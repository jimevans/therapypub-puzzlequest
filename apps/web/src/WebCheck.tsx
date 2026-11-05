// A temporary page, at /web-check, for checking a deployment: the bundle
// loaded, the typed API client reaches the API, and the live-update socket
// connects through the host's web server. It goes away with the first real
// screen.
import type { Schemas } from "@puzzlequest/api-client";
import { useEffect, useState } from "react";
import { api } from "./api";

/** Says who is signed in, as the API reports it. */
function useSessionStatus(): string {
  const [status, setStatus] = useState("Checking");
  useEffect(() => {
    let current = true;
    api.GET("/sessions/current").then(
      ({ data, response }) => {
        if (!current) {
          return;
        }
        if (data) {
          setStatus(`Signed in as ${data.user.displayName}`);
        } else {
          setStatus(
            response.status === 401
              ? "Not signed in"
              : `Failed: the API answered ${response.status}`
          );
        }
      },
      () => {
        if (current) {
          setStatus("Failed: couldn't reach the API");
        }
      }
    );
    return () => {
      current = false;
    };
  }, []);
  return status;
}

/** Says whether the server has answered on the live-update socket. */
function useLiveUpdatesStatus(): string {
  const [status, setStatus] = useState("Connecting");
  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${location.host}/api/v1/updates`
    );
    socket.addEventListener("open", () => {
      const subscription: Schemas["LiveUpdateSubscription"] = {
        message: "subscribe",
        questName: "web-check",
      };
      socket.send(JSON.stringify(subscription));
    });
    socket.addEventListener("message", (event: MessageEvent<string>) => {
      const update = JSON.parse(event.data) as Schemas["LiveUpdate"];
      if (update.message === "connection") {
        setStatus("Connected");
      }
    });
    socket.addEventListener("error", () => {
      setStatus("Failed: couldn't connect");
    });
    return () => socket.close();
  }, []);
  return status;
}

export function WebCheck() {
  const session = useSessionStatus();
  const liveUpdates = useLiveUpdatesStatus();
  return (
    <main>
      <h1>Web app check</h1>
      <dl>
        <dt>Bundle</dt>
        <dd id="bundle">Loaded</dd>
        <dt>API</dt>
        <dd id="session">{session}</dd>
        <dt>Live updates</dt>
        <dd id="live-updates">{liveUpdates}</dd>
      </dl>
    </main>
  );
}
