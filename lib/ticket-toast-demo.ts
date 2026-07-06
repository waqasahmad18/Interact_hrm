import type { TicketCategory } from "./ticket-catalog";
import { playTicketSoundFromUserGesture } from "./ticket-toast-sound";

export type TicketToastKind = "created" | "updated";

export type TicketToastPayload = {
  id: number;
  ticket_number: string;
  employee_id?: string;
  employee_name: string;
  employee_pseudonym?: string | null;
  employee_photo?: string | null;
  category: TicketCategory;
  ticket_type: string;
  subject: string | null;
  kind?: TicketToastKind;
  preview?: string | null;
  _skipSound?: boolean;
};

export const DEMO_TICKET_TOAST_EVENT = "hrm:demo-ticket-toast";
export const DEMO_TICKET_TOAST_QUERY = "demoTicketToast=1";
export const NOTIFICATION_DEMO_PATH = "/notification-demo";

export const DEMO_TICKET_TOAST: TicketToastPayload = {
  id: 0,
  ticket_number: "TKT-DEMO-001",
  employee_name: "Waqas Rafique",
  category: "HR",
  ticket_type: "leave",
  subject: "Annual leave request — 3 days",
  kind: "created",
};

export function notificationDemoUrl(path = "/dashboard"): string {
  return path.includes("?")
    ? `${path}&${DEMO_TICKET_TOAST_QUERY}`
    : `${path}?${DEMO_TICKET_TOAST_QUERY}`;
}

export function dispatchDemoTicketToast(overrides?: Partial<TicketToastPayload>): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DEMO_TICKET_TOAST_EVENT, {
      detail: { ...DEMO_TICKET_TOAST, ...overrides },
    })
  );
}

export function previewTicketToastOnPage(overrides?: Partial<TicketToastPayload>): void {
  playTicketSoundFromUserGesture();
  dispatchDemoTicketToast({ ...overrides, _skipSound: true });
}
