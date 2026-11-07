import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from './api';
import { useAuth } from './auth';
import { Field, describe } from './ui';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const expired = (useLocation().state as { expired?: boolean } | null)?.expired;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!username.trim()) errs.username = 'Podaj nazwę użytkownika.';
    if (!password) errs.password = 'Podaj hasło.';
    setErrors(errs); setMessage(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { await login(username.trim(), password); navigate('/admin/serie'); }
    catch (err) {
      setMessage(err instanceof ApiError && err.status === 401 ? 'Niepoprawna nazwa użytkownika lub hasło.' : err instanceof ApiError ? err.message : 'Nie udało się zalogować.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <h1>Logowanie administratora</h1>
      {expired && <p className="alert" role="status">Sesja wygasła. Zaloguj się ponownie.</p>}
      <form className="panel form" onSubmit={(e) => void submit(e)} noValidate>
        <Field id="username" label="Nazwa użytkownika" error={errors.username}>
          <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} {...describe('username', errors.username)} />
        </Field>
        <Field id="password" label="Hasło" error={errors.password}>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} {...describe('password', errors.password)} />
        </Field>
        <div aria-live="assertive">{message && <p className="alert alert-error" role="alert">{message}</p>}</div>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Logowanie…' : 'Zaloguj'}</button>
      </form>
    </>
  );
}
