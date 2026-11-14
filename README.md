# Photo Quality AI 2.0

Naršyklėje veikiantis nuotraukų kokybės prototipas. Nuotraukos originalas nėra siunčiamas į serverį: vaizdas apdorojamas naršyklėje, o ONNX modelių failai atsisiunčiami iš Hugging Face ir talpinami Cache API.

## Trys analizės režimai

- **Pilna:** MUSIQ, 224 × 224 įvestis, `[-1, 1]` normalizacija, dokumentuota 0–100 skalė.
- **Optimizuota:** HyperIQA, ImageNet normalizacija, penkių iškarpų vidurkis, dokumentuota 0–1 skalė konvertuojama į 0–100.
- **Mažoji:** DBCNN, ImageNet normalizacija, dokumentuota 0–100 skalė.

Kiekvienam modeliui atskirai parsisiunčiami abu failai: `.onnx` ir `.onnx.data`. ONNX Runtime Web `externalData` parametre perduodamas papildomas failas su tiksliu modelio viduje nurodytu keliu. Failai saugomi naršyklės Cache API, jei naršyklė leidžia.

## Paleidimas

```bash
npm install
npm run dev
```

## Sukūrimas GitHub Pages

```bash
npm run build
```

Vite bazinis kelias nustatytas į `/kokybe/`, kaip ir ankstesnėje `andrnav/kokybe` saugykloje.

## Privatumas ir tinklo naudojimas

- Nuotraukos turinys nekeliamas į Hugging Face ar GitHub.
- Pirmą kartą pasirinkus režimą, atsisiunčiami jo modelio failai. Dydžiai pagal modelio kortelę: DBCNN apie 59 MB, HyperIQA apie 105 MB, MUSIQ apie 104 MB.
- Modelių atsisiuntimui būtinas internetas. Vėliau failai gali būti naudojami iš naršyklės talpyklos, jei ji jų neišvalė.
- Modelių talpykla yra atskira kiekvienai naršyklei / įrenginiui.

## Modelių kilmė ir ribos

Modeliai: `86Cao/IQA-ONNX-Models` (Hugging Face). Modelio kortelėje nurodyta Apache-2.0 licencija; kortelė taip pat pažymi, kad originalių svorių licencijos gali skirtis. Modelių kortelėje nurodyti įvesties dydžiai, normalizacija ir rezultatų skalės.

Tai NR-IQA modeliai, kurie prognozuoja bendrą suvokiamą vaizdo kokybę. Jie nėra specializuoti veidų / akių ryškumo, fokusavimo klaidų lokalizavimo ar triukšmo žemėlapio modeliai. Šioje versijoje AI balas neturi būti interpretuojamas kaip patvirtinta spaudos garantija. PPI vertinimas yra atskiras techninis skaičiavimas.

## Svarbu prieš gamybinį naudojimą

`npm run build` patikrina TypeScript ir Vite kompiliaciją, bet neįrodo, kad visi modeliai sėkmingai veikia kiekvienoje Safari / Chrome versijoje ar GPU tvarkyklėje. Prieš realų laboratorijos naudojimą būtina atlikti naršyklės testus su realiais failais ir palyginti modelių prognozes su atspaudais.
