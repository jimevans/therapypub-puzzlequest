// Tests of paging through lists, as the v1 API's lists do.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Schema, Types, model } from "mongoose";

const { findPage, pageQuery, MAX_PAGE_SIZE } =
  await import("../../src/api/paging.js");

const ItemModel = model("PagingTestItem", new Schema({ n: Number }));

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await ItemModel.deleteMany({});
  // Created in order, so their IDs are in order.
  for (let n = 1; n <= 5; n++) {
    await ItemModel.create({ n });
  }
});

/**
 * Gets a page of the items, as a list request would.
 * @param query the request's query parameters
 * @param filter conditions the items must meet
 * @returns the page, with the items' numbers
 */
async function page(query: object, filter: object = {}) {
  const result = await findPage(
    (conditions) => ItemModel.find({ ...filter, ...conditions }).lean(),
    pageQuery.parse(query)
  );
  return { numbers: result.items.map((item) => item.n), next: result.next };
}

describe("a page", () => {
  it("holds up to the limit, with a cursor for the next", async () => {
    const first = await page({ limit: "2" });
    expect(first.numbers).toEqual([1, 2]);
    expect(first.next).toEqual(expect.any(String));

    const second = await page({ limit: "2", after: first.next });
    expect(second.numbers).toEqual([3, 4]);

    const last = await page({ limit: "2", after: second.next });
    expect(last).toEqual({ numbers: [5], next: null });
  });

  it("is the whole list when it fits, with no next page", async () => {
    expect(await page({})).toEqual({ numbers: [1, 2, 3, 4, 5], next: null });
  });

  it("has no next page when the list ends exactly at the limit", async () => {
    expect(await page({ limit: "5" })).toEqual({
      numbers: [1, 2, 3, 4, 5],
      next: null,
    });
  });

  it("neither skips nor repeats items when earlier ones are deleted", async () => {
    const first = await page({ limit: "2" });
    await ItemModel.deleteMany({ n: { $in: [1, 2] } });

    expect((await page({ limit: "2", after: first.next })).numbers).toEqual([
      3, 4,
    ]);
  });

  it("keeps the list's own conditions", async () => {
    const first = await page({ limit: "1" }, { n: { $gte: 4 } });

    expect(first.numbers).toEqual([4]);
    expect(
      (await page({ after: first.next }, { n: { $gte: 4 } })).numbers
    ).toEqual([5]);
  });
});

describe("the page query", () => {
  it("defaults to 50 items", () => {
    expect(pageQuery.parse({})).toEqual({ limit: 50 });
  });

  it.each([["0"], [String(MAX_PAGE_SIZE + 1)], ["2.5"], ["many"]])(
    "refuses a limit of %s",
    (limit) => {
      expect(pageQuery.safeParse({ limit }).success).toBe(false);
    }
  );

  it.each([
    ["not base64 of an ID", "nonsense"],
    ["an ID not encoded", new Types.ObjectId().toHexString()],
  ])("refuses a cursor that is %s", (_, after) => {
    const result = pageQuery.safeParse({ after });

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe(
      "Not a cursor this API gave; use the next value of a page"
    );
  });
});
