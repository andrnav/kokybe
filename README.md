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
