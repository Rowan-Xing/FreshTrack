import type { ReminderFood, ReminderPermission } from "./planner";
import { planReminder } from "./planner";
import {
  reminderSettingsSchema,
  type ReminderRegistry,
  type ReminderSettings
} from "./schema";
import type { ReminderStorage } from "./storage";

export type ReminderSession = {
  userId: string;
  isCurrent(): boolean;
};

export type ReminderNotificationInput = {
  userId: string;
  foodId: string;
  foodName: string;
  expiryDate: string;
  trigger: Date;
};

export interface ReminderNotifications {
  initialize(): Promise<void>;
  getPermission(): Promise<ReminderPermission>;
  requestPermission(): Promise<ReminderPermission>;
  schedule(input: ReminderNotificationInput): Promise<string>;
  cancel(identifier: string): Promise<void>;
  openSettings(): Promise<void>;
}

export type ReminderSyncResult = {
  status: "synced" | "stale";
  warnings: string[];
};

export type ReminderSettingsSaveResult =
  | {
      status: "stale";
      persisted: boolean;
      warnings: string[];
    }
  | {
      status: "saveFailed";
      persisted: false;
      warnings: string[];
      error: unknown;
    }
  | {
      status: "saved";
      persisted: true;
      syncStatus: "synced";
      warnings: string[];
    }
  | {
      status: "saved";
      persisted: true;
      syncStatus: "failed";
      warnings: string[];
      error: unknown;
    };

export type ReminderUserState = {
  settings: ReminderSettings;
  permission: ReminderPermission;
};

type ActiveFoodFetcher = (signal: AbortSignal) => Promise<ReminderFood[]>;

const CANCEL_WARNING = "部分旧提醒取消失败，可稍后重试提醒同步";
const SCHEDULE_WARNING = "部分提醒安排失败，可稍后重试提醒同步";

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

