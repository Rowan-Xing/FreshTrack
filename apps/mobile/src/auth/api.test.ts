import { afterEach, describe, expect, it, vi } from "vitest";

import { login, logout } from "./api";

vi.mock("../env", () => ({
  getMobileEnv: () => ({
    EXPO_PUBLIC_API_URL: "http://127.0.0.1:3000"
  })
}));

describe("auth API network errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a user-facing login error without API details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed")))
    );

    await expect(
      login({ email: "user@example.com", password: "password123" })
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "无法连接服务器，请检查网络"
    });
  });

  it("uses the same safe message for empty responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed")))
    );

    await expect(logout("opaque-session-token")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "无法连接服务器，请检查网络"
    });
  });
});
