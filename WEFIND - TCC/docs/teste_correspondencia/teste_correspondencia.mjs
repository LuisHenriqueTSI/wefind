import { calculatePetMatchScore } from './src/services/petMatching.js';
const C=[-31.7654,-52.3376]; // Centro de Pelotas
const at=(km,ang=40)=>{const r=ang*Math.PI/180;return {latitude:C[0]+(km/111.32)*Math.cos(r),longitude:C[1]+(km/(111.32*Math.cos(C[0]*Math.PI/180)))*Math.sin(r)};};
const P=(species,gender,size,breed,color,age)=>({species,gender,size,breed,color,age,...C&&{}});
const pair=(id,same,a,b,km)=>({id,same,a:{...a,latitude:C[0],longitude:C[1],city:'Pelotas'},b:{...b,...at(km),city:'Pelotas'},km});
const S='Sem raça definida';
const cases=[
pair('V1',1,P('Cachorro','Macho','Médio',S,'Caramelo','Adulto'),P('Cachorro','Macho','Médio',S,'Caramelo','Adulto'),0.6),
pair('V2',1,P('Cachorro','Fêmea','Pequeno','Poodle','Branco','Adulto'),P('Cachorro','Não informado','Pequeno','','Branco','Adulto'),1.4),
pair('V3',1,P('Gato','Macho','Pequeno',S,'Preto','Adulto'),P('Gato','Não informado','Pequeno',S,'Preto','Não informado'),0.3),
pair('V4',1,P('Cachorro','Macho','Grande','Labrador','Dourado','Adulto'),P('Cachorro','Macho','Grande',S,'Amarelo','Adulto'),2.1),
pair('V5',1,P('Cachorro','Fêmea','Médio',S,'Preto com Branco','Adulto'),P('Cachorro','Fêmea','Médio',S,'Preto com Branco','Adulto'),3.2),
pair('V6',1,P('Gato','Fêmea','Pequeno',S,'Laranja com Branco','Filhote'),P('Gato','Fêmea','Pequeno',S,'Laranja','Filhote'),0.9),
pair('V7',1,P('Cachorro','Macho','Médio',S,'Marrom com Branco','Idoso'),P('Cachorro','Macho','Grande',S,'Marrom','Adulto'),1.8),
pair('V8',1,P('Cachorro','Macho','Pequeno','Shih Tzu','Branco com Dourado','Adulto'),P('Cachorro','Macho','Pequeno','Shih-tzu','Branco com Caramelo','Adulto'),2.6),
pair('V9',1,P('Cachorro','Fêmea','Médio',S,'Caramelo','Adulto'),P('Cachorro','Fêmea','Médio',S,'Caramelo','Adulto'),6.5),
pair('V10',1,P('Gato','Macho','Pequeno',S,'Cinza','Adulto'),P('Gato','Macho','Médio',S,'Cinza com Branco','Adulto'),0.5),
pair('D1',0,P('Cachorro','Macho','Médio',S,'Caramelo','Adulto'),P('Cachorro','Macho','Médio',S,'Caramelo','Adulto'),2.8),
pair('D2',0,P('Cachorro','Fêmea','Médio',S,'Preto','Adulto'),P('Cachorro','Macho','Médio',S,'Preto','Adulto'),1.0),
pair('D3',0,P('Gato','Macho','Pequeno',S,'Preto','Adulto'),P('Cachorro','Macho','Pequeno',S,'Preto','Adulto'),0.4),
pair('D4',0,P('Cachorro','Macho','Pequeno','Pinscher','Preto','Adulto'),P('Cachorro','Macho','Grande',S,'Preto','Adulto'),1.5),
pair('D5',0,P('Cachorro','Fêmea','Médio',S,'Branco','Filhote'),P('Cachorro','Fêmea','Médio',S,'Branco','Idoso'),1.1),
pair('D6',0,P('Cachorro','Macho','Médio',S,'Caramelo','Adulto'),P('Cachorro','Não informado','Médio',S,'Marrom','Adulto'),0.7),
pair('D7',0,P('Gato','Fêmea','Pequeno',S,'Preto com Branco','Adulto'),P('Gato','Não informado','Pequeno',S,'Preto com Branco','Adulto'),4.0),
pair('D8',0,P('Cachorro','Macho','Grande','Pastor Alemão','Preto com Marrom','Adulto'),P('Cachorro','Macho','Grande','Rottweiler','Preto com Marrom','Adulto'),2.0),
pair('D9',0,P('Cachorro','Fêmea','Pequeno',S,'Branco','Adulto'),P('Cachorro','Fêmea','Pequeno',S,'Branco','Adulto'),25),
pair('D10',0,P('Cachorro','Macho','Médio',S,'Caramelo com Branco','Adulto'),P('Cachorro','Macho','Médio',S,'Caramelo','Filhote'),3.0),
];
const rows=cases.map(c=>{const r=calculatePetMatchScore(c.a,c.b);return {id:c.id,same:c.same,km:c.km,pct:r.percentage,dist:r.distanceKm};});
console.log(JSON.stringify(rows));
for (const t of [55,60]){const tp=rows.filter(r=>r.same&&r.pct>=t).length, fp=rows.filter(r=>!r.same&&r.pct>=t).length, fn=10-tp, tn=10-fp;
console.log(t,{tp,fp,fn,tn,precisao:(tp/(tp+fp)).toFixed(2),revocacao:(tp/10).toFixed(2)});}
