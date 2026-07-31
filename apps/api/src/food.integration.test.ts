import {
  apiErrorSchema,
  authResponseSchema,
  foodCountsResponseSchema,
  foodItemsResponseSchema,
  foodListResponseSchema,
  foodResponseSchema,
  type FoodCreate
} from "@freshtrack/contracts";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createAuthService } from "./auth-service.js";
import { createFoodService } from "./food-service.js";
import type { Logger } from "./logger.js";

const prisma = new PrismaClient();
const logger: Logger = { log() {} };
const app = createApp({
  authService: await createAuthService(prisma, 30),
  foodService: createFoodService(prisma),
  logger
});

beforeEach(async () => {
  await prisma.food.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function register(email: string): Promise<string> {
  const response = await app.request("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "secure-password" })
  });
  return authResponseSchema.parse(await response.json()).session.token;
}

function headers(token: string, json = false): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {})
  };
}

const baseFood: FoodCreate = {
  name: "牛奶",
  category: "DAIRY",
  quantity: "2.5",
  unit: "盒",
  expiryDate: "2026-07-28",
  reminderEnabled: true,
  notes: "开封后冷藏"
};

async function createFood(
  token: string,
  overrides: Partial<FoodCreate> = {}
) {
  const response = await app.request("/v1/foods", {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify({ ...baseFood, ...overrides })
  });
  expect(response.status).toBe(201);
  return foodResponseSchema.parse(await response.json()).food;
}

