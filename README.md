# Foto inspektorius 2.1.0

Atnaujintas „Nuotraukos kokybė“ puslapis. Jis skirtas vienai nuotraukai įkelti, konkrečiam spaudos formatui pasirinkti, kadrui pele pastumti, pasukti ir priartinti, o tada analizuoti tiksliai tą patį apkirptą vaizdą.

## Kadravimas ir analizė
- Nuotrauka apkerpama pagal pasirinktą spaudos formato proporciją.
- Peržiūros kadras ir AI modeliams perduodamas vaizdas generuojami iš tos pačios apkirpimo geometrijos.
- Galima stumdyti nuotrauką pele arba pirštu, pasukti 90° žingsniais, keisti priartinimą ir atkurti pradinę nuotraukos padėtį.
- Pakeitus „Foto spauda“ / „Platiaformatė spauda“ tipą, formatas grąžinamas į atitinkamą numatytą dydį, todėl ankstesnis 100 × 150 cm pasirinkimas nebeturi likti aktyvus foto spaudos režime.

## Kaip skaičiuojamas 1–10 spaudos balas
Tai matematinis raiškos tinkamumo įvertinimas, o ne AI modelių vidurkis:
1. Iš galutinio apkirpimo nustatomas plotis ir aukštis pikseliais.
2. Kiekviena kraštinė padalijama iš atitinkamo spaudos dydžio coliais (cm / 2,54). Taip gaunamas DPI.
3. Mažesnis iš dviejų DPI skaičių lyginamas su rekomenduojamu DPI, kuris nustatomas pagal spaudos kraštinės dydį ir kokybės nustatymų lentelę.
4. Santykis paverčiamas į 1–10 balą: ≥150% = 10; ≥125% = 9; ≥110% = 8; ≥100% = 7; ≥90% = 6; ≥80% = 5; ≥70% = 4; ≥60% = 3; ≥45% = 2; mažiau = 1.

Todėl pasirinkus kitą AI modelį ar jų skaičių DPI balas nesikeičia. Tai sąmoninga: modelių išvestys turi skirtingas, tarpusavyje nesuderintas skales. Jų neapdoroti rezultatai rodomi atskirai. Modeliai vertina suvokiamą vaizdo kokybę, o DPI skaičiavimas vertina, ar turimos detalės pakanka nurodytam fiziniam spaudos dydžiui.

## Paleidimas
```bash
npm install
npm run dev
```

Modeliai veikia naršyklėje per ONNX Runtime Web ir pirmą kartą atsisiunčiami iš modelių saugyklos. Tolimesnis veikimas priklauso nuo naršyklės cache nustatymų.


## v2.1.1 pataisymai
- Spaudos kadro peržiūra išlaiko tikrą formato proporciją ir nebėra tempiama per visą plotį.
- Centrinė peržiūra apribota pagal ekrano aukštį ir plotį.
- AI modelių rezultatai rodomi aiškiai atskirai; žinomos DBCNN, HyperIQA, MUSIQ ir CLIPIQA skalės orientaciškai perskaičiuojamos į 1–10.
- MANIQA skaitinė skalė neperverčiama, nes šio modelio kortelėje nepateikta patikima riba.


## v2.2.0 – nuotraukos kokybės santrauka
Po analizės pateikiama viena aiški apkirpto kadro santrauka: spaudos tinkamumas, tikslus DPI, ryškumo ir susiliejimo rizikos indikatorius, triukšmo indikatorius, ekspozicija, AI modelių bendras signalas ir galutinė rekomendacija. DPI skaičiuojamas pagal apkirpto vaizdo pikselius ir pasirinktą fizinį spaudos dydį. Ryškumo, triukšmo ir ekspozicijos reikšmės yra automatiniai vaizdo signalų įverčiai, ne laboratoriniai matavimai.


## v2.3.1 – build pataisymas ir sąsajos supaprastinimas
- Atkurta pilna pagrindinio JSX komponento struktūra, kuri v2.3.0 archyve buvo netyčia nukirsta.
- AI modelių pasirinkimo sąrašas pašalintas iš pagrindinės šoninės juostos; naudojami numatytieji analizės modeliai.
- Priartinimo valdikliai perkelti ant nuotraukos, palaikomas pelės ratukas.
- AI techniniai rezultatai paslėpti nuo pagrindinio naudotojo vaizdo; palikta kokybės santrauka.


## v2.4.0 – matematinė nuotraukos analizė
- Pašalintas ONNX Runtime AI modelių vykdymas ir modelių pasirinkimas.
- Analizuojamas tik galutinis apkirptas kadras.
- Kadras dalijamas į 8 × 8 (64) diagnostines zonas.
- Naudojami Laplacian Variance, Tenengrad/Sobel kraštų stiprumas, triukšmo indikatorius, ekspozicijos ir 8 px blokų ribų indikatoriai.
- Žalios, raudonos ir neutralios zonos rodomos ant nuotraukos; jas galima įjungti arba išjungti.
- FFT atskiras matavimas šiame leidime dar neįgyvendintas ir nėra pristatomas kaip atliktas.
- Rodiklių ribos yra pradinės heuristikos. Reikia patikrinti su ryškių, išplaukusių, triukšmingų ir lygių sričių pavyzdžiais.


## v2.4.2 pataisymas
- Atkurta trūkstama `Sparkles` piktogramos importo deklaracija, dėl kurios naršyklėje įvykdavo `ReferenceError` ir puslapis likdavo tuščias.


