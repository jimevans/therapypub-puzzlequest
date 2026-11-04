/**
 * Calls the v1 API.
 * @param {string} path the path below /api/v1, such as "/sessions"
 * @param {{ method?: string, body?: unknown, formData?: FormData }} options
 *  the HTTP method (GET by default), and the body: sent as JSON, or form
 *  data sent as multipart, such as an upload
 * @returns {Promise<{ ok: true, status: number, data: unknown } | { ok: false, status: number, problem: { type: string, title: string, status: number, detail?: string, errors?: { path: string, message: string }[] } }>}
 *  the response's body: data if it succeeded, or the problem it reports
 */
export async function callApi(path, { method = "GET", body, formData } = {}) {
  const response = await fetch(`/api/v1${path}`, {
    method,
    // The browser sets the Content-Type of form data, with its boundary.
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
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

/**
 * Gets every item of a v1 list, following its pages.
 * @param {string} path the list's path below /api/v1, such as "/users"
 * @returns {Promise<{ ok: true, items: unknown[] } | { ok: false, problem: object }>}
 *  the items, or the problem a page reported
 */
export async function listAll(path) {
  const items = [];
  let after;
  do {
    const query = new URLSearchParams({ limit: "200" });
    if (after) {
      query.set("after", after);
    }
    const page = await callApi(`${path}?${query}`);
    if (!page.ok) {
      return { ok: false, problem: page.problem };
    }
    items.push(...page.data.items);
    after = page.data.next;
  } while (after);
  return { ok: true, items };
}
