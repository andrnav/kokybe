# FotoKadravimas v1.1

## Paleidimas vietoje

```bash
npm install
npm run dev
```

## GitHub Pages

Projektas sukonfigūruotas publikavimui adresu `https://andrnav.github.io/kokybe/` iš `test` branch per GitHub Actions. Saugyklos `Settings → Pages → Build and deployment → Source` turi būti pasirinkta `GitHub Actions`.

## Šios versijos pakeitimai

- Viena kadravimo geometrija naudojama pagrindinei peržiūrai, miniatiūroms ir JPEG eksportui.
- Pasirinktas formatas visada išlaiko tikslią proporciją, nepriklausomai nuo peržiūros lango dydžio.
- Nuotrauka pritaikoma pagal tikrą jos proporciją, o ne ištempiama iki lango dydžio.
- Kadravimo pradžia centruojama, o nuotrauką galima stumdyti ir priartinti.
- Apatinės miniatiūros rodo jau apkirptą rezultatą. Būsenos žymimos miniatiūros rėmelio spalva, be žalio burbulo.
- Originalūs failai nekeičiami.
