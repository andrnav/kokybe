# Foto inspektorius v1.5

## Paleidimas vietoje

```bash
npm install
npm run dev
```

## GitHub Pages

Projektas sukonfigūruotas publikavimui adresu `https://andrnav.github.io/kokybe/` iš `test` branch per GitHub Actions. Saugyklos `Settings → Pages → Build and deployment → Source` turi būti pasirinkta `GitHub Actions`.

## v1.5 pakeitimai

- „Balti kraštai“ pervadinti į „Įtalpinta“. Įtalpinimo režime galima priartinti ir pastumti nuotrauką, kad sumažėtų balti šonai; tai veikia ir pagrindinėje peržiūroje, ir eksporte.
- Spausdinimo formatas pasirenkamas iš išskleidžiamo sąrašo; rankiniai matmenys automatiškai perjungia formatą į „Pagal skaičius“.
- Pašalintas dešinysis informacijos skydelis ir didinimo mygtukas, todėl pagrindinė peržiūra platesnė.
- „Atsisiųsti šią nuotrauką“ perkeltas šalia „Atstatyti“.
- Apatinė nuotraukų juosta slenkama pelės ratuku horizontaliai.
- Prie failo pavadinimo pridėtas kopijų skaičius. Kai skaičius didesnis nei 1, eksportuojamo failo pavadinimas prasideda, pvz., „2x - “.

## v1.2 pakeitimai

- „Balti kraštai“ pagrindiniame peržiūros lange rodomi tikrame pasirinkto formato baltame lape.
- Balto lapo proporcija apskaičiuojama iš pasirinktų centimetrų, o nuotrauka įtalpinama nekeičiant jos proporcijų.
- Kadravimo peržiūroje nuotrauka rodoma tik pasirinkto formato rėmelio viduje; išorė pritemdoma.
- Pridėtas rankinis formato įvedimas centimetrais. Pakeitus bent vieną matmenį, formatas tampa „Pagal skaičius“.
- Pašalintas „Patvirtinti“ mygtukas. Pereinant prie kitos nuotraukos, ankstesnė pažymima kaip peržiūrėta; eksportuojant pažymima visa partija.
- Paliktas „Atstatyti“ mygtukas, kuris grąžina automatinę orientaciją, mastelį ir centrinį kadravimą.
- Apatinės miniatiūros rodo būsimą eksportuojamą vaizdą, įskaitant baltus kraštus.
- Originalūs įkelti failai nekeičiami.

## Pastaba

Šioje aplinkoje nepavyko įdiegti npm priklausomybių per skirtą laiką, todėl `npm run build` dar nebuvo patikrintas. GitHub Actions atliks build publikavimo metu ir parodys konkrečią klaidą, jei jos liko.
\n\n## v1.5\n- Fixed fitted-mode thumbnails so the actual photo and white margins render together.\n- Crop and Real Size previews now show the full source image; the area outside the print crop is dimmed.\n

## v1.5
- App renamed to Foto inspektorius.
- Removed the original-file note and the thumbnail status legend.
- Added left/right keyboard navigation.
- Added JPG and lossless 8-bit TIFF export.
- Added live crop pixel, print-size, and DPI readouts.
- Added unconstrained Free crop mode and Apply to all photos for the selected crop mode.


## v1.7
- Preview positioning now derives directly from the same source-pixel crop rectangle used by export.
- Added print-size-aware resolution grading (editable DPI/PPI targets).
- Added quality threshold settings with browser persistence and JSON import/export.
- Added quality status beside pixel dimensions and effective resolution.


## v1.7 – crop/export synchronization and quality scoring

- Crop preview now derives image placement from the exact source-pixel crop rectangle used by the export canvas.
- Dragging the photo right moves the displayed photo right; the exported crop corresponds to the visible crop window.
- Added a visible print-quality rating beside pixel dimensions and DPI.
- Added editable quality thresholds in the settings dialog. Values are saved in browser local storage.
- Quality thresholds are interpolated by the print's longest side. The rating uses the lower of horizontal and vertical effective source DPI.
- Real Size output remains 320 DPI, while its quality rating uses the original source crop resolution before upscaling.


