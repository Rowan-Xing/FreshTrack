import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_SETTINGS,
  LAST_REMINDER_USER_KEY,
  PENDING_REMINDER_CLEANUP_USERS_KEY,
  reminderRegistryKey,
  reminderSettingsKey
} from "./schema";
import {
  createReminderStorage,
  type KeyValueStorage
} from "./storage";

const USER_A = "9d07dfb4-8070-4b10-a19c-d9fb122a27cb";
const USER_B = "c13a4569-48f7-411c-902b-eccf713f50bb";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const driver: KeyValueStorage = {
    getItem: (key) => Promise.resolve(values.get(key) ?? null),
    setItem: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      values.delete(key);
      return Promise.resolve();
    }
  };
  return { storage: createReminderStorage(driver), values };
}

describe("reminder storage", () => {
  it("uses one strict settings shape and safe defaults", async () => {
    const fake = memoryStorage();
    await expect(fake.storage.readSettings(USER_A)).resolves.toEqual(
      DEFAULT_REMINDER_SETTINGS
    );
    expect(JSON.parse(fake.values.get(reminderSettingsKey(USER_A)) ?? "")).toEqual(
      DEFAULT_REMINDER_SETTINGS
    );
  });

  it.each([
    "{broken",
    JSON.stringify({ globalEnabled: true, daysBefore: 7, time: "9:00" }),
    JSON.stringify({
      globalEnabled: true,
      daysBefore: 1,
      time: "09:00",
      token: "must-not-survive"
    })
  ])("repairs corrupt settings: %s", async (raw) => {
    const fake = memoryStorage({ [reminderSettingsKey(USER_A)]: raw });
    await expect(fake.storage.readSettings(USER_A)).resolves.toEqual(
      DEFAULT_REMINDER_SETTINGS
    );
    expect(fake.values.get(reminderSettingsKey(USER_A))).toBe(
      JSON.stringify(DEFAULT_REMINDER_SETTINGS)
    );
  });

  it("isolates settings and identifier registries by user id", async () => {
    const fake = memoryStorage();
    await fake.storage.writeSettings(USER_A, {
      globalEnabled: false,
      daysBefore: 3,
      time: "18:30"
    });
    await fake.storage.writeRegistry(USER_A, {
      "8fb50979-728c-42f5-b7e9-8377c21bfd9d": "notification-a"
    });

    await expect(fake.storage.readSettings(USER_B)).resolves.toEqual(
      DEFAULT_REMINDER_SETTINGS
    );
    await expect(fake.storage.readRegistry(USER_B)).resolves.toEqual({});
    expect(reminderSettingsKey(USER_A)).not.toBe(reminderSettingsKey(USER_B));
    expect(reminderRegistryKey(USER_A)).not.toBe(reminderRegistryKey(USER_B));
  });

  it("repairs a corrupt identifier registry without touching other keys", async () => {
    const fake = memoryStorage({
      [reminderRegistryKey(USER_A)]: JSON.stringify({
        "not-a-food-id": "notification"
      }),
      [reminderRegistryKey(USER_B)]: JSON.stringify({
        "8fb50979-728c-42f5-b7e9-8377c21bfd9d": "notification-b"
      })
    });
    await expect(fake.storage.readRegistry(USER_A)).resolves.toEqual({});
    await expect(fake.storage.readRegistry(USER_B)).resolves.toEqual({
      "8fb50979-728c-42f5-b7e9-8377c21bfd9d": "notification-b"
    });
  });

  it("stores only an opaque last reminder user id and consumes it conditionally", async () => {
    const fake = memoryStorage();
    await fake.storage.writeLastUserId(USER_A);
    expect(fake.values.get(LAST_REMINDER_USER_KEY)).toBe(USER_A);
    await fake.storage.clearLastUserIdIf(USER_B);
    await expect(fake.storage.readLastUserId()).resolves.toBe(USER_A);
    await fake.storage.clearLastUserIdIf(USER_A);
    await expect(fake.storage.readLastUserId()).resolves.toBeNull();
  });

  it("persists a deduplicated cleanup queue without emails or tokens", async () => {
    const fake = memoryStorage();
    await Promise.all([
      fake.storage.addPendingCleanupUserId(USER_A),
      fake.storage.addPendingCleanupUserId(USER_B),
      fake.storage.addPendingCleanupUserId(USER_A)
    ]);

    await expect(
      fake.storage.readPendingCleanupUserIds()
    ).resolves.toEqual([USER_A, USER_B]);
    expect(
      fake.values.get(PENDING_REMINDER_CLEANUP_USERS_KEY)
    ).toBe(JSON.stringify([USER_A, USER_B]));
    await fake.storage.removePendingCleanupUserId(USER_A);
    await expect(
      fake.storage.readPendingCleanupUserIds()
    ).resolves.toEqual([USER_B]);
  });

  it("migrates a valid legacy last-user marker without consuming its purpose", async () => {
    const fake = memoryStorage({
      [LAST_REMINDER_USER_KEY]: USER_A
    });

    await expect(
      fake.storage.readPendingCleanupUserIds()
    ).resolves.toEqual([USER_A]);
    await expect(fake.storage.readLastUserId()).resolves.toBe(USER_A);
    expect(
      fake.values.get(PENDING_REMINDER_CLEANUP_USERS_KEY)
    ).toBe(JSON.stringify([USER_A]));
  });

  it("repairs a legacy or corrupt cleanup queue by retaining only unique user ids", async () => {
    const fake = memoryStorage({
      [PENDING_REMINDER_CLEANUP_USERS_KEY]: JSON.stringify([
        USER_A,
        "person@example.com",
        USER_A,
        "a".repeat(43),
        USER_B
      ])
    });

    await expect(
      fake.storage.readPendingCleanupUserIds()
    ).resolves.toEqual([USER_A, USER_B]);
    expect(
      fake.values.get(PENDING_REMINDER_CLEANUP_USERS_KEY)
    ).toBe(JSON.stringify([USER_A, USER_B]));
  });
});
