import React, { useMemo, useState } from 'react';
import { LEVELS, evaluate, evaluateFree, fmt1 } from './engine.js';

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
  { p: ['noise', 'high'], label: 'Didelis triukšmas nuo σ', step: 0.5 },
  { p: ['exposure', 'brightClipBad'], label: 'Išdegę šviesūs plotai nuo (%)', step: 1 },
  { p: ['aiBad'], label: 'AI laiko problema, jei tikimybė <', step: 0.05 },
];
const getP = (o, p) => p.reduce((a, k) => a[k], o);

export default function QualityTab({ photos, thumbs, getPrint, quality, activeId, onOpen, appMessage }) {
  const { cfg, analysis, job, ai, analyzeAll, loadAi, runAi, stopAi, updateConfig, resetConfig } = quality;

  const rows = useMemo(() => photos.map((p, i) => {
    const a = analysis[p.id] || {};
    const print = getPrint(p);
    const q = print.free
      ? evaluateFree(a.metrics, a.ai, cfg)
      : evaluate({ dpi: print.effDpi, cmW: print.wCm, cmH: print.hCm, metrics: a.metrics, ai: a.ai }, cfg);
    return { p, i, a, print, q };
  }), [photos, analysis, cfg, getPrint]);

  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, free: 0 };
  rows.forEach(r => { if (r.q.free) counts.free++; else counts[r.q.level]++; });
  const analyzed = photos.filter(p => analysis[p.id]?.metrics).length;
  const aiDone = photos.filter(p => analysis[p.id]?.ai).length;
  const shown = rows;
  const problems = counts[1] + counts[2];
  const activeExists = photos.some(p => p.id === activeId);

  return <section className="quality-page" aria-label="Nuotraukos kokybė">
    <div className="quality-inner">
      <div className="q-head">
        <div className="q-ctx">
          Kiekviena nuotrauka analizuojama pagal jos apkirptą kadrą ir pasirinktą spaudos formatą.
          Spausdintuvas parenkamas automatiškai: iki {fmt1(cfg.maxMinilabCm)} cm pločio – {cfg.printers.noritsu.name.split(' (')[0]}, didesniems – {cfg.printers.mimaki.name.split(' (')[0]}.
        </div>
        <div className="q-actions">
          <button className="primary" onClick={analyzeAll} disabled={!photos.length || job.analyzing}>Analizuoti nuotraukas</button>
          <span className="q-status">{job.text}</span>
        </div>
      </div>

      <div className="q-summary">
        {[5, 4, 3, 2, 1].map(l => <span key={l} className="q-sum"><span className={`q-badge ${LEVELS[l].cls}`}>{LEVELS[l].label}</span><b>{counts[l]}</b></span>)}
        {counts.free > 0 && <span className="q-sum"><span className="q-badge neutral">Laisvas</span><b>{counts.free}</b></span>}
        <span className="q-sum muted">Išanalizuota: <b>{analyzed}/{photos.length}</b></span>
        {aiDone > 0 && <span className="q-sum muted">AI: <b>{aiDone}/{photos.length}</b></span>}
        {problems > 0 && <span className="q-sum q-problem">Nerekomenduojama / ribinė: <b>{problems}</b></span>}
      </div>

      <div className="q-ai">
        <div className="q-ai-head"><b>AI antra nuomonė</b> <span className="muted">(neprivaloma, veikia jūsų naršyklėje, be raktų ir be paskyros)</span></div>
        <p className="muted">
          CLIP yra tik papildoma nuomonė. Pagrindinę ataskaitą sudaro matematiniai matavimai.
          Nuotraukos niekur nesiunčiamos. Tai papildoma nuomonė po matematinės analizės, o ne vietoj jos.
        </p>
        <div className="q-ai-actions">
          {!ai.ready && <button className="secondary" onClick={loadAi} disabled={ai.loading}>{ai.loading ? 'Siunčiama…' : 'Atsisiųsti ir įjungti AI'}</button>}
          {ai.ready && <>
            <button className="secondary" onClick={() => runAi(null)} disabled={ai.running || !photos.length}>AI: įvertinti visas</button>
            <button className="secondary" onClick={() => runAi([activeId])} disabled={ai.running || !activeExists}>AI: tik pasirinktą</button>
          </>}
          {ai.running && <button className="secondary" onClick={stopAi}>Sustabdyti</button>}
          <span className={`q-status ${ai.error ? 'err' : ''}`}>{ai.text}</span>
        </div>
        {ai.pct != null && <div className="q-bar"><i style={{ width: `${ai.pct}%` }} /></div>}
      </div>

      <div className="q-list">
        {!photos.length && <div className="q-empty">Nuotraukų dar nėra. Įkelkite jas skirsnyje „Kadravimas“.</div>}
        {shown.map(({ p, i, a, print, q }) => (
          <div key={p.id} className={`q-row ${p.id === activeId ? 'current' : ''}`} role="button" tabIndex={0}
            title="Atidaryti kadravimo skirsnyje" onClick={() => onOpen(p.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id); } }}>
            <img className="q-thumb" src={thumbs.get(p.id) || p.url} alt="" />
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
              {a.metrics && <details className="q-detail" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <summary onClick={e => e.stopPropagation()}>Detali analizė: ką rado sistema</summary>
                <div className="q-detail-grid">
                  <div><b>Ryškumas</b><span>{a.metrics.sharp == null ? 'Nepakanka detalių matavimui' : `${Math.round(a.metrics.sharp)} balų · ${a.metrics.sharp < 25 ? 'galimai išplaukusi' : a.metrics.sharp < 80 ? 'silpnas detalumas' : 'pakankamas detalumo signalas'}`}</span></div>
                  <div><b>Triukšmas</b><span>{a.metrics.noise == null ? 'Neįvertinta' : `σ ${a.metrics.noise.toFixed(2)} · ${a.metrics.noise < 2.5 ? 'mažas' : a.metrics.noise < 4.5 ? 'vidutinis' : 'didelis'}`}</span></div>
                  <div><b>Kontrastas</b><span>{a.metrics.histogram?.contrastRange ?? '—'} (2–98 % tonų skirtumas)</span></div>
                  <div><b>Šviesios vietos</b><span>{(a.metrics.histogram?.brightPct ?? 0).toFixed(1)} % beveik baltų pikselių</span></div>
                  <div><b>Tamsios vietos</b><span>{(a.metrics.histogram?.darkPct ?? 0).toFixed(1)} % beveik juodų pikselių</span></div>
                  <div><b>Galimas padidinimas</b><span>{a.metrics.upscale?.likely ? 'Aptikta požymių' : 'Aiškių požymių nerasta'} · tai tik įtarimas</span></div>
                  <div><b>JPEG suspaudimas</b><span>{a.metrics.jpeg?.avgQuantization == null ? 'JPEG lentelės nepasiekiamos' : `Kvantavimo vidurkis ${a.metrics.jpeg.avgQuantization.toFixed(1)}`}</span></div>
                  <div><b>Spalvų triukšmo požymiai</b><span>{a.metrics.advanced?.chromaNoiseProxy?.toFixed(1) ?? '—'} (apytikslis indikatorius)</span></div>
                  <div><b>Galimas kryptinis suliejimas</b><span>{a.metrics.advanced?.possibleDirectionalBlur ? 'Yra požymių' : 'Aiškių požymių nerasta'}</span></div>
                  <div><b>Spalvų balanso indikatoriai</b><span>a*: {a.metrics.advanced?.colorCast?.redGreen?.toFixed(1) ?? '—'} · b*: {a.metrics.advanced?.colorCast?.greenBlue?.toFixed(1) ?? '—'} (ne spalvų tikslumo matas)</span></div>
                </div>
                {a.metrics.heatmap && <div className="q-heat"><b>Ryškumo žemėlapis</b><img src={a.metrics.heatmap} alt="Ryškumo analizės žemėlapis" /><small>Žalia – stipresnis detalių signalas; geltona – silpnesnis; raudona – labai silpnas. Tai ne automatinis broko įrodymas.</small></div>}
                {!!a.metrics.findings?.length && <div className="q-findings">{a.metrics.findings.map((f,k)=><p key={k} className={f.level}>{f.text}</p>)}</div>}
              </details>}
              {!a.metrics && !print.free && <div className="q-pending">Ryškumas ir triukšmas dar nevertinti – spauskite „Analizuoti nuotraukas“. Kol kas vertinama tik pagal dpi.</div>}
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
          <p><b>3. Ryškumas, triukšmas, ekspozicija.</b> Matuojama ties tikrais taškais (be sumažinimo) iš iki 49 vaizdo fragmentų: ryškiausių fragmentų detalumas (Laplaso dispersija su triukšmo pataisa),
            triukšmo σ (Immerkaer metodas), šviesos išdegimas ir bendras šviesumas. Neryški nuotrauka laikoma mažesnės skiriamosios gebos, todėl jai rekomenduojamas mažesnis formatas.
            Ribos yra pradinės vertės – pasitikrinkite su savo nuotraukomis ir pakoreguokite nustatymuose.</p>
          <p><b>4. AI (neprivaloma).</b> CLIP-IQA metodas: modelis lygina vaizdą su aprašymų poromis („Sharp photo“ / „Blurry photo“, „Clean“ / „Noisy“, „Good“ / „Bad“).
            Su žmonių vertinimais koreliuoja tik vidutiniškai (~0,6–0,74), todėl jis gali sumažinti įvertinimą ne daugiau kaip vienu laipsniu, kai mato aiškią problemą.</p>
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
