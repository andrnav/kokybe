# Foto inspektorius v2.0.3 – naršyklės AI bandymas

Atskira eksperimentinė versija. Originali v2.0.1 nepakeista.

## Paleidimas

```bash
npm install
npm run dev
```

## AI kokybės analizė

Nuotrauka įkeliama, parenkamas spaudos formatas, nustatomas kadro priartinimas ir horizontali / vertikali padėtis. Analizės metu iš šio kadro sukuriamas atskiras PNG, ir būtent jis perduodamas pasirinktiems ONNX NR-IQA modeliams.

Galima pasirinkti vieną ar kelis modelius:
- DBCNN (~59 MB)
- HyperIQA (~105 MB)
- MUSIQ (~104 MB)
- MANIQA (~437 MB)
- CLIPIQA+ (~146 MB)

Modeliai atsisiunčiami iš Hugging Face pirmo panaudojimo metu ir laikomi naršyklės Cache Storage. Keli pasirinkti modeliai vykdomi paeiliui, kad nereikėtų vienu metu laikyti visų modelių aktyvioje RAM.

**Svarbūs apribojimai:**
- Visų penkių modelių failai kartu sudaro apie 851 MB, papildomai gali reikėti atminties vykdymui.
- NR-IQA modelių balai yra skirtingų skalių ir negali būti tiesiogiai lyginami ar vidurkinami.
- Ši versija rodo kiekvieno modelio neapdorotą balą atskirai.
- Kadravimo sąsaja naudoja spaudos formato proporciją, priartinimą ir X/Y padėties slankiklius.
- Šis prototipas nėra patvirtintas spaudos tinkamumo verdiktas. Reikia realių nuotraukų testų ir modelių išvesties / preprocessing patikros.
- Šiuo metu modelių ONNX failų suderinamumas ir inferencija konkrečioje naršyklėje dar nėra patikrinti šiame kūrimo konteineryje.

Modelių ONNX eksportai: https://huggingface.co/86Cao/IQA-ONNX-Models
Originalūs modeliai turi atskiras publikacijas ir licencijų sąlygas. Prieš komercinį diegimą būtina patikrinti kiekvieno svorių rinkinio licenciją.


## Spaudos kokybės įvertinimas 1–10

Ekrane rodomas pagrindinis 1–10 balas yra orientacinis spaudos tinkamumo įvertinimas:
- pagrindas yra apkirpto kadro faktinė DPI raiška, palyginta su pasirinktam spaudos dydžiui nustatytu tiksliniu DPI;
- papildomas nedidelis koregavimas taikomas, jei 3 × 3 ryškumo tinklelis aptinka galimai silpnesnių sričių;
- AI modelių neapdoroti balai nerodomi kaip tariamai tikslus 1–10 įvertinimas, nes kiekvieno modelio skalė ir išvesties reikšmės skiriasi. Modelių rezultatai kol kas pateikiami kaip analizės būsena.

Šis balas nėra laboratorinis spaudos kokybės sertifikatas. Jis padeda suprasti, ar apkirpto kadro raiška pakankama pasirinktam fiziniam dydžiui. Ryškumo tinklelis yra orientacinė heuristika.


### v2.0.3 kadravimo valdymas
- Kokybės analizės peržiūroje horizontalaus ir vertikalaus pozicijos slankiklių nebeliko.
- Priartinus vaizdą, jį galima stumdyti tiesiog pele arba jutikliniu ekranu.
- AI analizė naudoja tą pačią pasirinkto kadro poziciją, kuri matoma peržiūroje.
