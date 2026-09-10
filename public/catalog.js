export const BOATS = [
  {id:'cutter',name:'Kutteren',tag:'DEN ALSIDIGE',description:'Et roligt ror og en god balance. Dit trofaste første skib.',mass:900,inertia:1900,thrust:3600,drag:28,scale:1,speed:3,agility:3,stability:3},
  {id:'skiff',name:'Havpilen',tag:'LET & LIVLIG',description:'Lav vægt og hurtig acceleration. Bølgerne får mere at sige.',mass:680,inertia:1150,thrust:2900,drag:22,scale:.9,speed:4,agility:5,stability:2},
  {id:'tug',name:'Slæberen',tag:'TUNG & STÆDIG',description:'Mere masse og et større skrog. Planlæg dine sving i god tid.',mass:1400,inertia:3300,thrust:4800,drag:42,scale:1.16,speed:2,agility:2,stability:5},
];
export const LIVERIES = [
  {id:'plain',name:'Original',price:0,description:'Rent skrog. Beskidt spil.'},
  {id:'racing',name:'Regatta',price:80,description:'To lyse striber. Fuld fart i udtrykket.'},
  {id:'dazzle',name:'Søspøgelse',price:140,description:'Skarpe mønstre fra et uroligt hav.'},
  {id:'royal',name:'Admiralen',price:220,description:'Gyldne kanter til en selvsikker kaptajn.'},
];
export const boatStats=id=>BOATS.find(b=>b.id===id)??BOATS[0];
