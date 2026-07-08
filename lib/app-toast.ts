export type AppToastVariant = "success" | "error" | "info";

export type AppToastPayload = {
  message: string;
  title?: string;
  variant?: AppToastVariant;
  /** Default 3000ms */
  durationMs?: number;
};

export const APP_TOAST_EVENT = "app-toast";

export function showAppToast(payload: AppToastPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_TOAST_EVENT, { detail: payload }));
}

export function toastSuccess(message: string, title = "Success", durationMs?: number): void {
  showAppToast({ message, title, variant: "success", durationMs });
}

export function toastError(message: string, title = "Error", durationMs?: number): void {
  showAppToast({ message, title, variant: "error", durationMs });
}

export function toastInfo(message: string, title = "Notice", durationMs?: number): void {
  showAppToast({ message, title, variant: "info", durationMs });
}
