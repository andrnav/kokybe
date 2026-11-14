# FotoKadravimas – pirmasis prototipas

## Paleidimas macOS

1. Įdiekite Node.js 20 arba naujesnę versiją.
2. Išarchyvuokite projektą.
3. Terminale pereikite į aplanką `fotokadravimas`.
4. Vykdykite:

```bash
npm install
npm run dev
```

5. Atidarykite terminale parodytą vietinį adresą (paprastai `http://localhost:5173`).

## Kas įtraukta

- React + Vite sąsaja lietuvių kalba.
- 10×15, 15×30, 15×15 ir A4 formatai.
- Kadravimo, baltų kraštų ir Real Size režimų prototipas.
- Automatinė, vertikali ir horizontali orientacija.
- Nuotraukų įkėlimas, miniatiūrų juosta ir būsenos.
- Didysis koregavimo langas, mastelio ir pozicijos valdymas.
- JPEG ir ZIP eksportavimo pradinis įgyvendinimas.
- HEIC/HEIF ir TIFF dekodavimo bibliotekos įtrauktos į priklausomybes.

## Svarbu

Tai pirmasis funkcinės sąsajos prototipas, ne galutinė spaudos paruošimo versija. Prieš naudojant realiems užsakymams būtina patikrinti kadravimo koordinates, TIFF/HEIC dekodavimą, spalvų profilių išsaugojimą, DPI metaduomenis ir didelių partijų našumą. Kampiniai rėmelio taškai šioje versijoje yra vizualūs; tikslus kadravimas šiuo metu valdomas tempiant vaizdą ir keičiant mastelį.
