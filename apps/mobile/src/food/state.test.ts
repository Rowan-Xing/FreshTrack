import type { Food } from "@freshtrack/contracts";
import { describe, expect, it } from "vitest";

import {
  flattenFoodPages,
  foodQueryKeys,
  foodToForm,
  formToFoodCreate,
  nextFoodPageOffset
} from "./state";

const food: Food = {
  id: "9d07dfb4-8070-4b10-a19c-d9fb122a27cb",
  name: "牛奶",
  category: "DAIRY",
  quantity: "1.25",
  unit: "盒",
  expiryDate: "2026-07-31",
  reminderEnabled: true,
  notes: null,
  status: "ACTIVE",
  processedAt: null,
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z"
};

describe("mobile food state", () => {
  it("maps details to an editable form and normalizes submission", () => {
    const form = foodToForm(food);
    expect(form).toMatchObject({ quantity: "1.25", notes: null });
    expect(
      formToFoodCreate({
        ...form,
        name: "  低脂牛奶 ",
        quantity: "01.200",
        unit: " 盒 ",
        notes: " "
      })
    ).toMatchObject({
      name: "低脂牛奶",
      quantity: "1.2",
      unit: "盒",
      notes: null
    });
  });

  it("scopes request keys by filters and authenticated session", () => {
    const oldRequest = foodQueryKeys.list("user-a", "token-old", {
      search: "奶"
    });
    expect(
      foodQueryKeys.list("user-a", "token-old", { search: "苹果" })
    ).not.toEqual(oldRequest);
    expect(
      foodQueryKeys.list("user-a", "token-new", { search: "奶" })
    ).not.toEqual(oldRequest);
    expect(
      foodQueryKeys.list("user-b", "token-old", { search: "奶" })
    ).not.toEqual(oldRequest);
  });

  it("flattens more than 100 paginated records in stable order without duplicates", () => {
    const items = Array.from({ length: 105 }, (_, index) => ({
      ...food,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: `食品 ${index + 1}`
    }));
    const pages = [0, 40, 80].map((offset, pageIndex) => ({
      items: [
        ...(pageIndex === 1 ? [items[39]] : []),
        ...items.slice(offset, offset + 40)
      ].filter((item): item is Food => item !== undefined),
      pageInfo: {
        offset,
        limit: 40,
        hasMore: offset < 80,
        nextOffset: offset < 80 ? offset + 40 : null
      }
    }));

    const flattened = flattenFoodPages(pages);
    const firstPage = pages[0];
    const lastPage = pages[2];
    if (!firstPage || !lastPage) {
      throw new Error("Expected three pagination fixtures");
    }
    expect(flattened).toHaveLength(105);
    expect(flattened[50]?.name).toBe("食品 51");
    expect(flattened[100]?.name).toBe("食品 101");
    expect(nextFoodPageOffset(firstPage)).toBe(40);
    expect(nextFoodPageOffset(lastPage)).toBeUndefined();
  });
});
