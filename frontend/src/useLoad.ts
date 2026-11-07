import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

/** Ładowanie danych z obsługą stanu ładowania, błędu i ponowienia. `load` powinno być stabilne (useCallback). */
export function useLoad<T>(load: (() => Promise<T>) | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!load);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!load) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    load().then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'Nieoczekiwany błąd'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load, n]);

  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data, setData, error, loading, reload };
}
