// Published policies wear the same violet stamp as the effective date on the public page.
export default function StatusBadge({ status }) {
  return status === 'published'
    ? <span className="badge badge--published">Published</span>
    : <span className="badge badge--draft">Draft</span>;
}
