import type { AuthUser } from "@freshtrack/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  commitSessionRefreshResult,
  isCurrentAuthenticatedSession,
  resolveSessionRefreshFailure,
  restoreSession,
  type AuthState,
  type RestoreApi,
  type SessionStorage
} from "./session-restore";

const user: AuthUser = {
  id: "9d07dfb4-8070-4b10-a19c-d9fb122a27cb",
  email: "user@example.com",
  createdAt: "2026-07-28T12:00:00.000Z"
};

function setup(token: string | null) {
  const clearToken = vi.fn(() => Promise.resolve());
  const compareAndClearToken = vi.fn(async (expectedToken: string) => {
    if (expectedToken !== token) {
      return false;
    }
    await clearToken();
    return true;
  });
  const storage: SessionStorage = {
    getToken: vi.fn(() => Promise.resolve(token)),
    setToken: vi.fn(() => Promise.resolve()),
    clearToken,
    compareAndClearToken
  };
  const me = vi.fn(() => Promise.resolve({ user }));
  const api: RestoreApi = {
    me,
    isInvalidSession: (error) =>
      error instanceof Error && error.message === "invalid",
    toMessage: () => "网络不可用"
  };
  return { storage, api, me, clearToken, compareAndClearToken };
}

describe("session restoration", () => {
  it("restores a valid persisted session", async () => {
    const { storage, api } = setup("opaque-token");
    await expect(restoreSession(storage, api)).resolves.toEqual({
      status: "authenticated",
      token: "opaque-token",
      user
    });
  });

  it("clears only an explicitly invalid session", async () => {
    const { storage, api, me, clearToken } = setup("expired-token");
    me.mockRejectedValueOnce(new Error("invalid"));
    await expect(restoreSession(storage, api)).resolves.toEqual({
      status: "anonymous"
    });
    expect(clearToken).toHaveBeenCalledOnce();
  });

  it("preserves credentials during a retryable network failure", async () => {
    const { storage, api, me, clearToken } = setup("still-valid-token");
    me.mockRejectedValueOnce(new Error("offline"));
    await expect(restoreSession(storage, api)).resolves.toEqual({
      status: "retryableError",
      message: "网络不可用"
    });
    expect(clearToken).not.toHaveBeenCalled();
  });

  it("keeps restoration retryable when an invalid token cannot be deleted", async () => {
    const { storage, api, me, clearToken } = setup("expired-token");
    me.mockRejectedValueOnce(new Error("invalid"));
    clearToken.mockRejectedValueOnce(new Error("secure storage unavailable"));

    await expect(restoreSession(storage, api)).resolves.toEqual({
      status: "retryableError",
      message: "登录已失效，但设备凭据清理失败，请重试"
    });
  });

  it("enters a recoverable error state when foreground 401 cleanup fails", async () => {
    const { storage, api, clearToken } = setup("expired-token");
    const unauthorized = new Error("invalid");
    clearToken.mockRejectedValueOnce(new Error("secure storage unavailable"));

    await expect(
      resolveSessionRefreshFailure(
        unauthorized,
        storage,
        "expired-token",
        (error) => api.isInvalidSession(error)
      )
    ).resolves.toEqual({
      status: "recoveryError",
      message: "登录已失效，但设备凭据清理失败，请重试"
    });
    expect(clearToken).toHaveBeenCalledOnce();
  });

  it("does not delete a replacement credential after a late old 401", async () => {
    const { storage, api, clearToken, compareAndClearToken } =
      setup("replacement-token");

    await expect(
      resolveSessionRefreshFailure(
        new Error("invalid"),
        storage,
        "old-token",
        (error) => api.isInvalidSession(error)
      )
    ).resolves.toEqual({ status: "unchanged" });
    expect(compareAndClearToken).toHaveBeenCalledWith("old-token");
    expect(clearToken).not.toHaveBeenCalled();
  });

  it("does not let a late refresh overwrite a changed session", () => {
    const signedOutState: AuthState = { status: "anonymous" };
    expect(
      commitSessionRefreshResult(signedOutState, "old-token", {
        status: "authenticated",
        user
      })
    ).toBe(signedOutState);

    const replacementState: AuthState = {
      status: "authenticated",
      token: "new-token",
      user
    };
    expect(
      commitSessionRefreshResult(replacementState, "old-token", {
        status: "anonymous"
      })
    ).toBe(replacementState);
    expect(
      commitSessionRefreshResult(replacementState, "old-token", {
        status: "recoveryError",
        message: "stale cleanup failed"
      })
    ).toBe(replacementState);
  });

  it("identifies only the exact current authenticated session", () => {
    const current: AuthState = {
      status: "authenticated",
      token: "current-token",
      user
    };
    expect(
      isCurrentAuthenticatedSession(current, "current-token")
    ).toBe(true);
    expect(isCurrentAuthenticatedSession(current, "old-token")).toBe(
      false
    );
    expect(
      isCurrentAuthenticatedSession({ status: "anonymous" }, "current-token")
    ).toBe(false);
  });
});
