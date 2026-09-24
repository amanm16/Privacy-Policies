import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

// Reads a complete HTML page (for example the file a policy is hosted as on GitHub Pages) and opens
// the editor with what was found. Nothing is saved until the editor's Save button.
export default function ImportDialog({ onClose }) {
  const dialogRef = useRef(null);
  const navigate = useNavigate();
  const [html, setHtml] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function readFile(file) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') {
      setError('Choose an .html file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setHtml(String(reader.result));
      setFilename(file.name);
      setError('');
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    readFile(event.dataTransfer.files[0]);
  }

  async function submit(event) {
    event.preventDefault();
    if (!html.trim()) {
      setError('Choose a file or paste the HTML first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api('/admin/import', { method: 'POST', body: { html, filename } });
      const imported = { fields: result.fields, notes: result.notes, removed: result.removed, source: filename || 'the pasted HTML' };
      dialogRef.current.close();
      if (result.existing) navigate('/policies/' + result.existing.id, { state: { imported } });
      else navigate('/new', { state: { imported } });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} aria-labelledby="import-title">
      <form className="dialog__body" onSubmit={submit}>
        <h2 id="import-title" className="dialog__title">Import a policy</h2>
        <p className="dialog__lead">
          Use the HTML page the policy lives in now. The app name, operator and effective date are read from it, and you can check them before saving.
        </p>

        <label
          className={'dropzone' + (dragging ? ' dropzone--active' : '') + (filename ? ' dropzone--filled' : '')}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".html,.htm,text/html"
            className="visually-hidden"
            onChange={(event) => readFile(event.target.files[0])}
          />
          <span className="dropzone__title">{filename || 'Drop an .html file here'}</span>
          <span className="dropzone__hint">{filename ? 'Choose a different file' : 'or click to choose one'}</span>
        </label>

        <label className="field">
          <span className="field__label">Or paste the HTML</span>
          <textarea
            className="code-input code-input--short"
            rows={6}
            spellCheck={false}
            value={html}
            placeholder="<!DOCTYPE html>…"
            onChange={(event) => { setHtml(event.target.value); setFilename(''); }}
          />
        </label>

        {error && <p className="notice notice--danger" role="alert">{error}</p>}

        <div className="dialog__actions">
          <button type="button" className="button" onClick={() => dialogRef.current.close()}>Cancel</button>
          <button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Reading…' : 'Continue'}</button>
        </div>
      </form>
    </dialog>
  );
}
