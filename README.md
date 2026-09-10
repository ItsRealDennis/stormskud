# STORMSKUD

Et multiplayer-søslag for 2–8 spillere med en tredimensional Three.js/WebGL-scene og en autoritativ Node.js/WebSocket-server. Ingen konti, API-nøgler, betalte assets, database eller build-step. Skibe og omgivelser modelleres i kode; Three.js-moduler leveres fra den samme server, så spillet ikke afhænger af en ekstern CDN.

## Start på din computer

Kræver Node.js 22 eller nyere og en browser med WebGL2, eksempelvis en opdateret Chrome eller Edge. Hardwareacceleration anbefales. Kør fra projektmappen:

```sh
npm ci
npm start
```

Åbn **http://localhost:3000**. Samme proces serverer både klienten og WebSocket-serveren; der skal ikke startes en ekstra klientserver. `npm run dev` genstarter serveren ved serverændringer (aktive rum nulstilles ved genstart).

Opret rum → kopiér link → venner deltager → start søslaget. Alle i rummet kan starte en runde. “Prøv alene” opretter et særskilt rum med tre tydeligt markerede bots.

## Spil på flere computere

Serveren lytter på `0.0.0.0:3000`. På samme lokale netværk kan venner åbne `http://DIN-LOKALE-IP:3000`; find IPv4-adressen med `ipconfig`. Tillad Node/port 3000 i din firewall på det relevante netværk. Opret rummet fra denne adresse, så det kopierede invitationslink bruger en adresse, vennerne kan nå. **Et localhost-link virker kun på din egen computer.**

Til venner over internettet skal hele appen hostes på en offentligt tilgængelig server/container med en vedvarende Node-proces og WebSocket-support. En statisk webhost alene kan ikke køre spilserveren.

Der medfølger en Dockerfile:

```sh
docker build -t stormskud .
docker run --rm -p 3000:3000 stormskud
```

Konfigurér et domæne og HTTPS hos din host eller en reverse proxy. Proxyen skal videresende `Host` og WebSocket `Upgrade` til `/ws`; `/` og `/health` går til samme Node-proces. Klienten vælger automatisk `wss://` ved HTTPS. Serverporten kan indstilles via `PORT`.

Brug **én serverinstans**: rum ligger i hukommelsen og deles ikke mellem instanser. Genstart stopper aktive rum. Der er ikke foretaget offentlig deployment, og intet offentligt invitationslink følger med projektet. Det manglende trin er hosting af Node/WebSocket-processen på en offentlig adresse med HTTPS.

