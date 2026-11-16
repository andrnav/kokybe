import React, { useEffect, useRef, useState } from 'react';
import FilerobotImageEditor from 'react-filerobot-image-editor';
import { ImagePlus, PencilRuler, Download, RefreshCw, FileImage } from 'lucide-react';

function getSavedImageUrl(imageData) {
  if (!imageData) return null;
  if (typeof imageData === 'string') return imageData;
  if (typeof imageData.imageBase64 === 'string') return imageData.imageBase64;
  if (typeof imageData.base64 === 'string') return imageData.base64;
  return null;
}

export default function TestEditorTab({ source, sourceName }) {
  const [selected, setSelected] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const uploadedUrlRef = useRef(null);

  useEffect(() => {
    if (source) {
      setSelected({ url: source, name: sourceName || 'Aktyvi nuotrauka' });
      setSaved(null);
      setError('');
    }
  }, [source, sourceName]);

  useEffect(() => () => {
    if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current);
    if (saved?.url?.startsWith('blob:')) URL.revokeObjectURL(saved.url);
  }, [saved]);

  const chooseFile = file => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Pasirinkite vaizdo failą.');
      return;
    }
    if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current);
    const url = URL.createObjectURL(file);
    uploadedUrlRef.current = url;
    setSelected({ url, name: file.name });
    setSaved(null);
    setError('');
  };

  const handleSave = async imageData => {
    const base64 = getSavedImageUrl(imageData);
    let url = base64;
    if (!url && imageData?.imageCanvas instanceof HTMLCanvasElement) {
      const blob = await new Promise(resolve => imageData.imageCanvas.toBlob(resolve, 'image/png'));
      if (blob) url = URL.createObjectURL(blob);
    }
    if (!url) {
      setError('Redaktorius išsaugojo rezultatą, tačiau nepavyko nuskaityti eksportuoto vaizdo.');
      return;
    }
    const name = imageData?.fullName || imageData?.name || `${(selected?.name || 'nuotrauka').replace(/\.[^.]+$/, '')}-edited.png`;
    setSaved({ url, name });
    setError('');
  };

  const downloadSaved = () => {
    if (!saved?.url) return;
    const a = document.createElement('a');
    a.href = saved.url;
    a.download = saved.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return <main className="test-editor-tab">
    <section className="test-editor-heading">
      <div className="test-editor-title"><div className="test-editor-icon"><PencilRuler size={21}/></div><div><h1>Testinis koregavimas</h1><p>Atskiras „Filerobot Image Editor“ bandymas. Pagrindinės kadravimo ir kokybės funkcijos neliečiamos.</p></div></div>
      <div className="test-editor-actions">
        <button className="secondary" onClick={() => fileRef.current?.click()}><ImagePlus size={16}/> Įkelti kitą nuotrauką</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }}/>
        <button className="primary" disabled={!selected?.url} onClick={() => { setError(''); setEditorOpen(true); }}><PencilRuler size={16}/> Atidaryti redaktorių</button>
      </div>
    </section>

    <section className="test-editor-content">
      <div className="test-editor-preview">
        {selected?.url ? <img src={selected.url} alt="Pasirinkta nuotrauka"/> : <div className="test-editor-empty"><FileImage size={42}/><b>Nuotrauka nepasirinkta</b><span>Įkelkite nuotrauką arba grįžkite į kadravimo skiltį ir pasirinkite aktyvią nuotrauką.</span><button className="primary" onClick={() => fileRef.current?.click()}><ImagePlus size={16}/> Pasirinkti failą</button></div>}
      </div>
      <div className="test-editor-info">
        <span className="test-editor-eyebrow">ŠALTINIS</span>
        <h2>{selected?.name || 'Laukiama nuotraukos'}</h2>
        <p>Redagavimas vyksta atskirame lange. Pakeitimai automatiškai neįrašomi į pagrindinę nuotraukų partiją ir nepakeičia originalaus failo.</p>
        <button className="primary test-editor-launch" disabled={!selected?.url} onClick={() => { setError(''); setEditorOpen(true); }}><PencilRuler size={16}/> Pradėti koregavimą</button>
        {saved && <div className="test-editor-saved"><div><b>Redaguotas vaizdas paruoštas</b><span>{saved.name}</span></div><button className="secondary" onClick={downloadSaved}><Download size={16}/> Atsisiųsti</button><img src={saved.url} alt="Redaguotas rezultatas"/></div>}
        {error && <div className="test-editor-error">{error}</div>}
        <div className="test-editor-note"><RefreshCw size={15}/> Tai bandomoji integracija. Išsaugotas rezultatas kol kas nekeičia pagrindinės programos nuotraukos.</div>
      </div>
    </section>

    {editorOpen && selected?.url && <FilerobotImageEditor
      key={selected.url}
      source={selected.url}
      onSave={handleSave}
      onClose={() => setEditorOpen(false)}
      closeAfterSave={false}
      defaultSavedImageType="png"
      defaultSavedImageQuality={1}
      defaultSavedImageName={`${(selected.name || 'nuotrauka').replace(/\.[^.]+$/, '')}-edited`}
      avoidChangesNotSavedAlertOnLeave={false}
    />}
  </main>;
}
