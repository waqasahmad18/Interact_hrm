"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Invisible activity probe — no UI.
 * Logs page views, clicks, uploads, downloads, and mutating API calls
 * for Backlog Tracker (admin + employee dashboards).
 */
export function AdminActivityProbe() {
  const pathname = usePathname();
  const lastPage = useRef("");

  useEffect(() => {
    const ids = actorIds();
    if (!ids.loginId && !ids.employeeId) return;

    const page = pathname || window.location.pathname;
    if (page === lastPage.current) return;
    lastPage.current = page;

    void send([{ type: "page_view", page, ...ids }]);
  }, [pathname]);

  useEffect(() => {
    if (!actorIds().loginId && !actorIds().employeeId) return;

    function describeTarget(el: Element | null): string {
      if (!el) return "";
      const html = el as HTMLElement;
      const text = (html.innerText || html.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      const id = html.id ? `#${html.id}` : "";
      const name = html.getAttribute("name")
        ? `[name=${html.getAttribute("name")}]`
        : "";
      const href =
        html instanceof HTMLAnchorElement ? html.getAttribute("href") || "" : "";
      const tag = html.tagName?.toLowerCase() || "";
      return [tag, id, name, text, href].filter(Boolean).join(" ").slice(0, 200);
    }

    function closestAction(t: EventTarget | null): Element | null {
      if (!(t instanceof Element)) return null;
      return t.closest(
        "button, a[href], [role='button'], input[type='submit'], input[type='button'], label, [data-action]",
      );
    }

    function looksLikeDelete(label: string, page: string) {
      const s = `${label} ${page}`.toLowerCase();
      return /\b(delete|remove|destroy|trash|archive)\b/.test(s);
    }

    function looksLikeDownload(url: string, label: string) {
      const s = `${url} ${label}`.toLowerCase();
      return (
        s.includes("download") ||
        s.includes("/api/attachments/") ||
        s.includes("export") ||
        /\.(pdf|xlsx?|csv|zip|docx?)(\?|$)/i.test(url)
      );
    }

    function onClick(e: MouseEvent) {
      const ids = actorIds();
      if (!ids.loginId && !ids.employeeId) return;
      const el = closestAction(e.target);
      if (!el) return;
      const label = describeTarget(el);
      const page = window.location.pathname + window.location.search;
      const href =
        el instanceof HTMLAnchorElement ? el.getAttribute("href") || "" : "";
      const isDelete = looksLikeDelete(label, page);
      const isDownload = looksLikeDownload(href, label);
      void send([
        {
          type: isDownload
            ? "download"
            : isDelete
              ? "click_delete"
              : "click",
          page,
          label,
          url: href ? href.slice(0, 300) : undefined,
          ...ids,
        },
      ]);
    }

    function onChange(e: Event) {
      const ids = actorIds();
      if (!ids.loginId && !ids.employeeId) return;
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "file") return;
      const files = t.files ? Array.from(t.files) : [];
      if (!files.length) return;
      const page = window.location.pathname + window.location.search;
      void send([
        {
          type: "file_select",
          page,
          label: describeTarget(t),
          files: files.map((f) => ({
            name: f.name,
            size: f.size,
            mime: f.type,
          })),
          ...ids,
        },
      ]);
      const first = files[0];
      if (first && first.size <= 25 * 1024 * 1024) {
        const fd = new FormData();
        fd.set("type", "file_upload");
        if (ids.loginId) fd.set("loginId", ids.loginId);
        if (ids.employeeId) fd.set("employeeId", ids.employeeId);
        fd.set("page", page);
        fd.set("label", describeTarget(t));
        fd.set("file", first, first.name);
        void fetch("/api/internal/admin-activity", {
          method: "POST",
          body: fd,
          credentials: "same-origin",
          keepalive: true,
        }).catch(() => {});
      }
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const ids = actorIds();
      try {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const method = (
          init?.method ||
          (typeof input !== "string" && !(input instanceof URL)
            ? input.method
            : "GET") ||
          "GET"
        ).toUpperCase();
        if (
          (ids.loginId || ids.employeeId) &&
          url &&
          (url.startsWith("/") || url.startsWith(window.location.origin)) &&
          !url.includes("/api/internal/admin-activity")
        ) {
          const path = url.replace(window.location.origin, "");
          if (method === "GET" || method === "HEAD") {
            if (looksLikeDownload(path, "")) {
              void send([
                {
                  type: "download",
                  page: window.location.pathname + window.location.search,
                  method,
                  url: path.slice(0, 300),
                  label: "download",
                  ...ids,
                },
              ]);
            }
          } else {
            const isDelete =
              method === "DELETE" || /\b(delete|remove|destroy)\b/i.test(path);
            void send([
              {
                type: isDelete ? "api_delete" : "api_call",
                page: window.location.pathname + window.location.search,
                method,
                url: path.slice(0, 300),
                ...ids,
              },
            ]);
          }
        }
      } catch {
        // ignore probe errors
      }
      return originalFetch(input, init);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}

function actorIds() {
  try {
    return {
      loginId: String(localStorage.getItem("loginId") || "").trim(),
      employeeId: String(localStorage.getItem("employeeId") || "").trim(),
    };
  } catch {
    return { loginId: "", employeeId: "" };
  }
}

function send(events: Record<string, unknown>[]) {
  try {
    const body = JSON.stringify({ events });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/internal/admin-activity", blob);
      return;
    }
    void fetch("/api/internal/admin-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}
