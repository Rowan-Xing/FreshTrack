import type { AuthUser } from "@freshtrack/contracts";

export interface SessionStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  compareAndClearToken(expectedToken: string): Promise<boolean>;
}

export type AuthState =
  | { status: "restoring" }
  | { status: "anonymous" }
  | { status: "authenticated"; token: string; user: AuthUser }
  | { status: "recoveryError"; message: string };

export type RestoreResult =
  | { status: "anonymous" }
  | { status: "authenticated"; token: string; user: AuthUser }
  | { status: "retryableError"; message: string };

export type RestoreApi = {
  me(token: string): Promise<{ user: AuthUser }>;
  isInvalidSession(error: unknown): boolean;
  toMessage(error: unknown): string;
};

export const SESSION_CLEANUP_ERROR_MESSAGE =
  "登录已失效，但设备凭据清理失败，请重试";

export type InvalidSessionCleanupResult =
  | { status: "anonymous" }
  | { status: "unchanged" }
  | { status: "recoveryError"; message: string };

export type SessionRefreshFailureResult =
  | { status: "unchanged" }
  | InvalidSessionCleanupResult;

export type SessionRefreshResult =
  | { status: "authenticated"; user: AuthUser }
  | SessionRefreshFailureResult;

export function isCurrentAuthenticatedSession(
  state: AuthState,
  expectedToken: string
): state is Extract<AuthState, { status: "authenticated" }> {
  return state.status === "authenticated" && state.token === expectedToken;
}

export function commitSessionRefreshResult(
  currentState: AuthState,
  refreshToken: string,
  result: SessionRefreshResult
): AuthState {
  if (
    !isCurrentAuthenticatedSession(currentState, refreshToken)
  ) {
    return currentState;
  }
  if (result.status === "unchanged") {
    return currentState;
  }
  if (result.status === "authenticated") {
    return { ...currentState, user: result.user };
  }
  return result;
}

export async function clearInvalidSession(
  storage: SessionStorage,
  expectedToken: string
): Promise<InvalidSessionCleanupResult> {
  try {
    const cleared = await storage.compareAndClearToken(expectedToken);
    return cleared ? { status: "anonymous" } : { status: "unchanged" };
  } catch {
    return {
      status: "recoveryError",
      message: SESSION_CLEANUP_ERROR_MESSAGE
    };
  }
}

export async function resolveSessionRefreshFailure(
  error: unknown,
  storage: SessionStorage,
  expectedToken: string,
  isInvalidSession: (candidate: unknown) => boolean
): Promise<SessionRefreshFailureResult> {
  if (!isInvalidSession(error)) {
    return { status: "unchanged" };
  }
  return clearInvalidSession(storage, expectedToken);
}

export async function restoreSession(
  storage: SessionStorage,
  api: RestoreApi
): Promise<RestoreResult> {
  let token: string | null;
  try {
    token = await storage.getToken();
  } catch {
    return {
      status: "retryableError",
      message: "无法读取设备上的登录凭据，请重试"
    };
  }

  if (!token) {
    return { status: "anonymous" };
  }

  try {
    const response = await api.me(token);
    return {
      status: "authenticated",
      token,
      user: response.user
    };
  } catch (error) {
    if (api.isInvalidSession(error)) {
      const cleanupResult = await clearInvalidSession(storage, token);
      if (cleanupResult.status === "anonymous") {
        return cleanupResult;
      }
      if (cleanupResult.status === "unchanged") {
        return {
          status: "retryableError",
          message: "登录凭据已变化，请重新恢复"
        };
      }
      return {
        status: "retryableError",
        message: cleanupResult.message
      };
    }
    return {
      status: "retryableError",
      message: api.toMessage(error)
    };
  }
}
