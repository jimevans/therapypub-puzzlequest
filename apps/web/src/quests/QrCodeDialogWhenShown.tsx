import { Suspense, lazy } from "react";
import type { QrCodeStop } from "./QrCodeDialog";

const QrCodeDialog = lazy(async () => ({
  default: (await import("./QrCodeDialog")).QrCodeDialog,
}));

/**
 * A stop's QR code dialog, whose code is downloaded the first time one is
 * shown, so the screens offering it stay small.
 */
export function QrCodeDialogWhenShown(props: {
  questName: string;
  stop: QrCodeStop | null;
  onClose: () => void;
}) {
  if (props.stop === null) {
    return null;
  }
  return (
    <Suspense>
      <QrCodeDialog {...props} />
    </Suspense>
  );
}
