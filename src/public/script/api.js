/**
 * Calls the v1 API.
 * @param {string} path the path below /api/v1, such as "/sessions"
 * @param {{ method?: string, body?: unknown }} options the HTTP method
 *  (GET by default), and the body to send as JSON, if any
 * @returns {Promise<{ ok: true, status: number, data: unknown } | { ok: false, status: number, problem: { type: string, title: string, status: number, detail?: string, errors?: { path: string, message: string }[] } }>}
 *  the response's body: data if it succeeded, or the problem it reports
 */
export async function callApi(path, { method = "GET", body } = {}) {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const isJson = /json/.test(response.headers.get("content-type") ?? "");
  const content = isJson ? await response.json() : undefined;
  if (response.ok) {
    return { ok: true, status: response.status, data: content };
  }
  return {
    ok: false,
    status: response.status,
    problem: content ?? {
      type: "about:blank",
      title: response.statusText,
      status: response.status,
    },
  };
}
