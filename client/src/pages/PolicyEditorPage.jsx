import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import Field from '../components/Field';
import StatusBadge from '../components/StatusBadge';
import CopyLinkButton from '../components/CopyLinkButton';
import ChecksPanel from '../components/ChecksPanel';
import PreviewPanel from '../components/PreviewPanel';
import HistoryPanel from '../components/HistoryPanel';
import { slugify } from '../../../shared/slug';
import { dateTime, localToday, plural, policyUrl, relativeTime } from '../lib/format';

const BLANK = {
  slug: '', appName: '', organization: '', organizationDetails: '', summary: '', contactEmail: '',
  effectiveDate: '', content: '', status: 'draft', legacyUrl: '', internalNotes: '',
};
const FIELDS = Object.keys(BLANK);
// Details an imported file often lacks. An import never blanks out values already filled in.
const KEEP_IF_EMPTY = ['organizationDetails', 'summary', 'contactEmail', 'legacyUrl', 'internalNotes'];

function pick(source) {
  const out = {};
  FIELDS.forEach((key) => {
    out[key] = source && source[key] !== undefined && source[key] !== null ? String(source[key]) : BLANK[key];
  });
  return out;
}

function same(a, b) {
  return FIELDS.every((key) => a[key] === b[key]);
}

function mergeImported(current, fields) {
  const next = { ...current };
  FIELDS.forEach((key) => {
    if (key === 'status' || typeof fields[key] !== 'string') return;
    if (!fields[key] && KEEP_IF_EMPTY.indexOf(key) !== -1) return;
    next[key] = fields[key];
  });
  return next;
}

function describeRemoved(removed) {
  return removed.map((item) => item.what + (item.count > 1 ? ' ×' + item.count : '')).join(', ');
}

function importBanner(imported, existing) {
  const lines = imported.notes.slice();
  if (imported.removed && imported.removed.length) lines.push('Removed from the file: ' + describeRemoved(imported.removed) + '.');
  return {
    tone: 'info',
    title: existing
      ? 'Loaded ' + imported.source + '. It has the same address as this policy, so saving replaces the current version.'
      : 'Imported ' + imported.source + '. Check the details, then save.',
    lines,
  };
}

function statusHint(saved, form, placeholders, url) {
  const live = saved && saved.status === 'published';
  if (form.status === 'published') {
    if (placeholders) return { tone: 'danger', text: 'Replace the ' + plural(placeholders, 'placeholder', 'placeholders') + ', or switch to Draft, before saving.' };
    return live
      ? { tone: 'plain', text: 'Live at ' + url + '. Saving updates the live page straight away.' }
      : { tone: 'plain', text: 'Saving publishes this policy at ' + url + '.' };
  }
  if (live) return { tone: 'caution', text: 'Saving takes this policy offline. ' + url + ' will show “Policy not found”.' };
  if (placeholders) return { tone: 'plain', text: 'Replace the ' + plural(placeholders, 'placeholder', 'placeholders') + ' to publish.' };
  return { tone: 'plain', text: 'Drafts are only visible here.' };
}

// Unsaved changes are kept in this tab's sessionStorage, so they survive a reload or the session
// ending mid-edit (which sends you to the sign-in page and back).
function unsavedKey(id) {
  return 'privacy-policies:unsaved:' + (id || 'new');
}

function readUnsaved(id) {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(unsavedKey(id)) || 'null');
    return stored && stored.form ? pick(stored.form) : null;
  } catch (err) {
    return null;
  }
}

function writeUnsaved(id, form) {
  try {
    if (form) window.sessionStorage.setItem(unsavedKey(id), JSON.stringify({ form }));
    else window.sessionStorage.removeItem(unsavedKey(id));
  } catch (err) {
    // Storage can be full or blocked; the editor works without it.
  }
}

const RESTORED_BANNER = { tone: 'info', title: 'Restored changes you hadn’t saved yet.', lines: [], discardable: true };

let measureCanvas = null;
function charWidth(font) {
  measureCanvas = measureCanvas || document.createElement('canvas');
  const context = measureCanvas.getContext('2d');
  context.font = font;
  return context.measureText('0').width || 8;
}

