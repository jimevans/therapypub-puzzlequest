import styles from "./PuzzleScreen.module.css";
import { useQrScanner } from "./useQrScanner";

interface QrScannerProps {
  onCode: (code: string) => void;
  onUnavailable: () => void;
}

/** The camera's picture, read continuously, with nothing to press. */
export function QrScanner({ onCode, onUnavailable }: QrScannerProps) {
  const videoRef = useQrScanner(onCode, onUnavailable);
  return (
    <div className={styles.scanner}>
      <video
        id="qr-scanner"
        ref={videoRef}
        aria-hidden="true"
        autoPlay
        muted
        playsInline
      />
      <span className={styles.viewfinder} aria-hidden="true" />
    </div>
  );
}
