import { plural } from '../lib/format';

function summary(review) {
  if (review.placeholders.length) return { tone: 'danger', text: "Can't publish yet" };
  if (review.warnings.length) return { tone: 'caution', text: plural(review.warnings.length, 'suggestion', 'suggestions') };
  return { tone: 'ok', text: 'Ready' };
}

// What stands between this policy and a store review. Placeholders block publishing; the rest is advice.
export default function ChecksPanel({ review, removed, onFind }) {
  if (!review) {
    return (
      <section className="panel checks" aria-labelledby="checks-title">
        <div className="panel__head"><h2 id="checks-title" className="panel__title">Before you publish</h2></div>
        <p className="muted">Checking…</p>
      </section>
    );
  }
  const state = summary(review);
  const { placeholders, warnings } = review;

  return (
    <section className="panel checks" aria-labelledby="checks-title">
      <div className="panel__head">
        <h2 id="checks-title" className="panel__title">Before you publish</h2>
        <span className={'pill pill--' + state.tone}>{state.text}</span>
      </div>

      {placeholders.length > 0 && (
        <div className="check check--danger">
          <p className="check__title">
            Replace {placeholders.length === 1 ? 'this placeholder' : 'these ' + placeholders.length + ' placeholders'} to publish
          </p>
          <ul className="chips">
            {placeholders.map((placeholder) => (
              <li key={placeholder}>
                <button type="button" className="chip" onClick={() => onFind(placeholder)} title="Find it in the policy text">
                  {placeholder}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.map((warning) => (
        <p key={warning.code} className="check check--caution">{warning.message}</p>
      ))}

      {!placeholders.length && !warnings.length && (
        <p className="check check--ok">No problems found. It names a contact, covers deletion, children and third-party services, and has no placeholders.</p>
      )}

      {removed && removed.length > 0 && (
        <p className="check check--info">
          Removed when you save: {removed.map((item) => item.what + (item.count > 1 ? ' ×' + item.count : '')).join(', ')}.
        </p>
      )}
    </section>
  );
}
