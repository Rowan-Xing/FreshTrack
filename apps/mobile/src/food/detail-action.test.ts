import { describe, expect, it } from "vitest";

import { getDetailActionConfirmation } from "./detail-action";

describe("food detail action confirmation", () => {
  it.each([
    [
      { kind: "delete" } as const,
      ["删除这项食品？", "删除后无法恢复。", "确认删除", "danger"]
    ],
    [
      { kind: "restore" } as const,
      [
        "恢复为活动食品？",
        "食品内容与原到期日会保持不变。",
        "确认恢复",
        "default"
      ]
    ],
    [
      { kind: "process", status: "EATEN" } as const,
      ["标记为已吃完？", "食品会进入处理历史。", "确认吃完", "danger"]
    ],
    [
      { kind: "process", status: "DISCARDED" } as const,
      ["标记为已丢弃？", "食品会进入处理历史。", "确认丢弃", "danger"]
    ]
  ])("maps %o to stable Chinese copy and tone", (action, expected) => {
    const confirmation = getDetailActionConfirmation(action);

    expect([
      confirmation.title,
      confirmation.message,
      confirmation.confirmLabel,
      confirmation.tone
    ]).toEqual(expected);
    expect(confirmation.cancelLabel).toBe("取消");
  });
});