export class ReminderCoordinator {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, number>();
  private readonly requests = new Map<string, AbortController>();
  private lifecycleQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly storage: ReminderStorage,
    private readonly notifications: ReminderNotifications,
    private readonly now: () => Date = () => new Date()
  ) {}

  private nextGeneration(userId: string): number {
    const generation = (this.generations.get(userId) ?? 0) + 1;
    this.generations.set(userId, generation);
    this.requests.get(userId)?.abort();
    this.requests.delete(userId);
    return generation;
  }

  private isFresh(
    session: ReminderSession,
    generation: number
  ): boolean {
    return (
      session.isCurrent() &&
      this.generations.get(session.userId) === generation
    );
  }

  private enqueue<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    this.queues.set(userId, settled);
    void settled.finally(() => {
      if (this.queues.get(userId) === settled) {
        this.queues.delete(userId);
      }
    });
    return result;
  }

  private enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleQueue.then(operation, operation);
    this.lifecycleQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  public async initialize(): Promise<void> {
    await this.notifications.initialize();
  }

  public loadUserState(userId: string): Promise<ReminderUserState> {
    return this.enqueue(userId, async () => ({
      settings: await this.storage.readSettings(userId),
      permission: await this.notifications.getPermission()
    }));
  }

  public activate(session: ReminderSession): Promise<ReminderSyncResult> {
    return this.enqueueLifecycle(async () => {
      const cleanupResult = await this.cleanupPendingUsersDirect();
      const generation = this.nextGeneration(session.userId);
      const activationResult = await this.enqueue<ReminderSyncResult>(
        session.userId,
        async () => {
          if (!this.isFresh(session, generation)) {
            return { status: "stale", warnings: [] };
          }
          await this.storage.writeLastUserId(session.userId);
          return { status: "synced", warnings: [] };
        }
      );
      return {
        status: activationResult.status,
        warnings: uniqueWarnings([
          ...cleanupResult.warnings,
          ...activationResult.warnings
        ])
      };
    });
  }

  private async cancelIdentifier(
    identifier: string,
    warnings: string[]
  ): Promise<boolean> {
    try {
      await this.notifications.cancel(identifier);
      return true;
    } catch {
      warnings.push(CANCEL_WARNING);
      return false;
    }
  }

  private async reconcileOne(
    session: ReminderSession,
    generation: number,
    food: ReminderFood,
    settings: ReminderSettings,
    permission: ReminderPermission,
    registry: ReminderRegistry,
    warnings: string[]
  ): Promise<void> {
    if (!this.isFresh(session, generation)) {
      return;
    }
    const existing = registry[food.id];
    const plan = planReminder(food, settings, permission, this.now());
    if (plan.action === "cancel") {
      if (
        existing !== undefined &&
        (await this.cancelIdentifier(existing, warnings))
      ) {
        delete registry[food.id];
        await this.storage.writeRegistry(session.userId, registry);
      }
      return;
    }

    if (existing !== undefined) {
      const cancelled = await this.cancelIdentifier(existing, warnings);
      if (!cancelled) {
        return;
      }
      delete registry[food.id];
      await this.storage.writeRegistry(session.userId, registry);
    }
    if (!this.isFresh(session, generation)) {
      return;
    }

    try {
      const identifier = await this.notifications.schedule({
        userId: session.userId,
        foodId: food.id,
        foodName: food.name,
        expiryDate: food.expiryDate,
        trigger: plan.trigger
      });
      if (!this.isFresh(session, generation)) {
        const cancelled = await this.cancelIdentifier(identifier, warnings);
        if (!cancelled) {
          registry[food.id] = identifier;
          await this.storage.writeRegistry(session.userId, registry);
        }
        return;
      }
      registry[food.id] = identifier;
      try {
        await this.storage.writeRegistry(session.userId, registry);
      } catch (error) {
        const cancelled = await this.cancelIdentifier(identifier, warnings);
        if (cancelled) {
          delete registry[food.id];
        } else {
          warnings.push(
            "新提醒标识保存失败且无法取消，请稍后重新同步全部提醒"
          );
        }
        throw error;
      }
    } catch {
      warnings.push(SCHEDULE_WARNING);
    }
  }

  public reconcileFood(
    session: ReminderSession,
    food: ReminderFood
  ): Promise<ReminderSyncResult> {
    const generation = this.nextGeneration(session.userId);
    return this.enqueue(session.userId, async () => {
      if (!this.isFresh(session, generation)) {
        return { status: "stale", warnings: [] };
      }
      const [settings, permission, registry] = await Promise.all([
        this.storage.readSettings(session.userId),
        this.notifications.getPermission(),
        this.storage.readRegistry(session.userId)
      ]);
      if (!this.isFresh(session, generation)) {
        return { status: "stale", warnings: [] };
      }
      const warnings: string[] = [];
      await this.reconcileOne(
        session,
        generation,
        food,
        settings,
        permission,
        registry,
        warnings
      );
      if (!this.isFresh(session, generation)) {
        return { status: "stale", warnings: uniqueWarnings(warnings) };
      }
      await this.storage.writeRegistry(session.userId, registry);
      return { status: "synced", warnings: uniqueWarnings(warnings) };
    });
  }

  public cancelFood(
    session: ReminderSession,
    foodId: string
  ): Promise<ReminderSyncResult> {
    const generation = this.nextGeneration(session.userId);
    return this.enqueue(session.userId, async () => {
      if (!this.isFresh(session, generation)) {
        return { status: "stale", warnings: [] };
      }
      const registry = await this.storage.readRegistry(session.userId);
      const identifier = registry[foodId];
      if (identifier === undefined) {
        return { status: "synced", warnings: [] };
      }
      const warnings: string[] = [];
      if (await this.cancelIdentifier(identifier, warnings)) {
        delete registry[foodId];
        await this.storage.writeRegistry(session.userId, registry);
      }
      return { status: "synced", warnings: uniqueWarnings(warnings) };
    });
  }

  private reconcileAllWithGeneration(
    session: ReminderSession,
    generation: number,
    fetchFoods: ActiveFoodFetcher
  ): Promise<ReminderSyncResult> {
    return this.enqueue(session.userId, async () => {
      if (!this.isFresh(session, generation)) {
        return { status: "stale", warnings: [] };
      }
      const controller = new AbortController();
      this.requests.set(session.userId, controller);
      let foods: ReminderFood[];
      try {
        foods = await fetchFoods(controller.signal);
      } catch (error) {
        if (!this.isFresh(session, generation)) {
          return { status: "stale", warnings: [] };
        }
        throw error;
      } finally {
        if (this.requests.get(session.userId) === controller) {
          this.requests.delete(session.userId);
        }
      }
      if (!this.isFresh(session, generation)) {
        return { status: "stale", warnings: [] };
      }
      const [settings, permission, registry] = await Promise.all([
        this.storage.readSettings(session.userId),
        this.notifications.getPermission(),
        this.storage.readRegistry(session.userId)
      ]);
      const warnings: string[] = [];
      const activeIds = new Set(foods.map((food) => food.id));
      for (const [foodId, identifier] of Object.entries(registry)) {
        if (
          !activeIds.has(foodId) &&
          (await this.cancelIdentifier(identifier, warnings))
        ) {
          delete registry[foodId];
        }
      }
      for (const food of foods) {
        await this.reconcileOne(
          session,
          generation,
          food,
          settings,
          permission,
          registry,
          warnings
        );
        if (!this.isFresh(session, generation)) {
          return { status: "stale", warnings: uniqueWarnings(warnings) };
        }
      }
      await this.storage.writeRegistry(session.userId, registry);
      return { status: "synced", warnings: uniqueWarnings(warnings) };
    });
  }

  public reconcileAll(
    session: ReminderSession,
    fetchFoods: ActiveFoodFetcher
  ): Promise<ReminderSyncResult> {
    const generation = this.nextGeneration(session.userId);
    return this.reconcileAllWithGeneration(session, generation, fetchFoods);
  }

  public saveSettingsAndReconcile(
    session: ReminderSession,
    settings: ReminderSettings,
    fetchFoods: ActiveFoodFetcher
  ): Promise<ReminderSettingsSaveResult> {
    const valid = reminderSettingsSchema.parse(settings);
    const generation = this.nextGeneration(session.userId);
    return this.enqueue(session.userId, async () => {
      if (!this.isFresh(session, generation)) {
        return { status: "stale", persisted: false, warnings: [] };
      }
      try {
        await this.storage.writeSettings(session.userId, valid);
      } catch (error) {
        if (!this.isFresh(session, generation)) {
          return { status: "stale", persisted: false, warnings: [] };
        }
        return {
          status: "saveFailed",
          persisted: false,
          warnings: [],
          error
        };
      }
      if (!this.isFresh(session, generation)) {
        return { status: "stale", persisted: true, warnings: [] };
      }

      const warnings: string[] = [];
      try {
        const controller = new AbortController();
        this.requests.set(session.userId, controller);
        let foods: ReminderFood[];
        try {
          foods = await fetchFoods(controller.signal);
        } finally {
          if (this.requests.get(session.userId) === controller) {
            this.requests.delete(session.userId);
          }
        }
        if (!this.isFresh(session, generation)) {
          return { status: "stale", persisted: true, warnings: [] };
        }
        const [permission, registry] = await Promise.all([
          this.notifications.getPermission(),
          this.storage.readRegistry(session.userId)
        ]);
        const activeIds = new Set(foods.map((food) => food.id));
        for (const [foodId, identifier] of Object.entries(registry)) {
          if (
            !activeIds.has(foodId) &&
            (await this.cancelIdentifier(identifier, warnings))
          ) {
            delete registry[foodId];
          }
        }
        for (const food of foods) {
          await this.reconcileOne(
            session,
            generation,
            food,
            valid,
            permission,
            registry,
            warnings
          );
          if (!this.isFresh(session, generation)) {
            return {
              status: "stale",
              persisted: true,
              warnings: uniqueWarnings(warnings)
            };
          }
        }
        await this.storage.writeRegistry(session.userId, registry);
        return {
          status: "saved",
          persisted: true,
          syncStatus: "synced",
          warnings: uniqueWarnings(warnings)
        };
      } catch (error) {
        if (!this.isFresh(session, generation)) {
          return { status: "stale", persisted: true, warnings: [] };
        }
        return {
          status: "saved",
          persisted: true,
          syncStatus: "failed",
          warnings: uniqueWarnings(warnings),
          error
        };
      }
    });
  }

  public requestPermission(): Promise<ReminderPermission> {
    return this.notifications.requestPermission();
  }

  public openSettings(): Promise<void> {
    return this.notifications.openSettings();
  }

  public cleanupUser(userId: string): Promise<ReminderSyncResult> {
    this.nextGeneration(userId);
    return this.enqueue(userId, async () => {
      await this.storage.addPendingCleanupUserId(userId);
      const registry = await this.storage.readRegistry(userId);
      const warnings: string[] = [];
      for (const [foodId, identifier] of Object.entries(registry)) {
        if (await this.cancelIdentifier(identifier, warnings)) {
          delete registry[foodId];
        }
      }
      await this.storage.writeRegistry(userId, registry);
      if (warnings.length === 0) {
        await this.storage.clearRegistry(userId);
        await this.storage.removePendingCleanupUserId(userId);
        await this.storage.clearLastUserIdIf(userId);
      }
      return { status: "synced", warnings: uniqueWarnings(warnings) };
    });
  }

  private async cleanupPendingUsersDirect(): Promise<ReminderSyncResult> {
    const userIds = await this.storage.readPendingCleanupUserIds();
    const warnings: string[] = [];
    for (const userId of userIds) {
      const result = await this.cleanupUser(userId);
      warnings.push(...result.warnings);
    }
    return { status: "synced", warnings: uniqueWarnings(warnings) };
  }

  public cleanupLastActiveUser(): Promise<ReminderSyncResult> {
    return this.enqueueLifecycle(async () => {
      const pendingUserIds =
        await this.storage.readPendingCleanupUserIds();
      const pendingResult = await this.cleanupPendingUsersDirect();
      const lastUserId = await this.storage.readLastUserId();
      if (!lastUserId || pendingUserIds.includes(lastUserId)) {
        return pendingResult;
      }
      const lastUserResult = await this.cleanupUser(lastUserId);
      return {
        status: "synced",
        warnings: uniqueWarnings([
          ...pendingResult.warnings,
          ...lastUserResult.warnings
        ])
      };
    });
  }
}
