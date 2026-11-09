import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { shareLinksQuery } from "./queries";

const ShareLinks = lazy(async () => ({
  default: (await import("./ShareLinks")).ShareLinks,
}));

/**
 * Adds the share links panel for a private quest. Most quests are public, so
 * the panel's code is downloaded only when it's needed.
 */
export function ShareLinksSection({ questName }: { questName: string }) {
  const links = useQuery(shareLinksQuery(questName));
  if (links.data?.visibility !== "private") {
    return null;
  }
  return (
    <Suspense>
      <ShareLinks questName={questName} />
    </Suspense>
  );
}
