import { describe, expect, it } from "vitest";

import {
  formatChineseLocalDateTime,
  INVALID_LOCAL_DATE_TIME_LABEL
} from "./date-time";

describe("Chinese local date-time formatting", () => {
  it("formats an API instant with stable Chinese date and 24-hour time", () => {
    const instant = new Date(2026, 6, 29, 0, 26, 29, 450).toISOString();

    expect(formatChineseLocalDateTime(instant)).toBe(
      "2026年7月29日 00:26:29"
    );
  });

  it("treats equivalent offsets as the same instant in the device timezone", () => {
    expect(
      formatChineseLocalDateTime("2026-07-29T00:26:29+08:00")
    ).toBe(formatChineseLocalDateTime("2026-07-28T16:26:29Z"));
  });

  it.each(["", "not-a-date"])(
    "returns a user-friendly fallback for invalid input %j",
    (value) => {
      expect(formatChineseLocalDateTime(value)).toBe(
        INVALID_LOCAL_DATE_TIME_LABEL
      );
    }
  );
});