## v1.8 – laisvas kadravimas ir nuotraukų eilės patobulinimai

- „Laisvas“ režimas naudoja nepriklausomą apkirpimo stačiakampį, kuris pradžioje apima visą originalią nuotrauką.
- Laisvo kadro proporcija nepririšta prie spausdinimo formato. Stačiakampį galima keisti tempiant jo apatinį dešinį kampą, o nuotrauką – stumdyti kadro viduje.
- Spausdinimo formato pasirinkimas ir rankiniai matmenys išjungiami „Laisvas“ režime. Kiti režimai vėl naudoja pasirinktą formatą.
- Pikseliai, DPI ir kokybės įvertinimas perkeltas šalia failo pavadinimo.
- Kopijų kiekio valdiklis perkeltas į kiekvienos nuotraukos kortelę apačioje, po miniatiūra ir failo pavadinimu.


## v1.9 – HEIC/HEIF ir PDF palaikymas

- HEIC ir HEIF failai konvertuojami į PNG naršyklėje; jei konverteris nepavyksta, bandomas naršyklės vietinis dekodavimas.
- Įkeliant PDF kiekvienas puslapis atskirai atvaizduojamas į PNG (3× PDF puslapio masteliu) ir įtraukiamas į bendrą nuotraukų eilę.
- PDF puslapių failų pavadinimai gauna puslapio numerį, pvz. `Dokumentas - 001.png`.
- Originalus HEIC/HEIF arba PDF failas nekeičiamas. Eksportuojamos tik apdorotos nuotraukų kopijos.
- Nepavykus įkelti failo, pranešime parodomas konkretus failo pavadinimas ir klaidos priežastis.


## v1.9.1 – HEIC dekoderio atnaujinimas

- Pašalinta pasenusi `heic2any` biblioteka (0.0.4), kuri naudojo senesnį libheif ir atmesdavo dalį naujesnių HEIC kodavimo variantų.
- Naudojama `heic-to` 1.6.7, paremta naujesniu libheif 1.23.7.
- HEIC/HEIF konvertuojamas į PNG naršyklėje. PDF apdorojimo kodas nepakeistas.
- Jei HEIC nepavyksta perskaityti, klaidos pranešime atskirai pateikiama dekoderio ir naršyklės klaida.


## v2.1.0 – skirsnis „Nuotraukos kokybė“

Skirsnis „Nuotraukos kokybė“ nebėra išjungtas. Jame kiekviena nuotrauka vertinama pagal **savo** pasirinktą formatą ir kadravimo tipą (Puiki / Gera / Tinka / Ribinė / Prasta), pateikiamos priežastys ir patarimas, o jei skiriamosios gebos nepakanka – koks didžiausias formatas dar tiktų.

