# Photo Quality AI 4.1

Lokali nuotraukų spaudos raiškos ir AI kokybės analizės aplikacija.

## Paleidimas

```bash
npm install
npm run dev
```

## Apkirpimas

- Apkirpimo lango proporcija susiejama su pasirinktu spaudos formatu.
- Originalus vaizdas rodomas išlaikant jo proporcijas, be tempimo.
- Vaizdas tempiamas po apkirpimo langu, priartinamas slankikliu.
- PPI perskaičiuojamas pagal tikrą apkirpimo stačiakampį ir fiksuotą spaudos formatą.
- Patvirtintas apkirpimas išsaugomas kaip PNG iš originalių dekoduotų pikselių, be dirbtinio raiškos didinimo.
- AI gauna tą patį patvirtintą PNG apkirpimą.

Pastaba: naršyklė gali riboti labai didelių nuotraukų dekodavimo / canvas dydį. PNG išsaugo apkirptų pikselių informaciją be JPEG pakartotinio suspaudimo, bet tai neatkuria informacijos, kurios nebuvo originale.

## 4.4 – Partijų apdorojimas

Pridėta atskira „Partijų apdorojimas“ skiltis:
- kelių nuotraukų įkėlimas vienu metu;
- galerijos miniatiūros ir failų būsenos;
- originalios proporcijos išsaugojimas arba centrinis apkirpimas pagal 3:2, 2:3, 4:3, 1:1 ir 16:9;
- eksportas į JPG 100 % kokybės nustatymu arba RGB 8 bitų nesuspaustą TIFF;
- ZIP eksportas be papildomo ZIP suspaudimo;
- kopijų skaičiaus prefiksas, pvz. `3x - IMG_4587.jpg`;
- HEIC/HEIF dekodavimas per heic2any; GIF apdorojamas kaip pirmasis kadras.

Svarbūs techniniai apribojimai:
- JPEG yra nuostolinis formatas. 100 % kokybės nustatymas yra maksimalus naršyklės JPEG encoderio nustatymas, bet tai nėra matematiškai be nuostolių išsaugojimas.
- TIFF rašomas kaip RGB 8 bitų baseline TIFF be suspaudimo.
- GIF animacija nėra išsaugoma: konvertuojamas pirmasis kadras.
- RAW formatai sąmoningai nepalaikomi.
- HEIC dekodavimui reikalinga `heic2any` biblioteka ir pirmą kartą gali reikėti interneto ryšio priklausomybių įdiegimui.
- Partijų apkirpimas taiko vienodą centrinį kadravimą pasirinktai proporcijai. Individualus kiekvienos nuotraukos kadro pastūmimas dar nėra įtrauktas.
