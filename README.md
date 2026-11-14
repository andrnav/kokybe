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
