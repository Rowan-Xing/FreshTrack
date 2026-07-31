import {
  apiErrorSchema,
  authResponseSchema,
  meResponseSchema
} from "@freshtrack/contracts";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createAuthService } from "./auth-service.js";
import { createFoodService } from "./food-service.js";
import type { Logger } from "./logger.js";

const prisma = new PrismaClient();
const silentLogger: Logger = { log() {} };
const authService = await createAuthService(prisma, 30);
const foodService = createFoodService(prisma);
const app = createApp({ authService, foodService, logger: silentLogger });

beforeEach(async () => {
  await prisma.food.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function register(email: string, password = "secure-password") {
  const result = await app.request("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  return { result, body: authResponseSchema.parse(await result.json()) };
}

describe("real PostgreSQL authentication", () => {
  it("registers, logs in, restores, and revokes an opaque session", async () => {
    const registered = await register(" Owner@Example.com ");
    expect(registered.result.status).toBe(201);
    expect(registered.body.user.email).toBe("owner@example.com");

    const storedSession = await prisma.authSession.findFirstOrThrow();
    expect(storedSession.tokenHash).toHaveLength(64);
    expect(storedSession.tokenHash).not.toContain(
      registered.body.session.token
    );
    const storedUser = await prisma.user.findFirstOrThrow();
    expect(storedUser.passwordHash).not.toContain("secure-password");
    expect(storedUser.passwordHash).toMatch(/^\$argon2id\$/);

    const loginResult = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "OWNER@example.com",
        password: "secure-password"
      })
    });
    const loggedIn = authResponseSchema.parse(await loginResult.json());
    expect(loginResult.status).toBe(200);

    const meResult = await app.request("/v1/auth/me", {
      headers: { authorization: `Bearer ${loggedIn.session.token}` }
    });
    expect(meResponseSchema.parse(await meResult.json()).user.id).toBe(
      registered.body.user.id
    );

    const logoutResult = await app.request("/v1/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${loggedIn.session.token}` }
    });
    expect(logoutResult.status).toBe(204);

    const revokedResult = await app.request("/v1/auth/me", {
      headers: { authorization: `Bearer ${loggedIn.session.token}` }
    });
    expect(revokedResult.status).toBe(401);
    expect(
      apiErrorSchema.parse(await revokedResult.json()).error.code
    ).toBe("AUTH_SESSION_INVALID");
  });

  it("enforces normalized email uniqueness and hides credential mismatch", async () => {
    await register("person@example.com");
    const duplicate = await app.request("/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: " PERSON@example.com ",
        password: "different-password"
      })
    });
    expect(duplicate.status).toBe(409);
    expect(apiErrorSchema.parse(await duplicate.json()).error.code).toBe(
      "AUTH_EMAIL_TAKEN"
    );

    for (const email of ["person@example.com", "missing@example.com"]) {
      const result = await app.request("/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "incorrect-password" })
      });
      const error = apiErrorSchema.parse(await result.json());
      expect(result.status).toBe(401);
      expect(error.error.code).toBe("AUTH_INVALID_CREDENTIALS");
      expect(error.error.message).toBe("邮箱或密码错误");
    }
  });

  it("rejects and revokes an expired persisted session", async () => {
    const registered = await register("expired@example.com");
    await prisma.authSession.updateMany({
      data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") }
    });

    const result = await app.request("/v1/auth/me", {
      headers: {
        authorization: `Bearer ${registered.body.session.token}`
      }
    });
    expect(result.status).toBe(401);
    expect(apiErrorSchema.parse(await result.json()).error.code).toBe(
      "AUTH_SESSION_EXPIRED"
    );
    expect((await prisma.authSession.findFirstOrThrow()).revokedAt).not.toBeNull();
  });
});
