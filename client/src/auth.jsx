import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api';

const AuthContext = createContext(null);

const SIGNED_OUT = { status: 'signed-out', user: null, publicBaseUrl: null };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, publicBaseUrl: null });

  useEffect(() => {
    setUnauthorizedHandler(() => setState(SIGNED_OUT));
    api('/auth/me').then(
      (data) => setState({ status: 'signed-in', user: data.user, publicBaseUrl: data.publicBaseUrl }),
      () => setState(SIGNED_OUT),
    );
  }, []);

  const signIn = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setState({ status: 'signed-in', user: data.user, publicBaseUrl: data.publicBaseUrl });
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setState(SIGNED_OUT);
  }, []);

  const value = useMemo(() => ({
    ...state,
    // Where published policies live. Falls back to this site when PUBLIC_BASE_URL isn't set.
    siteUrl: (state.publicBaseUrl || window.location.origin).replace(/\/+$/, ''),
    signIn,
    signOut,
  }), [state, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
