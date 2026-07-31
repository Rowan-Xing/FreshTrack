import type { Food } from "@freshtrack/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  ReminderCoordinator,
  type ReminderNotifications,
  type ReminderSession
} from "./coordinator";
import type { ReminderPermission } from "./planner";
import { reminderSettingsKey } from "./schema";
import { createReminderStorage, type KeyValueStorage } from "./storage";

const USER_A = "9d07dfb4-8070-4b10-a19c-d9fb122a27cb";
const USER_B = "c13a4569-48f7-411c-902b-eccf713f50bb";
const FOOD_A = "8fb50979-728c-42f5-b7e9-8377c21bfd9d";

function deferred<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T | PromiseLike<T>) {
      resolvePromise?.(value);
    }
  };
}

function setup() {
  const values = new Map<string, string>();
  let nextSettingsWriteError: Error | null = null;
  const driver: KeyValueStorage = {
    getItem: (key) => Promise.resolve(values.get(key) ?? null),
    setItem: (key, value) => {
      if (
        key === reminderSettingsKey(USER_A) &&
        nextSettingsWriteError
      ) {
        const error = nextSettingsWriteError;
        nextSettingsWriteError = null;
        return Promise.reject(error);
      }
      values.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      values.delete(key);
      return Promise.resolve();
    }
  };
  let sequence = 0;
  const allowed: ReminderPermission = "allowed";
  const initializeMock = vi.fn<ReminderNotifications["initialize"]>(() =>
    Promise.resolve()
  );
  const getPermissionMock = vi.fn<
    ReminderNotifications["getPermission"]
  >(() => Promise.resolve(allowed));
  const requestPermissionMock = vi.fn<
    ReminderNotifications["requestPermission"]
  >(() => Promise.resolve(allowed));
  const scheduleMock = vi.fn<ReminderNotifications["schedule"]>(() => {
    sequence += 1;
    return Promise.resolve(`notification-${sequence}`);
  });
  const cancelMock = vi.fn<ReminderNotifications["cancel"]>(() =>
    Promise.resolve()
  );
  const openSettingsMock = vi.fn<
    ReminderNotifications["openSettings"]
  >(() => Promise.resolve());
  const notifications: ReminderNotifications = {
    initialize: initializeMock,
    getPermission: getPermissionMock,
    requestPermission: requestPermissionMock,
    schedule: scheduleMock,
    cancel: cancelMock,
    openSettings: openSettingsMock
  };
  const storage = createReminderStorage(driver);
  const coordinator = new ReminderCoordinator(
    storage,
    notifications,
    () => new Date(2026, 6, 28, 8, 0)
  );
  return {
    coordinator,
    storage,
    scheduleMock,
    cancelMock,
    failNextSettingsWrite(error: Error) {
      nextSettingsWriteError = error;
    }
  };
}

function session(userId = USER_A): ReminderSession {
  return { userId, isCurrent: () => true };
}

function activeFood(
  overrides: Partial<Food> = {}
): Food {
  return {
    id: FOOD_A,
    name: "牛奶",
    category: "DAIRY",
    quantity: "1",
    unit: "盒",
    expiryDate: "2026-08-01",
    reminderEnabled: true,
    notes: null,
    status: "ACTIVE",
    processedAt: null,
    createdAt: "2026-07-28T12:00:00.000Z",
    updatedAt: "2026-07-28T12:00:00.000Z",
    ...overrides
  };
}

