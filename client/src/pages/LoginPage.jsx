import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

// Where to go after signing in. Only admin screens are accepted, so a crafted link can't send
// someone elsewhere once they have signed in.
function returnPath(state) {
  const from = state && state.from;
  return typeof from === 'string' && /^\/(new|policies\/[a-f0-9]{24})?$/.test(from) ? from : '/';
}

export default function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'signed-in') return <Navigate to={returnPath(location.state)} replace />;

  async function submit(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit} noValidate>
        <img className="login__mark" src="/assets/favicon.svg" alt="" width="44" height="44" />
        <h1 className="login__title">Privacy Policies</h1>
        <p className="login__lead">Sign in to publish and update the privacy policies of your apps.</p>
        {error && <p className="notice notice--danger" role="alert">{error}</p>}
        <label className="field">
          <span className="field__label">Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button type="submit" className="button button--primary button--block" disabled={busy || status === 'loading'}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="login__hint">No account yet? Whoever runs the server can create one with <code>npm run user -- add you@example.com</code>.</p>
      </form>
    </div>
  );
}
