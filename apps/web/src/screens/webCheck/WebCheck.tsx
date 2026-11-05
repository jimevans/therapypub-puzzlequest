// A temporary page, at /web-check, for checking a deployment: the bundle
// loaded, the typed API client reaches the API, the live-update socket connects
// through the host's web server, and the shared components and fonts work. It
// goes away with the first real screen.
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuest } from "../../live/useLiveQuest";
import { useSession } from "../../session";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/TextField";
import styles from "./WebCheck.module.css";

function useSessionStatus(): string {
  const { data, error, isPending } = useSession();
  if (isPending) {
    return "Checking";
  }
  if (error) {
    return `Failed: ${error.message}`;
  }
  return data ? `Signed in as ${data.user.displayName}` : "Not signed in";
}

export function WebCheck() {
  const queryClient = useQueryClient();
  const session = useSessionStatus();
  const { connected } = useLiveQuest("web-check");
  return (
    <>
      <h1>Web app check</h1>
      <dl className={styles.results}>
        <dt>Bundle</dt>
        <dd id="bundle">Loaded</dd>
        <dt>API</dt>
        <dd id="session">{session}</dd>
        <dt>Live updates</dt>
        <dd id="live-updates">{connected ? "Connected" : "Connecting"}</dd>
      </dl>
      <h2>Components</h2>
      <div className={styles.samples}>
        <Banner>A notice</Banner>
        <Banner tone="danger">A problem</Banner>
        <TextField label="A text field" description="With a description" />
        <TextField label="An invalid one" errorMessage="With an error" />
        <Button
          id="check-again"
          variant="primary"
          onPress={() => {
            void queryClient.invalidateQueries({ queryKey: ["session"] });
          }}
        >
          Check again
        </Button>
        <Button>A secondary button</Button>
        <Button isDisabled>A disabled button</Button>
      </div>
    </>
  );
}