describe("reminder coordinator", () => {
  it("schedules, replaces, and cancels only identifiers in the user's registry", async () => {
    const fake = setup();
    await fake.coordinator.reconcileFood(session(), activeFood());
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({
      [FOOD_A]: "notification-1"
    });

    await fake.coordinator.reconcileFood(
      session(),
      activeFood({ expiryDate: "2026-08-02" })
    );
    expect(fake.cancelMock).toHaveBeenCalledWith("notification-1");
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({
      [FOOD_A]: "notification-2"
    });

    await fake.coordinator.reconcileFood(
      session(),
      activeFood({ reminderEnabled: false })
    );
    expect(fake.cancelMock).toHaveBeenCalledWith("notification-2");
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({});
  });

  it("cancels delete/process and reschedules restore through their concrete effects", async () => {
    const fake = setup();
    await fake.coordinator.reconcileFood(session(), activeFood());
    await fake.coordinator.cancelFood(session(), FOOD_A);
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({});

    await fake.coordinator.reconcileFood(
      session(),
      activeFood({ status: "EATEN" })
    );
    expect(fake.scheduleMock).toHaveBeenCalledTimes(1);

    await fake.coordinator.reconcileFood(session(), activeFood());
    expect(fake.scheduleMock).toHaveBeenCalledTimes(2);
  });

  it("full reconcile cancels orphaned mappings and handles a global settings change", async () => {
    const fake = setup();
    await fake.coordinator.reconcileFood(session(), activeFood());
    await fake.coordinator.saveSettingsAndReconcile(
      session(),
      { globalEnabled: false, daysBefore: 3, time: "18:30" },
      () => Promise.resolve([activeFood()])
    );
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({});

    await fake.storage.writeRegistry(USER_A, {
      [FOOD_A]: "orphan-notification"
    });
    await fake.coordinator.reconcileAll(session(), () => Promise.resolve([]));
    expect(fake.cancelMock).toHaveBeenCalledWith(
      "orphan-notification"
    );
  });

  it("reports native failures without pretending the food operation failed", async () => {
    const fake = setup();
    fake.scheduleMock.mockRejectedValueOnce(
      new Error("native schedule failed")
    );
    await expect(
      fake.coordinator.reconcileFood(session(), activeFood())
    ).resolves.toEqual({
      status: "synced",
      warnings: ["部分提醒安排失败，可稍后重试提醒同步"]
    });
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({});
  });

  it("serializes per user while allowing another user's work to proceed", async () => {
    const fake = setup();
    const allowUserA = deferred<Food[]>();
    const first = fake.coordinator.reconcileAll(session(USER_A), () =>
      allowUserA.promise
    );
    const second = fake.coordinator.reconcileAll(session(USER_B), () =>
      Promise.resolve([activeFood()])
    );

    await expect(second).resolves.toMatchObject({ status: "synced" });
    allowUserA.resolve([activeFood()]);
    await expect(first).resolves.toMatchObject({ status: "synced" });
  });

  it("discards an old generation and prevents its late schedule from surviving", async () => {
    const fake = setup();
    const scheduled = deferred<string>();
    fake.scheduleMock.mockImplementationOnce(() => scheduled.promise);
    const first = fake.coordinator.reconcileFood(session(), activeFood());
    await vi.waitFor(() => {
      expect(fake.scheduleMock).toHaveBeenCalledOnce();
    });

    const second = fake.coordinator.cancelFood(session(), FOOD_A);
    scheduled.resolve("late-notification");
    await expect(first).resolves.toMatchObject({ status: "stale" });
    await second;
    expect(fake.cancelMock).toHaveBeenCalledWith(
      "late-notification"
    );
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({});
  });

  it("does not let an older settings save overwrite the newest settings", async () => {
    const fake = setup();
    const oldFetch = deferred<Food[]>();
    const oldFetchStarted = deferred<void>();
    const oldSave = fake.coordinator.saveSettingsAndReconcile(
      session(),
      { globalEnabled: true, daysBefore: 3, time: "20:00" },
      () => {
        oldFetchStarted.resolve(undefined);
        return oldFetch.promise;
      }
    );
    await oldFetchStarted.promise;
    const newSave = fake.coordinator.saveSettingsAndReconcile(
      session(),
      { globalEnabled: false, daysBefore: 0, time: "07:15" },
      () => Promise.resolve([activeFood()])
    );
    oldFetch.resolve([activeFood()]);

    await expect(oldSave).resolves.toMatchObject({ status: "stale" });
    await expect(newSave).resolves.toMatchObject({
      status: "saved",
      syncStatus: "synced"
    });
    await expect(fake.storage.readSettings(USER_A)).resolves.toEqual({
      globalEnabled: false,
      daysBefore: 0,
      time: "07:15"
    });
  });

  it("keeps cleanup retryable and never clears another account", async () => {
    const fake = setup();
    await fake.storage.writeLastUserId(USER_A);
    await fake.storage.writeRegistry(USER_A, {
      [FOOD_A]: "notification-a"
    });
    await fake.storage.writeRegistry(USER_B, {
      [FOOD_A]: "notification-b"
    });
    await fake.coordinator.cleanupLastActiveUser();

    expect(fake.cancelMock).toHaveBeenCalledWith("notification-a");
    expect(fake.cancelMock).not.toHaveBeenCalledWith(
      "notification-b"
    );
    await expect(fake.storage.readLastUserId()).resolves.toBeNull();
    await expect(fake.storage.readRegistry(USER_B)).resolves.toEqual({
      [FOOD_A]: "notification-b"
    });
  });

  it("retains the cold-start marker when invalid-session cleanup fails", async () => {
    const fake = setup();
    await fake.storage.writeLastUserId(USER_A);
    await fake.storage.writeRegistry(USER_A, {
      [FOOD_A]: "retry-notification"
    });
    fake.cancelMock.mockRejectedValueOnce(
      new Error("native cancel failed")
    );

    await expect(
      fake.coordinator.cleanupLastActiveUser()
    ).resolves.toMatchObject({
      warnings: ["部分旧提醒取消失败，可稍后重试提醒同步"]
    });
    await expect(fake.storage.readLastUserId()).resolves.toBe(USER_A);
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({
      [FOOD_A]: "retry-notification"
    });

    await fake.coordinator.cleanupLastActiveUser();
    await expect(fake.storage.readLastUserId()).resolves.toBeNull();
  });

  it("retains user A cleanup across user B activation without touching B", async () => {
    const fake = setup();
    await fake.storage.writeLastUserId(USER_A);
    await fake.storage.writeRegistry(USER_A, {
      [FOOD_A]: "notification-a"
    });
    await fake.storage.writeRegistry(USER_B, {
      [FOOD_A]: "notification-b"
    });
    fake.cancelMock
      .mockRejectedValueOnce(new Error("first native cancel failure"))
      .mockRejectedValueOnce(new Error("retry during B activation failed"));

    await fake.coordinator.cleanupUser(USER_A);
    await expect(
      fake.storage.readPendingCleanupUserIds()
    ).resolves.toEqual([USER_A]);

    await expect(
      fake.coordinator.activate(session(USER_B))
    ).resolves.toEqual({
      status: "synced",
      warnings: ["部分旧提醒取消失败，可稍后重试提醒同步"]
    });
    await expect(fake.storage.readLastUserId()).resolves.toBe(USER_B);
    await expect(
      fake.storage.readPendingCleanupUserIds()
    ).resolves.toEqual([USER_A]);
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({
      [FOOD_A]: "notification-a"
    });
    await expect(fake.storage.readRegistry(USER_B)).resolves.toEqual({
      [FOOD_A]: "notification-b"
    });
    expect(fake.cancelMock).not.toHaveBeenCalledWith("notification-b");

    await fake.coordinator.cleanupUser(USER_A);
    await expect(
      fake.storage.readPendingCleanupUserIds()
    ).resolves.toEqual([]);
    await expect(fake.storage.readRegistry(USER_B)).resolves.toEqual({
      [FOOD_A]: "notification-b"
    });
  });

  it("distinguishes settings persistence failure from post-save sync failure", async () => {
    const writeFailure = new Error("async storage unavailable");
    const writeFake = setup();
    writeFake.failNextSettingsWrite(writeFailure);
    const unusedFetch = vi.fn(() => Promise.resolve([activeFood()]));

    await expect(
      writeFake.coordinator.saveSettingsAndReconcile(
        session(),
        { globalEnabled: false, daysBefore: 2, time: "08:30" },
        unusedFetch
      )
    ).resolves.toEqual({
      status: "saveFailed",
      persisted: false,
      warnings: [],
      error: writeFailure
    });
    expect(unusedFetch).not.toHaveBeenCalled();
    await expect(writeFake.storage.readSettings(USER_A)).resolves.toEqual({
      globalEnabled: true,
      daysBefore: 1,
      time: "09:00"
    });

    const syncFailure = new Error("request unauthorized");
    const syncFake = setup();
    await expect(
      syncFake.coordinator.saveSettingsAndReconcile(
        session(),
        { globalEnabled: false, daysBefore: 2, time: "08:30" },
        () => Promise.reject(syncFailure)
      )
    ).resolves.toEqual({
      status: "saved",
      persisted: true,
      syncStatus: "failed",
      warnings: [],
      error: syncFailure
    });
    await expect(syncFake.storage.readSettings(USER_A)).resolves.toEqual({
      globalEnabled: false,
      daysBefore: 2,
      time: "08:30"
    });
    await expect(
      syncFake.coordinator.cleanupUser(USER_A)
    ).resolves.toMatchObject({ status: "synced" });
  });

  it("releases a failed full-reconcile queue before cleanup is enqueued", async () => {
    const fake = setup();
    const unauthorized = new Error("request unauthorized");
    await expect(
      fake.coordinator.reconcileAll(session(), () =>
        Promise.reject(unauthorized)
      )
    ).rejects.toBe(unauthorized);
    await expect(fake.coordinator.cleanupUser(USER_A)).resolves.toMatchObject({
      status: "synced"
    });
  });
});
