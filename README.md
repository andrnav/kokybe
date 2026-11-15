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


## Nuotraukos kokybės analizė (v2.1.0)

Kokybės skiltis analizuoja esamą kadrą, atsižvelgdama į kadravimo režimą, priartinimą, panoramą, orientaciją ir pasirinktą fizinį spaudos formatą. Pakeitus šiuos parametrus analizė perskaičiuojama.

### Matematiniai indikatoriai
- Efektyvi raiška pagal išlikusius kadro pikselius ir fizinį spaudos dydį.
- Aštrumo indikatorius pagal Laplacian variance ir kraštų gradientų stiprumą.
- Kontrastas pagal 2–98 procentilių šviesumo diapazoną.
- Šviesių ir tamsių detalių praradimas.
- Skaitmeninio triukšmo apytikslis aukšto dažnio likučio indikatorius.
- Galimi JPEG blokavimo artefaktai.
- Spalvų sodrumo ir bendro spalvų balanso indikatoriai.

### Spausdintuvo parinkimas
- Iki 30,5 cm spaudinio pločio imamas Noritsu QSS-3701 scenarijus.
- Didesniam nei 30,5 cm pločiui imamas Mimaki JV100-160 scenarijus.
- Tikslinė raiška interpoliuojama pagal „Kokybės nustatymuose“ esančią spaudos dydžio skalę. Didesniems spaudiniams naudojamas mažesnis DPI tikslas, nes jie paprastai žiūrimi iš toliau.

### Svarbūs apribojimai
Matematiniai indikatoriai yra diagnostinės heuristikos, o ne laboratorijoje kalibruotas spaudos kokybės matavimas. Aštrumo balas priklauso ir nuo vaizdo turinio, todėl galutiniam slenksčių sukalibravimui reikės realių gerų ir blogų nuotraukų pavyzdžių bei atspausdintų rezultatų. JPEG artefaktų indikatorius neidentifikuoja pakartotinių išsaugojimų skaičiaus. AI IQA modelis šiame etape dar neprijungtas.


### Vietinio AI modelio planuojama integracija
Naršyklės saugumo apribojimai neleidžia įprastai svetainei savarankiškai įsiminti ir vėliau skaityti bet kurio kompiuterio aplanko kelio. Todėl vietiniam modeliui reikės mažo vietinio Node.js pagalbinio proceso: naudotojas vieną kartą pasirenka modelio failą, kelias įrašomas į vietinį konfigūracijos failą, o aplikacija kreipiasi į `localhost` analizės API. Modelio svoriai liktų kompiuteryje ir nebūtų siunčiami kiekvieną kartą iš naujo. Ši paslauga dar neįdiegta v2.1.0.


## 2.1.1 pataisymas
- Pašalinta neegzistuojančio `score` kintamojo nuoroda, dėl kurios kokybės analizė nutrūkdavo su `score is not defined` klaida.
