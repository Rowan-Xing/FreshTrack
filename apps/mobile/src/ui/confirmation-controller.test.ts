import { describe, expect, it, vi } from "vitest";

import {
  ConfirmationController,
  type ConfirmationRequest
} from "./confirmation-controller";

const request: ConfirmationRequest = {
  title: "删除这项食品？",
  message: "删除后无法恢复。",
  confirmLabel: "确认删除",
  cancelLabel: "取消",
  tone: "danger"
};

describe("confirmation controller", () => {
  it("publishes a request and resolves it exactly once when confirmed", async () => {
    const controller = new ConfirmationController();
    const listener = vi.fn();
    controller.subscribe(listener);

    const result = controller.confirm(request);
    expect(controller.getSnapshot()).toEqual(request);
    expect(listener).toHaveBeenCalledOnce();

    controller.settle(true);
    controller.settle(false);

    await expect(result).resolves.toBe(true);
    expect(controller.getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("resolves cancellation from the explicit cancel path", async () => {
    const controller = new ConfirmationController();
    const result = controller.confirm(request);

    controller.cancel();

    await expect(result).resolves.toBe(false);
    expect(controller.getSnapshot()).toBeNull();
  });

  it("cancels a replaced request while keeping the latest request active", async () => {
    const controller = new ConfirmationController();
    const first = controller.confirm(request);
    const replacement: ConfirmationRequest = {
      ...request,
      title: "恢复为活动食品？",
      confirmLabel: "确认恢复",
      tone: "default"
    };

    const second = controller.confirm(replacement);

    await expect(first).resolves.toBe(false);
    expect(controller.getSnapshot()).toEqual(replacement);

    controller.settle(true);
    await expect(second).resolves.toBe(true);
  });

  it("cancels an outstanding request when its owner is disposed", async () => {
    const controller = new ConfirmationController();
    const result = controller.confirm(request);

    controller.dispose();

    await expect(result).resolves.toBe(false);
    expect(controller.getSnapshot()).toBeNull();
  });
});
