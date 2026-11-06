import { Suspense, lazy } from "react";
import styles from "./PuzzleContent.module.css";

const loadPuzzleText = () => import("./PuzzleText");
const PuzzleText = lazy(loadPuzzleText);

/**
 * Starts downloading what shows a text puzzle, without waiting to hear that the
 * puzzle has text. The download is needed soon anyway, on this puzzle or the
 * next, and waiting for the API first delays the puzzle by a whole round trip.
 */
export function preloadPuzzleText(): void {
  // If this fails, showing the puzzle tries again, and reports it if need be.
  void loadPuzzleText().catch(() => {});
}

const TYPE_IMAGE = 1;
const TYPE_AUDIO = 2;
const TYPE_VIDEO = 3;

interface PuzzleContentProps {
  displayName: string;
  type: number;
  /** The puzzle's Markdown, or the path of its media. */
  text: string;
}

function Content({ displayName, type, text }: PuzzleContentProps) {
  switch (type) {
    case TYPE_IMAGE:
      return <img src={text} alt={displayName} />;
    case TYPE_AUDIO:
      return <audio src={text} controls />;
    case TYPE_VIDEO:
      return <video src={text} controls playsInline />;
    default:
      return (
        <Suspense fallback={null}>
          <PuzzleText text={text} />
        </Suspense>
      );
  }
}

/** What a puzzle asks: its text, picture, recording, or film. */
export function PuzzleContent(props: PuzzleContentProps) {
  return (
    <div id="puzzle-content" className={styles.content}>
      <Content {...props} />
    </div>
  );
}
