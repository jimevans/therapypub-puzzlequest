// Accessibility checks: whatever each component test leaves on screen is
// checked with axe-core against WCAG 2.2 AA (see setup.ts). Rules that need
// real layout, such as color contrast, or a whole page, such as landmarks and
// the document's title, can't be judged in jsdom: the browser tests check
// those, on the built site.
import axe from "axe-core";

/** The WCAG 2.2 A and AA rules. */
const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Rules jsdom can't judge, left to the browser tests. */
const NEEDS_A_BROWSER = [
  "color-contrast",
  "region",
  "landmark-one-main",
  "page-has-heading-one",
  "document-title",
  "html-has-lang",
];

/**
 * Checks what's in the document.
 * @returns each problem found, one line each: the rule, and where
 */
export async function accessibilityProblems(): Promise<string[]> {
  if (document.body.childElementCount === 0) {
    return [];
  }
  const results = await axe.run(document.body, {
    runOnly: { type: "tag", values: WCAG_AA },
    rules: Object.fromEntries(
      NEEDS_A_BROWSER.map((rule) => [rule, { enabled: false }])
    ),
  });
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id}: ${violation.help} (${node.target.join(" ")})`
    )
  );
}
