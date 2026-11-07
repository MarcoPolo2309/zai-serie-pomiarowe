import type { ReactNode } from 'react';

/** Stan ładowania / błędu komunikacji z możliwością ponowienia (F9). */
export function Status({ loading, error, onRetry, label = 'Ładowanie danych…' }:
  { loading: boolean; error: string | null; onRetry: () => void; label?: string }) {
  return (
    <div aria-live="polite">
      {loading && <p className="muted" role="status">{label}</p>}
      {error && (
        <div className="alert alert-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>Spróbuj ponownie</button>
        </div>
      )}
    </div>
  );
}

/** Pole formularza z etykietą i komunikatem błędu powiązanymi przez aria. */
export function Field({ id, label, error, hint, children }:
  { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="field-error" id={`${id}-err`}>{error}</span>}
    </div>
  );
}

export const describe = (id: string, error?: string, hint?: string) =>
  ({ 'aria-invalid': error ? true : undefined,
     'aria-describedby': [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined });

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'medium' }) : '—';
