import type { FieldError } from './types';

const KEY = 'zai_token';
export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t: string | null) => (t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors: FieldError[] = []) { super(message); }
}

interface Options { method?: string; body?: unknown }

/** Wywołanie API; po 401 przy zapisanym tokenie czyści sesję i zgłasza zdarzenie przekierowania na logowanie. */
export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.');
  }
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('zai-unauthorized'));
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!res.ok) {
    const p = (data ?? {}) as { detail?: string; title?: string; errors?: FieldError[] };
    throw new ApiError(res.status, p.detail ?? p.title ?? `Błąd serwera (${res.status})`, p.errors);
  }
  return data as T;
}
