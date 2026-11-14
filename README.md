# Photo Quality Checker

Pirmoji lokali nuotraukų tinkamumo spaudai analizės versija.

## Paleidimas macOS

1. Įdiekite Node.js LTS (jei dar nėra).
2. Išskleiskite ZIP archyvą.
3. Terminale pereikite į projekto aplanką.
4. Vykdykite:

```bash
npm install
npm run dev
```

5. Atidarykite terminale parodytą vietinį adresą, dažniausiai `http://localhost:5173`.

## Gamybinė versija

```bash
npm run build
```

Sukurti failai bus `dist/` aplanke. `vite.config.ts` jau nustatytas santykiniams keliams, todėl projektą galima publikuoti GitHub Pages.

## Privatumas

Nuotraukos failas apdorojamas naršyklėje per `URL.createObjectURL`, `HTMLImageElement` ir Canvas. Nėra API ar serverio įkėlimo. Paspaudus „Pašalinti failą“ panaikinama lokali URL nuoroda ir išvaloma aplikacijos būsena. Naršyklė pati valdo fizinį atminties išvalymą.

## Dabartinės analizės ribos

- DPI skaičiuojamas iš realaus pikselių skaičiaus ir pasirinkto fizinio dydžio. Įrašytas DPI metaduomuo rodomas tik informaciniais tikslais.
- Numatyta analizė visam vaizdui be apkirpimo; trumpesnė kraštinė lemia konservatyvų efektyvų DPI.
- Ryškumas vertinamas Laplaso dispersijos metodu. Tai tik orientacinis indikatorius, o ne universalus AI kokybės balas.
- Triukšmo ir JPEG artefaktų patikimam atskiram įvertinimui reikės papildomų algoritmų ir testavimo su realiomis laboratorijos nuotraukomis.
- Maksimalus dydis pateikiamas pagal trumpesnę kraštinę ir 150 DPI, todėl tai konservatyvus orientyras.

## Kitas etapas

Patikrinti su realiais failais iš laboratorijos, suderinti DPI ribas pagal spaudos technologiją, drobės tekstūrą, žiūrėjimo atstumą ir gamybos praktiką.

## TIFF ir dideli failai

- Įkeliamo failo riba: 500 MB.
- Pasirinktas tikslas: FULL analizė, t. y. visų originalo pikselių analizė blokais, ne vien peržiūros kopijos.
- Techninis planas ir suderinamumo ribos aprašyti `ARCHITEKTURA.md`.
- Svarbu: šiame etape 500 MB validacija jau įdėta, tačiau pilnas TIFF dekoderio Web Worker dar neįgyvendintas. Todėl negalima laikyti, kad visi TIFF failai jau palaikomi. Dabartinis naršyklės vaizdo dekoderis priklauso nuo konkrečios naršyklės galimybių.
