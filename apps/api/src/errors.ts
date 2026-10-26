export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function requireFound<T>(value: T | null): T {
  if (!value) throw new HttpError(404, 'Resource not found');
  return value;
}
