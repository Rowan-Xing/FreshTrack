import type {
  AuthCredentials,
  AuthResponse,
  AuthUser,
  Food
} from "@freshtrack/contracts";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import type {
  AuthenticatedSession,
  AuthService
} from "./auth-service.js";
import type { Logger } from "./logger.js";
import type { FoodService } from "./food-service.js";

const user: AuthUser = {
  id: "9d07dfb4-8070-4b10-a19c-d9fb122a27cb",
  email: "user@example.com",
  createdAt: "2026-07-28T12:00:00.000Z"
};

const response: AuthResponse = {
  user,
  session: {
    token: "a".repeat(43),
    expiresAt: "2026-08-27T12:00:00.000Z"
  }
};

const food: Food = {
  id: "7bc297df-548a-434e-83d1-9fdd7f19fd34",
  name: "牛奶",
  category: "DAIRY",
  quantity: "1.5",
  unit: "盒",
  expiryDate: "2026-07-31",
  reminderEnabled: true,
  notes: null,
  status: "ACTIVE",
  processedAt: null,
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z"
};

function setup() {
  const register = vi.fn<(value: AuthCredentials) => Promise<AuthResponse>>(
    () => Promise.resolve(response)
  );
  const login = vi.fn<(value: AuthCredentials) => Promise<AuthResponse>>(
    () => Promise.resolve(response)
  );
  const authenticate = vi.fn<
    (token: string) => Promise<AuthenticatedSession>
  >(() => Promise.resolve({ tokenHash: "hash", user }));
  const logout = vi.fn<(tokenHash: string) => Promise<void>>(() =>
    Promise.resolve()
  );
  const authService: AuthService = {
    register,
    login,
    authenticate,
    logout
  };
  const createFood = vi.fn<FoodService["create"]>();
  const listFoods = vi.fn<FoodService["list"]>(() =>
    Promise.resolve({
      items: [],
      pageInfo: {
        offset: 0,
        limit: 50,
        hasMore: false,
        nextOffset: null
      }
    })
  );
  const listActiveForReminders = vi.fn<
    FoodService["listActiveForReminders"]
  >(() => Promise.resolve([]));
  const countFoods = vi.fn<FoodService["counts"]>(() =>
    Promise.resolve({ all: 0, expired: 0, today: 0, next3: 0 })
  );
  const foodService: FoodService = {
    create: createFood,
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    list: listFoods,
    listActiveForReminders,
    counts: countFoods,
    process: vi.fn(),
    restore: vi.fn()
  };
  const logger: Logger = { log: vi.fn() };
  return {
    app: createApp({ authService, foodService, logger }),
    register,
    authenticate,
    logout,
    foodService,
    createFood,
    listFoods,
    listActiveForReminders,
    countFoods
  };
}

describe("authentication HTTP contract", () => {
  it("normalizes and validates registration inputs", async () => {
    const { app, register } = setup();
    const result = await app.request("/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "  USER@Example.com ",
        password: "secure-password"
      })
    });

    expect(result.status).toBe(201);
    expect(register).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secure-password"
    });
    expect(result.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns stable field errors without echoing secrets", async () => {
    const { app } = setup();
    const result = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bad", password: "secret" })
    });
    const body = await result.text();

    expect(result.status).toBe(400);
    expect(body).toContain("REQUEST_INVALID");
    expect(body).not.toContain("secret");
  });

  it("requires a well-formed bearer token", async () => {
    const { app, authenticate } = setup();
    const result = await app.request("/v1/auth/me");

    expect(result.status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("revokes the authenticated session on logout", async () => {
    const { app, logout } = setup();
    const result = await app.request("/v1/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${"x".repeat(43)}` }
    });

    expect(result.status).toBe(204);
    expect(logout).toHaveBeenCalledWith("hash");
  });
});

describe("food HTTP contract", () => {
  it("authenticates and validates a normalized create payload", async () => {
    const { app, createFood } = setup();
    createFood.mockResolvedValueOnce(food);
    const result = await app.request("/v1/foods", {
      method: "POST",
      headers: {
        authorization: `Bearer ${"x".repeat(43)}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: " 牛奶 ",
        category: "DAIRY",
        quantity: "01.500",
        unit: " 盒 ",
        expiryDate: "2026-07-31",
        reminderEnabled: true,
        notes: " "
      })
    });

    expect(result.status).toBe(201);
    expect(createFood).toHaveBeenCalledWith(user.id, {
      name: "牛奶",
      category: "DAIRY",
      quantity: "1.5",
      unit: "盒",
      expiryDate: "2026-07-31",
      reminderEnabled: true,
      notes: null
    });
  });

  it("rejects overlapping or incomplete active filters at the boundary", async () => {
    const { app, listFoods } = setup();
    const result = await app.request(
      "/v1/foods?view=active&segment=today&status=EATEN",
      { headers: { authorization: `Bearer ${"x".repeat(43)}` } }
    );

    expect(result.status).toBe(400);
    expect(listFoods).not.toHaveBeenCalled();
    expect(await result.text()).toContain("REQUEST_INVALID");
  });

  it("passes validated pagination through and returns continuation metadata", async () => {
    const { app, listFoods } = setup();
    listFoods.mockResolvedValueOnce({
      items: [food],
      pageInfo: {
        offset: 50,
        limit: 25,
        hasMore: true,
        nextOffset: 75
      }
    });
    const result = await app.request(
      "/v1/foods?view=active&limit=25&offset=50",
      { headers: { authorization: `Bearer ${"x".repeat(43)}` } }
    );

    expect(result.status).toBe(200);
    expect(listFoods).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ limit: 25, offset: 50 })
    );
    await expect(result.json()).resolves.toMatchObject({
      items: [{ id: food.id }],
      pageInfo: { offset: 50, nextOffset: 75, hasMore: true }
    });
  });

  it("never invokes food services without authentication", async () => {
    const { app, countFoods } = setup();
    const result = await app.request(
      "/v1/foods/counts?today=2026-07-28"
    );

    expect(result.status).toBe(401);
    expect(countFoods).not.toHaveBeenCalled();
  });

  it("returns all reminder candidates only for the authenticated user", async () => {
    const { app, listActiveForReminders } = setup();
    listActiveForReminders.mockResolvedValueOnce([food]);
    const result = await app.request("/v1/foods/reminder-candidates", {
      headers: { authorization: `Bearer ${"x".repeat(43)}` }
    });

    expect(result.status).toBe(200);
    expect(listActiveForReminders).toHaveBeenCalledWith(user.id);
    await expect(result.json()).resolves.toMatchObject({
      items: [{ id: food.id, status: "ACTIVE" }]
    });
  });
});
