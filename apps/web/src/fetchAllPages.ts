/**
 * Gets everything in one of the API's paged lists.
 * @param fetchPage fetches the page after the given cursor
 * @returns every item, in order
 */
export async function fetchAllPages<Item>(
  fetchPage: (
    after: string | undefined
  ) => Promise<{ items: Item[]; next?: string | null }>
): Promise<Item[]> {
  const items: Item[] = [];
  let after: string | undefined;
  do {
    const page = await fetchPage(after);
    items.push(...page.items);
    after = page.next ?? undefined;
  } while (after);
  return items;
}
