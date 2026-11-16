import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LEVELS, evaluate, evaluateFree, fmt1, sharpnessCells, summarizeRegion } from './engine.js';
import { PRESETS, NORM_OPTIONS } from './onnxModel.js';
import { regionKey } from './analyze.js';

const MODE_LABEL = { crop: 'Kadravimas', fit: 'Įtalpinta', real: 'Real Size', free: 'Laisvas' };

// Nustatymų laukai: p – kelias cfg objekte
const FIELDS = [
  { p: ['printerOverride'], label: 'Spausdintuvas', select: [['auto', 'Automatiškai pagal dydį'], ['noritsu', 'Visada Noritsu QSS-3701'], ['mimaki', 'Visada Mimaki JV100-160']] },
  { p: ['maxMinilabCm'], label: 'Noritsu: trumpesnė kraštinė iki (cm)', step: 0.5 },
  { p: ['maxMinilabLongCm'], label: 'Noritsu: ilgesnė kraštinė iki (cm)', step: 1 },
  { p: ['printers', 'noritsu', 'nativeDpi'], label: 'Noritsu skiriamoji geba (dpi)', step: 10 },
  { p: ['printers', 'mimaki', 'nativeDpi'], label: 'Mimaki skiriamoji geba (dpi)', step: 10 },
  { p: ['k'], label: 'Žiūrėjimo atstumas (× įstrižainė)', step: 0.05 },
  { p: ['minCm'], label: 'Mažiausias atstumas (cm)', step: 5 },
  { p: ['maxCm'], label: 'Didžiausias atstumas (cm)', step: 5 },
  { p: ['fractions', 'puiki'], label: '„Puiki“ nuo (dalis reikiamo dpi)', step: 0.05 },
  { p: ['fractions', 'gera'], label: '„Gera“ nuo', step: 0.05 },
  { p: ['fractions', 'tinka'], label: '„Tinka“ nuo', step: 0.05 },
  { p: ['fractions', 'ribine'], label: '„Ribinė“ nuo', step: 0.05 },
  { p: ['sharp', 'veryBlurry'], label: 'Labai neryški, jei detalumas <', step: 5 },
  { p: ['sharp', 'blurry'], label: 'Neryški, jei detalumas <', step: 5 },
  { p: ['motion', 'anisotropy'], label: 'Judesio suliejimas, jei kryptingumas ≥', step: 0.25 },
  { p: ['upscale', 'warn'], label: 'Įspėti dėl padidinimo nuo (× kartų)', step: 0.1 },
  { p: ['noise', 'high'], label: 'Didelis šviesos triukšmas nuo σ', step: 0.5 },
  { p: ['noise', 'chromaHigh'], label: 'Didelis spalvų triukšmas nuo σ', step: 0.5 },
  { p: ['noise', 'dark'], label: 'Didelis triukšmas šešėliuose nuo σ', step: 0.5 },
  { p: ['jpeg', 'warn'], label: 'JPEG kokybė: įspėti, jei <', step: 5 },
  { p: ['jpeg', 'bad'], label: 'JPEG kokybė: bloga, jei <', step: 5 },
  { p: ['jpeg', 'blockWarn'], label: 'JPEG blokeliai: įspėti nuo', step: 0.05 },
  { p: ['jpeg', 'blockBad'], label: 'JPEG blokeliai: bloga nuo', step: 0.05 },
  { p: ['exposure', 'brightClipBad'], label: 'Išdegę šviesūs plotai nuo (%)', step: 1 },
  { p: ['exposure', 'channelClip'], label: 'Išdegęs kanalas nuo (%)', step: 0.5 },
  { p: ['exposure', 'shadowClip'], label: 'Užstrigę šešėliai nuo (%)', step: 1 },
  { p: ['exposure', 'lowContrast'], label: 'Žemas kontrastas, jei tonų ribos <', step: 5 },
  { p: ['aiBad'], label: 'CLIP AI laiko problema, jei tikimybė <', step: 0.05 },
  { p: ['model', 'bad'], label: 'Įkeltas modelis: žemai, jei įvertis <', step: 0.05 },
  { p: ['model', 'veryBad'], label: 'Įkeltas modelis: labai žemai, jei <', step: 0.05 },
];
const DISTANCES = [['near', 'Arti'], ['normal', 'Įprastai'], ['far', 'Toli']];
const MAP_COLORS = ['rgba(0,0,0,0)', 'rgba(220,38,38,.55)', 'rgba(245,158,11,.5)', 'rgba(34,197,94,.35)'];

