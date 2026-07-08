export type AppConfirmVariant = "default" | "danger";

export type AppConfirmPayload = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AppConfirmVariant;
};

export type AppConfirmRequest = AppConfirmPayload & { id: string };

export const APP_CONFIRM_EVENT = "app-confirm";

const resolvers = new Map<string, (value: boolean) => void>();

export function showAppConfirm(payload: AppConfirmPayload): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const id = `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve) => {
    resolvers.set(id, resolve);
    const request: AppConfirmRequest = { id, ...payload };
    window.dispatchEvent(new CustomEvent(APP_CONFIRM_EVENT, { detail: request }));
  });
}

export function settleAppConfirm(id: string, value: boolean): void {
  const resolve = resolvers.get(id);
  if (resolve) {
    resolve(value);
    resolvers.delete(id);
  }
}
