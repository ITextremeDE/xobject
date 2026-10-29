import type { Inputs, Operation, Outputs, AuthUser } from '@xobject/contracts';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-XObject-Request': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url.startsWith('/api/v1/')) window.dispatchEvent(new Event('xobject:session-expired'));
    throw new ApiError(response.status, result.error || result.message || 'Request failed');
  }
  return result as T;
}

export function api<K extends Operation>(operation: K, input: Inputs[K]): Promise<Outputs[K]> {
  return request(`/api/v1/${operation}`, input);
}
export const getSession = () => request<{ user: AuthUser } | null>('/api/auth/get-session');
export const signIn = (email: string, password: string) => request('/api/auth/sign-in/email', { email, password });
export const signOut = () => request('/api/auth/sign-out', {});
