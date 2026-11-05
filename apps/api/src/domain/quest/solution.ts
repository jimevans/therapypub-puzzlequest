/**
 * Decides whether a guess solves a puzzle.
 * @param guess the player's guess, as typed
 * @param keywords the puzzle's solution keywords, as written by its author
 * @returns true if the guess is correct
 */
export type SolutionMatcher = (
  guess: string,
  keywords: readonly string[]
) => boolean;

/**
 * Reduces text to the form solutions are compared in, so that differences in
 * case, accents, punctuation, and spacing don't make a guess wrong. "O'Neil",
 * "ONeil", and "o neil" all become "oneil", and "Café" becomes "cafe".
 * Symbols, such as "+" or emoji, are kept.
 * @param text the text to normalize
 * @returns the normalized text
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\p{M}\p{P}\p{Z}\s]/gu, "");
}

/**
 * Splits a puzzle's comma-separated solution keywords into a list, dropping
 * blank entries.
 * @param solutionKeyword the keywords as stored on the puzzle
 * @returns the keywords
 */
export function parseSolutionKeywords(solutionKeyword: string): string[] {
  return solutionKeyword
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword);
}

/**
 * The default rule: a guess is correct when it contains every keyword. Both
 * are normalized first. A keyword made only of punctuation, which would
 * normalize to nothing and so match anything, is instead matched literally,
 * ignoring case. A puzzle with no keywords is solved by any guess.
 * @param guess the player's guess
 * @param keywords the puzzle's solution keywords
 * @returns true if the guess contains every keyword
 */
export const containsAllKeywords: SolutionMatcher = (guess, keywords) => {
  const normalizedGuess = normalize(guess);
  return keywords.every((keyword) => {
    const normalizedKeyword = normalize(keyword);
    return normalizedKeyword
      ? normalizedGuess.includes(normalizedKeyword)
      : guess.toLowerCase().includes(keyword.toLowerCase());
  });
};
