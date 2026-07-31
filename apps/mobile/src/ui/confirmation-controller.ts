export type ConfirmationTone = "default" | "danger";

export type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmationTone;
};

type ConfirmationListener = () => void;
type ConfirmationResolver = (accepted: boolean) => void;

export class ConfirmationController {
  private current: ConfirmationRequest | null = null;
  private resolver: ConfirmationResolver | null = null;
  private readonly listeners = new Set<ConfirmationListener>();

  readonly getSnapshot = (): ConfirmationRequest | null => this.current;

  readonly subscribe = (listener: ConfirmationListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly confirm = (
    request: ConfirmationRequest
  ): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const previousResolver = this.resolver;
      this.current = request;
      this.resolver = resolve;
      this.emit();
      previousResolver?.(false);
    });

  readonly settle = (accepted: boolean): void => {
    const currentResolver = this.resolver;
    if (!currentResolver) {
      return;
    }
    this.current = null;
    this.resolver = null;
    this.emit();
    currentResolver(accepted);
  };

  readonly cancel = (): void => {
    this.settle(false);
  };

  readonly dispose = (): void => {
    this.cancel();
    this.listeners.clear();
  };

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
