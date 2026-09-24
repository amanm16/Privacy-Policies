import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import StatusBadge from '../components/StatusBadge';
import CopyLinkButton from '../components/CopyLinkButton';
import ImportDialog from '../components/ImportDialog';
import { dateTime, formatShortDate, plural, policyUrl, relativeTime } from '../lib/format';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
];

function Checks({ policy }) {
  if (policy.placeholders) return <span className="pill pill--danger">{plural(policy.placeholders, 'placeholder', 'placeholders')}</span>;
  if (policy.warnings) return <span className="pill pill--caution">{plural(policy.warnings, 'suggestion', 'suggestions')}</span>;
  return <span className="pill pill--ok">Ready</span>;
}

export default function PolicyListPage() {
  const { siteUrl } = useAuth();
  const navigate = useNavigate();
  const [policies, setPolicies] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    api('/admin/policies').then((data) => setPolicies(data.policies), (err) => setError(err.message));
  }, []);

  const counts = useMemo(() => {
    const list = policies || [];
    return {
      all: list.length,
      published: list.filter((policy) => policy.status === 'published').length,
      draft: list.filter((policy) => policy.status === 'draft').length,
    };
  }, [policies]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (policies || []).filter((policy) => {
      if (filter !== 'all' && policy.status !== filter) return false;
      const haystack = (policy.appName + ' ' + policy.organization + ' /' + policy.slug).toLowerCase();
      return words.every((word) => haystack.indexOf(word) !== -1);
    });
  }, [policies, query, filter]);

  function openRow(event, id) {
    if (event.target.closest('a, button')) return;
    navigate('/policies/' + id);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Policies</h1>
          {policies && policies.length > 0 && (
            <p className="page-sub">{plural(counts.all, 'policy', 'policies')} · {counts.published} published · {plural(counts.draft, 'draft', 'drafts')}</p>
          )}
        </div>
        <div className="page-actions">
          <button type="button" className="button" onClick={() => setImporting(true)}>Import HTML</button>
          <Link className="button button--primary" to="/new">New policy</Link>
        </div>
      </div>

      {error && <p className="notice notice--danger" role="alert">{error}</p>}
      {!policies && !error && <p className="muted">Loading policies…</p>}

      {policies && policies.length === 0 && (
        <div className="empty">
          <h2 className="empty__title">No policies yet</h2>
          <p className="empty__text">Import the HTML page a policy is hosted on today, or write a new one. Each app gets its own address, like {siteUrl}/my-app.</p>
          <div className="page-actions">
            <button type="button" className="button" onClick={() => setImporting(true)}>Import HTML</button>
            <Link className="button button--primary" to="/new">New policy</Link>
          </div>
        </div>
      )}

      {policies && policies.length > 0 && (
        <>
          <div className="toolbar">
            <input
              type="search"
              className="input search"
              placeholder="Search apps, operators or addresses"
              aria-label="Search policies"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="segmented" role="group" aria-label="Show">
              {FILTERS.map((option) => (
                <button key={option.key} type="button" className="segmented__option" aria-pressed={filter === option.key} onClick={() => setFilter(option.key)}>
                  {option.label} <span className="segmented__count">{counts[option.key]}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="muted">No policies match{query ? ' “' + query + '”' : ''}.</p>
          ) : (
            <div className="table-card">
              <table className="policy-table">
                <thead>
                  <tr>
                    <th scope="col">App</th>
                    <th scope="col">Address</th>
                    <th scope="col">Status</th>
                    <th scope="col">Effective</th>
                    <th scope="col">Checks</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((policy) => (
                    <tr key={policy.id} onClick={(event) => openRow(event, policy.id)}>
                      <td className="policy-table__app">
                        <Link to={'/policies/' + policy.id} className="policy-table__name">{policy.appName}</Link>
                        <span className="policy-table__operator">{policy.organization}</span>
                      </td>
                      <td className="policy-table__address">
                        <code>/{policy.slug}</code>
                        <CopyLinkButton url={policyUrl(siteUrl, policy.slug)} label="Copy" className="button button--small button--quiet" />
                      </td>
                      <td data-label="Status"><StatusBadge status={policy.status} /></td>
                      <td data-label="Effective" className="policy-table__mono">{formatShortDate(policy.effectiveDate)}</td>
                      <td data-label="Checks"><Checks policy={policy} /></td>
                      <td data-label="Updated" className="policy-table__updated" title={dateTime(policy.updatedAt) + (policy.updatedBy ? ' by ' + policy.updatedBy : '')}>
                        {relativeTime(policy.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
