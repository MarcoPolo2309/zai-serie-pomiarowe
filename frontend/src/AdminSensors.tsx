import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import { Field, Status, describe, fmtDate } from './ui';
import { useLoad } from './useLoad';
import type { Sensor, Series } from './types';

export function AdminSensors() {
  const sensors = useLoad<Sensor[]>(useCallback(() => api<Sensor[]>('/api/sensors'), []));
  const series = useLoad<Series[]>(useCallback(() => api<Series[]>('/api/series'), []));
  const [name, setName] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { if (created) dialog.current?.showModal(); }, [created]);
  const seriesName = (id: number) => series.data?.find((s) => s.id === id)?.name ?? `#${id}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim() || name.length > 100) errs.name = 'Podaj nazwę czujnika (1–100 znaków).';
    if (!seriesId) errs.seriesId = 'Wybierz serię.';
    setErrors(errs); setMessage(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await api<Sensor & { apiKey: string }>('/api/sensors', { method: 'POST', body: { name: name.trim(), seriesId: Number(seriesId) } });
      setCreated({ name: r.name, apiKey: r.apiKey }); setCopied(false);
      setName(''); sensors.reload();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Nie udało się zarejestrować czujnika.' });
    } finally { setBusy(false); }
  }

  async function remove(s: Sensor) {
    if (!window.confirm(`Wyrejestrować czujnik „${s.name}”? Jego klucz przestanie działać, zebrane wyniki zostaną.`)) return;
    try { await api(`/api/sensors/${s.id}`, { method: 'DELETE' }); sensors.reload(); setMessage({ ok: true, text: `Wyrejestrowano czujnik „${s.name}”.` }); }
    catch (err) { setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Nie udało się wyrejestrować czujnika.' }); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(created!.apiKey); setCopied(true); } catch { setCopied(false); }
  }
  function closeDialog() { dialog.current?.close(); setCreated(null); }

  return (
    <>
      <h1>Czujniki</h1>
      <div aria-live="polite">{message && <p className={message.ok ? 'alert alert-ok' : 'alert alert-error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}</div>
      <form className="panel form" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="sensor-form-h">
        <h2 id="sensor-form-h">Rejestracja czujnika</h2>
        <Field id="sname" label="Nazwa czujnika" error={errors.name}><input id="sname" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} {...describe('sname', errors.name)} /></Field>
        <Field id="sseries" label="Seria" error={errors.seriesId}>
          <select id="sseries" value={seriesId} onChange={(e) => setSeriesId(e.target.value)} {...describe('sseries', errors.seriesId)}>
            <option value="">— wybierz —</option>
            {series.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Rejestrowanie…' : 'Zarejestruj czujnik'}</button>
      </form>

      <h2>Zarejestrowane czujniki</h2>
      <Status loading={sensors.loading || series.loading} error={sensors.error ?? series.error} onRetry={() => { sensors.reload(); series.reload(); }} />
      {sensors.data && sensors.data.length === 0 && <p>Brak zarejestrowanych czujników.</p>}
      {sensors.data && sensors.data.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Lista czujników">
          <table>
            <caption className="sr-only">Zarejestrowane czujniki</caption>
            <thead><tr><th scope="col">Nazwa</th><th scope="col">Seria</th><th scope="col">Zarejestrowano</th><th scope="col">Ostatni wynik</th><th scope="col">Akcje</th></tr></thead>
            <tbody>
              {sensors.data.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.name}</th><td>{seriesName(s.seriesId)}</td><td>{fmtDate(s.createdAt)}</td><td>{fmtDate(s.lastMeasurementAt)}</td>
                  <td className="actions"><button type="button" className="danger" onClick={() => void remove(s)} aria-label={`Wyrejestruj czujnik ${s.name}`}>Wyrejestruj</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dialog ref={dialog} className="modal" aria-labelledby="key-h" onCancel={(e) => { e.preventDefault(); }}>
        {created && (
          <div>
            <h2 id="key-h">Klucz API czujnika „{created.name}”</h2>
            <p className="alert alert-error" role="alert">Klucz jest pokazany tylko teraz. Po zamknięciu tego okna nie będzie można go odczytać ponownie. Skopiuj go i zapisz w bezpiecznym miejscu.</p>
            <p><code className="key" tabIndex={0}>{created.apiKey}</code></p>
            <div aria-live="polite">{copied && <p className="alert alert-ok" role="status">Skopiowano do schowka.</p>}</div>
            <div className="actions">
              <button type="button" className="primary" onClick={() => void copy()}>Kopiuj klucz</button>
              <button type="button" onClick={closeDialog}>Zamknij – zapisałem klucz</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