describe("real PostgreSQL food lifecycle", () => {
  it("supports CRUD, mutually exclusive counts, filters, stable sorting and history", async () => {
    const token = await register("foods@example.com");
    const expired = await createFood(token, {
      name: "旧面包",
      category: "STAPLES",
      expiryDate: "2026-07-27",
      quantity: "001.200"
    });
    expect(expired.quantity).toBe("1.2");
    const today = await createFood(token, { name: "今日牛奶" });
    await createFood(token, {
      name: "明日苹果",
      category: "PRODUCE",
      expiryDate: "2026-07-29"
    });
    await createFood(token, {
      name: "三日苹果",
      category: "PRODUCE",
      expiryDate: "2026-07-31"
    });
    await createFood(token, {
      name: "远期苹果",
      category: "PRODUCE",
      expiryDate: "2026-08-01"
    });

    const countsResult = await app.request(
      "/v1/foods/counts?today=2026-07-28",
      { headers: headers(token) }
    );
    expect(foodCountsResponseSchema.parse(await countsResult.json()).counts).toEqual(
      { all: 5, expired: 1, today: 1, next3: 2 }
    );

    const filteredResult = await app.request(
      "/v1/foods?view=active&segment=next3&today=2026-07-28&category=PRODUCE&sort=expiry&search=%E8%8B%B9%E6%9E%9C",
      { headers: headers(token) }
    );
    expect(
      foodListResponseSchema
        .parse(await filteredResult.json())
        .items.map((food) => food.name)
    ).toEqual(["明日苹果", "三日苹果"]);

    const updateResult = await app.request(`/v1/foods/${today.id}`, {
      method: "PUT",
      headers: headers(token, true),
      body: JSON.stringify({
        ...baseFood,
        name: "低脂牛奶",
        unit: " 自定义盒 ",
        notes: ""
      })
    });
    const updated = foodResponseSchema.parse(await updateResult.json()).food;
    expect(updated).toMatchObject({ name: "低脂牛奶", unit: "自定义盒", notes: null });

    const processResult = await app.request(`/v1/foods/${updated.id}/process`, {
      method: "POST",
      headers: headers(token, true),
      body: JSON.stringify({ status: "EATEN" })
    });
    const processed = foodResponseSchema.parse(await processResult.json()).food;
    expect(processed.status).toBe("EATEN");
    expect(processed.processedAt).not.toBeNull();

    const repeated = await app.request(`/v1/foods/${updated.id}/process`, {
      method: "POST",
      headers: headers(token, true),
      body: JSON.stringify({ status: "DISCARDED" })
    });
    expect(repeated.status).toBe(404);

    const historyResult = await app.request(
      "/v1/foods?view=history&status=EATEN&sort=created&search=%E7%89%9B%E5%A5%B6",
      { headers: headers(token) }
    );
    expect(
      foodListResponseSchema.parse(await historyResult.json()).items
    ).toHaveLength(1);

    const restoreResult = await app.request(`/v1/foods/${updated.id}/restore`, {
      method: "POST",
      headers: headers(token)
    });
    const restored = foodResponseSchema.parse(await restoreResult.json()).food;
    expect(restored).toMatchObject({ status: "ACTIVE", processedAt: null });

    const repeatedRestore = await app.request(
      `/v1/foods/${updated.id}/restore`,
      { method: "POST", headers: headers(token) }
    );
    expect(repeatedRestore.status).toBe(404);

    const deleteResult = await app.request(`/v1/foods/${expired.id}`, {
      method: "DELETE",
      headers: headers(token)
    });
    expect(deleteResult.status).toBe(204);
    expect(
      (
        await app.request(`/v1/foods/${expired.id}`, {
          headers: headers(token)
        })
      ).status
    ).toBe(404);
  });

  it("isolates every read and mutation path between two users", async () => {
    const ownerToken = await register("owner-food@example.com");
    const attackerToken = await register("other-food@example.com");
    const food = await createFood(ownerToken);

    const attempts: Array<{ path: string; method: string; body?: string }> = [
      { path: `/v1/foods/${food.id}`, method: "GET" },
      {
        path: `/v1/foods/${food.id}`,
        method: "PUT",
        body: JSON.stringify(baseFood)
      },
      { path: `/v1/foods/${food.id}`, method: "DELETE" },
      {
        path: `/v1/foods/${food.id}/process`,
        method: "POST",
        body: JSON.stringify({ status: "DISCARDED" })
      },
      { path: `/v1/foods/${food.id}/restore`, method: "POST" }
    ];

    for (const attempt of attempts) {
      const response = await app.request(attempt.path, {
        method: attempt.method,
        headers: headers(attackerToken, attempt.body !== undefined),
        ...(attempt.body === undefined ? {} : { body: attempt.body })
      });
      expect(response.status).toBe(404);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe(
        "NOT_FOUND"
      );
    }

    const attackerList = await app.request(
      "/v1/foods?view=active&sort=expiry",
      { headers: headers(attackerToken) }
    );
    expect(
      foodListResponseSchema.parse(await attackerList.json()).items
    ).toEqual([]);
    const attackerReminderCandidates = await app.request(
      "/v1/foods/reminder-candidates",
      { headers: headers(attackerToken) }
    );
    expect(attackerReminderCandidates.status).toBe(200);
    expect(
      foodItemsResponseSchema.parse(
        await attackerReminderCandidates.json()
      ).items
    ).toEqual([]);

    const ownerReminderCandidates = await app.request(
      "/v1/foods/reminder-candidates",
      { headers: headers(ownerToken) }
    );
    expect(ownerReminderCandidates.status).toBe(200);
    expect(
      foodItemsResponseSchema
        .parse(await ownerReminderCandidates.json())
        .items.map((candidate) => candidate.id)
    ).toEqual([food.id]);
    expect(
      foodResponseSchema.parse(
        await (
          await app.request(`/v1/foods/${food.id}`, {
            headers: headers(ownerToken)
          })
        ).json()
      ).food.status
    ).toBe("ACTIVE");
  });

  it("paginates active and history beyond 100 while reminders stay complete", async () => {
    const token = await register("pagination-foods@example.com");
    await Promise.all(
      Array.from({ length: 105 }, (_, index) =>
        createFood(token, {
          name: `分页食品 ${String(index + 1).padStart(3, "0")}`,
          expiryDate: "2026-08-15"
        })
      )
    );

    const pages = await Promise.all(
      [0, 40, 80].map(async (offset) => {
        const response = await app.request(
          `/v1/foods?view=active&sort=expiry&limit=40&offset=${offset}`,
          { headers: headers(token) }
        );
        expect(response.status).toBe(200);
        return foodListResponseSchema.parse(await response.json());
      })
    );
    expect(pages.map((page) => page.items.length)).toEqual([40, 40, 25]);
    expect(pages.map((page) => page.pageInfo.nextOffset)).toEqual([
      40,
      80,
      null
    ]);
    const allIds = pages.flatMap((page) =>
      page.items.map((item) => item.id)
    );
    expect(new Set(allIds).size).toBe(105);
    expect(allIds[50]).toBeTypeOf("string");
    expect(allIds[100]).toBeTypeOf("string");

    const reminderResponse = await app.request(
      "/v1/foods/reminder-candidates",
      { headers: headers(token) }
    );
    expect(reminderResponse.status).toBe(200);
    expect(
      foodItemsResponseSchema.parse(await reminderResponse.json()).items
    ).toHaveLength(105);

    await prisma.food.updateMany({
      where: { id: { in: allIds } },
      data: {
        status: "DISCARDED",
        processedAt: new Date("2026-07-29T12:00:00.000Z")
      }
    });
    const historyPages = await Promise.all(
      [0, 40, 80].map(async (offset) => {
        const response = await app.request(
          `/v1/foods?view=history&status=DISCARDED&limit=40&offset=${offset}`,
          { headers: headers(token) }
        );
        expect(response.status).toBe(200);
        return foodListResponseSchema.parse(await response.json());
      })
    );
    const historyIds = historyPages.flatMap((page) =>
      page.items.map((item) => item.id)
    );
    expect(historyPages.map((page) => page.items.length)).toEqual([
      40,
      40,
      25
    ]);
    expect(new Set(historyIds).size).toBe(105);
    expect(historyIds).toEqual([...historyIds].sort());
    expect(historyIds[50]).toBeTypeOf("string");
    expect(historyIds[100]).toBeTypeOf("string");
  });
});
