import {
  DEFAULT_REMINDER_SETTINGS,
  LAST_REMINDER_USER_KEY,
  PENDING_REMINDER_CLEANUP_USERS_KEY,
  pendingReminderCleanupUserIdsSchema,
  reminderRegistryKey,
  reminderRegistrySchema,
  reminderSettingsKey,
  reminderSettingsSchema,
  reminderUserIdSchema,
  type ReminderRegistry,
  type ReminderSettings,
  type PendingReminderCleanupUserIds
} from "./schema";

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ReminderStorage {
  readSettings(userId: string): Promise<ReminderSettings>;
  writeSettings(userId: string, settings: ReminderSettings): Promise<void>;
  readRegistry(userId: string): Promise<ReminderRegistry>;
  writeRegistry(userId: string, registry: ReminderRegistry): Promise<void>;
  clearRegistry(userId: string): Promise<void>;
  readLastUserId(): Promise<string | null>;
  writeLastUserId(userId: string): Promise<void>;
  clearLastUserIdIf(userId: string): Promise<void>;
  readPendingCleanupUserIds(): Promise<PendingReminderCleanupUserIds>;
  addPendingCleanupUserId(userId: string): Promise<void>;
  removePendingCleanupUserId(userId: string): Promise<void>;
}

function parseStoredJson(raw: string): unknown {
  return JSON.parse(raw);
}

export function createReminderStorage(
  driver: KeyValueStorage
): ReminderStorage {
  let pendingCleanupQueue: Promise<void> = Promise.resolve();

  function serializePendingCleanup<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const result = pendingCleanupQueue.then(operation, operation);
    pendingCleanupQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async function readValidLastUserIdDirect(): Promise<string | null> {
    const parsed = reminderUserIdSchema.safeParse(
      await driver.getItem(LAST_REMINDER_USER_KEY)
    );
    return parsed.success ? parsed.data : null;
  }

  async function readPendingCleanupUserIdsDirect(): Promise<
    PendingReminderCleanupUserIds
  > {
    const raw = await driver.getItem(PENDING_REMINDER_CLEANUP_USERS_KEY);
    if (!raw) {
      const legacyLastUserId = await readValidLastUserIdDirect();
      const migrated: PendingReminderCleanupUserIds =
        legacyLastUserId ? [legacyLastUserId] : [];
      await driver.setItem(
        PENDING_REMINDER_CLEANUP_USERS_KEY,
        JSON.stringify(migrated)
      );
      return migrated;
    }
    try {
      const parsed = pendingReminderCleanupUserIdsSchema.safeParse(
        parseStoredJson(raw)
      );
      if (parsed.success) {
        return parsed.data;
      }
      const unknownValue = parseStoredJson(raw);
      const legacyLastUserId = await readValidLastUserIdDirect();
      const repaired = Array.isArray(unknownValue)
        ? [
            ...new Set(
              [
                ...unknownValue.flatMap((value) => {
                  const userId = reminderUserIdSchema.safeParse(value);
                  return userId.success ? [userId.data] : [];
                }),
                ...(legacyLastUserId ? [legacyLastUserId] : [])
              ]
            )
          ]
        : legacyLastUserId
          ? [legacyLastUserId]
          : [];
      const validated =
        pendingReminderCleanupUserIdsSchema.parse(repaired);
      await driver.setItem(
        PENDING_REMINDER_CLEANUP_USERS_KEY,
        JSON.stringify(validated)
      );
      return validated;
    } catch {
      const legacyLastUserId = await readValidLastUserIdDirect();
      const repaired: PendingReminderCleanupUserIds =
        legacyLastUserId ? [legacyLastUserId] : [];
      await driver.setItem(
        PENDING_REMINDER_CLEANUP_USERS_KEY,
        JSON.stringify(repaired)
      );
      return repaired;
    }
  }

  return {
    async readSettings(userId) {
      const key = reminderSettingsKey(userId);
      const raw = await driver.getItem(key);
      if (raw) {
        try {
          const parsed = reminderSettingsSchema.safeParse(parseStoredJson(raw));
          if (parsed.success) {
            return parsed.data;
          }
        } catch {
          // Invalid JSON is repaired below with the safe default.
        }
      }
      await driver.setItem(key, JSON.stringify(DEFAULT_REMINDER_SETTINGS));
      return DEFAULT_REMINDER_SETTINGS;
    },

    async writeSettings(userId, settings) {
      const valid = reminderSettingsSchema.parse(settings);
      await driver.setItem(reminderSettingsKey(userId), JSON.stringify(valid));
    },

    async readRegistry(userId) {
      const key = reminderRegistryKey(userId);
      const raw = await driver.getItem(key);
      if (raw) {
        try {
          const parsed = reminderRegistrySchema.safeParse(parseStoredJson(raw));
          if (parsed.success) {
            return parsed.data;
          }
        } catch {
          // Invalid JSON is repaired below with an empty registry.
        }
      }
      const empty: ReminderRegistry = {};
      await driver.setItem(key, JSON.stringify(empty));
      return empty;
    },

    async writeRegistry(userId, registry) {
      const valid = reminderRegistrySchema.parse(registry);
      await driver.setItem(reminderRegistryKey(userId), JSON.stringify(valid));
    },

    async clearRegistry(userId) {
      await driver.removeItem(reminderRegistryKey(userId));
    },

    async readLastUserId() {
      const raw = await driver.getItem(LAST_REMINDER_USER_KEY);
      if (!raw) {
        return null;
      }
      const parsed = reminderUserIdSchema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
      await driver.removeItem(LAST_REMINDER_USER_KEY);
      return null;
    },

    async writeLastUserId(userId) {
      const valid = reminderUserIdSchema.parse(userId);
      await driver.setItem(LAST_REMINDER_USER_KEY, valid);
    },

    async clearLastUserIdIf(userId) {
      const stored = await driver.getItem(LAST_REMINDER_USER_KEY);
      if (stored === userId) {
        await driver.removeItem(LAST_REMINDER_USER_KEY);
      }
    },

    readPendingCleanupUserIds() {
      return serializePendingCleanup(readPendingCleanupUserIdsDirect);
    },

    addPendingCleanupUserId(userId) {
      const valid = reminderUserIdSchema.parse(userId);
      return serializePendingCleanup(async () => {
        const userIds = await readPendingCleanupUserIdsDirect();
        if (userIds.includes(valid)) {
          return;
        }
        const next = pendingReminderCleanupUserIdsSchema.parse([
          ...userIds,
          valid
        ]);
        await driver.setItem(
          PENDING_REMINDER_CLEANUP_USERS_KEY,
          JSON.stringify(next)
        );
      });
    },

    removePendingCleanupUserId(userId) {
      const valid = reminderUserIdSchema.parse(userId);
      return serializePendingCleanup(async () => {
        const userIds = await readPendingCleanupUserIdsDirect();
        if (!userIds.includes(valid)) {
          return;
        }
        await driver.setItem(
          PENDING_REMINDER_CLEANUP_USERS_KEY,
          JSON.stringify(userIds.filter((candidate) => candidate !== valid))
        );
      });
    }
  };
}
