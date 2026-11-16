import { useCallback, useRef, useState } from 'react';
import { cloneConfig, DEFAULT_CONFIG, loadConfig, saveConfig } from './engine.js';
import { analyzePhoto } from './analyze.js';
import * as AI from './ai.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Kokybės skirsnio būsena laikoma App lygyje, kad rezultatai išliktų perjungus skirsnius
 * ir kad analizė / AI vertinimas tęstųsi, kol vartotojas dirba kadravimo skirsnyje. */
export function useQuality(photos) {
  const [cfg, setCfg] = useState(loadConfig);
  const [analysis, setAnalysis] = useState({});       // photoId -> { metrics, ai }
  const [job, setJob] = useState({ analyzing: false, text: '' });
  const [ai, setAi] = useState({ ready: AI.isReady(), loading: false, running: false, text: '', pct: null, error: false });

  const photosRef = useRef(photos); photosRef.current = photos;
  const analysisRef = useRef(analysis); analysisRef.current = analysis;
  const busy = useRef({ analyzing: false, ai: false });
  const stopRef = useRef(false);

  const patchAnalysis = useCallback((id, patch) => {
    setAnalysis(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      analysisRef.current = next;
      return next;
    });
  }, []);

  const getMetrics = useCallback(async photo => {
    const cached = analysisRef.current[photo.id]?.metrics;
    if (cached) return cached;
    const metrics = await analyzePhoto(photo);
    patchAnalysis(photo.id, { metrics });
    return metrics;
  }, [patchAnalysis]);

  const analyzeAll = useCallback(async () => {
    if (busy.current.analyzing) return;
    const todo = photosRef.current.filter(p => !analysisRef.current[p.id]?.metrics);
    if (!todo.length) { setJob({ analyzing: false, text: 'Visos nuotraukos jau išanalizuotos.' }); return; }
    busy.current.analyzing = true;
    try {
      for (let i = 0; i < todo.length; i++) {
        setJob({ analyzing: true, text: `Analizuojama ${i + 1} / ${todo.length}…` });
        await sleep(0);
        try { await getMetrics(todo[i]); } catch (e) { console.error('Analizė nepavyko:', todo[i].name, e); }
      }
      setJob({ analyzing: false, text: `Išanalizuota: ${todo.length}` });
    } finally {
      busy.current.analyzing = false;
    }
  }, [getMetrics]);

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

  // ids – nuotraukų id sąrašas; jei nenurodyta, vertinamos visos
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
          const metrics = await getMetrics(list[i]);
          patchAnalysis(list[i].id, { ai: await AI.scorePhoto(list[i], metrics) });
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
  }, [getMetrics, patchAnalysis]);

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

  return { cfg, analysis, job, ai, analyzeAll, loadAi, runAi, stopAi, updateConfig, resetConfig };
}
