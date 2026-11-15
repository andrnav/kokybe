import React, { useMemo } from 'react';
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
const aiLevel = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n >= .80 ? 5 : n >= .65 ? 4 : n >= .50 ? 3 : n >= .35 ? 2 : 1;
};
const AI_METRICS = [
  ['sharp', 'Aštrumas'],
  ['clean', 'Vaizdo švara'],
  ['bright', 'Ekspozicija'],
  ['contrast', 'Kontrastas'],
  ['quality', 'Bendra kokybė'],
];

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

  const activeExists = photos.some(p => p.id === activeId);

  return <section className="quality-page" aria-label="Nuotraukos kokybė">
    <div className="quality-inner">
      <div className="q-head q-head-simple">
        <div className="q-actions">
          <button className="primary" onClick={analyzeAll} disabled={!photos.length || job.analyzing}>Analizuoti nuotraukas</button>
          <span className="q-status">{job.text}</span>
        </div>
      </div>

      <div className="q-ai">
        <div className="q-ai-head"><b>AI patikra</b> <span className="muted">(neprivaloma, veikia jūsų naršyklėje, be raktų ir be paskyros)</span></div>
        <p className="muted">
          Papildomas AI vertinimas pagal aštrumą, vaizdo švarą, ekspoziciją, kontrastą ir bendrą kokybę.
          Nuotraukos niekur nesiunčiamos. Tai papildoma nuomonė po matematinės analizės, o ne vietoj jos.
        </p>
        <div className="q-ai-actions">
          {!ai.ready && <button className="secondary" onClick={loadAi} disabled={ai.loading}>{ai.loading ? 'Siunčiama…' : 'Atsisiųsti ir įjungti AI'}</button>}
          {ai.ready && <>
            <button className="secondary" onClick={() => runAi(null)} disabled={ai.running || !photos.length}>AI patikrinti visas</button>
            <button className="secondary" onClick={() => runAi([activeId])} disabled={ai.running || !activeExists}>AI patikrinti pasirinktą</button>
          </>}
          {ai.running && <button className="secondary" onClick={stopAi}>Sustabdyti</button>}
          <span className={`q-status ${ai.error ? 'err' : ''}`}>{ai.text}</span>
        </div>
        {ai.pct != null && <div className="q-bar"><i style={{ width: `${ai.pct}%` }} /></div>}
      </div>

      <div className="q-list">
        {!photos.length && <div className="q-empty">Nuotraukų dar nėra. Įkelkite jas skirsnyje „Kadravimas“.</div>}
        {photos.length > 0 && !rows.length && <div className="q-empty">Nuotraukų nėra.</div>}
        {rows.map(({ p, i, a, print, q }) => (
          <div key={p.id} className={`q-row ${p.id === activeId ? 'current' : ''}`} role="button" tabIndex={0}
            title="Atidaryti kadravimo skirsnyje" onClick={() => onOpen(p.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id); } }}>
            <img className="q-thumb" src={thumbs.get(p.id) || p.url} alt="" />
            <div className="q-id">
              <div className="q-name" title={p.name}>{p.name}</div>
              <div className="q-sub">
                {print.widthPx} × {print.heightPx} px · {print.free ? 'laisvas kadras · DPI nenustatytas' : `${print.wCm} × ${print.hCm} cm · ${Math.round(Math.min(print.dpiX, print.dpiY))} DPI`}
              </div>
              <span className={`q-badge ${q.cls}`}>{q.label}</span>
            </div>
            <div className="q-res">
              <ul className="q-why">{q.reasons.map((r, k) => <li key={k} className={r.tone}>{r.text}</li>)}</ul>
              {a.ai && <div className="q-ai-scores">
                <b>AI įvertinimas</b>
                <div className="q-ai-score-grid">
                  {AI_METRICS.map(([key, label]) => {
                    const level = aiLevel(a.ai[key]);
                    return <div className="q-ai-score" key={key}>
                      <span>{label}</span>
                      <strong>{level ? `${level}/5 · ${LEVELS[level].label}` : 'Nėra duomenų'}</strong>
                    </div>;
                  })}
                </div>
              </div>}
              <div className={`q-adv ${q.cls}`}>{q.advice}</div>
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
        <p className="q-note">Tie patys nustatymai naudojami ir kadravimo skiltyje, ir čia. DPI bei kokybės įvertinimas abiejose vietose visada sutampa.</p>
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
