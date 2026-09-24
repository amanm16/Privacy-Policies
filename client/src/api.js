let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || 'The server returned an error (' + status + ').');
    this.status = status;
    this.body = body || {};
  }
}

// JSON request to the server's /api. The X-Requested-With header is what the server checks to
// accept changes made with the session cookie (see server/middleware/auth.js).
export async function api(path, options = {}) {
  const { method = 'GET', body, signal } = options;
  const headers = { Accept: 'application/json', 'X-Requested-With': 'fetch' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch('/api' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { error: "Couldn't reach the server. Check your connection and try again." });
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && onUnauthorized) onUnauthorized();
    throw new ApiError(response.status, data);
  }
  return data;
}
