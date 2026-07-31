import { describe, expect, it } from "vitest";

import {
  activeFoodQuickActions,
  quickActionToDetailAction
} from "./quick-action";

describe("active food quick actions", () => {
  it("exposes only the required active-card choices in stable order", () => {
    expect(activeFoodQuickActions).toEqual([
      { id: "edit", label: "编辑" },
      { id: "eat", label: "标记已吃完" },
      { id: "discard", label: "标记已丢弃" },
      { id: "delete", label: "删除" }
    ]);
  });

  it("maps status and destructive actions to the existing detail actions", () => {
    expect(quickActionToDetailAction("edit")).toBeNull();
    expect(quickActionToDetailAction("eat")).toEqual({
      kind: "process",
      status: "EATEN"
    });
    expect(quickActionToDetailAction("discard")).toEqual({
      kind: "process",
      status: "DISCARDED"
    });
    expect(quickActionToDetailAction("delete")).toEqual({
      kind: "delete"
    });
  });
});
