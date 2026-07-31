import { z } from "zod";

export const reminderTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "提醒时间必须为 HH:mm");

export const reminderSettingsSchema = z.strictObject({
  globalEnabled: z.boolean(),
  daysBefore: z.number().int().min(0).max(3),
  time: reminderTimeSchema
});

export const reminderRegistrySchema = z.record(
  z.string().uuid(),
  z.string().min(1)
);

export const reminderUserIdSchema = z.string().uuid();
export const pendingReminderCleanupUserIdsSchema = z
  .array(reminderUserIdSchema)
  .refine(
    (userIds) => new Set(userIds).size === userIds.length,
    "待清理提醒账号不能重复"
  );

export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;
export type ReminderRegistry = z.infer<typeof reminderRegistrySchema>;
export type PendingReminderCleanupUserIds = z.infer<
  typeof pendingReminderCleanupUserIdsSchema
>;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  globalEnabled: true,
  daysBefore: 1,
  time: "09:00"
};

export function reminderSettingsKey(userId: string): string {
  return `freshtrack.reminders.settings.v1.${userId}`;
}

export function reminderRegistryKey(userId: string): string {
  return `freshtrack.reminders.registry.v1.${userId}`;
}

export const LAST_REMINDER_USER_KEY =
  "freshtrack.reminders.last-active-user.v1";
export const PENDING_REMINDER_CLEANUP_USERS_KEY =
  "freshtrack.reminders.pending-cleanup-users.v1";
