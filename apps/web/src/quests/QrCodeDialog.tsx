import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import dialogStyles from "../ui/Dialog.module.css";
import styles from "./QrCodeDialog.module.css";

/** The stop whose QR code is shown. */
export interface QrCodeStop {
  /** Its place in the quest, counting from 1. */
  number: number;
  /** The puzzle's name in addresses. */
  puzzleName: string;
  /** The puzzle's name as the quest shows it. */
  label: string;
  activationCode: string;
}

interface QrCodeDialogProps {
  questName: string;
  /** The stop to show, or null when the dialog is closed. */
  stop: QrCodeStop | null;
  onClose: () => void;
}

/**
 * A stop's activation QR code, large enough for the players to scan from a
 * staff member's phone or tablet, with its code to type if the scan fails,
 * and a link to save the image.
 */
export function QrCodeDialog({ questName, stop, onClose }: QrCodeDialogProps) {
  const image = stop
    ? `/api/v1/quests/${encodeURIComponent(questName)}/puzzles/${encodeURIComponent(stop.puzzleName)}/qr-code`
    : "";
  return (
    <Dialog
      id="qr-code-dialog"
      className={styles.dialog}
      isOpen={stop !== null}
      title={stop ? `Stop ${stop.number}: ${stop.label}` : ""}
      onDismiss={onClose}
    >
      {stop && (
        <>
          <img
            className={styles.code}
            src={image}
            alt={`QR code for activating ${stop.label}`}
          />
          <p className={styles.text}>
            <span className={styles.caption}>Or type</span>{" "}
            <span className={styles.activationCode}>{stop.activationCode}</span>
          </p>
          <div className={dialogStyles.actions}>
            <a
              className={styles.download}
              href={image}
              download={`${questName}-${stop.puzzleName}-qr-code.png`}
            >
              Download PNG
            </a>
            <Button variant="primary" onPress={onClose}>
              Done
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
