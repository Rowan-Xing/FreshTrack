import {
  addLocalCalendarDays,
  localDateSchema,
  type Food
} from "@freshtrack/contracts";

import {
  reminderSettingsSchema,
  reminderTimeSchema,
  type ReminderSettings
} from "./schema";

export type ReminderPermission = "undetermined" | "allowed" | "denied";

export type ReminderFood = Pick<
  Food,
  "id" | "name" | "expiryDate" | "reminderEnabled" | "status"
>;

export type ReminderPlan =
  | { action: "cancel"; reason: "permission" | "global" | "food" | "status" | "past" }
  | { action: "schedule"; trigger: Date };

export function reminderTriggerDate(
  expiryDate: string,
  settings: ReminderSettings
): Date {
  const validExpiry = localDateSchema.parse(expiryDate);
  const validSettings = reminderSettingsSchema.parse(settings);
  const validTime = reminderTimeSchema.parse(validSettings.time);
  const date = addLocalCalendarDays(validExpiry, -validSettings.daysBefore);
  const [yearText, monthText, dayText] = date.split("-");
  const [hourText, minuteText] = validTime.split(":");
  return new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    0,
    0
  );
}

export function planReminder(
  food: ReminderFood,
  settings: ReminderSettings,
  permission: ReminderPermission,
  now: Date
): ReminderPlan {
  if (permission !== "allowed") {
    return { action: "cancel", reason: "permission" };
  }
  if (!settings.globalEnabled) {
    return { action: "cancel", reason: "global" };
  }
  if (!food.reminderEnabled) {
    return { action: "cancel", reason: "food" };
  }
  if (food.status !== "ACTIVE") {
    return { action: "cancel", reason: "status" };
  }
  const trigger = reminderTriggerDate(food.expiryDate, settings);
  if (trigger.getTime() <= now.getTime()) {
    return { action: "cancel", reason: "past" };
  }
  return { action: "schedule", trigger };
}

export type FoodMutationReminderEffect = "reconcile" | "cancel";

export function reminderEffectForFoodMutation(
  kind: "create" | "update" | "delete" | "process" | "restore"
): FoodMutationReminderEffect {
  return kind === "create" || kind === "update" || kind === "restore"
    ? "reconcile"
    : "cancel";
}
