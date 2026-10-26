export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const body = (await response.json().catch(() => null)) as {
    error?: {
      message: string;
    };
  } | null;

  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.error?.message ?? 'Unable to connect. Please try again.',
    );
  return body as T;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
