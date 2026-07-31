import type { FoodProcess } from "@freshtrack/contracts";

import type { ConfirmationRequest } from "../ui/confirmation-controller";

export type DetailAction =
  | { kind: "delete" }
  | { kind: "restore" }
  | { kind: "process"; status: FoodProcess["status"] };

export function getDetailActionConfirmation(
  action: DetailAction
): ConfirmationRequest {
  if (action.kind === "delete") {
    return {
      title: "删除这项食品？",
      message: "删除后无法恢复。",
      confirmLabel: "确认删除",
      cancelLabel: "取消",
      tone: "danger"
    };
  }
  if (action.kind === "restore") {
    return {
      title: "恢复为活动食品？",
      message: "食品内容与原到期日会保持不变。",
      confirmLabel: "确认恢复",
      cancelLabel: "取消",
      tone: "default"
    };
  }
  if (action.status === "EATEN") {
    return {
      title: "标记为已吃完？",
      message: "食品会进入处理历史。",
      confirmLabel: "确认吃完",
      cancelLabel: "取消",
      tone: "danger"
    };
  }
  return {
    title: "标记为已丢弃？",
    message: "食品会进入处理历史。",
    confirmLabel: "确认丢弃",
    cancelLabel: "取消",
    tone: "danger"
  };
}
