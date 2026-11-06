import type { Schemas } from "@puzzlequest/api-client";

/** How much time has been spent on a quest, or on one of its steps. */
export type Clock = Pick<
  Schemas["QuestSummary"]["progress"],
  "running" | "clockStart" | "elapsedMs" | "penaltyMs" | "totalMs"
>;

/**
 * Works out the time spent, not counting penalties.
 * @param clock the clock, as the API last reported it
 * @param now the current time, in milliseconds since the epoch
 * @returns the time, in milliseconds
 */
export function elapsedAt(clock: Clock, now: number): number {
  return clock.running && clock.clockStart
    ? now - Date.parse(clock.clockStart)
    : clock.elapsedMs;
}

/**
 * Works out the players' score: the time spent, plus penalties.
 * @param clock the clock, as the API last reported it
 * @param now the current time, in milliseconds since the epoch
 * @returns the time, in milliseconds
 */
export function totalAt(clock: Clock, now: number): number {
  return clock.running && clock.clockStart
    ? elapsedAt(clock, now) + clock.penaltyMs
    : clock.totalMs;
}

/**
 * Formats a length of time, such as 4:05 or 1:04:05.
 * @param ms the length of time, in milliseconds
 * @returns the text
 */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours
    ? `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`;
}

const momentFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Formats a moment in the player's own time zone.
 * @param iso the moment, in ISO 8601 format
 * @returns the text
 */
export function formatMoment(iso: string): string {
  return momentFormat.format(Date.parse(iso));
}
