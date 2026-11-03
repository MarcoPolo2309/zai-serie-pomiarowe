export interface FieldError { field: string; message: string }

/** Błąd, który zamieniamy na odpowiedź application/problem+json (RFC 9457). */
export class HttpError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
    public errors?: FieldError[],
    public headers?: Record<string, string>,
  ) {
    super(detail ?? title);
  }
}

export const badRequest = (detail: string, errors?: FieldError[]) => new HttpError(400, 'Bad Request', detail, errors);
export const unauthorized = (detail = 'Brak lub niepoprawne uwierzytelnienie', scheme = 'Bearer') =>
  new HttpError(401, 'Unauthorized', detail, undefined, { 'www-authenticate': scheme });
export const forbidden = (detail: string) => new HttpError(403, 'Forbidden', detail);
export const notFound = (detail = 'Zasób nie istnieje') => new HttpError(404, 'Not Found', detail);
export const conflict = (detail: string) => new HttpError(409, 'Conflict', detail);
export const unprocessable = (detail: string, errors?: FieldError[]) => new HttpError(422, 'Unprocessable Content', detail, errors);

export const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  406: 'Not Acceptable', 409: 'Conflict', 413: 'Content Too Large', 415: 'Unsupported Media Type',
  422: 'Unprocessable Content', 429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable',
};
