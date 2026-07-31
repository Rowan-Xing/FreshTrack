import { describe, expect, it, vi } from "vitest";

import {
  addLocalCalendarDays,
  classifyExpiry,
  formatLocalDate,
  localDateSchema
} from "./date.js";

describe("local calendar date rules", () => {
  it.each([
    ["2026-07-27", "expired"],
    ["2026-07-28", "expiringSoon"],
    ["2026-07-31", "expiringSoon"],
    ["2026-08-01", "normal"]
  ] as const)("classifies %s without elapsed-millisecond arithmetic", (date, status) => {
    expect(classifyExpiry(date, "2026-07-28")).toBe(status);
  });

  it.each([
    ["2026-01-31", 1, "2026-02-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2028-02-29", 1, "2028-03-01"],
    ["2026-03-07", 1, "2026-03-08"],
    ["2026-11-01", 1, "2026-11-02"]
  ])("adds calendar days across boundaries: %s", (date, amount, expected) => {
    expect(addLocalCalendarDays(date, amount)).toBe(expected);
  });

  it("rejects impossible calendar dates", () => {
    expect(localDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(localDateSchema.safeParse("2028-02-29").success).toBe(true);
  });

  it("formats a date using local calendar fields", () => {
    expect(formatLocalDate(new Date(2026, 6, 28, 23, 59))).toBe("2026-07-28");
  });

  it("advances calendar dates across daylight-saving changes", () => {
    vi.stubEnv("TZ", "America/New_York");
    try {
      expect(addLocalCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
      expect(addLocalCalendarDays("2026-11-01", 1)).toBe("2026-11-02");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