- **Efektyvus dpi → reikiamas dpi.** Reikiamas dpi ≈ 3438 ÷ žiūrėjimo atstumas coliais; atstumas = 1,25 × įstrižainė, bet 30–60 cm. Maža nuotrauka (10×15) reikalauja ~290 dpi, didelė – ~145 dpi.
- **Spausdintuvas parenkamas pagal dydį:** trumpesnė kraštinė ≤ 30,5 cm ir ilgesnė ≤ 91,4 cm – Noritsu QSS-3701 (300 dpi), kitaip – Mimaki JV100-160.
- **Vaizdo analizė** (mygtukas „Analizuoti nuotraukas“): ryškumas ir triukšmas matuojami ties tikrais taškais iš iki 49 fragmentų, taip pat šviesos išdegimas ir bendras šviesumas. Neryški nuotrauka laikoma mažesnės skiriamosios gebos.
- **AI antra nuomonė (neprivaloma):** CLIP-IQA metodas per Transformers.js. Biblioteka ir modelis (`Xenova/clip-vit-base-patch16`, apie 150 MB) atsisiunčiami tik paspaudus „Atsisiųsti ir įjungti AI“, be raktų ir paskyros; vertinimas vyksta naršyklėje ir nuotraukos niekur nesiunčiamos. AI gali sumažinti įvertinimą ne daugiau kaip vienu laipsniu.
- Skirsnio nustatymai (žiūrėjimo atstumas, spausdintuvų dpi, ryškumo / triukšmo ribos) keičiami pačiame skirsnyje ir išsaugomi naršyklėje (`foto-inspektorius-quality-v1`).
- „Laisvas“ režimo nuotraukoms vertinama tik vaizdo kokybė, nes spaudos dydis nenustatytas.
- Eilutės paspaudimas atidaro tą nuotrauką kadravimo skirsnyje. Analizės ir AI rezultatai išlieka perjungiant skirsnius.
- **Pataisymas:** „Įtalpinta“ režime įrankių juostoje rodomas DPI dabar įskaito priartinimą (priartinus ×2 nuotrauka spaudoje didinama, todėl realus dpi perpus mažesnis). Toks pat skaičiavimas naudojamas ir naujame skirsnyje.
- Kadravimo įrankių juostoje esantis „Kokybė“ indikatorius ir jo skalė (krumpliaračio nustatymai) nekeisti, todėl kraštutiniais atvejais jo ir naujojo skirsnio vertinimai gali skirtis.
- Kai skirsnis „Nuotraukos kokybė“ atidarytas, rodyklės ←/→ nekeičia aktyvios nuotraukos.
- Nauji failai: `src/quality/` (`engine.js`, `analyze.js`, `ai.js`, `useQuality.js`, `QualityTab.jsx`). Naujų npm priklausomybių nėra.


## v2.2.0 – išplėsta skirsnio „Nuotraukos kokybė“ analizė

- **Tik kadro sritis.** Vertinama tik tai, kas pateks ant popieriaus (Kadravimas, Įtalpinta su priartinimu, Real Size, Laisvas). Nuotrauka vieną kartą išmatuojama 128×128 px fragmentais (iki 400), todėl pakeitus kadravimą vertinimas perskaičiuojamas iš karto.
- **Ryškumo žemėlapis** (žymimasis langelis viršuje) ir neryškumo rūšis: judesio suliejimas (pagal gradientų kryptingumą) ar nefokusavimas.
- **Tikroji raiška:** padidintos / suliesintos / stipriai suglaudintų nuotraukų aptikimas (pvz. „WhatsApp“, ekrano kopijos); tokiai nuotraukai dpi mažinamas.
- **JPEG glaudinimas:** kokybė iš kvantavimo lentelių + blokelių artefaktai.
- **Šešėliai ir šviesūs plotai:** išdegę kanalai (R/G/B), užstrigę šešėliai, triukšmas tamsiose zonose, kontrastas (2–98 %), kontrajutė.
- **Šviesos ir spalvų triukšmas** atskirai.
- **Žiūrėjimo atstumas:** Arti / Įprastai / Toli.
- **Savo ONNX modelis iš failo:** pasirenkate parsisiųstą `.onnx` (DBCNN, HyperIQA, MUSIQ, MANIQA, TReS, CLIP-IQA), jis išsaugomas naršyklės IndexedDB ir kraunamas automatiškai. Vykdoma onnxruntime-web (WASM) 1.22.0, įkeliama iš CDN. Vertinamas bendras kadras ir iki 4 tikrų detaliausių fragmentų. Modelio tipas nustatomas pagal failo pavadinimą, nuostatas galima keisti. Mažas CLIP AI paliktas kaip alternatyva.
- Spalvos / atspalviai sąmoningai nevertinami (koreguojama gaminant). Nuotraukos nekeičiamos – tik diagnostika.
- Nauji failai: `src/quality/metrics.js`, `jpeg.js`, `onnxModel.js`. Naujų npm priklausomybių nėra.
- Ribos yra pradinės, patikrintos tik su sintetinėmis nuotraukomis; realaus ONNX modelio šioje aplinkoje išbandyti nebuvo galima (testuota su imitacija).
