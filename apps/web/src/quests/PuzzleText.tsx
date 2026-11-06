import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * A text puzzle's Markdown. HTML in it shows as plain text, so an author can't
 * put anything on the page that isn't Markdown. It's kept apart from the screen
 * so that players download it only once they've activated a puzzle.
 */
export default function PuzzleText({ text }: { text: string }) {
  return <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>;
}
