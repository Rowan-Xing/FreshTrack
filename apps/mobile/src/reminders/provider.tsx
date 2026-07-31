import type { Food } from "@freshtrack/contracts";
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

import { ApiClientError } from "../auth/api";
import { useAuth } from "../auth/provider";
import * as foodApi from "../food/api";
import type {
  ReminderSession,
  ReminderSettingsSaveResult,
  ReminderSyncResult
} from "./coordinator";
import type { ReminderPermission } from "./planner";
import { reminderCoordinator } from "./runtime";
import {
  DEFAULT_REMINDER_SETTINGS,
  reminderSettingsSchema,
  type ReminderSettings
} from "./schema";

type ReminderPhase =
  | "idle"
  | "loading"
  | "ready"
  | "saving"
  | "syncing"
  | "error";

export type ReminderSettingsUiResult =
  | { status: "saved" }
  | { status: "savedWithWarning"; warning: string }
  | { status: "failed"; message: string }
  | { status: "stale" };

type ReminderContextValue = {
  phase: ReminderPhase;
  permission: ReminderPermission;
  settings: ReminderSettings;
  message: string | null;
  warning: string | null;
  refresh(): Promise<void>;
  saveSettings(
    settings: ReminderSettings
  ): Promise<ReminderSettingsUiResult>;
  requestPermission(): Promise<void>;
  openSystemSettings(): Promise<void>;
  reconcileFood(food: Food): Promise<string[]>;
  cancelFood(foodId: string): Promise<string[]>;
};

const ReminderContext = createContext<ReminderContextValue | undefined>(
  undefined
);

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "提醒同步失败，请稍后重试";
}

function warningMessage(
  result: Pick<ReminderSyncResult, "warnings">
): string | null {
  const warnings = [...new Set(result.warnings)];
  return warnings.length > 0 ? warnings.join("；") : null;
}

