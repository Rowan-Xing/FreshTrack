import type { DetailAction } from "./detail-action";

export const activeFoodQuickActions = [
  { id: "edit", label: "编辑" },
  { id: "eat", label: "标记已吃完" },
  { id: "discard", label: "标记已丢弃" },
  { id: "delete", label: "删除" }
] as const;

export type ActiveFoodQuickAction =
  (typeof activeFoodQuickActions)[number]["id"];

export function quickActionToDetailAction(
  action: ActiveFoodQuickAction
): DetailAction | null {
  switch (action) {
    case "edit":
      return null;
    case "eat":
      return { kind: "process", status: "EATEN" };
    case "discard":
      return { kind: "process", status: "DISCARDED" };
    case "delete":
      return { kind: "delete" };
  }
}
