import { describe, expect, it } from "vitest";

import { parseApiEnv } from "./env.js";

const databaseUrl =
  "postgresql://user:database-password@localhost:5432/freshtrack";

describe("API environment validation", () => {
  it("ignores unrelated shell variables and applies defaults", () => {
    expect(
      parseApiEnv({
        DATABASE_URL: databaseUrl,
        PATH: "/usr/local/bin:/usr/bin",
        npm_config_user_agent: "pnpm"
      })
    ).toEqual({
      DATABASE_URL: databaseUrl,
      API_HOST: "0.0.0.0",
      API_PORT: 3000,
      SESSION_TTL_DAYS: 30,
      LOG_LEVEL: "info",
      NODE_ENV: "development"
    });
  });

  it("parses bounded runtime values", () => {
    const env = parseApiEnv({
      DATABASE_URL: databaseUrl,
      API_PORT: "3010",
      SESSION_TTL_DAYS: "7"
    });
    expect(env.API_PORT).toBe(3010);
    expect(env.SESSION_TTL_DAYS).toBe(7);
  });

  it("uses the platform PORT value when provided", () => {
    const env = parseApiEnv({
      DATABASE_URL: databaseUrl,
      API_PORT: "3010",
      PORT: "8080"
    });
    expect(env.API_PORT).toBe(8080);
  });

  it("names invalid known variables without exposing their values", () => {
    const invalidDatabaseUrl = "not-a-secret-database-url";
    const invalidPort = "secret-port";
    const invalidLogLevel = "secret-level";
    let message = "";

    try {
      parseApiEnv({
        DATABASE_URL: invalidDatabaseUrl,
        API_PORT: invalidPort,
        LOG_LEVEL: invalidLogLevel
      });
    } catch (error) {
      if (error instanceof Error) {
        message = error.message;
      }
    }

    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("API_PORT");
    expect(message).toContain("LOG_LEVEL");
    expect(message).not.toContain(invalidDatabaseUrl);
    expect(message).not.toContain(invalidPort);
    expect(message).not.toContain(invalidLogLevel);
  });
});
