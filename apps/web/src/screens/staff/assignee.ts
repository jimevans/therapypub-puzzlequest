/**
 * Names who a quest is for, for staff.
 * @param assignee the quest's team or player
 * @returns the name, such as "The Reds (team)"
 */
export function assigneeOf(assignee: {
  kind: "user" | "team";
  name?: string;
  displayName?: string;
}): string {
  const kind = assignee.kind === "team" ? "team" : "player";
  return assignee.name
    ? `${assignee.displayName ?? assignee.name} (${kind})`
    : `A deleted ${kind}`;
}
