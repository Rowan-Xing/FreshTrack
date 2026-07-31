import type {
  AuthCredentials,
  AuthResponse
} from "@freshtrack/contracts";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { AppState } from "react-native";

import * as authApi from "./api";
import { ApiClientError } from "./api";
import { secureSessionStorage } from "./secure-storage";
import {
  clearInvalidSession,
  commitSessionRefreshResult,
  isCurrentAuthenticatedSession,
  restoreSession,
  type AuthState
} from "./session-restore";
import { reminderCoordinator } from "../reminders/runtime";

type AuthContextValue = AuthState & {
  signIn(credentials: AuthCredentials): Promise<void>;
  signUp(credentials: AuthCredentials): Promise<void>;
  signOut(): Promise<void>;
  retryRestore(): void;
  refreshSession(): Promise<void>;
  handleAuthenticatedError(error: unknown, requestToken: string): Promise<void>;
  isCurrentSession(requestToken: string): boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "发生未知错误，请稍后重试";
}

function isInvalidSession(error: unknown): boolean {
  return error instanceof ApiClientError && error.isInvalidSession;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "restoring" });
  const stateRef = useRef<AuthState>(state);
  stateRef.current = state;
  const invalidationSequence = useRef(0);
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  const replaceState = useCallback((nextState: AuthState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const invalidateLocalSession = useCallback(async (expectedToken: string) => {
    if (
      !isCurrentAuthenticatedSession(stateRef.current, expectedToken)
    ) {
      return;
    }
    const reminderUserId = stateRef.current.user.id;
    const operation = invalidationSequence.current + 1;
    invalidationSequence.current = operation;
    replaceState({ status: "restoring" });
    queryClient.clear();
    const result = await clearInvalidSession(
      secureSessionStorage,
      expectedToken
    );
    if (invalidationSequence.current !== operation) {
      return;
    }
    if (result.status === "unchanged") {
      replaceState({
        status: "recoveryError",
        message: "登录凭据已变化，请重新恢复"
      });
      return;
    }
    if (result.status === "anonymous") {
      try {
        await reminderCoordinator.cleanupUser(reminderUserId);
      } catch {
        // The pending user-id queue and last-user marker retain retry state.
      }
    }
    if (invalidationSequence.current !== operation) {
      return;
    }
    replaceState(result);
  }, [queryClient, replaceState]);

  useEffect(() => {
    let active = true;
    void restoreSession(secureSessionStorage, {
      me: authApi.me,
      isInvalidSession,
      toMessage: errorMessage
    }).then(async (result) => {
      if (!active) {
        return;
      }
      if (result.status === "retryableError") {
        replaceState({ status: "recoveryError", message: result.message });
      } else {
        if (result.status === "anonymous") {
          try {
            await reminderCoordinator.cleanupLastActiveUser();
          } catch {
            // Valid pending user ids and the last-user marker remain retryable.
          }
          if (!active) {
            return;
          }
        }
        replaceState(result);
      }
    });
    return () => {
      active = false;
    };
  }, [replaceState, restoreAttempt]);

  const acceptSession = useCallback(async (response: AuthResponse) => {
    try {
      await secureSessionStorage.setToken(response.session.token);
    } catch {
      try {
        await authApi.logout(response.session.token);
      } catch {
        // The credential is never exposed locally if secure persistence fails.
      }
      throw new Error("设备无法安全保存登录凭据，请检查系统设置");
    }
    queryClient.clear();
    invalidationSequence.current += 1;
    replaceState({
      status: "authenticated",
      token: response.session.token,
      user: response.user
    });
  }, [queryClient, replaceState]);

  const signIn = useCallback(
    async (credentials: AuthCredentials) => {
      await acceptSession(await authApi.login(credentials));
    },
    [acceptSession]
  );

  const signUp = useCallback(
    async (credentials: AuthCredentials) => {
      await acceptSession(await authApi.register(credentials));
    },
    [acceptSession]
  );

  const refreshSession = useCallback(async () => {
    if (state.status !== "authenticated") {
      return;
    }
    const refreshToken = state.token;
    try {
      const response = await authApi.me(refreshToken);
      setState((currentState) => {
        const nextState = commitSessionRefreshResult(
          currentState,
          refreshToken,
          {
            status: "authenticated",
            user: response.user
          }
        );
        stateRef.current = nextState;
        return nextState;
      });
    } catch (error) {
      if (isInvalidSession(error)) {
        await invalidateLocalSession(refreshToken);
      }
    }
  }, [invalidateLocalSession, state]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshSession();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    if (state.status !== "authenticated") {
      return;
    }
    const signOutToken = state.token;
    try {
      await authApi.logout(signOutToken);
      await invalidateLocalSession(signOutToken);
    } catch (error) {
      if (isInvalidSession(error)) {
        await invalidateLocalSession(signOutToken);
        return;
      }
      throw error;
    }
  }, [invalidateLocalSession, state]);

  const retryRestore = useCallback(() => {
    replaceState({ status: "restoring" });
    setRestoreAttempt((value) => value + 1);
  }, [replaceState]);

  const handleAuthenticatedError = useCallback(
    async (error: unknown, requestToken: string) => {
      if (
        !isInvalidSession(error) ||
        !isCurrentAuthenticatedSession(stateRef.current, requestToken)
      ) {
        return;
      }
      await invalidateLocalSession(requestToken);
    },
    [invalidateLocalSession]
  );

  const isCurrentSession = useCallback((requestToken: string) => {
    return isCurrentAuthenticatedSession(stateRef.current, requestToken);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      signUp,
      signOut,
      retryRestore,
      refreshSession,
      handleAuthenticatedError,
      isCurrentSession
    }),
    [
      handleAuthenticatedError,
      isCurrentSession,
      refreshSession,
      retryRestore,
      signIn,
      signOut,
      signUp,
      state
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