## v2.5.0 – „Kadruoklis“ vertinimo logikos perkėlimas
- Perkelta spaudos vertinimo logika: žiūrėjimo atstumas, Noritsu/Mimaki profiliai, efektyvios raiškos korekcija pagal ryškumą, Immerkaer triukšmo įvertis, ekspozicijos histogramų statistika ir 5 kokybės lygiai.
- Analizuojamas galutinis apkirptas kadras, o ne pradinis originalas.
- Vertinimo ribas galima keisti rezultatų skiltyje; jos saugomos naršyklėje.
- Claude projekto `ai.js` neperkeltas: jis naudoja bendrą CLIP zero-shot modelį ir tekstines poras, ne atskirai išmokytą CLIP-IQA modelį.
- Perkelti skaitiniai slenksčiai yra pradinės heuristikos. Juos būtina kalibruoti su realiais spaudos pavyzdžiais.


## v2.5.1 – Claude „Kadruoklis“ CLIP modelio integracija
- Įdėtas tas pats `Xenova/clip-vit-base-patch16` modelis iš pateikto `kadruoklis/ai.js`, per Transformers.js 3.8.1, Q8 ir WASM.
- Išsaugotos Claude projekto penkios tekstų poros: bendras kokybės, ryškumo, švaros/triukšmo, šviesumo ir kontrasto vertinimas.
- AI veikia tik paspaudus mygtuką, po to, kai atlikta matematinė apkirpto kadro analizė.
- CLIP vertina centrinį viso kadro fragmentą ir iki keturių matematiškai atrinktų detalių fragmentų.
- AI rezultatas rodomas atskiroje santraukos eilutėje ir gali sumažinti bendrą 1–5 spaudos įvertinimą pagal Claude projekto `aiBad` ribą (numatyta 0,30).
- Modelis atsisiunčiamas pirmą kartą iš Hugging Face per Transformers.js; reikalingas internetas. Vaizdo pikseliai apdorojami lokaliai naršyklėje, į serverį nesiunčiami.
- Svarbu: tai tas pats bendras CLIP ViT modelis ir tekstinių porų metodas iš Claude projekto, o ne atskirai IQA duomenimis išmokytas CLIP-IQA modelis. Jo procentai yra modelio panašumo į tekstinius aprašymus tikimybės tipo balai, ne kalibruota objektyvi nuotraukos kokybės tikimybė.


## v2.5.4 – vieninga analizės ataskaita
- Pašalintas atskiras rezultatų blokas šoninėje juostoje. Visi skaičiavimai pateikiami vienoje detalioje ataskaitoje po nuotraukos peržiūra.
- Pašalintas žalias / raudonas zonų žymėjimas ant nuotraukos.
- Pašalinti atskiri DPI ir raiškos rezultatų blokai; jų duomenys perkelti į vieną ataskaitą.
- Pagrindinis veiksmas pervadintas į „Tikrinti nuotrauką“.
- Jei CLIP modelis jau įkeltas, pagrindinis tikrinimo veiksmas paleidžia ir matematinę, ir CLIP analizę.
- CLIP rezultatai pateikiami po nuotrauka aiškia kalba: bendra kokybė, ryškumas, triukšmas, šviesumas ir kontrastas. Procentai paaiškinami kaip teksto ir vaizdo panašumo balai, o ne objektyvios kokybės tikimybė.


## v2.5.5 – build klaidos pataisymas
- Pašalintas netyčia įterptas antras programos šaltinio fragmentas, kuris sukėlė `Expected ";" but found "React"` klaidą.
- Atkurta viena pilna `src/main.jsx` importų ir programos struktūra.


## v2.5.6 – JSX sintaksės pataisymas
- CLIP išvados bloko `className` išraiška perrašyta be įdėtinio šabloninio teksto, kad JSX parseris neklystų dėl kabučių.


## v2.5.7 – JSX klasės išraiškos pataisymas
- „Kadruoklis“ vertinimo priežasčių sąraše dinaminė CSS klasė perrašyta į paprastą string konkatenaciją.


## v2.5.9 – DPI rekomendacijų ir nustatymų suvienodinimas

- Nuotraukų kokybės DPI tikslai pritaikyti pagal praktinį spaudinio dydį: 10×15 cm – 250 DPI, 15×21 cm – 220 DPI, 20×30 cm – 190 DPI, 30×40 cm – 160 DPI, 30×45 cm – 150 DPI, 50×50 cm – 150 DPI, 60×90 cm – 120 DPI, 100×150 cm ir 100×200 cm – 100 DPI. Tarp dydžių reikšmės interpoliuojamos.
- Spaudos įrenginio DPI yra viršutinė riba, o ne automatinis reikalavimas: Noritsu 300 DPI, Mimaki 360 DPI.
- Žiūrėjimo atstumas rodomas ataskaitoje kaip orientacinis dydis ir skaičiuojamas pagal spaudinio įstrižainę; dideliems spaudiniams nebetaikoma ankstesnė 60 cm riba.
- DPI skalė, spausdintuvų ribos, žiūrėjimo atstumo parametrai ir matematinės analizės slenksčiai valdomi viename viršutiniame nustatymų lange.
- Kokybės analizės puslapyje pašalinti atskiri dubliuoti vertinimo nustatymai.
