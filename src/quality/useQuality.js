import { useCallback, useEffect, useRef, useState } from 'react';
import { cloneConfig, DEFAULT_CONFIG, loadConfig, saveConfig, summarizeRegion } from './engine.js';
import { analyzePhoto, buildViews, regionKey } from './analyze.js';
import * as AI from './ai.js';
import * as MDL from './onnxModel.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Kokybės skirsnio būsena laikoma App lygyje, kad rezultatai išliktų perjungus skirsnius
 * ir kad analizė / AI vertinimas tęstųsi, kol vartotojas dirba kadravimo skirsnyje.
 * getPrint(photo) grąžina ir kadro sritį (region) originalo taškais. */
export function useQuality(photos, getPrint) {
  const [cfg, setCfg] = useState(loadConfig);
  const [analysis, setAnalysis] = useState({});       // photoId -> { grid, ai, model }
  const [job, setJob] = useState({ analyzing: false, text: '' });
  const [ai, setAi] = useState({ ready: AI.isReady(), loading: false, running: false, text: '', pct: null, error: false });
  const [mdl, setMdl] = useState({ stored: null, loaded: MDL.isLoaded(), loading: false, running: false, text: '', pct: null, error: false });

  const photosRef = useRef(photos); photosRef.current = photos;
  const printRef = useRef(getPrint); printRef.current = getPrint;
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const analysisRef = useRef(analysis); analysisRef.current = analysis;
  const busy = useRef({ analyzing: false, ai: false, model: false });
  const stopRef = useRef(false);

  useEffect(() => { MDL.storedModel().then(rec => rec && setMdl(s => ({ ...s, stored: rec }))); }, []);

  const patchAnalysis = useCallback((id, patch) => {
    setAnalysis(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      analysisRef.current = next;
      return next;
    });
  }, []);

  const getGrid = useCallback(async photo => {
    const cached = analysisRef.current[photo.id]?.grid;
    if (cached) return cached;
    const grid = await analyzePhoto(photo);
    patchAnalysis(photo.id, { grid });
    return grid;
  }, [patchAnalysis]);

  const regionOf = photo => { const p = printRef.current(photo); return p && p.region ? p.region : null; };

  const analyzeAll = useCallback(async () => {
    if (busy.current.analyzing) return;
    const todo = photosRef.current.filter(p => !analysisRef.current[p.id]?.grid);
    if (!todo.length) { setJob({ analyzing: false, text: 'Visos nuotraukos jau išanalizuotos.' }); return; }
    busy.current.analyzing = true;
    try {
      for (let i = 0; i < todo.length; i++) {
        setJob({ analyzing: true, text: `Analizuojama ${i + 1} / ${todo.length}…` });
        await sleep(0);
        try { await getGrid(todo[i]); } catch (e) { console.error('Analizė nepavyko:', todo[i].name, e); }
      }
      setJob({ analyzing: false, text: `Išanalizuota: ${todo.length}` });
    } finally {
      busy.current.analyzing = false;
    }
  }, [getGrid]);

  /* ---------- CLIP-IQA (atsisiunčiamas) ---------- */

  const loadAi = useCallback(async () => {
    setAi(s => ({ ...s, loading: true, error: false, pct: 0, text: 'Pradedama…' }));
    try {
      await AI.loadAi(st => setAi(s => ({ ...s, text: st.text, pct: st.pct })));
      setAi(s => ({ ...s, ready: true, loading: false, pct: null, text: 'AI paruoštas. Modelis lieka naršyklės talpykloje.' }));
    } catch (e) {
      console.error(e);
      setAi(s => ({ ...s, loading: false, pct: null, error: true, text: `Nepavyko įkelti AI: ${e && e.message ? e.message : e} (pirmą kartą reikia interneto, kad būtų atsisiųstas modelis).` }));
    }
  }, []);

  const runAi = useCallback(async ids => {
    if (busy.current.ai || !AI.isReady()) return;
    const list = photosRef.current.filter(p => !ids || ids.includes(p.id));
    if (!list.length) return;
    busy.current.ai = true; stopRef.current = false;
    setAi(s => ({ ...s, running: true, error: false }));
    let stopped = false;
    try {
      for (let i = 0; i < list.length; i++) {
        if (stopRef.current) { stopped = true; break; }
        setAi(s => ({ ...s, text: `AI vertina ${i + 1} / ${list.length}: ${list[i].name}`, pct: Math.round(i / list.length * 100) }));
        try {
          const region = regionOf(list[i]);
          const grid = await getGrid(list[i]);
          const summary = summarizeRegion(grid, region, cfgRef.current);
          patchAnalysis(list[i].id, { ai: { ...(await AI.scorePhoto(list[i], summary, region)), rk: regionKey(region) } });
        } catch (e) {
          console.error('AI klaida:', list[i].name, e);
          setAi(s => ({ ...s, error: true, text: `AI klaida (${list[i].name}): ${e.message || e}` }));
        }
      }
      setAi(s => (s.error ? { ...s, running: false, pct: null } : { ...s, running: false, pct: null, text: stopped ? 'Sustabdyta.' : `AI įvertinta: ${list.length}` }));
    } finally {
      busy.current.ai = false;
      setAi(s => ({ ...s, running: false, pct: null }));
    }
  }, [getGrid, patchAnalysis]);

  /* ---------- Savo ONNX modelis iš failo ---------- */

  const pickModel = useCallback(async (file, dataFile) => {
    if (!file) return;
    const preset = MDL.guessPreset(file.name), p = MDL.PRESETS[preset];
    setMdl(s => ({ ...s, loading: true, error: false, pct: null, text: 'Saugoma šios naršyklės saugykloje…' }));
    try {
      const rec = await MDL.saveModel(file, dataFile || null, { preset, norm: p.norm, lo: p.lo, hi: p.hi });
      setMdl(s => ({ ...s, stored: rec, loaded: false, text: 'Modelis išsaugotas. Įkeliama…' }));
      const info = await MDL.loadModel(rec, t => setMdl(s => ({ ...s, text: t })));
      setMdl(s => ({ ...s, loaded: true, loading: false, text: `Modelis paruoštas (įvestis: ${info.inputs.join(', ')}${info.layout ? ', ' + info.layout.toUpperCase() : ''}).` }));
    } catch (e) {
      console.error(e);
      setMdl(s => ({ ...s, loading: false, error: true, text: `Nepavyko įkelti modelio: ${e && e.message ? e.message : e}` }));
    }
  }, []);

  const ensureModel = useCallback(async () => {
    if (MDL.isLoaded()) return true;
    const rec = await MDL.storedModel();
    if (!rec) { setMdl(s => ({ ...s, error: true, text: 'Modelio failas dar nepasirinktas.' })); return false; }
    setMdl(s => ({ ...s, loading: true, error: false, stored: rec, text: 'Įkeliamas išsaugotas modelis…' }));
    try {
      await MDL.loadModel(rec, t => setMdl(s => ({ ...s, text: t })));
      setMdl(s => ({ ...s, loaded: true, loading: false, text: 'Modelis paruoštas.' }));
      return true;
    } catch (e) {
      console.error(e);
      setMdl(s => ({ ...s, loading: false, error: true, text: `Nepavyko įkelti modelio: ${e && e.message ? e.message : e}` }));
      return false;
    }
  }, []);

  const setModelSettings = useCallback(async settings => {
    const rec = await MDL.updateSettings(settings);
    if (rec) setMdl(s => ({ ...s, stored: rec }));
  }, []);

  const forgetModel = useCallback(async () => {
    await MDL.clearModel();
    setMdl({ stored: null, loaded: false, loading: false, running: false, text: 'Modelis pašalintas iš naršyklės saugyklos.', pct: null, error: false });
    setAnalysis(prev => { const n = {}; for (const k in prev) { const { model, ...rest } = prev[k]; n[k] = rest; } analysisRef.current = n; return n; });
  }, []);

  const runModel = useCallback(async ids => {
    if (busy.current.model) return;
    const list = photosRef.current.filter(p => !ids || ids.includes(p.id));
    if (!list.length) return;
    busy.current.model = true; stopRef.current = false;
    setMdl(s => ({ ...s, running: true, error: false }));
    let stopped = false, failed = false;
    try {
      if (!(await ensureModel())) { failed = true; return; }
      for (let i = 0; i < list.length; i++) {
        if (stopRef.current) { stopped = true; break; }
        setMdl(s => ({ ...s, text: `Modelis vertina ${i + 1} / ${list.length}: ${list[i].name}`, pct: Math.round(i / list.length * 100) }));
        try {
          const region = regionOf(list[i]);
          const grid = await getGrid(list[i]);
          const summary = summarizeRegion(grid, region, cfgRef.current);
          const res = await MDL.scoreViews(buildViews(list[i], summary, region));
          patchAnalysis(list[i].id, { model: { ...res, rk: regionKey(region) } });
        } catch (e) {
          failed = true;
          console.error('Modelio klaida:', list[i].name, e);
          setMdl(s => ({ ...s, error: true, text: `Modelio klaida (${list[i].name}): ${e.message || e}` }));
          break;
        }
      }
      if (!failed) setMdl(s => ({ ...s, text: stopped ? 'Sustabdyta.' : `Modeliu įvertinta: ${list.length}` }));
    } finally {
      busy.current.model = false;
      setMdl(s => ({ ...s, running: false, pct: null }));
    }
  }, [ensureModel, getGrid, patchAnalysis]);

  const stopAi = useCallback(() => { stopRef.current = true; }, []);

  const updateConfig = useCallback((path, value) => {
    setCfg(prev => {
      const next = cloneConfig(prev);
      let o = next;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = value;
      saveConfig(next);
      return next;
    });
  }, []);
  const resetConfig = useCallback(() => { const c = cloneConfig(DEFAULT_CONFIG); saveConfig(c); setCfg(c); }, []);

  return { cfg, analysis, job, ai, mdl, analyzeAll, loadAi, runAi, stopAi, pickModel, runModel, setModelSettings, forgetModel, updateConfig, resetConfig };
}