export default function PolicyEditorPage({ id }) {
  const isNew = !id;
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { siteUrl } = useAuth();
  const [incoming] = useState(() => location.state || {});

  const [saved, setSaved] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [preview, setPreview] = useState({ html: '', review: null, removed: [], error: '' });
  const [tab, setTab] = useState('edit');
  const [historyOpen, setHistoryOpen] = useState(false);
  const contentRef = useRef(null);
  const saveRef = useRef(null);

  function adopt(policy) {
    const fields = pick(policy);
    setSaved(policy);
    setBaseline(fields);
    setForm(fields);
  }

  // Load once. Router state carries an import or a just-created policy; it's cleared straight away
  // so reloading the page doesn't apply it twice.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });

    if (isNew) {
      const start = { ...BLANK, effectiveDate: localToday() };
      const unsaved = incoming.imported ? null : readUnsaved(null);
      setBaseline(start);
      if (incoming.imported) {
        setForm(mergeImported(start, incoming.imported.fields));
        setBanner(importBanner(incoming.imported, null));
        setSlugTouched(true);
      } else if (unsaved && !same(unsaved, start)) {
        setForm(unsaved);
        setBanner(RESTORED_BANNER);
        setSlugTouched(true);
      } else {
        setForm(start);
      }
      return undefined;
    }
    if (incoming.created) {
      adopt(incoming.created.policy);
      if (incoming.created.removed && incoming.created.removed.length) {
        setBanner({ tone: 'info', title: 'Cleaned up while saving: ' + describeRemoved(incoming.created.removed) + '.', lines: [] });
      }
      return undefined;
    }
    let cancelled = false;
    api('/admin/policies/' + id).then(
      (data) => {
        if (cancelled) return;
        adopt(data.policy);
        const unsaved = readUnsaved(id);
        if (incoming.imported) {
          setForm(mergeImported(pick(data.policy), incoming.imported.fields));
          setBanner(importBanner(incoming.imported, data.policy));
        } else if (unsaved && !same(unsaved, pick(data.policy))) {
          setForm(unsaved);
          setBanner(RESTORED_BANNER);
        }
      },
      (err) => {
        if (!cancelled) setLoadError(err.status === 404 ? 'This policy no longer exists. It may have been deleted.' : err.message);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = Boolean(form && baseline && !same(form, baseline));

  useEffect(() => {
    if (form && baseline) writeUnsaved(id, dirty ? form : null);
  }, [id, form, baseline, dirty]);

  // Live preview and checks, a moment after typing stops.
  useEffect(() => {
    if (!form) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api('/admin/preview', { method: 'POST', body: form, signal: controller.signal }).then(
        (data) => setPreview({ html: data.html, review: data.review, removed: data.removed, error: '' }),
        (err) => {
          if (err.name !== 'AbortError') setPreview((current) => ({ ...current, error: err.message }));
        },
      );
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function update(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'appName' && isNew && !slugTouched) next.slug = slugify(value);
      return next;
    });
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function save() {
    if (!form || saving || !dirty) return;
    setSaving(true);
    try {
      const data = isNew
        ? await api('/admin/policies', { method: 'POST', body: form })
        : await api('/admin/policies/' + id, { method: 'PUT', body: form });
      const before = saved ? saved.status : 'draft';
      const after = data.policy.status;
      let message = 'Draft saved';
      if (after === 'published' && before !== 'published') message = 'Published';
      else if (after !== 'published' && before === 'published') message = 'Unpublished';
      else if (after === 'published') message = 'Saved. The live page is updated.';
      toast(message, 'success');
      setErrors({});
      if (isNew) {
        writeUnsaved(null, null);
        navigate('/policies/' + data.policy.id, { replace: true, state: { created: data } });
        return;
      }
      adopt(data.policy);
      setBanner(data.removed && data.removed.length
        ? { tone: 'info', title: 'Cleaned up while saving: ' + describeRemoved(data.removed) + '.', lines: [] }
        : null);
    } catch (err) {
      const fields = (err.body && err.body.fields) || {};
      setErrors(fields);
      setBanner({ tone: 'danger', title: err.message, lines: [] });
      if (Object.keys(fields).length) setTab('edit');
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  async function remove() {
    if (!window.confirm('Delete the draft policy for ' + saved.appName + ' and all its versions? This can’t be undone.')) return;
    try {
      await api('/admin/policies/' + saved.id, { method: 'DELETE' });
      writeUnsaved(id, null);
      toast('Policy deleted', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      setBanner({ tone: 'danger', title: err.message, lines: [] });
    }
  }

  function loadRevision(revision) {
    setForm((current) => ({ ...pick(revision.data), status: current.status }));
    setBanner({
      tone: 'info',
      title: 'Loaded version ' + revision.number + ' from ' + dateTime(revision.createdAt) + '. Save to make it the current version.',
      lines: [],
    });
  }

  // Selects a placeholder in the policy text so it can be typed over.
  function findInContent(text) {
    const area = contentRef.current;
    const index = area ? area.value.indexOf(text) : -1;
    if (index === -1) {
      toast('“' + text + '” isn’t in the policy text. Check the fields above it.', 'info');
      return;
    }
    setTab('edit');
    requestAnimationFrame(() => {
      const style = window.getComputedStyle(area);
      const lineHeight = parseFloat(style.lineHeight) || 20;
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const columns = Math.max(20, Math.floor((area.clientWidth - padding) / charWidth(style.font)));
      const rows = area.value.slice(0, index).split('\n').reduce(
        (sum, line, i, lines) => sum + (i === lines.length - 1 ? 0 : Math.max(1, Math.ceil(line.length / columns))),
        0,
      );
      area.scrollIntoView({ block: 'center' });
      area.focus({ preventScroll: true });
      area.setSelectionRange(index, index + text.length);
      area.scrollTop = Math.max(0, rows * lineHeight - area.clientHeight / 3);
    });
  }

  function confirmLeave(event) {
    if (dirty && !window.confirm('Leave without saving? Your changes will be lost.')) event.preventDefault();
  }

  if (loadError) {
    return (
      <div className="page">
        <Link to="/" className="back-link">← All policies</Link>
        <p className="notice notice--danger" role="alert">{loadError}</p>
      </div>
    );
  }
  if (!form) return <p className="loading">Loading…</p>;

  const review = preview.review;
  const placeholders = review ? review.placeholders.length : 0;
  const addressUrl = policyUrl(siteUrl, form.slug || 'your-app');
  const liveUrl = saved ? policyUrl(siteUrl, saved.slug) : '';
  const hint = statusHint(saved, form, placeholders, addressUrl);
  const title = (saved && saved.appName) || form.appName || 'New policy';

  return (
    <div className="page page--wide editor">
      <Link to="/" className="back-link" onClick={confirmLeave}>← All policies</Link>
      <div className="page-head">
        <div className="editor__heading">
          <div className="editor__title-row">
            <h1 className="page-title">{title}</h1>
            {saved && <StatusBadge status={saved.status} />}
          </div>
          <p className="page-sub">
            {saved
              ? <><code>/{saved.slug}</code> · version {saved.revision} · saved {relativeTime(saved.updatedAt)}{saved.updatedBy ? ' by ' + saved.updatedBy : ''}</>
              : 'Not saved yet'}
            {dirty && <span className="unsaved"> · Unsaved changes</span>}
          </p>
        </div>
        <div className="page-actions">
          {saved && saved.status === 'published' && (
            <>
              <a className="button" href={liveUrl} target="_blank" rel="noreferrer">View live page</a>
              <CopyLinkButton url={liveUrl} />
            </>
          )}
          {saved && <button type="button" className="button" onClick={() => setHistoryOpen(true)}>History</button>}
          <button type="button" className="button button--primary" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {banner && (
        <div className={'banner banner--' + banner.tone} role={banner.tone === 'danger' ? 'alert' : 'status'}>
          <div>
            <p className="banner__title">{banner.title}</p>
            {banner.lines.length > 0 && (
              <ul className="banner__lines">{banner.lines.map((line) => <li key={line}>{line}</li>)}</ul>
            )}
          </div>
          <div className="banner__actions">
            {banner.discardable && (
              <button type="button" className="button button--small" onClick={() => { setForm(baseline); setBanner(null); }}>Discard them</button>
            )}
            <button type="button" className="button button--quiet button--small" onClick={() => setBanner(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Editor">
        <button type="button" role="tab" className="tabs__tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}>Edit</button>
        <button type="button" role="tab" className="tabs__tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>
          Preview and checks{placeholders > 0 && <span className="tabs__count">{placeholders}</span>}
        </button>
      </div>

      <div className="editor__body">
        <form
          className={'editor__form' + (tab === 'edit' ? ' is-active' : '')}
          onSubmit={(event) => { event.preventDefault(); save(); }}
          noValidate
        >
          <section className="form-section" aria-labelledby="section-app">
            <h2 id="section-app" className="form-section__title">App</h2>
            <Field label="App name" hint="As it appears in the store listing." error={errors.appName}>
              <input className="input" value={form.appName} maxLength={120} onChange={(event) => update('appName', event.target.value)} />
            </Field>
            <Field
              label="Address"
              error={errors.slug}
              hint={saved && form.slug !== saved.slug
                ? 'The old address, /' + saved.slug + ', will keep redirecting here.'
                : 'Paste this into the store listing: ' + addressUrl}
            >
              {(props) => (
                <div className="affix">
                  <span className="affix__text">{siteUrl.replace(/^https?:\/\//, '')}/</span>
                  <input
                    {...props}
                    className="input affix__input"
                    value={form.slug}
                    maxLength={64}
                    spellCheck={false}
                    autoCapitalize="none"
                    onChange={(event) => {
                      setSlugTouched(true);
                      update('slug', event.target.value.toLowerCase().replace(/\s+/g, '-'));
                    }}
                  />
                </div>
              )}
            </Field>
            <Field label="Operator" hint="The company or public body responsible for the app and its data." error={errors.organization}>
              <input className="input" value={form.organization} maxLength={200} onChange={(event) => update('organization', event.target.value)} />
            </Field>
            <Field label="Operator details" optional hint="A second line, such as a department." error={errors.organizationDetails}>
              <input className="input" value={form.organizationDetails} maxLength={300} onChange={(event) => update('organizationDetails', event.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Effective date" error={errors.effectiveDate}>
                <input type="date" className="input" value={form.effectiveDate} onChange={(event) => update('effectiveDate', event.target.value)} />
              </Field>
              <Field label="Privacy contact email" optional hint="Shown at the foot of the page." error={errors.contactEmail}>
                <input type="email" className="input" value={form.contactEmail} maxLength={254} onChange={(event) => update('contactEmail', event.target.value)} />
              </Field>
            </div>
            <Field label="Search description" optional hint="Shown by search engines. Up to 300 characters." error={errors.summary}>
              <textarea className="input" rows={2} value={form.summary} maxLength={300} onChange={(event) => update('summary', event.target.value)} />
            </Field>
          </section>

          <section className="form-section" aria-labelledby="section-text">
            <h2 id="section-text" className="form-section__title">Policy text</h2>
            <Field
              label="HTML"
              hint="Headings, paragraphs, lists, tables, links and bold text are kept. Styles and scripts are removed when you save."
              error={errors.content}
            >
              <textarea
                ref={contentRef}
                className="code-input"
                rows={28}
                spellCheck={false}
                value={form.content}
                onChange={(event) => update('content', event.target.value)}
              />
            </Field>
          </section>

          <section className="form-section" aria-labelledby="section-publishing">
            <h2 id="section-publishing" className="form-section__title">Publishing</h2>
            <fieldset className="status-choice">
              <legend className="visually-hidden">Status</legend>
              <label className={'status-choice__option' + (form.status === 'draft' ? ' is-checked' : '')}>
                <input type="radio" name="status" value="draft" checked={form.status === 'draft'} onChange={() => update('status', 'draft')} />
                <span className="status-choice__name">Draft</span>
                <span className="status-choice__text">Only visible here</span>
              </label>
              <label className={'status-choice__option' + (form.status === 'published' ? ' is-checked' : '') + (placeholders && form.status !== 'published' ? ' is-disabled' : '')}>
                <input
                  type="radio"
                  name="status"
                  value="published"
                  checked={form.status === 'published'}
                  disabled={placeholders > 0 && form.status !== 'published'}
                  onChange={() => update('status', 'published')}
                />
                <span className="status-choice__name">Published</span>
                <span className="status-choice__text">Live at its address</span>
              </label>
            </fieldset>
            <p className={'status-hint status-hint--' + hint.tone}>{hint.text}</p>
            {errors.status && <p className="field__error">{errors.status}</p>}
          </section>

          <section className="form-section" aria-labelledby="section-internal">
            <h2 id="section-internal" className="form-section__title">Internal</h2>
            <p className="form-section__lead">Only visible to people signed in here.</p>
            <Field
              label="Previous address"
              optional
              hint="Where this policy was hosted before. Point that store listing here, then redirect or remove the old page."
              error={errors.legacyUrl}
            >
              <input type="url" className="input" value={form.legacyUrl} maxLength={500} onChange={(event) => update('legacyUrl', event.target.value)} />
            </Field>
            <Field label="Notes" optional error={errors.internalNotes}>
              <textarea className="input" rows={5} value={form.internalNotes} maxLength={5000} onChange={(event) => update('internalNotes', event.target.value)} />
            </Field>
          </section>

          {saved && (
            <section className="form-section form-section--quiet" aria-labelledby="section-delete">
              <h2 id="section-delete" className="form-section__title">Delete</h2>
              {saved.status === 'published' ? (
                <p className="form-section__lead">A published policy can’t be deleted, because its address may be in a store listing. Switch it to Draft and save first.</p>
              ) : (
                <>
                  <p className="form-section__lead">Deletes this draft and all its versions.</p>
                  <button type="button" className="button button--danger" onClick={remove}>Delete policy</button>
                </>
              )}
            </section>
          )}
        </form>

        <aside className={'editor__side' + (tab === 'preview' ? ' is-active' : '')} aria-label="Preview and checks">
          <ChecksPanel review={review} removed={preview.removed} onFind={findInContent} />
          <PreviewPanel html={preview.html} error={preview.error} />
        </aside>
      </div>

      {historyOpen && saved && (
        <HistoryPanel
          policyId={saved.id}
          currentRevision={saved.revision}
          onClose={() => setHistoryOpen(false)}
          onLoad={loadRevision}
        />
      )}
    </div>
  );
}
