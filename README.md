# FotoKadravimas v1.2

## Paleidimas vietoje

```bash
npm install
npm run dev
```

## GitHub Pages

Projektas sukonfigūruotas publikavimui adresu `https://andrnav.github.io/kokybe/` iš `test` branch per GitHub Actions. Saugyklos `Settings → Pages → Build and deployment → Source` turi būti pasirinkta `GitHub Actions`.

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
