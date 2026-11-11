// Lists in the v1 API come a page at a time. A page holds up to `limit`
// items in the order they were created, and `next` is a cursor for the page
// after it. Cursors are opaque to clients, and are based on IDs rather than
// positions, so items added or deleted between requests don't make a page
// skip or repeat any.
import { Types } from "mongoose";
import { z } from "zod";

/** How many items a page holds, unless the client asks for another number. */
export const DEFAULT_PAGE_SIZE = 50;

/** The most items a page can hold. */
export const MAX_PAGE_SIZE = 200;

/**
 * Reads a cursor.
 * @param cursor the cursor a page gave
 * @returns the ID of the last item before the page, or null if the cursor
 *  isn't one this API gave
 */
function readCursor(cursor: string): Types.ObjectId | null {
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  return /^[0-9a-f]{24}$/.test(id) ? new Types.ObjectId(id) : null;
}

/**
 * Makes the cursor for the page after an item.
 * @param id the ID of the last item on a page
 * @returns the cursor
 */
function makeCursor(id: Types.ObjectId): string {
  return Buffer.from(id.toHexString(), "utf8").toString("base64url");
}

/** The query parameters of a list request. */
export const pageQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .meta({
      description: `How many items to return, from 1 to ${MAX_PAGE_SIZE}.`,
    }),
  after: z
    .string()
    .transform((cursor, context) => {
      const id = readCursor(cursor);
      if (!id) {
        context.addIssue({
          code: "custom",
          message: "Not a cursor this API gave; use the next value of a page",
        });
        return z.NEVER;
      }
      return id;
    })
    .optional()
    .meta({
      description:
        "Where the page starts: the next value of the page before. Leave it out for the first page.",
    }),
});
export type PageQuery = z.output<typeof pageQuery>;

/** The named page schemas made so far, by their items' schemas. */
const namedPages = new WeakMap<z.ZodType, z.ZodType>();

/**
 * The schema of a page of a list. When the items' schema is named, the page's
 * is too, after it (a page of Quest is a QuestPage), so that generated
 * clients have one type for each kind of page.
 * @param item the schema of the list's items
 * @returns the schema
 */
export function pageSchema<T extends z.ZodType>(item: T) {
  const cached = namedPages.get(item);
  if (cached) {
    return cached as ReturnType<typeof makePageSchema<T>>;
  }
  const page = makePageSchema(item);
  const itemId = z.globalRegistry.get(item)?.id;
  if (!itemId) {
    return page;
  }
  const named = page.meta({ id: `${itemId}Page` });
  namedPages.set(item, named);
  return named;
}

/**
 * Makes the schema of a page of a list.
 * @param item the schema of the list's items
 * @returns the schema
 */
function makePageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item).meta({ description: "The page's items." }),
    next: z.string().nullable().meta({
      description:
        "The cursor for the next page, to send as after; null on the last page.",
    }),
  });
}

/** A page of a list. */
export interface Page<T> {
  items: T[];
  next: string | null;
}

/** A database query that can be sorted and limited, such as Mongoose's. */
interface PageableQuery<D> {
  sort(order: { _id: 1 }): { limit(count: number): PromiseLike<D[]> };
}

/**
 * Gets a page of the documents a query matches, in the order they were
 * created (ObjectIds start with their creation time).
 * @param find makes the query, with the extra conditions that start it
 *  after the cursor, such as (conditions) => Model.find({ ...filter,
 *  ...conditions }).lean(); the page sorts and limits it
 * @param query the page wanted
 * @returns the page of documents
 */
export async function findPage<D extends { _id: Types.ObjectId }>(
  find: (conditions: { _id?: { $gt: Types.ObjectId } }) => PageableQuery<D>,
  query: PageQuery
): Promise<Page<D>> {
  // One more than the page holds, to tell whether there is another page.
  const found = await find(query.after ? { _id: { $gt: query.after } } : {})
    .sort({ _id: 1 })
    .limit(query.limit + 1);
  const items = found.slice(0, query.limit);
  const last = items.at(-1);
  return {
    items,
    next: found.length > query.limit && last ? makeCursor(last._id) : null,
  };
}
