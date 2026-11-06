import { useRef, useState } from "react";
import { ApiError, api, dataOrThrow } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { AnswerForm } from "./AnswerForm";
import { QrScanner } from "./QrScanner";
import { type PuzzlePath, refusalOf, usePuzzleAction } from "./puzzleActions";
import { canScan } from "./useQrScanner";

/** How long to wait before sending a code again after getting no answer. */
const RETRY_AFTER_NO_ANSWER_MS = 5000;

/** Starts a puzzle: by scanning its QR code, or typing its code. */
export function Activation({
  path,
  paused,
}: {
  path: PuzzlePath;
  paused: boolean;
}) {
  const [method, setMethod] = useState<"scan" | "type">(
    canScan() ? "scan" : "type"
  );
  const [cameraFailed, setCameraFailed] = useState(false);
  // The scanner sees a code many times a second, and wrong codes are limited,
  // so a code left in view must not use them up.
  const lastScan = useRef({ code: "", tryAgainAt: 0 });
  const activate = usePuzzleAction(path, async (activationCode: string) =>
    dataOrThrow(
      await api.POST("/quests/{name}/puzzles/{puzzleName}/activation", {
        params: { path },
        body: { activationCode },
      })
    )
  );

  function codeScanned(code: string) {
    const { code: lastCode, tryAgainAt } = lastScan.current;
    if (activate.isPending || (code === lastCode && Date.now() < tryAgainAt)) {
      return;
    }
    lastScan.current = { code, tryAgainAt: Infinity };
    activate.mutate(code, {
      onError: (error) => {
        // The server never answered, so this says nothing about the code.
        if (!(error instanceof ApiError)) {
          lastScan.current.tryAgainAt = Date.now() + RETRY_AFTER_NO_ANSWER_MS;
        }
      },
    });
  }

  function switchTo(next: "scan" | "type") {
    activate.reset();
    setCameraFailed(false);
    lastScan.current = { code: "", tryAgainAt: 0 };
    setMethod(next);
  }

  const offerToScan = canScan() && !paused;
  return (
    <>
      {method === "scan" && !paused ? (
        <>
          <p>
            You've found this puzzle's place. Point your camera at its QR code.
          </p>
          {activate.error && (
            <Banner tone="danger">{refusalOf(activate.error)}</Banner>
          )}
          <QrScanner
            onCode={codeScanned}
            onUnavailable={() => {
              switchTo("type");
              setCameraFailed(true);
            }}
          />
          <Button id="type-code" onPress={() => switchTo("type")}>
            Enter the code instead
          </Button>
        </>
      ) : (
        <>
          <p>
            {cameraFailed
              ? "We couldn't use your camera, so enter this puzzle's code to begin."
              : "You've found this puzzle's place. Enter its code to begin."}
          </p>
          {activate.error && (
            <Banner tone="danger">{refusalOf(activate.error)}</Banner>
          )}
          <AnswerForm
            fieldId="activation-code"
            buttonId="activate"
            label="Activation code"
            buttonLabel="Start this puzzle"
            emptyMessage="Enter the code"
            isDisabled={paused}
            isPending={activate.isPending}
            onSubmit={(code) => activate.mutate(code)}
          >
            {offerToScan && (
              <Button id="scan-code" onPress={() => switchTo("scan")}>
                Scan the QR code instead
              </Button>
            )}
          </AnswerForm>
        </>
      )}
    </>
  );
}
