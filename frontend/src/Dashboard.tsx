import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './api';
import { DASHES, ICON_LABELS, Marker, Swatch } from './Markers';
import { Status, fmtDate } from './ui';
import { useLoad } from './useLoad';
import type { Measurement, Series } from './types';

const LIMIT = 2000;
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toIso = (local: string) => { const d = new Date(local); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

const SHORTCUTS: { label: string; ms: number | null }[] = [
  { label: 'Ostatnia godzina', ms: 3600e3 }, { label: 'Ostatnia doba', ms: 24 * 3600e3 },
  { label: 'Ostatnie 7 dni', ms: 7 * 24 * 3600e3 }, { label: 'Wszystko', ms: null },
];

export function Dashboard() {
  const [params, setParams] = useSearchParams();
  const fromParam = params.get('from') ?? '';
  const toParam = params.get('to') ?? '';
  const seriesParam = params.get('series'); // null = wszystkie, '' = żadna

  const seriesLoad = useLoad<Series[]>(useCallback(() => api<Series[]>('/api/series'), []));
  const allSeries = seriesLoad.data ?? [];
  const selectedIds = useMemo(
    () => (seriesParam === null ? allSeries.map((s) => s.id) : seriesParam.split(',').map(Number).filter((id) => allSeries.some((s) => s.id === id))),
    [seriesParam, allSeries]);
  const selected = allSeries.filter((s) => selectedIds.includes(s.id));
  const idsKey = selectedIds.join(',');

  const [rangeError, setRangeError] = useState<string | null>(null);
  const fromIso = fromParam ? toIso(fromParam) : null;
  const toIsoVal = toParam ? toIso(toParam) : null;
  const invalidRange = !!fromIso && !!toIsoVal && fromIso > toIsoVal;
  useEffect(() => setRangeError(invalidRange ? 'Początek zakresu musi być wcześniejszy niż jego koniec.' : null), [invalidRange]);

  const measLoad = useLoad<Measurement[]>(useCallback(() => {
    if (!seriesLoad.data || selectedIds.length === 0 || invalidRange) return Promise.resolve([]);
    const q = new URLSearchParams({ series: idsKey, sort: '-timestamp', limit: String(LIMIT) });
    if (fromIso) q.set('from', fromIso);
    if (toIsoVal) q.set('to', toIsoVal);
    return api<Measurement[]>(`/api/measurements?${q}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesLoad.data, idsKey, fromIso, toIsoVal, invalidRange]));
  const measurements = measLoad.data ?? [];
  const { setData: setMeasurements } = measLoad;
  const { reload: reloadSeries } = seriesLoad;

  // Bonus: aktualizacja na żywo przez SSE
  const [live, setLive] = useState(false);
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener('series-changed', () => reloadSeries());
    es.addEventListener('measurement', (ev) => {
      const m = JSON.parse((ev as MessageEvent<string>).data) as Measurement;
      const t = new Date(m.timestamp).getTime();
      if (!idsKey.split(',').includes(String(m.seriesId))) return;
      if (fromIso && t < new Date(fromIso).getTime()) return;
      if (toIsoVal && t > new Date(toIsoVal).getTime()) return;
      setMeasurements((prev) => (prev && !prev.some((x) => x.id === m.id) ? [m, ...prev].slice(0, LIMIT) : prev));
    });
    return () => es.close();
  }, [idsKey, fromIso, toIsoVal, setMeasurements, reloadSeries]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v === null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };
  const toggleSeries = (id: number) => {
    const ids = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : allSeries.map((s) => s.id).filter((x) => x === id || selectedIds.includes(x));
    update({ series: ids.length === allSeries.length ? null : ids.join(',') });
  };
  const applyShortcut = (ms: number | null) =>
    update({ from: ms ? toLocalInput(new Date(Date.now() - ms)) : null, to: null });

  // Wybór punktu (F6)
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [shown, setShown] = useState(100);

  // Skala: przy wielu seriach każda krzywa jest normalizowana do 0–100 % swojego zakresu danych
  const normalize = selected.length > 1;
  const stats = useMemo(() => {
    const st = new Map<number, { min: number; max: number }>();
    for (const m of measurements) {
      const s = st.get(m.seriesId);
      if (!s) st.set(m.seriesId, { min: m.value, max: m.value });
      else { s.min = Math.min(s.min, m.value); s.max = Math.max(s.max, m.value); }
    }
    return st;
  }, [measurements]);
  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    for (const m of [...measurements].reverse()) {
      const t = new Date(m.timestamp).getTime();
      const row = rows.get(t) ?? { t };
      const st = stats.get(m.seriesId)!;
      row[`v${m.seriesId}`] = normalize ? (st.max === st.min ? 50 : ((m.value - st.min) / (st.max - st.min)) * 100) : m.value;
      row[`r${m.seriesId}`] = m.value;
      row[`m${m.seriesId}`] = m.id;
      rows.set(t, row);
    }
    return [...rows.values()];
  }, [measurements, stats, normalize]);
  const selectedMeasurement = measurements.find((m) => m.id === selectedId);
  const manyPoints = chartData.length > 150;

  const fmtVal = (s: Series, v: number) => `${v.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}${s.unit ? ` ${s.unit}` : ''}`;
  const rangeText = `${fromParam ? fmtDate(fromIso) : 'początek danych'} – ${toParam ? fmtDate(toIsoVal) : 'teraz'}`;
  const loading = seriesLoad.loading || measLoad.loading;
  const error = seriesLoad.error ?? measLoad.error;

  return (
    <>
      <h1>Pomiary środowiska w Warszawie</h1>
      <p className="print-only">Zakres czasu: {rangeText}. Serie: {selected.map((s) => s.name).join(', ') || 'brak'}.</p>

      <section className="panel no-print" aria-labelledby="filters-h">
        <h2 id="filters-h">Filtry</h2>
        <form className="filters" onSubmit={(e) => e.preventDefault()} aria-describedby="range-err">
          <div className="field">
            <label htmlFor="from">Od</label>
            <input id="from" type="datetime-local" value={fromParam} onChange={(e) => update({ from: e.target.value || null })} />
          </div>
          <div className="field">
            <label htmlFor="to">Do</label>
            <input id="to" type="datetime-local" value={toParam} onChange={(e) => update({ to: e.target.value || null })} />
          </div>
          <div className="shortcuts" role="group" aria-label="Skróty zakresu czasu">
            {SHORTCUTS.map((s) => <button type="button" key={s.label} onClick={() => applyShortcut(s.ms)}>{s.label}</button>)}
          </div>
          <p id="range-err" className="field-error" role="alert">{rangeError}</p>
          <fieldset>
            <legend>Widoczne serie</legend>
            <div className="series-list">
              {allSeries.map((s, i) => (
                <label key={s.id} className="check">
                  <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleSeries(s.id)} />
                  <Swatch kind={s.icon} color={s.color} dash={DASHES[i % DASHES.length]!} />
                  <span>{s.name}{s.unit ? ` (${s.unit})` : ''}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </form>
        <p className="muted" role="status">{live ? 'Aktualizacja na żywo: włączona.' : 'Aktualizacja na żywo: brak połączenia.'}</p>
      </section>

      <Status loading={loading} error={error} onRetry={() => { seriesLoad.reload(); measLoad.reload(); }} />

      {!loading && !error && selected.length === 0 && <p>Nie wybrano żadnej serii. Zaznacz co najmniej jedną w filtrach.</p>}
      {!error && selected.length > 0 && measurements.length === 0 && !loading && <p>Brak wyników w wybranym zakresie czasu.</p>}

      {selected.length > 0 && measurements.length > 0 && (
        <>
          <section aria-labelledby="chart-h">
            <h2 id="chart-h">Wykres</h2>
            <figure className="chart" role="img"
              aria-label={`Wykres ${selected.length} serii w funkcji czasu: ${selected.map((s) => s.name).join(', ')}. Te same dane są w tabeli poniżej.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 10, left: 0 }} accessibilityLayer={false}>
                  <CartesianGrid stroke="#d0d0d0" strokeDasharray="3 3" />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={{ fill: '#333', fontSize: 12 }}
                    tickFormatter={(t: number) => new Date(t).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} />
                  <YAxis width={normalize ? 48 : 56} tick={{ fill: '#333', fontSize: 12 }} domain={normalize ? [0, 100] : ['auto', 'auto']}
                    tickFormatter={(v: number) => (normalize ? `${v}%` : String(v))} />
                  <Tooltip content={<ChartTooltip series={selected} />} />
                  <Legend content={() => null} />
                  {selected.map((s, i) => (
                    <Line key={s.id} dataKey={`v${s.id}`} name={s.name} stroke={s.color} strokeWidth={2} connectNulls isAnimationActive={false}
                      strokeDasharray={DASHES[allSeries.findIndex((x) => x.id === s.id) % DASHES.length] || undefined}
                      activeDot={false}
                      dot={(p: { cx?: number; cy?: number; payload?: Record<string, number>; index?: number }) => {
                        const key = `${s.id}-${p.index}`;
                        const has = p.payload && p.cx !== undefined && p.cy !== undefined && Number.isFinite(p.cy) && p.payload[`v${s.id}`] !== undefined;
                        if (!has) return <g key={key} />;
                        const isSel = p.payload![`m${s.id}`] === selectedId;
                        if (manyPoints && !isSel) return <g key={key} />;
                        return <g key={key}><Marker kind={s.icon} cx={p.cx!} cy={p.cy!} color={s.color} selected={isSel} r={isSel ? 6 : 4} /></g>;
                      }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </figure>
            <p className="muted">
              {normalize ? 'Oś pionowa: wartość względna (0–100 % zakresu danych danej serii); rzeczywiste wartości są w tabeli i podpowiedzi. ' : ''}
              {selectedMeasurement && <>Wyróżniony punkt: {selected.find((s) => s.id === selectedMeasurement.seriesId)?.name}, {fmtDate(selectedMeasurement.timestamp)}. </>}
              {measurements.length >= LIMIT ? `Pokazano najnowsze ${LIMIT} wyników.` : ''}
            </p>
            <ul className="legend" aria-label="Legenda wykresu">
              {selected.map((s) => (
                <li key={s.id}>
                  <Swatch kind={s.icon} color={s.color} dash={DASHES[allSeries.findIndex((x) => x.id === s.id) % DASHES.length]!} />
                  {s.name} (znacznik: {ICON_LABELS[s.icon ?? 'circle'] ?? 'koło'})
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="table-h">
            <h2 id="table-h">Tabela wyników</h2>
            <p className="muted no-print">Wybierz czas w wierszu (kliknięcie lub Enter), aby wyróżnić punkt na wykresie.</p>
            <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="table-h">
              <table>
                <caption className="sr-only">Wyniki pomiarów, od najnowszych</caption>
                <thead>
                  <tr>
                    <th scope="col">Czas</th>
                    {selected.map((s) => <th scope="col" key={s.id}>{s.name}{s.unit ? ` [${s.unit}]` : ''}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {measurements.slice(0, shown).map((m) => (
                    <tr key={m.id} className={m.id === selectedId ? 'selected' : undefined} onClick={() => setSelectedId(m.id === selectedId ? null : m.id)}>
                      <th scope="row">
                        <button type="button" className="row-button" aria-pressed={m.id === selectedId}>{fmtDate(m.timestamp)}</button>
                      </th>
                      {selected.map((s) => <td key={s.id}>{s.id === m.seriesId ? fmtVal(s, m.value) : ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {measurements.length > shown && (
              <p className="no-print"><button type="button" onClick={() => setShown(shown + 100)}>Pokaż więcej ({measurements.length - shown} pozostało)</button></p>
            )}
          </section>
        </>
      )}
    </>
  );
}

function ChartTooltip({ active, payload, series }: {
  active?: boolean; payload?: { payload: Record<string, number> }[]; series: Series[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div className="tooltip">
      <strong>{fmtDate(new Date(row.t!).toISOString())}</strong>
      <ul>
        {series.filter((s) => row[`r${s.id}`] !== undefined).map((s) => (
          <li key={s.id}>{s.name}: {row[`r${s.id}`]!.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}{s.unit ? ` ${s.unit}` : ''}</li>
        ))}
      </ul>
    </div>
  );
}
