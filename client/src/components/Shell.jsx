import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Shell() {
  const { user, signOut, siteUrl } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img className="brand__mark" src="/assets/favicon.svg" alt="" width="24" height="24" />
          <span className="brand__name">Privacy Policies</span>
          <span className="brand__tag">Admin</span>
        </Link>
        <nav className="topbar__links" aria-label="Site">
          <a href={siteUrl + '/'} target="_blank" rel="noreferrer">Public site</a>
        </nav>
        <div className="topbar__user">
          <span className="topbar__email" title={user.email}>{user.email}</span>
          <button type="button" className="button button--quiet button--small" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
