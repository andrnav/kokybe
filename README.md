# FotoKadravimas v1

React + Vite nuotraukų kadravimo aplikacija.

## Paleidimas lokaliai

```bash
npm install
npm run dev
```

## Publikavimas GitHub Pages

Šis projektas paruoštas adresui `https://andrnav.github.io/kokybe/` ir `test` branch.

1. Įkelkite visą projekto turinį į `kokybe` saugyklos `test` branch, įskaitant paslėptą `.github` aplanką.
2. GitHub atidarykite **Settings → Pages**.
3. Skiltyje **Build and deployment → Source** pasirinkite **GitHub Actions**. **Nesirinkite „Deploy from a branch“**, nes tada GitHub pateiks neapdorotą `index.html` ir naršyklė bandys vykdyti JSX failą tiesiogiai.
4. Atidarykite **Actions** ir paleiskite arba palaukite „Deploy FotoKadravimas to GitHub Pages“ veiksmą. Jis turi baigtis žalia varnele.
5. Tik tada atidarykite `https://andrnav.github.io/kokybe/`.

Kiekvienas naujas pakeitimas `test` branch automatiškai paleis naują publikavimą.
