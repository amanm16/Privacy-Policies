import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { dateTime, formatShortDate } from '../lib/format';
import StatusBadge from './StatusBadge';

// Every save is a numbered version. Loading one puts it in the editor; saving makes it current.
export default function HistoryPanel({ policyId, currentRevision, onClose, onLoad }) {
  const dialogRef = useRef(null);
  const [revisions, setRevisions] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    api('/admin/policies/' + policyId + '/revisions').then(
      (data) => setRevisions(data.revisions),
      (err) => setError(err.message),
    );
  }, [policyId]);

  async function load(number) {
    setLoading(number);
    try {
      const data = await api('/admin/policies/' + policyId + '/revisions/' + number);
      dialogRef.current.close();
      onLoad(data.revision);
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog dialog--side" onClose={onClose} aria-labelledby="history-title">
      <div className="dialog__body">
        <div className="dialog__head">
          <h2 id="history-title" className="dialog__title">History</h2>
          <button type="button" className="button button--quiet button--small" onClick={() => dialogRef.current.close()}>Close</button>
        </div>
        <p className="dialog__lead">Every save is kept. Load an earlier version into the editor, then save to make it the current one.</p>
        {error && <p className="notice notice--danger" role="alert">{error}</p>}
        {!revisions && !error && <p className="muted">Loading…</p>}
        {revisions && (
          <ol className="history">
            {revisions.map((revision) => (
              <li key={revision.number} className="history__item">
                <div className="history__row">
                  <strong>Version {revision.number}</strong>
                  <StatusBadge status={revision.status} />
                  {revision.number === currentRevision && <span className="history__current">Current</span>}
                </div>
                <p className="history__meta">
                  {dateTime(revision.createdAt)} · {revision.editedBy || 'unknown'} · effective {formatShortDate(revision.effectiveDate)}
                </p>
                {revision.number !== currentRevision && (
                  <button type="button" className="button button--small" onClick={() => load(revision.number)} disabled={loading !== null}>
                    {loading === revision.number ? 'Loading…' : 'Load into editor'}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
