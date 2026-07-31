import type { Food } from "@freshtrack/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  planReminder,
  reminderEffectForFoodMutation,
  reminderTriggerDate
} from "./planner";
import type { ReminderSettings } from "./schema";

const settings: ReminderSettings = {
  globalEnabled: true,
  daysBefore: 1,
  time: "09:00"
};

const food: Food = {
  id: "8fb50979-728c-42f5-b7e9-8377c21bfd9d",
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
  updatedAt: "2026-07-28T12:00:00.000Z"
};

describe("reminder planner", () => {
  it.each([
    ["2026-03-01", 1, "2026-02-28T09:00"],
    ["2027-01-01", 1, "2026-12-31T09:00"],
    ["2028-03-01", 1, "2028-02-29T09:00"],
    ["2028-02-29", 1, "2028-02-28T09:00"]
  ])("subtracts calendar days across boundaries", (expiry, days, expected) => {
    const trigger = reminderTriggerDate(expiry, {
      ...settings,
      daysBefore: days
    });
    const formatted = [
      trigger.getFullYear(),
      String(trigger.getMonth() + 1).padStart(2, "0"),
      String(trigger.getDate()).padStart(2, "0")
    ].join("-");
    expect(
      `${formatted}T${String(trigger.getHours()).padStart(2, "0")}:${String(
        trigger.getMinutes()
      ).padStart(2, "0")}`
    ).toBe(expected);
  });

  it("constructs the configured wall-clock time across DST boundaries", () => {
    vi.stubEnv("TZ", "America/New_York");
    try {
      const spring = reminderTriggerDate("2026-03-09", settings);
      const autumn = reminderTriggerDate("2026-11-02", settings);
      expect([spring.getMonth(), spring.getDate(), spring.getHours()]).toEqual([
        2, 8, 9
      ]);
      expect([autumn.getMonth(), autumn.getDate(), autumn.getHours()]).toEqual([
        10, 1, 9
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("schedules only when every condition is true and trigger is strictly future", () => {
    expect(
      planReminder(food, settings, "allowed", new Date(2026, 6, 31, 8, 59))
    ).toMatchObject({ action: "schedule" });
    expect(
      planReminder(food, settings, "allowed", new Date(2026, 6, 31, 9, 0))
    ).toEqual({ action: "cancel", reason: "past" });
    expect(planReminder(food, settings, "denied", new Date(0))).toEqual({
      action: "cancel",
      reason: "permission"
    });
    expect(
      planReminder(
        food,
        { ...settings, globalEnabled: false },
        "allowed",
        new Date(0)
      )
    ).toEqual({ action: "cancel", reason: "global" });
    expect(
      planReminder(
        { ...food, reminderEnabled: false },
        settings,
        "allowed",
        new Date(0)
      )
    ).toEqual({ action: "cancel", reason: "food" });
    expect(
      planReminder(
        { ...food, status: "EATEN" },
        settings,
        "allowed",
        new Date(0)
      )
    ).toEqual({ action: "cancel", reason: "status" });
  });

  it("maps food mutations to reconcile or cancel semantics", () => {
    expect(reminderEffectForFoodMutation("create")).toBe("reconcile");
    expect(reminderEffectForFoodMutation("update")).toBe("reconcile");
    expect(reminderEffectForFoodMutation("restore")).toBe("reconcile");
    expect(reminderEffectForFoodMutation("delete")).toBe("cancel");
    expect(reminderEffectForFoodMutation("process")).toBe("cancel");
  });
});