// Ryškumo žemėlapis: visa nuotrauka su spalvotomis plytelėmis ir kadro rėmeliu
function SharpMap({ photo, grid, region, cfg }) {
  const ref = useRef(null);
  const w = 104, h = Math.max(40, Math.round(w * photo.height / photo.width));
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, w, h);
    const k = w / photo.width;
    for (const cell of sharpnessCells(grid, cfg)) {
      ctx.fillStyle = MAP_COLORS[cell.cls];
      ctx.fillRect(cell.x * k, cell.y * k, cell.size * k, cell.size * k);
    }
    if (region) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(region.x * k, region.y * k, region.w * k, region.h * k);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.strokeRect(region.x * k - 1, region.y * k - 1, region.w * k + 2, region.h * k + 2); }
  }, [photo, grid, region, cfg, w, h]);
  return <div className="q-map" style={{ width: w, height: h }}>
    <img src={photo.url} alt="" />
    <canvas ref={ref} width={w} height={h} />
  </div>;
}
const getP = (o, p) => p.reduce((a, k) => a[k], o);

export default function QualityTab({ photos, thumbs, getPrint, quality, activeId, onOpen, appMessage }) {
  const { cfg, analysis, job, ai, mdl, analyzeAll, loadAi, runAi, stopAi, pickModel, runModel, setModelSettings, forgetModel, updateConfig, resetConfig } = quality;
  const [onlyBad, setOnlyBad] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const dataFileRef = useRef(null);

  const rows = useMemo(() => photos.map((p, i) => {
    const a = analysis[p.id] || {};
    const print = getPrint(p);
    const metrics = a.grid ? summarizeRegion(a.grid, print.region, cfg) : null;
    const q = print.free
      ? evaluateFree(metrics, a.ai, a.model, cfg)
      : evaluate({ dpi: print.effDpi, cmW: print.wCm, cmH: print.hCm, metrics, ai: a.ai, model: a.model }, cfg);
    const rk = regionKey(print.region);
    const stale = !!((a.ai && a.ai.rk !== rk) || (a.model && a.model.rk !== rk));
    return { p, i, a, print, q, metrics, stale };
  }), [photos, analysis, cfg, getPrint]);

  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, free: 0 };
  rows.forEach(r => { if (r.q.free) counts.free++; else counts[r.q.level]++; });
  const analyzed = photos.filter(p => analysis[p.id]?.grid).length;
  const modelDone = photos.filter(p => analysis[p.id]?.model).length;
  const aiDone = photos.filter(p => analysis[p.id]?.ai).length;
  const shown = onlyBad ? rows.filter(r => !r.q.free && r.q.level <= 2) : rows;
  const problems = counts[1] + counts[2];
  const activeExists = photos.some(p => p.id === activeId);

  return <section className="quality-page" aria-label="Nuotraukos kokybė">
    <div className="quality-inner">
      <div className="q-head">
        <div className="q-ctx">
          Kiekviena nuotrauka vertinama pagal <b>jos pasirinktą formatą ir kadravimo tipą</b> (keičiama skirsnyje „Kadravimas“).
          Spausdintuvas parenkamas automatiškai: iki {fmt1(cfg.maxMinilabCm)} cm pločio – {cfg.printers.noritsu.name.split(' (')[0]}, didesniems – {cfg.printers.mimaki.name.split(' (')[0]}.
        </div>
        <div className="q-dist" role="group" aria-label="Žiūrėjimo atstumas">
          <span className="muted">Kaip žiūrima į atspaudą:</span>
          {DISTANCES.map(([v, t]) => <button key={v} className={cfg.distance === v ? 'primary' : 'secondary'} aria-pressed={cfg.distance === v} onClick={() => updateConfig(['distance'], v)}>{t}</button>)}
        </div>
        <div className="q-actions">
          <button className="primary" onClick={analyzeAll} disabled={!photos.length || job.analyzing}>Analizuoti nuotraukas</button>
          <label className="q-only"><input type="checkbox" checked={onlyBad} onChange={e => setOnlyBad(e.target.checked)} /> tik problemines</label>
          <label className="q-only"><input type="checkbox" checked={showMap} onChange={e => setShowMap(e.target.checked)} /> ryškumo žemėlapis</label>
          <span className="q-status">{job.text}</span>
        </div>
      </div>

      <div className="q-summary">
        {[5, 4, 3, 2, 1].map(l => <span key={l} className="q-sum"><span className={`q-badge ${LEVELS[l].cls}`}>{LEVELS[l].label}</span><b>{counts[l]}</b></span>)}
        {counts.free > 0 && <span className="q-sum"><span className="q-badge neutral">Laisvas</span><b>{counts.free}</b></span>}
        <span className="q-sum muted">Išanalizuota: <b>{analyzed}/{photos.length}</b></span>
        {aiDone > 0 && <span className="q-sum muted">CLIP AI: <b>{aiDone}/{photos.length}</b></span>}
        {modelDone > 0 && <span className="q-sum muted">Modelis: <b>{modelDone}/{photos.length}</b></span>}
        {problems > 0 && <span className="q-sum q-problem">Nerekomenduojama / ribinė: <b>{problems}</b></span>}
      </div>

      <div className="q-ai">
        <div className="q-ai-head"><b>Savo AI modelis iš failo (.onnx)</b> <span className="muted">(neprivaloma, veikia jūsų naršyklėje, be raktų ir be paskyros)</span></div>
        <p className="muted">
          Modelio failą parsisiunčiate patys (pvz. iš Hugging Face „86Cao/IQA-ONNX-Models“: DBCNN ~59 MB, HyperIQA ~105 MB, MUSIQ ~104 MB, MANIQA ~437 MB, TReS ~575 MB) ir vieną kartą pasirenkate čia.
          Naršyklė negali pati skaityti failo iš Desktop, todėl failas išsaugomas šios naršyklės saugykloje ir vėliau kraunamas automatiškai (kitoje naršyklėje ar adresu reikės pasirinkti iš naujo).
          Nuotraukos niekur nesiunčiamos. Vertinamas ir bendras kadras, ir tikri detaliausi fragmentai.
        </p>
        <div className="q-ai-actions">
          <label className="secondary q-file">{mdl.stored ? 'Pakeisti modelio failą…' : 'Pasirinkti modelio failą (.onnx)…'}
            <input type="file" accept=".onnx" hidden disabled={mdl.loading || mdl.running}
              onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) pickModel(f, dataFileRef.current); }} /></label>
          <label className="q-datafile muted">papildomas „.data“ failas (tik jei modelis jį turi):
            <input type="file" accept=".data" disabled={mdl.loading || mdl.running} onChange={e => { dataFileRef.current = e.target.files[0] || null; }} /></label>
        </div>
        {mdl.stored && <>
          <div className="q-model-meta"><b>{mdl.stored.name}</b> · {(mdl.stored.size / 1048576).toFixed(0)} MB{mdl.stored.dataName ? ` + ${mdl.stored.dataName}` : ''} · išsaugota naršyklėje</div>
          <div className="q-grid">
            <label>Modelio tipas (įvesties / išvesties nuostatos)
              <select value={mdl.stored.preset} onChange={e => { const p = PRESETS[e.target.value]; setModelSettings({ preset: e.target.value, norm: p.norm, lo: p.lo, hi: p.hi }); }}>
                {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label>Vaizdo normalizavimas
              <select value={mdl.stored.norm} onChange={e => setModelSettings({ norm: e.target.value, preset: 'custom' })}>
                {NORM_OPTIONS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            <label>Išvestis = 0 % kai
              <input type="number" step="any" value={mdl.stored.lo} onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setModelSettings({ lo: v, preset: 'custom' }); }} /></label>
            <label>Išvestis = 100 % kai
              <input type="number" step="any" value={mdl.stored.hi} onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setModelSettings({ hi: v, preset: 'custom' }); }} /></label>
          </div>
          <div className="q-ai-actions">
            <button className="secondary" onClick={() => runModel(null)} disabled={mdl.running || mdl.loading || !photos.length}>Modelis: įvertinti visas</button>
            <button className="secondary" onClick={() => runModel([activeId])} disabled={mdl.running || mdl.loading || !activeExists}>Modelis: tik pasirinktą</button>
            {mdl.running && <button className="secondary" onClick={stopAi}>Sustabdyti</button>}
            <button className="secondary" onClick={forgetModel} disabled={mdl.running || mdl.loading}>Pašalinti iš naršyklės</button>
            <label className="q-only"><input type="checkbox" checked={cfg.model.affects} onChange={e => updateConfig(['model', 'affects'], e.target.checked)} /> modelis keičia įvertinimą (kitaip tik rodomas)</label>
          </div>
        </>}
        <span className={`q-status ${mdl.error ? 'err' : ''}`}>{mdl.text}</span>
        {mdl.pct != null && <div className="q-bar"><i style={{ width: `${mdl.pct}%` }} /></div>}
      </div>

      <details className="q-ai">
        <summary><b>Mažas CLIP AI (atsisiunčiamas automatiškai)</b> <span className="muted">(~150 MB, neprivaloma)</span></summary>
        <p className="muted">
          Alternatyva be failų: atsisiunčiamas CLIP modelis, kuris įvertina ryškumą, triukšmą ir bendrą kokybę. Tai papildoma nuomonė po matematinės analizės, o ne vietoj jos.
        </p>
        <div className="q-ai-actions">
          {!ai.ready && <button className="secondary" onClick={loadAi} disabled={ai.loading}>{ai.loading ? 'Siunčiama…' : 'Atsisiųsti ir įjungti CLIP AI'}</button>}
          {ai.ready && <>
            <button className="secondary" onClick={() => runAi(null)} disabled={ai.running || !photos.length}>CLIP AI: įvertinti visas</button>
            <button className="secondary" onClick={() => runAi([activeId])} disabled={ai.running || !activeExists}>CLIP AI: tik pasirinktą</button>
          </>}
          {ai.running && <button className="secondary" onClick={stopAi}>Sustabdyti</button>}
          <span className={`q-status ${ai.error ? 'err' : ''}`}>{ai.text}</span>
        </div>
        {ai.pct != null && <div className="q-bar"><i style={{ width: `${ai.pct}%` }} /></div>}
      </details>

      <div className="q-list">
        {!photos.length && <div className="q-empty">Nuotraukų dar nėra. Įkelkite jas skirsnyje „Kadravimas“.</div>}
        {photos.length > 0 && !shown.length && <div className="q-empty">Problemų nerasta.</div>}
        {shown.map(({ p, i, a, print, q, stale }) => (
          <div key={p.id} className={`q-row ${p.id === activeId ? 'current' : ''}`} role="button" tabIndex={0}
            title="Atidaryti kadravimo skirsnyje" onClick={() => onOpen(p.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id); } }}>
            {showMap && a.grid
              ? <SharpMap photo={p} grid={a.grid} region={print.region} cfg={cfg} />
              : <img className="q-thumb" src={thumbs.get(p.id) || p.url} alt="" />}
            <div className="q-id">
              <div className="q-name" title={p.name}>{p.name}</div>
              <div className="q-sub">
                {p.width}×{p.height} px · {print.free ? 'laisvas kadras' : `${print.wCm}×${print.hCm} cm · ${MODE_LABEL[print.mode] || print.mode}`}
              </div>
              <span className={`q-badge ${q.cls}`}>{q.label}</span>
            </div>
            <div className="q-res">
              <ul className="q-why">{q.reasons.map((r, k) => <li key={k} className={r.tone}>{r.text}</li>)}</ul>
              <div className={`q-adv ${q.cls}`}>{q.advice}</div>
              {!a.grid && !print.free && <div className="q-pending">Vaizdo kokybė dar nevertinta – spauskite „Analizuoti nuotraukas“. Kol kas vertinama tik pagal dpi.</div>}
              {stale && <div className="q-pending">Modelio / AI įvertis gautas prieš keičiant kadravimą – paleiskite vertinimą iš naujo.</div>}
              {showMap && a.grid && <div className="q-maplegend muted"><i className="r" /> labai neryšku <i className="o" /> neryšku <i className="g" /> ryšku · baltas rėmelis – kadras</div>}
            </div>
          </div>
        ))}
      </div>

      <details className="q-box">
        <summary>Vertinimo nustatymai</summary>
        <div className="q-grid">
          {FIELDS.map(f => <label key={f.p.join('.')}>{f.label}
            {f.select
              ? <select value={getP(cfg, f.p)} onChange={e => updateConfig(f.p, e.target.value)}>{f.select.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              : <input type="number" step={f.step} value={getP(cfg, f.p)} onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) updateConfig(f.p, v); }} />}
          </label>)}
        </div>
        <button className="secondary" onClick={resetConfig}>Atstatyti numatytuosius</button>
        <p className="q-note">Šie nustatymai skirti tik šiam skirsniui. Kadravimo įrankių juostoje rodomas kokybės indikatorius naudoja atskirą skalę iš krumpliaračio nustatymų.</p>
      </details>

      <details className="q-box">
        <summary>Kaip vertinama kokybė</summary>
        <div className="q-how">
          <p><b>1. Efektyvus dpi.</b> Nuotraukos taškai po kadravimo dalijami iš atspaudo pločio coliais (Įtalpinta režime įskaitomas ir priartinimas). Rezultatas lyginamas su „reikiamu“ dpi:
            akies skiriamoji geba ribota, todėl reikiamas dpi ≈ 3438 ÷ žiūrėjimo atstumas coliais. Atstumas = 1,25 × atspaudo įstrižainė, bet ne mažiau nei 30 cm (nuotrauka rankoje) ir ne daugiau nei 60 cm
            (prie didelio atspaudo vis tiek prieinama arčiau). Todėl maža nuotrauka reikalauja daug didesnio dpi (~290 dpi 10×15), o didelė – mažesnio (~145 dpi).
            Tai atitinka įprastas rekomendacijas: nuotraukoms 200–300 dpi, dideliems plakatams 100–150 dpi.</p>
          <p><b>2. Spausdintuvas.</b> Jei trumpesnė kraštinė ≤ {fmt1(cfg.maxMinilabCm)} cm ir ilgesnė ≤ {fmt1(cfg.maxMinilabLongCm)} cm – Noritsu QSS-3701 (lazeris, 300 dpi, Fuji DP II), kitaip – Mimaki JV100-160.</p>
          <p><b>3. Tik kadro sritis.</b> Vaizdas analizuojamas ties tikrais taškais iš iki 400 fragmentų (128×128 px) visoje nuotraukoje, o vertinimui imami tik fragmentai, patenkantys į pasirinktą kadrą
            (Kadravimas, Įtalpinta su priartinimu, Real Size, Laisvas). Pakeitus kadravimą, vertinimas perskaičiuojamas iš karto, nereikia analizuoti iš naujo.</p>
          <p><b>4. Ryškumas ir neryškumo rūšis.</b> Detalumas – Laplaso dispersija su triukšmo pataisa (imama ryškiausių fragmentų reikšmė). „Ryškumo žemėlapis“ spalvina fragmentus (raudona – labai neryšku, oranžinė – neryšku, žalia – ryšku).
            Neryškumui palyginamos keturių krypčių gradientų energijos: jei viena kryptis smarkiai silpnesnė (kryptingumas ≥ {fmt1(cfg.motion.anisotropy)}×), tai judesio suliejimas, jei visos panašios – nefokusavimas.</p>
          <p><b>5. Tikroji raiška.</b> Palyginamas vieno ir dviejų taškų žingsnio gradientas: padidintoje, suliesintoje ar stipriai suglaudintoje nuotraukoje smulkių detalių nėra, nors taškų daug
            (pvz. ~1200 px detalių 4000 px faile). Įspėjama, kai apskaičiuotas padidinimas ≥ {fmt1(cfg.upscale.warn)}× ir detalumas ne aukštas; tokiai nuotraukai dpi mažinamas atitinkamai (kartu su neryškumu nesumuojama).</p>
          <p><b>6. JPEG glaudinimas.</b> Iš JPEG failo kvantavimo lentelių apskaičiuojama kokybė (0–100) ir spalvų pavyzdžiavimas; papildomai ieškoma 8×8 blokelių ribų vaizde (veikia ir PNG, jei jis buvo išsaugotas iš suglaudinto JPEG). Dvigubai padidintos nuotraukos kartais duoda klaidingą blokelių signalą.</p>
          <p><b>7. Šešėliai ir šviesūs plotai.</b> Išdegimas atskirai pagal R/G/B kanalus, užstrigę šešėliai, triukšmas tamsiose zonose, kontrastas (2–98 procentilis) ir kontrajutės požymis (kadre vienu metu daug tamsių ir išdegusių plotų). Spalvos ir atspalviai nevertinami – juos koreguojate gamindami.</p>
          <p><b>8. Šviesos ir spalvų triukšmas.</b> Immerkaer metodas atskirai šviesumui ir spalvų skirtumų kanalams; spalvų triukšmas matomas kaip spalvotos dėmelės.</p>
          <p><b>9. Žiūrėjimo atstumas.</b> „Arti / Įprastai / Toli“ keičia žiūrėjimo atstumą (×0,7 / ×1 / ×1,6) ir kartu reikiamą dpi.</p>
          <p><b>10. AI (neprivaloma).</b> Galite įkelti savo ONNX modelį (DBCNN, HyperIQA, MUSIQ, MANIQA, TReS…) arba naudoti mažą CLIP AI. Modelių įverčiai su žmonių vertinimais koreliuoja tik iš dalies, todėl jie gali sumažinti įvertinimą ne daugiau kaip vienu laipsniu
            (labai žemas modelio įvertis – dviem). Jų ribas galima keisti, o įtaką – išjungti.</p>
          <p className="muted">Visos ribos yra pradinės vertės, patikrintos tik su sintetinėmis nuotraukomis – pasitikrinkite su savo tikrais atspaudais ir pakoreguokite nustatymuose.</p>
          <p className="muted">Šaltiniai:{' '}
            <a href="https://www.northlight-images.co.uk/?p=7040" target="_blank" rel="noopener noreferrer">Northlight Images – skiriamoji geba ir atstumas</a> ·{' '}
            <a href="https://letsenhance.io/blog/all/image-resolution-print-quality/amp/" target="_blank" rel="noopener noreferrer">Print resolution standards</a> ·{' '}
            <a href="https://arxiv.org/pdf/2207.12396v1" target="_blank" rel="noopener noreferrer">CLIP-IQA</a> ·{' '}
            <a href="https://minilab.com.ua/en/description/noritsu/qss37hd" target="_blank" rel="noopener noreferrer">Noritsu QSS-37 specifikacija</a> ·{' '}
            <a href="https://mimaki.com/product/inkjet/i-roll/jv100-160/specification.html" target="_blank" rel="noopener noreferrer">Mimaki JV100-160</a></p>
        </div>
      </details>
    </div>
    {appMessage ? <div className="q-footer-msg">{appMessage}</div> : null}
  </section>;
}
