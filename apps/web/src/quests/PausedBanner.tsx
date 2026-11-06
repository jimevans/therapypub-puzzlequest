import { Banner } from "../ui/Banner";

/** Says that the puzzle master has paused the quest. */
export function PausedBanner() {
  return (
    <Banner id="paused-banner">
      Paused by the puzzle master. The clock is stopped, and you can carry on as
      soon as the quest resumes.
    </Banner>
  );
}
