import { useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import { Field, describe } from './ui';

export function Account() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!cur) errs.cur = 'Podaj bieżące hasło.';
    if (next.length < 8) errs.next = 'Nowe hasło musi mieć co najmniej 8 znaków.';
    if (again !== next) errs.again = 'Hasła nie są takie same.';
    setErrors(errs); setMessage(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'PUT', body: { currentPassword: cur, newPassword: next } });
      setCur(''); setNext(''); setAgain('');
      setMessage({ ok: true, text: 'Hasło zostało zmienione.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError && err.status === 403 ? 'Bieżące hasło jest niepoprawne.' : err instanceof ApiError ? err.message : 'Nie udało się zmienić hasła.' });
    } finally { setBusy(false); }
  }

  return (
    <>
      <h1>Konto administratora</h1>
      <form className="panel form" onSubmit={(e) => void submit(e)} noValidate>
        <h2>Zmiana hasła</h2>
        <Field id="cur" label="Bieżące hasło" error={errors.cur}>
          <input id="cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} {...describe('cur', errors.cur)} />
        </Field>
        <Field id="next" label="Nowe hasło" hint="Co najmniej 8 znaków." error={errors.next}>
          <input id="next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} {...describe('next', errors.next, 'x')} />
        </Field>
        <Field id="again" label="Powtórz nowe hasło" error={errors.again}>
          <input id="again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} {...describe('again', errors.again)} />
        </Field>
        <div aria-live="polite">{message && <p className={message.ok ? 'alert alert-ok' : 'alert alert-error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}</div>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zmień hasło'}</button>
      </form>
    </>
  );
}
