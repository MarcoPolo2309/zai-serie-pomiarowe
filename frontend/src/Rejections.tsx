import { useCallback } from 'react';
import { api } from './api';
import { Status, fmtDate } from './ui';
import { useLoad } from './useLoad';
import type { Rejection } from './types';

const REASONS: Record<string, string> = { out_of_range: 'Wartość poza przedziałem serii', future_timestamp: 'Znacznik czasu z przyszłości' };

export function Rejections() {
  const { data, error, loading, reload } = useLoad<Rejection[]>(useCallback(() => api<Rejection[]>('/api/rejections?limit=200'), []));
  return (
    <>
      <h1>Log odrzuconych wyników</h1>
      <p><button type="button" onClick={reload}>Odśwież</button></p>
      <Status loading={loading} error={error} onRetry={reload} />
      {data && data.length === 0 && <p>Brak odrzuconych wyników.</p>}
      {data && data.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Odrzucone wyniki">
          <table>
            <caption className="sr-only">Ostatnie odrzucone wyniki</caption>
            <thead><tr><th scope="col">Kiedy</th><th scope="col">Seria</th><th scope="col">Czujnik</th><th scope="col">Wartość</th><th scope="col">Powód</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{fmtDate(r.createdAt)}</th><td>{r.seriesName}</td><td>{r.sensorName ?? '—'}</td>
                  <td>{r.value}</td><td>{REASONS[r.reason] ?? r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
