# STORMSKUD på Render Free

`render.yaml` beskriver én gratis Docker Web Service i Frankfurt. Samme proces serverer spillet og WebSocket-forbindelserne. Der skal ikke tilføjes database, disk, miljøhemmeligheder eller en separat frontend.

## Udgiv koden og opret tjenesten

1. Push projektet til et GitHub- eller GitLab-repository, som din Render-konto kan læse. Medtag `render.yaml`, `Dockerfile`, `package.json`, `package-lock.json`, `server/` og `public/`; undlad lokale hemmeligheder, `node_modules/` og `artifacts/`.
2. Åbn [Render Dashboard](https://dashboard.render.com), vælg **New → Blueprint**, og forbind repositoryet. Brug `render.yaml` fra projektroden.
3. Kontrollér, at der kun oprettes **stormskud**, med **Free**, **Frankfurt**, **Docker**, én instans og health check **/health**. Opret tjenesten. Dockerfile indeholder både installation og startkommando; serveren læser Render-porten fra `PORT`.
4. Vent på **Live**, og åbn den faktiske HTTPS-adresse, som Render viser på tjenesten. Opret et rum, og brug spillets **Kopiér link** til Discord-invitationen.

Konfigurationen slår automatisk deployment fra, så et push ikke afbryder en igangværende runde. Udgiv senere ændringer med **Manual Deploy → Deploy latest commit**, efter at de er pushet. Feltvalg følger [Render Blueprint-referencen](https://render.com/docs/blueprint-spec).

## Kontrollér den offentlige forbindelse

Åbn tjenesten og vent på, at den er vågen. Fra projektmappen:

```powershell
npm ci
$stormskudUrl = Read-Host 'Indsæt den faktiske HTTPS-adresse fra Render'
npm run test:public -- $stormskudUrl
```

Testen kontrollerer HTTP, invitationsside, spilfiler, WebSocket-forbindelse med browserens Origin-header, to samtidige spillere, fælles runde, adskilte rum, at en spiller forlader rummet, og oprydning. Den tester ikke grafik eller alle kampmekanikker. Åbn også invitationen på to computere, og spil en runde.

## Begrænsninger på Free

Efter 15 minutter uden indgående HTTP- eller WebSocket-trafik sover tjenesten. Næste besøg starter den igen; Render angiver omkring ét minuts ventetid. Åbn derfor spillet, før du sender første invitation. Free kan også genstartes af Render. [Render Free](https://render.com/docs/free)

Rum og igangværende runder ligger i serverens hukommelse og forsvinder ved genstart, deployment eller dvale. Opret da et nyt rum. XP, mønter og valg er gemt lokalt i spillerens browser. Behold én serverinstans: denne version deler ikke rumtilstand mellem processer.

Free har månedlige grænser for instanstimer, trafik og builds. `plan: free` vælger gratis compute; ekstra trafik/buildforbrug kan faktureres, hvis kontoen har en betalingsmetode. Uden betalingsmetode suspenderes relevante tjenester eller builds ved grænsen. Se kontoens forbrug og [Renders gældende Free-vilkår](https://render.com/docs/free).
