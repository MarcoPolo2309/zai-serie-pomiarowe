import { FieldError, badRequest, unprocessable } from './errors.js';

export type Json = Record<string, unknown>;

export function asObject(body: unknown): Json {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Treść żądania musi być obiektem JSON');
  }
  return body as Json;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/i;
const MIN_TS = Date.parse('1970-01-01T00:00:00Z');
const MAX_TS = Date.parse('9999-12-31T23:59:59Z');

/** Zwraca Date albo null, jeśli napis nie jest poprawnym znacznikiem ISO 8601 ze strefą czasową. */
export function parseIso(value: string): Date | null {
  // „+” w niezakodowanym query string zamienia się w spację
  const s = value.replace(/^(.*T[\d:.]+) (\d{2}:\d{2})$/, '$1+$2');
  if (!ISO_RE.test(s)) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms) || ms < MIN_TS || ms > MAX_TS) return null;
  return new Date(ms);
}

export function parseId(value: string, max = 2_147_483_647): number | null {
  if (!/^\d{1,18}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= max ? n : null;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface SeriesInput {
  name: string; minValue: number; maxValue: number; color: string; icon: string | null; unit: string | null;
}

export function parseSeriesInput(body: unknown): SeriesInput {
  const o = asObject(body);
  const errors: FieldError[] = [];
  const { name, minValue, maxValue, color, icon, unit } = o;

  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
    errors.push({ field: 'name', message: 'Wymagany napis o długości 1–100 znaków' });
  }
  if (!isFiniteNumber(minValue)) errors.push({ field: 'minValue', message: 'Wymagana liczba' });
  if (!isFiniteNumber(maxValue)) errors.push({ field: 'maxValue', message: 'Wymagana liczba' });
  if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    errors.push({ field: 'color', message: 'Wymagany kolor w formacie #RRGGBB' });
  }
  if (icon != null && (typeof icon !== 'string' || icon.length > 50)) {
    errors.push({ field: 'icon', message: 'Dozwolony napis do 50 znaków lub null' });
  }
  if (unit != null && (typeof unit !== 'string' || unit.length > 20)) {
    errors.push({ field: 'unit', message: 'Dozwolony napis do 20 znaków lub null' });
  }
  if (errors.length) throw badRequest('Niepoprawne dane serii', errors);

  if ((minValue as number) >= (maxValue as number)) {
    throw unprocessable('minValue musi być mniejsze od maxValue', [
      { field: 'minValue', message: 'Musi być mniejsze od maxValue' },
    ]);
  }
  return {
    name: name as string, minValue: minValue as number, maxValue: maxValue as number, color: color as string,
    icon: (icon as string | null | undefined) || null, unit: (unit as string | null | undefined) || null,
  };
}
