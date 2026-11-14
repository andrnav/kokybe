# Photo Quality AI – beta 1.0

Nauja lokali nuotraukų kokybės tikrinimo aplikacija.

## Paleidimas
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## GitHub Pages
Projektas sukonfigūruotas publikuoti iš `andrnav/kokybe` šakninio Vite build'o (`base: '/kokybe/'`). Reikės GitHub Actions workflow arba Pages deploy konfigūracijos.

## Privatumas
Nuotraukos nėra siunčiamos į aplikacijos serverį. AI modeliai atsisiunčiami iš Hugging Face į naršyklę ir gali būti saugomi Cache API.

## Svarbūs beta apribojimai
- Šiame leidime AI kokybės modelių ONNX įvesties / išvesties kontraktas dar turi būti patikrintas su realiu modelio vykdymu konkrečiose naršyklėse. Jei išvesties mastelis neatpažįstamas, programa sąmoningai nerodo balo.
- Veidų ir akių lokali analizė dar neįjungta. UI ir architektūra paruošta kitam etapui; bendro NR-IQA balo negalima laikyti veido ryškumo detektoriumi.
- TIFF / BigTIFF analizė dar nepalaikoma.
- PPI profiliai yra laboratoriniai orientaciniai slenksčiai, juos reikia kalibruoti su realiais spaudiniais.
- ONNX modelių failų dydžiai ir prieinamumas priklauso nuo modelių saugyklos. Modeliai neįtraukti į ZIP, kad GitHub saugykla nebūtų užpildyta dideliais binariniais failais.

## Modelių šaltinis
86Cao/IQA-ONNX-Models (Apache-2.0 pagal modelio kortelę): MUSIQ, DBCNN, HyperIQA ir kiti.
