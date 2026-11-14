# Photo Quality Checker – techninė architektūra

## Pasirinkti reikalavimai
- TIFF režimas: **FULL** – kokybės analizė atliekama visos originalios nuotraukos pikselių erdvėje.
- Maksimalus failo dydis: **500 MB**.
- Apdorojimas: tik naršyklėje, lokaliame įrenginyje. Failas nesiunčiamas į serverį.
- Generatyvinis AI ir mokami API nenaudojami.

## Siūloma architektūra

```text
React UI (main thread)
  ├─ failo pasirinkimas ir 500 MB validacija
  ├─ produkto / spaudos dydžio pasirinkimas
  ├─ peržiūra, mastelio keitimas, analizės eiga
  └─ rezultatų pateikimas
       │ postMessage(File, settings)
       ▼
Dedicated Web Worker
  ├─ failo tipo ir TIFF struktūros patikra
  ├─ metaduomenys: matmenys, bit depth, spalvų modelis, kompresija
  ├─ TIFF dekodavimas per geotiff.js
  ├─ pilnos raiškos analizė blokais (tiles/windows)
  ├─ globalių ryškumo statistinių reikšmių kaupimas
  └─ sumažintos peržiūros bitmap generavimas
       │ progress / result / error
       ▼
React UI
```

## Kodėl geotiff.js + Web Worker
`geotiff.js` gali skaityti TIFF iš `Blob`, apdoroti tiled ir stripped vaizdus, skaityti atskirus langus (windows), turi dekoderių worker pool ir palaiko kelis dažnus kompresijos tipus. Tai leidžia nebandyti iškart išdekoduoti viso 500 MB failo į vieną milžinišką RGBA masyvą.

Pagrindinis analizės principas – **pilnos raiškos blokinis apdorojimas**. Worker skaito visus originalo pikselius dalimis, su vieno pikselio persidengimu tarp blokų, kad Laplaco ryškumo skaičiavimas neprarastų blokų ribų. Tarp blokų saugomos tik suminės statistikos, o ne visas išdekoduotas vaizdas.

Peržiūrai atskirai generuojama sumažinta kopija. Ji naudojama tik ekrane, ne vietoje originalo analizės.

## Atminties valdymas
- Nelaikyti pilno dekoduoto RGB/RGBA originalo RAM.
- TIFF skaityti mažais langais / blokais.
- Riboti dekoderio worker pool dydį (pradinis tikslas – 2).
- Rodyti analizės progresą ir leisti ją atšaukti.
- Atšaukus arba pašalinus failą, nutraukti worker darbą, atlaisvinti `ImageBitmap`, `ObjectURL` ir tarpinius buferius.
- 500 MB yra įkeliamo failo dydžio riba, o ne garantija, kad kiekvienas TIFF variantas bus dekoduojamas.

## TIFF suderinamumo politika
Negalima žadėti universalaus TIFF palaikymo vien pagal plėtinį. Prieš analizę reikia patikrinti:
- klasikinis TIFF ar BigTIFF;
- 8 / 16 bitų mėginiai;
- RGB, grayscale, CMYK ar indeksuota spalva;
- tiled ar stripped išdėstymas;
- kompresijos tipas;
- vienas ar keli puslapiai / IFD.

Pirmoje pilno TIFF palaikymo iteracijoje apdorojamas pirmas vaizdo puslapis. Nepalaikomas formatas turi pateikti aiškią klaidą, o ne neteisingą kokybės rezultatą. BigTIFF ir neįprasti spaudos darbo eigos variantai turi būti patikrinti atskirais realiais testiniais failais.

## Analizės metodai
1. **Spaudos raiška (DPI):** iš originalių pikselių matmenų ir pasirinkto fizinio dydžio. EXIF DPI yra tik informaciniai metaduomenys.
2. **Ryškumas:** Laplaco dispersija, skaičiuojama per visą originalų vaizdą blokais. Tai santykinis neryškumo indikatorius, ne absoliutus kokybės balas.
3. **Spalvos / kanalai:** TIFF dekoderio RGB konversija naudojama peržiūrai ir ryškumo analizei. CMYK konversijos tikslumas turi būti patikrintas su laboratorijos failais.
4. **Apkirpimas:** dabartinis DPI vertinimas daro prielaidą, kad visas vaizdas telpa į gaminį. Būsimas crop įrankis turės perskaičiuoti DPI pagal pasirinktą sritį.

## Privatumas
Failas apdorojamas tik naršyklėje. Nėra upload endpoint, duomenų bazės ar nuotraukų saugojimo. Sąsaja gali atlaisvinti nuorodas ir buferius pašalinus failą, tačiau naršyklė negarantuoja momentinio fizinio RAM išvalymo.

## Įgyvendinimo etapai
1. Įdiegti TIFF dekoderio worker ir pranešimų protokolą.
2. Pridėti blokinį pilnos raiškos analizės variklį, progresą ir atšaukimą.
3. Generuoti atskirą sumažintą peržiūrą.
4. Pridėti TIFF struktūros patikrą ir aiškias nepalaikomų formatų klaidas.
5. Testuoti su laboratorijos realiais TIFF pavyzdžiais: LZW, ZIP/Deflate, uncompressed, RGB, CMYK, 8/16 bit, tiled/stripped, kelių puslapių ir BigTIFF.
6. Tik po testų įjungti FULL TIFF analizę kaip patvirtintą funkciją.

## Dabartinė įgyvendinimo būsena
Šiame architektūros atnaujinime įvesta 500 MB failo dydžio validacija ir pridėta `geotiff` priklausomybė būsimam worker dekoderiui. TIFF FULL dekodavimas dar nėra įgyvendintas; dabartinis UI vaizdo elementas negali patikimai atvaizduoti visų TIFF formatų. Iki worker etapo užbaigimo TIFF palaikymas neturi būti laikomas veikiančiu.
