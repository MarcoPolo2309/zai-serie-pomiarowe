import { useCallback, useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import { ICONS, ICON_LABELS, Swatch } from './Markers';
import { Field, Status, describe } from './ui';
import { useLoad } from './useLoad';
import type { Series } from './types';

interface Form { name: string; minValue: string; maxValue: string; color: string; icon: string; unit: string }
const EMPTY: Form = { name: '', minValue: '', maxValue: '', color: '#1f5fbf', icon: 'circle', unit: '' };

export function AdminSeries() {
  const { data, error, loading, reload } = useLoad<Series[]>(useCallback(() => api<Series[]>('/api/series'), []));
  const [editId, setEditId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const open = (s?: Series) => {
    setEditId(s ? s.id : 'new'); setErrors({}); setMessage(null);
    setForm(s ? { name: s.name, minValue: String(s.minValue), maxValue: String(s.maxValue), color: s.color, icon: s.icon ?? 'circle', unit: s.unit ?? '' } : EMPTY);
  };
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const min = Number(form.minValue), max = Number(form.maxValue);
    if (!form.name.trim() || form.name.length > 100) errs.name = 'Podaj nazwę (1–100 znaków).';
    if (form.minValue.trim() === '' || !Number.isFinite(min)) errs.minValue = 'Podaj liczbę.';
    if (form.maxValue.trim() === '' || !Number.isFinite(max)) errs.maxValue = 'Podaj liczbę.';
    if (!errs.minValue && !errs.maxValue && min >= max) errs.maxValue = 'Wartość maksymalna musi być większa od minimalnej.';
    if (!/^#[0-9A-Fa-f]{6}$/.test(form.color)) errs.color = 'Wybierz kolor.';
    if (form.unit.length > 20) errs.unit = 'Najwyżej 20 znaków.';
    setErrors(errs); setMessage(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const body = { name: form.name.trim(), minValue: min, maxValue: max, color: form.color, icon: form.icon, unit: form.unit.trim() || null };
    try {
      if (editId === 'new') await api('/api/series', { method: 'POST', body });
      else await api(`/api/series/${editId}`, { method: 'PUT', body });
      setEditId(null); reload();
      setMessage({ ok: true, text: 'Seria została zapisana.' });
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      setMessage({ ok: false, text: err instanceof ApiError && err.status === 409 ? 'Nie zapisano: nowy przedział wykluczałby wyniki już zapisane w tej serii.' : err instanceof ApiError ? err.message : 'Nie udało się zapisać serii.' });
    } finally { setBusy(false); }
  }

  async function remove(s: Series) {
    if (!window.confirm(`Usunąć serię „${s.name}” wraz z jej wynikami i czujnikami? Operacji nie można cofnąć.`)) return;
    try { await api(`/api/series/${s.id}`, { method: 'DELETE' }); reload(); setMessage({ ok: true, text: `Usunięto serię „${s.name}”.` }); }
    catch (err) { setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Nie udało się usunąć serii.' }); }
  }

  return (
    <>
      <h1>Serie pomiarowe</h1>
      <div aria-live="polite">{message && <p className={message.ok ? 'alert alert-ok' : 'alert alert-error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}</div>
      <Status loading={loading} error={error} onRetry={reload} />
      {data && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Lista serii">
          <table>
            <caption className="sr-only">Skonfigurowane serie</caption>
            <thead><tr><th scope="col">Wygląd</th><th scope="col">Nazwa</th><th scope="col">Przedział</th><th scope="col">Jednostka</th><th scope="col">Akcje</th></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td><Swatch kind={s.icon} color={s.color} dash="" /></td>
                  <th scope="row">{s.name}</th>
                  <td>{s.minValue} … {s.maxValue}</td>
                  <td>{s.unit ?? '—'}</td>
                  <td className="actions">
                    <button type="button" onClick={() => open(s)} aria-label={`Edytuj serię ${s.name}`}>Edytuj</button>
                    <button type="button" className="danger" onClick={() => void remove(s)} aria-label={`Usuń serię ${s.name}`}>Usuń</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editId === null && <p><button type="button" className="primary" onClick={() => open()}>Dodaj serię</button></p>}
      {editId !== null && (
        <form className="panel form" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="series-form-h">
          <h2 id="series-form-h">{editId === 'new' ? 'Nowa seria' : 'Edycja serii'}</h2>
          <Field id="name" label="Nazwa" error={errors.name}><input id="name" value={form.name} onChange={set('name')} maxLength={100} {...describe('name', errors.name)} /></Field>
          <Field id="minValue" label="Wartość minimalna" error={errors.minValue}><input id="minValue" inputMode="decimal" value={form.minValue} onChange={set('minValue')} {...describe('minValue', errors.minValue)} /></Field>
          <Field id="maxValue" label="Wartość maksymalna" error={errors.maxValue}><input id="maxValue" inputMode="decimal" value={form.maxValue} onChange={set('maxValue')} {...describe('maxValue', errors.maxValue)} /></Field>
          <Field id="unit" label="Jednostka (opcjonalnie)" error={errors.unit}><input id="unit" value={form.unit} onChange={set('unit')} maxLength={20} {...describe('unit', errors.unit)} /></Field>
          <Field id="color" label="Kolor" error={errors.color}><input id="color" type="color" value={form.color} onChange={set('color')} {...describe('color', errors.color)} /></Field>
          <Field id="icon" label="Znacznik punktu">
            <select id="icon" value={form.icon} onChange={set('icon')}>{ICONS.map((i) => <option key={i} value={i}>{ICON_LABELS[i]}</option>)}</select>
          </Field>
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz'}</button>
            <button type="button" onClick={() => setEditId(null)}>Anuluj</button>
          </div>
        </form>
      )}
    </>
  );
}
