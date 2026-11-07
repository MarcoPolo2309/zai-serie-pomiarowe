import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';

interface Auth { loggedIn: boolean; login: (u: string, p: string) => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<Auth | null>(null);
export const useAuth = () => useContext(Ctx)!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(() => !!getToken());
  const navigate = useNavigate();

  useEffect(() => {
    const onExpired = () => { setLoggedIn(false); navigate('/login', { state: { expired: true } }); };
    window.addEventListener('zai-unauthorized', onExpired);
    return () => window.removeEventListener('zai-unauthorized', onExpired);
  }, [navigate]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ accessToken: string }>('/api/auth/login', { method: 'POST', body: { username, password } });
    setToken(r.accessToken);
    setLoggedIn(true);
  }, []);

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* token i tak usuwamy lokalnie */ }
    setToken(null);
    setLoggedIn(false);
    navigate('/');
  }, [navigate]);

  return <Ctx.Provider value={{ loggedIn, login, logout }}>{children}</Ctx.Provider>;
}