export function ReminderProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [phase, setPhase] = useState<ReminderPhase>("idle");
  const [permission, setPermission] =
    useState<ReminderPermission>("undetermined");
  const [settings, setSettings] = useState<ReminderSettings>(
    DEFAULT_REMINDER_SETTINGS
  );
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const viewGeneration = useRef(0);

  const currentSession = useCallback(
    (userId: string, token: string): ReminderSession => ({
      userId,
      isCurrent: () => auth.isCurrentSession(token)
    }),
    [auth]
  );

  // This callback runs inside the coordinator's per-user queue. It must only
  // perform the request: authenticated-error handling may enqueue cleanup and
  // therefore belongs in each outer caller after the coordinator has settled.
  const fetchFoods = useCallback(
    (token: string, signal: AbortSignal) =>
      foodApi.listActiveFoodsForReminders(token, signal),
    []
  );

  const refresh = useCallback(async (initial = false) => {
    if (auth.status !== "authenticated") {
      return;
    }
    const userId = auth.user.id;
    const token = auth.token;
    const operation = viewGeneration.current + 1;
    viewGeneration.current = operation;
    setPhase(initial ? "loading" : "syncing");
    setMessage(null);
    try {
      await reminderCoordinator.initialize();
      const session = currentSession(userId, token);
      const activationResult =
        await reminderCoordinator.activate(session);
      const state = await reminderCoordinator.loadUserState(userId);
      if (
        viewGeneration.current !== operation ||
        !auth.isCurrentSession(token)
      ) {
        return;
      }
      setPermission(state.permission);
      setSettings(state.settings);
      const result = await reminderCoordinator.reconcileAll(
        session,
        (signal) => fetchFoods(token, signal)
      );
      if (
        viewGeneration.current !== operation ||
        !auth.isCurrentSession(token)
      ) {
        return;
      }
      setWarning(
        warningMessage({
          warnings: [
            ...activationResult.warnings,
            ...result.warnings
          ]
        })
      );
      setPhase("ready");
    } catch (error) {
      // The coordinator Promise has settled here, so 401 cleanup can safely
      // enqueue behind it without creating a queue/auth invalidation cycle.
      await auth.handleAuthenticatedError(error, token);
      if (
        viewGeneration.current !== operation ||
        !auth.isCurrentSession(token)
      ) {
        return;
      }
      setMessage(errorMessage(error));
      setPhase("error");
    }
  }, [auth, currentSession, fetchFoods]);

  useEffect(() => {
    viewGeneration.current += 1;
    if (auth.status !== "authenticated") {
      setPhase("idle");
      setMessage(null);
      setWarning(null);
      return;
    }
    void refresh(true);
  }, [auth.status, auth.status === "authenticated" ? auth.token : ""]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && auth.status === "authenticated") {
        void refresh();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [auth.status, refresh]);

  const saveSettings = useCallback(
    async (
      nextSettings: ReminderSettings
    ): Promise<ReminderSettingsUiResult> => {
      if (auth.status !== "authenticated") {
        return { status: "stale" };
      }
      const valid = reminderSettingsSchema.parse(nextSettings);
      const userId = auth.user.id;
      const token = auth.token;
      const priorSettings = settings;
      const operation = viewGeneration.current + 1;
      viewGeneration.current = operation;
      setSettings(valid);
      setPhase("saving");
      setMessage(null);
      setWarning(null);
      let result: ReminderSettingsSaveResult;
      try {
        result = await reminderCoordinator.saveSettingsAndReconcile(
          currentSession(userId, token),
          valid,
          (signal) => fetchFoods(token, signal)
        );
      } catch (error) {
        await auth.handleAuthenticatedError(error, token);
        if (
          viewGeneration.current !== operation ||
          !auth.isCurrentSession(token)
        ) {
          return { status: "stale" };
        }
        const saveError = "提醒设置保存失败，请检查设备存储后重试";
        setSettings(priorSettings);
        setMessage(saveError);
        setPhase("error");
        return { status: "failed", message: saveError };
      }

      if (result.status === "stale") {
        return { status: "stale" };
      }
      if (result.status === "saveFailed") {
        if (
          viewGeneration.current !== operation ||
          !auth.isCurrentSession(token)
        ) {
          return { status: "stale" };
        }
        const saveError = "提醒设置保存失败，请检查设备存储后重试";
        setSettings(priorSettings);
        setMessage(saveError);
        setPhase("error");
        return { status: "failed", message: saveError };
      }
      if (result.syncStatus === "failed") {
        // saveSettingsAndReconcile has already released its per-user queue.
        // Handling a 401 here may now enqueue reminder cleanup without deadlock.
        await auth.handleAuthenticatedError(result.error, token);
        if (
          viewGeneration.current !== operation ||
          !auth.isCurrentSession(token)
        ) {
          return { status: "stale" };
        }
        const syncWarning = `设置已保存，但${errorMessage(result.error)}`;
        setSettings(valid);
        setWarning(syncWarning);
        setPhase("ready");
        return { status: "savedWithWarning", warning: syncWarning };
      }
      if (
        viewGeneration.current !== operation ||
        !auth.isCurrentSession(token)
      ) {
        return { status: "stale" };
      }
      setSettings(valid);
      const resultWarning = warningMessage(result);
      setWarning(resultWarning);
      setPhase("ready");
      if (resultWarning) {
        return {
          status: "savedWithWarning",
          warning: resultWarning
        };
      }
      return { status: "saved" };
    },
    [auth, currentSession, fetchFoods, settings]
  );

  const requestPermission = useCallback(async () => {
    if (auth.status !== "authenticated") {
      return;
    }
    const userId = auth.user.id;
    const token = auth.token;
    const operation = viewGeneration.current + 1;
    viewGeneration.current = operation;
    setPhase("syncing");
    setMessage(null);
    try {
      const nextPermission = await reminderCoordinator.requestPermission();
      if (
        viewGeneration.current !== operation ||
        !auth.isCurrentSession(token)
      ) {
        return;
      }
      setPermission(nextPermission);
      const result = await reminderCoordinator.reconcileAll(
        currentSession(userId, token),
        (signal) => fetchFoods(token, signal)
      );
      if (
        viewGeneration.current !== operation ||
        !auth.isCurrentSession(token)
      ) {
        return;
      }
      setWarning(warningMessage(result));
      setPhase("ready");
    } catch (error) {
      // Authentication cleanup must run after reconcileAll releases its queue.
      await auth.handleAuthenticatedError(error, token);
      if (
        viewGeneration.current !== operation ||
        !auth.isCurrentSession(token)
      ) {
        return;
      }
      setMessage(errorMessage(error));
      setPhase("error");
    }
  }, [auth, currentSession, fetchFoods]);

  const reconcileFood = useCallback(
    async (food: Food) => {
      if (auth.status !== "authenticated") {
        return [];
      }
      const token = auth.token;
      try {
        const result = await reminderCoordinator.reconcileFood(
          currentSession(auth.user.id, token),
          food
        );
        if (!auth.isCurrentSession(token)) {
          return [];
        }
        setWarning(warningMessage(result));
        return result.warnings;
      } catch {
        if (!auth.isCurrentSession(token)) {
          return [];
        }
        const syncWarning =
          "食品已保存，但提醒同步失败，可稍后在设置页重试";
        setWarning(syncWarning);
        return [syncWarning];
      }
    },
    [auth, currentSession]
  );

  const cancelFood = useCallback(
    async (foodId: string) => {
      if (auth.status !== "authenticated") {
        return [];
      }
      const token = auth.token;
      try {
        const result = await reminderCoordinator.cancelFood(
          currentSession(auth.user.id, token),
          foodId
        );
        if (!auth.isCurrentSession(token)) {
          return [];
        }
        setWarning(warningMessage(result));
        return result.warnings;
      } catch {
        if (!auth.isCurrentSession(token)) {
          return [];
        }
        const syncWarning =
          "食品操作已完成，但提醒取消失败，可稍后在设置页重试";
        setWarning(syncWarning);
        return [syncWarning];
      }
    },
    [auth, currentSession]
  );

  const value = useMemo<ReminderContextValue>(
    () => ({
      phase,
      permission,
      settings,
      message,
      warning,
      refresh,
      saveSettings,
      requestPermission,
      openSystemSettings: () => reminderCoordinator.openSettings(),
      reconcileFood,
      cancelFood
    }),
    [
      cancelFood,
      message,
      permission,
      phase,
      reconcileFood,
      refresh,
      requestPermission,
      saveSettings,
      settings,
      warning
    ]
  );

  return (
    <ReminderContext.Provider value={value}>
      {children}
    </ReminderContext.Provider>
  );
}

export function useReminders(): ReminderContextValue {
  const context = useContext(ReminderContext);
  if (!context) {
    throw new Error("useReminders must be used inside ReminderProvider");
  }
  return context;
}
