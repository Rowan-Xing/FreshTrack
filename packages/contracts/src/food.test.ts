import { describe, expect, it } from "vitest";

import {
  FOOD_LIST_DEFAULT_PAGE_SIZE,
  FOOD_LIST_MAX_OFFSET,
  FOOD_LIST_MAX_PAGE_SIZE,
  expirySegmentBounds,
  foodFormSchema,
  foodListResponseSchema,
  foodListQuerySchema,
  foodQuantitySchema
} from "./food.js";

describe("food quantity contract", () => {
  it.each([
    ["1", "1"],
    ["001", "1"],
    ["01.230", "1.23"],
    ["0.010", "0.01"],
    ["10.000", "10"]
  ])("normalizes %s to %s without using a number", (input, expected) => {
    expect(foodQuantitySchema.parse(input)).toBe(expected);
  });

  it.each([
    "",
    "0",
    "0.000",
    "-1",
    "+1",
    "1e3",
    ".5",
    "1.",
    "1.2345",
    "9999999999999999"
  ])(
    "rejects non-positive or non-canonicalizable input %s",
    (input) => {
      expect(foodQuantitySchema.safeParse(input).success).toBe(false);
    }
  );
});

describe("food form and query contracts", () => {
  it("trims bounded text and maps blank notes to null", () => {
    expect(
      foodFormSchema.parse({
        name: "  牛奶 ",
        category: "DAIRY",
        quantity: "2.500",
        unit: " 盒 ",
        expiryDate: "2026-07-31",
        reminderEnabled: true,
        notes: "   "
      })
    ).toEqual({
      name: "牛奶",
      category: "DAIRY",
      quantity: "2.5",
      unit: "盒",
      expiryDate: "2026-07-31",
      reminderEnabled: true,
      notes: null
    });
  });

  it("normalizes blank search and enforces view-specific query boundaries", () => {
    expect(
      foodListQuerySchema.parse({ view: "active", search: "   " })
    ).toMatchObject({
      view: "active",
      search: undefined,
      limit: FOOD_LIST_DEFAULT_PAGE_SIZE,
      offset: 0
    });
    expect(
      foodListQuerySchema.safeParse({
        view: "active",
        segment: "today"
      }).success
    ).toBe(false);
    expect(
      foodListQuerySchema.safeParse({
        view: "history"
      }).success
    ).toBe(true);
    expect(
      foodListQuerySchema.safeParse({
        view: "history",
        sort: "created",
        segment: "expired"
      }).success
    ).toBe(false);
  });

  it("validates bounded pagination and continuation metadata", () => {
    expect(
      foodListQuerySchema.parse({
        view: "history",
        limit: String(FOOD_LIST_MAX_PAGE_SIZE),
        offset: "100"
      })
    ).toMatchObject({
      limit: FOOD_LIST_MAX_PAGE_SIZE,
      offset: 100
    });
    expect(
      foodListQuerySchema.safeParse({
        view: "active",
        limit: FOOD_LIST_MAX_PAGE_SIZE + 1
      }).success
    ).toBe(false);
    expect(
      foodListQuerySchema.safeParse({
        view: "active",
        offset: FOOD_LIST_MAX_OFFSET + 1
      }).success
    ).toBe(false);
    expect(
      foodListQuerySchema.safeParse({
        view: "active",
        offset: -1
      }).success
    ).toBe(false);
    expect(
      foodListResponseSchema.safeParse({
        items: [],
        pageInfo: {
          offset: 100,
          limit: FOOD_LIST_DEFAULT_PAGE_SIZE,
          hasMore: true,
          nextOffset: 150
        }
      }).success
    ).toBe(true);
    expect(
      foodListResponseSchema.safeParse({
        items: [],
        pageInfo: {
          offset: 100,
          limit: FOOD_LIST_DEFAULT_PAGE_SIZE,
          hasMore: true,
          nextOffset: null
        }
      }).success
    ).toBe(false);
    expect(
      foodListResponseSchema.safeParse({
        items: [],
        pageInfo: {
          offset: 100,
          limit: FOOD_LIST_DEFAULT_PAGE_SIZE,
          hasMore: false,
          nextOffset: 150
        }
      }).success
    ).toBe(false);
  });

  it("builds mutually exclusive calendar-date segments", () => {
    expect(expirySegmentBounds("expired", "2026-12-31")).toEqual({
      before: "2026-12-31"
    });
    expect(expirySegmentBounds("today", "2026-12-31")).toEqual({
      exact: "2026-12-31"
    });
    expect(expirySegmentBounds("next3", "2026-12-31")).toEqual({
      after: "2027-01-01",
      through: "2027-01-03"
    });
  });
});
