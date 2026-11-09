// Checks that every navigation returned by browsingContext.navigate gets a
// browsingContext.navigationStarted event, while navigations overlap.
//
// Needs Node 22 or later (for its built-in WebSocket) and nothing else:
//   node bidi-missing-navigation-started.mjs /path/to/firefox [iterations] [delay-ms]
// Exits with 1 if any navigation had no navigationStarted event.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const FIREFOX = process.argv[2];
const ITERATIONS = Number(process.argv[3] ?? 1000);
const DELAY = Number(process.argv[4] ?? 0);
if (!FIREFOX) {
  console.error("Usage: node <script> /path/to/firefox [iterations]");
  process.exit(2);
}

const server = createServer((request, response) => {
  if (request.url === "/redirect") {
    response.writeHead(302, { Location: "/" });
    response.end();
    return;
  }
  if (request.url === "/app.js") {
    response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
    response.end('fetch("/data").then((r) => r.text()).then((t) => { document.title = t; });');
    return;
  }
  // A slower answer leaves navigations overlapping for longer.
  setTimeout(() => {
    if (request.url === "/data") {
      response.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      response.end("loaded");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    response.end(`<!doctype html><title>${request.url}</title><h1>${request.url}</h1><script type="module" src="/app.js"></script>`);
  }, DELAY);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(path.join(tmpdir(), "bidi-repro-"));
writeFileSync(path.join(profile, "user.js"), 'user_pref("browser.shell.checkDefaultBrowser", false);\n');
const firefox = spawn(FIREFOX, ["--headless", "--no-remote", "--profile", profile, "--remote-debugging-port=0"], {
  stdio: ["ignore", "ignore", "pipe"],
});
const endpoint = await new Promise((resolve, reject) => {
  let output = "";
  firefox.stderr.on("data", (chunk) => {
    output += chunk;
    const found = output.match(/WebDriver BiDi listening on (ws:\/\/\S+)/);
    if (found) {
      resolve(found[1]);
    }
  });
  firefox.on("exit", () => reject(new Error(`Firefox exited early:\n${output}`)));
});

const socket = new WebSocket(`${endpoint}/session`);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let nextId = 1;
const pending = new Map();
const events = new Map(); // navigation ID -> the events seen for it
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id !== undefined) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  } else if (message.type === "event" && message.params.navigation) {
    const list = events.get(message.params.navigation) ?? [];
    list.push({ method: message.method, url: message.params.url });
    events.set(message.params.navigation, list);
  }
};

/** Sends a command and returns its whole reply, which may be an error. */
function send(method, params) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

/** Sends a command that has to succeed. */
async function must(method, params) {
  const reply = await send(method, params);
  if (reply.type !== "success") {
    throw new Error(`${method}: ${JSON.stringify(reply)}`);
  }
  return reply.result;
}

const replies = [];
let refused = 0;

/** Navigates, keeping the navigation ID the browser answers with. */
async function navigate(context, sequence, relative) {
  const asked = origin + relative;
  const reply = await send("browsingContext.navigate", { context, url: asked, wait: "complete" });
  if (reply.type === "success") {
    replies.push({ sequence, asked, ...reply.result });
  } else {
    refused++; // An overlapping navigation may be refused, which is expected.
  }
}

let failure = 0;
try {
  await must("session.new", { capabilities: {} });
  await must("session.subscribe", {
    events: [
      "browsingContext.navigationStarted",
      "browsingContext.navigationFailed",
      "browsingContext.domContentLoaded",
      "browsingContext.load",
      "network.beforeRequestSent",
      "network.responseCompleted",
      "network.fetchError",
    ],
  });
  const { contexts } = await must("browsingContext.getTree", {});
  const context = contexts[0].context;
  await navigate(context, "setup", "/login");

  for (let i = 0; i < ITERATIONS; i++) {
    // The page starts a navigation, and another follows at once.
    await send("script.callFunction", {
      functionDeclaration: '() => { location.assign("/"); }',
      awaitPromise: false,
      target: { context },
    });
    await navigate(context, "self-navigation", "/login");
  }
  for (let i = 0; i < ITERATIONS; i++) {
    // The same, after a navigation that the server redirects.
    await navigate(context, "redirect", "/redirect");
    await navigate(context, "redirect", "/login");
  }

  // Leave time for any late events.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const started = (id) =>
    (events.get(id) ?? []).some((e) => e.method === "browsingContext.navigationStarted");
  const missing = replies.filter((reply) => !started(reply.navigation));
  console.log(`${replies.length} navigations answered, ${refused} refused, ${missing.length} with no navigationStarted`);
  for (const reply of missing) {
    console.log(JSON.stringify({ ...reply, eventsSeen: events.get(reply.navigation) ?? [] }));
  }
  failure = missing.length > 0 ? 1 : 0;
} finally {
  socket.close();
  firefox.removeAllListeners("exit");
  firefox.kill();
  server.close();
  await new Promise((resolve) => setTimeout(resolve, 500));
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failure);