Et passende første valg er **Railway**: deploy projektets Dockerfile som én instans. Hobby har pr. 10. september 2026 et minimum på 5 USD om måneden, inklusive 5 USD i forbrug; forbrug derudover koster ekstra. Se [Railways priser](https://railway.com/pricing). **Render** er et alternativ til gratis afprøvning, men gratis webservices sover efter 15 minutters inaktivitet og bruger cirka et minut på at vågne. Se [Renders begrænsninger for gratis hosting](https://render.com/docs/free). Det er mindre praktisk til spontane Discord-pauser.

Railway-konfiguration og præcise deploy-kommandoer findes i [.railway/README.md](.railway/README.md).

**Render Free:** Projektet har også en valideret `render.yaml` til én gratis webservice i Frankfurt. Se [Render-vejledningen](docs/RENDER.md) for deployment og test af det faktiske offentlige link.

## Styring og spilregler

| Input | Handling |
|---|---|
| W / pil op | Motor frem |
| S / pil ned | Brems med modkraft fra propellen |
| A/D / venstre/højre | Drej roret; skibet kræver fart for at dreje effektivt |
| Mus | Retning og afstand til kanonsigtet |
| Venstre museknap | Skyd; hold nede for gentagne skud |
| Mellemrum | 1,2 sekunders ekstra motorkraft; 6 sekunders cooldown |
| Musehjul | Zoom kameraet under en runde |

En runde varer 120 sekunder efter en 3-sekunders nedtælling. Fire almindelige træffere sænker et skib. Sænkninger giver 3 point. Seneste angriber får også point for en efterfølgende klippekollision, hvis sidste skade skete inden for 5 sekunder. Hårde sammenstød mellem skibe kan også skade.

Respawn efter 3 sekunder med 2 sekunders synlig beskyttelse. Spawn vælger blandt mulige placeringer med afstand til fjender, klipper og projektiler. Beskyttelsen blokerer skade. Delt førsteplads er tilladt, og alle kan starte en ny runde.

Stormbølgen varsles 3 sekunder før den kommer ind i arenaen. Der er strøm, vind, klipper og en blød arenagrænse. Tre pickups: +2 liv (maks. 4), hurtigere ild i 7 sekunder, genopladning af boost.

Lyd er slukket som standard. Tryk på lydknappen for dæmpet havlyd og effekter genereret med Web Audio. Samme knap slukker lyden. Der bruges ingen eksterne mediefiler. `prefers-reduced-motion` reducerer regn, visuel vuggen og lysvariationer; ingen kamerarystelser.

## Havn, skibe, XP og butik

Åbn **Værft & butik** på forsiden eller **Kaptajn** i topbjælken.

- **Kutteren:** 900 kg, balanceret båd.
- **Havpilen:** 680 kg, mindre skrog og hurtigere respons; påvirkes mere af bølger.
- **Slæberen:** 1.400 kg, større skrog og mere inerti.

Alle skibe er gratis fra start og har samme liv og kanon. Valg af skib og skrogdesign anvendes, når du deltager i et nyt rum, og er synligt for andre spillere.

For en afsluttet runde modtager du 30 XP + 20 XP pr. sænkning + 40 XP ved førsteplads. Du får også 15 skaller + 8 pr. sænkning + 20 ved førsteplads. Delt førsteplads tæller, og solorunder giver også fremskridt. Butikken sælger tre kosmetiske skrogdesigns for optjente skaller; køb bliver udstyret og gemt. Ingen betaling, annoncer eller gameplay-opgraderinger.

Fremskridt, købt udstyr og skibsvalg gemmes i **localStorage i denne browser**. De synkroniseres ikke mellem computere og forsvinder, hvis browserdata slettes. De er en lokal, redigerbar profil, ikke et sikkert konto-/økonomisystem. Kampens liv, bevægelse og point beregnes altid på serveren; lokal XP bruges ikke som autoritet for kampe.

## Fysik

`server/physics.js` regner kræfter i SI-enheder, med 12 skærmkoordinatenheder pr. meter. Modellen omfatter masse, inertimoment, forsinket motor-/rorrespons, propellerkraft, lineær og kvadratisk vandmodstand relativt til strømmen, større tværmodstand, fartafhængig rorkraft og rotationsdæmpning. Topfart følger balancen mellem motorkraft og modstand, ikke en vilkårlig hastighedsbegrænsning.

Skrog modelleres med to orienterede kontaktcirkler. Skibskollisioner bruger normalimpulser med masse og inertimoment og lav restitution. Klipper giver kontaktimpuls og rotation. Kanonkugler arver bådens hastighed, får tyngdeacceleration, har højdebaseret kollisionskontrol og giver rekyl ud fra projektilmomentum. Kanonens lave elevationsvinkel beregnes automatisk ud fra museafstanden.

Stormen bruger en begrænset bølgepakke med dybvandsdispersion, overfladens orbitale vandhastighed og gradvise kræfter fra bølgehældning. Skibets visuelle hævning følger bølgepakken.

Grafikken er en **3D-scene med et perspektivkamera**. Serverens fysiske spilmodel er fortsat **2D/2,5D**: bevægelse og skrogkontakt beregnes på havplanet, mens kanonkugler også har højde. Visuel bølgebevægelse og skibets hævning er ikke en fuld opdriftssimulation. Vandet er ikke et tredimensionalt væskegitter; planing, fuld opdrift og skrogdeformation simuleres ikke. Fire liv, skadetærskler, boost og den bløde arenagrænse er bevidste spilregler.

## Multiplayer og forbindelser

- Serveren simulerer med faste 30 Hz og sender tilstand 15 gange pr. sekund.
- Andre skibe interpoleres omkring 100 ms bagud. Eget skib ekstrapoleres højst 70 ms; kanonsigtet reagerer lokalt.
- Tilstand, projektiler, point, tid og storm tilhører hvert sit rum.
- Maks. 8 spillere pr. rum; input, farver, udstyr og kaldenavne valideres. Begrænset beskedstørrelse og beskedfrekvens. Klienter kan ikke sende nye kamp-point eller liv.
- Afbrudte spillere reserveres i 15 sekunder. Automatisk genforbindelse og genindlæsning i samme fane bruger et tilfældigt sessionstoken. Inaktivt input nulstilles efter 350 ms.
- Værten har ingen særrolle. Et rum fortsætter, når opretteren går. Tomme rum, også solorum uden mennesker, fjernes.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:browser
```

`npm test` indeholder regel-, fysik-, profil- og integrationstests. WebSocket-testen opretter virkelige samtidige forbindelser og kontrollerer oprettelse, invitationens HTTP-adresse, deltagelse, skud, skade, point, respawn, separate rum, sen deltagelse, genforbindelse, rundeafslutning, genstart, opretterens afgang og oprydning. Desuden inputvalidering og fulde rum.

Browsertesten bruger to adskilte Chromium-browserkontekster og rigtige DOM-, tastatur- og musehandlinger. Den tester kopiering af invitationslink, deltagelse via link, kamp, død, respawn, kontrolinput, point, resultater, replay fra den anden spiller, afgang, solobots, lydknap samt skibsvalg, XP, butikskøb og vedvarende udstyr. Museprøven bruger 3D-kameraets projektion, kontrollerer konverteringen tilbage til havkoordinater og skyder derefter med faktiske musehandlinger. Den kontrollerer også en fungerende WebGL2-kontekst, synlige varierede scenepixels, indlæste modelbilleder i værft og butik samt fravær af browserfejl. Screenshots af forside, kamp, værft og øvrige skærme gemmes i `artifacts/`.

Den automatiske Chromium-test tillader SwiftShader for maskiner uden tilgængelig GPU. Det verificerer funktion og rendering; det er ikke en måling af billedhastighed på en rigtig gamingcomputer.

`node test/visual-3d.mjs` er en valgfri visuel prøve, der gemmer friske 3D-billeder, kontrollerer kameraets zoom og udskriver renderdiagnostik. Kør den efter øvrige tests, så softwaregrafik ikke konkurrerer med serverens tidsfølsomme testforløb.

Tests anvender kontrollerede startplaceringer og fjerner respawn-beskyttelse før skydeprøven. Browsertesten springer ventetiden frem til rundens slutning over og indlæser en tydelig testsaldo for butikskøbet. 120-sekunders varighed, beskyttelse, saldoafvisning og købsregler testes separat. WebSocket-testen bruger en kortere runde. Det er ikke en måling af en hel runde over internettet.

Alle klienter i den automatiske test kører på samme computer. Forskellige fysiske computere, offentlig hosting, høj netværkslatens, Docker-runtime og Firefox/Safari er ikke verificeret her.

## Filer

- `server/index.js`: HTTP, WebSockets, forbindelser, rum og faste simulationstrin.
- `server/game.js`: runder, skade, storm, point, pickups, spawn og bots.
- `server/physics.js`: bådkræfter, kontaktimpulser og ballistik.
- `public/app.js`: netværk, interpolation, input og kamp-UI.
- `public/render.js`: Three.js-scene, 3D-hav, kamera, bølger og partikeleffekter.
- `public/models.js`: fælles, procedurale 3D-skibsmodeller.
- `public/model-preview.js`: modelbilleder til værft og butik fra samme skibsmodeller.
- `public/vendor/`: lokale Three.js-moduler og deres MIT-licens.
- `public/profile.js`, `public/catalog.js`: havnemenu, skibe, XP og butik.
- `public/audio.js`: dæmpet, genereret lyd.
- `test/`: automatiske tests.
