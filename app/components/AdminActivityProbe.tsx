"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Invisible activity probe — no UI, no Guard dependency.
 * Logs page_view / click / file events for Backlog Tracker.
 * Optional PC hostname: best-effort local agent status only (ignored if absent).
 */
export function AdminActivityProbe() {
  const pathname = usePathname();
  const lastPage = useRef("");
  const prevPage = useRef("");

  useEffect(() => {
    void refreshPcHostname();
  }, []);

  useEffect(() => {
    const ids = actorIds();
    if (!ids.loginId && !ids.employeeId) return;

    const pathOnly = pathname || window.location.pathname;
    if (pathOnly === lastPage.current) return;

    const from = lastPage.current || prevPage.current || "";
    prevPage.current = lastPage.current;
    lastPage.current = pathOnly;

    // Title often updates after Next.js paints the route.
    const sendView = () => {
      const ctx = pageContext();
      const title = ctx.page_title || humanizePath(ctx.page);
      const fromLabel = from ? humanizePath(from) : "";
      const detail = [
        `Viewing "${title}"`,
        ctx.page ? `on ${ctx.page}` : "",
        from ? `came from ${from}${fromLabel && fromLabel !== from ? ` (${fromLabel})` : ""}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      void send([
        {
          type: "page_view",
          page: ctx.page,
          page_title: title,
          full_url: ctx.full_url,
          from_page: from || undefined,
          label: detail,
          detail,
          hostname: pcHostname(),
          ...ids,
        },
      ]);
    };

    const t = window.setTimeout(sendView, 120);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!actorIds().loginId && !actorIds().employeeId) return;

    function closestAction(t: EventTarget | null): Element | null {
      if (!(t instanceof Element)) return null;
      return t.closest(
        "button, a[href], [role='button'], input[type='submit'], input[type='button'], input[type='file'], select, [data-action], summary",
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

      const target = describeClickTarget(el);
      if (!target.element_text && !target.element_id && !target.href) {
        // Ignore anonymous chrome clicks (empty icon-only with no id/aria).
        if (!target.element_tag) return;
      }

      const ctx = pageContext();
      const pageTitle = ctx.page_title || humanizePath(ctx.page);
      const clickedName =
        target.element_text ||
        target.aria ||
        target.title ||
        target.element_id ||
        target.element_tag ||
        "control";

      const detail = [
        `Clicked "${clickedName}"`,
        target.element_tag ? `(${target.element_tag})` : "",
        `on page "${pageTitle}"`,
        ctx.page ? `[${ctx.page}]` : "",
        target.href ? `→ ${target.href}` : "",
        target.section ? `section: ${target.section}` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const href = target.href || "";
      const isDelete = looksLikeDelete(detail, ctx.page);
      const isDownload = looksLikeDownload(href, detail);

      void send([
        {
          type: isDownload ? "download" : isDelete ? "click_delete" : "click",
          page: ctx.page,
          page_title: pageTitle,
          full_url: ctx.full_url,
          label: detail,
          detail,
          element_text: target.element_text || undefined,
          element_tag: target.element_tag || undefined,
          element_id: target.element_id || undefined,
          section: target.section || undefined,
          url: href ? href.slice(0, 300) : undefined,
          hostname: pcHostname(),
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
      const ctx = pageContext();
      const pageTitle = ctx.page_title || humanizePath(ctx.page);
      const names = files.map((f) => f.name).join(", ");
      const detail = `Selected file(s) "${names}" on page "${pageTitle}" [${ctx.page}]`;
      void send([
        {
          type: "file_select",
          page: ctx.page,
          page_title: pageTitle,
          full_url: ctx.full_url,
          label: detail,
          detail,
          files: files.map((f) => ({
            name: f.name,
            size: f.size,
            mime: f.type,
          })),
          hostname: pcHostname(),
          ...ids,
        },
      ]);
      const first = files[0];
      if (first && first.size <= 25 * 1024 * 1024) {
        const fd = new FormData();
        fd.set("type", "file_upload");
        if (ids.loginId) fd.set("loginId", ids.loginId);
        if (ids.employeeId) fd.set("employeeId", ids.employeeId);
        const host = pcHostname();
        if (host) fd.set("hostname", host);
        fd.set("page", ctx.page);
        fd.set("label", detail);
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
          const ctx = pageContext();
          const pageTitle = ctx.page_title || humanizePath(ctx.page);
          if (method === "GET" || method === "HEAD") {
            if (looksLikeDownload(path, "")) {
              const detail = `Downloaded "${path}" from page "${pageTitle}" [${ctx.page}]`;
              void send([
                {
                  type: "download",
                  page: ctx.page,
                  page_title: pageTitle,
                  full_url: ctx.full_url,
                  method,
                  url: path.slice(0, 300),
                  label: detail,
                  detail,
                  hostname: pcHostname(),
                  ...ids,
                },
              ]);
            }
          } else {
            const isDelete =
              method === "DELETE" || /\b(delete|remove|destroy)\b/i.test(path);
            const detail = `${isDelete ? "API delete" : "API"} ${method} ${path} while on "${pageTitle}" [${ctx.page}]`;
            void send([
              {
                type: isDelete ? "api_delete" : "api_call",
                page: ctx.page,
                page_title: pageTitle,
                full_url: ctx.full_url,
                method,
                url: path.slice(0, 300),
                label: detail,
                detail,
                hostname: pcHostname(),
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

function pageContext() {
  const path = window.location.pathname + window.location.search;
  const title = String(document.title || "")
    .replace(/\s*[|–—-]\s*Interact.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return {
    page: path.slice(0, 512),
    page_title: title,
    full_url: String(window.location.href || "").slice(0, 500),
  };
}

function humanizePath(path: string) {
  const clean = String(path || "").split("?")[0].replace(/\/+$/, "");
  if (!clean || clean === "/") return "Home";
  const last = clean.split("/").filter(Boolean).pop() || clean;
  return last
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 80);
}

function cleanText(raw: string) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[:\-–—|]+|[:\-–—|]+$/g, "")
    .trim()
    .slice(0, 140);
}

function describeClickTarget(el: Element) {
  const html = el as HTMLElement;
  const tag = (html.tagName || "").toLowerCase();
  const aria = cleanText(html.getAttribute("aria-label") || "");
  const title = cleanText(html.getAttribute("title") || "");
  const dataAction = cleanText(html.getAttribute("data-action") || "");
  const id = html.id ? cleanText(html.id) : "";

  let text = "";
  if (html instanceof HTMLInputElement) {
    text = cleanText(html.value || html.placeholder || html.name || html.type);
  } else if (html instanceof HTMLSelectElement) {
    const opt = html.selectedOptions?.[0];
    text = cleanText(opt?.text || html.name || "select");
  } else {
    text = cleanText(html.innerText || html.textContent || "");
  }
  // Drop noise-only / junk labels like ":" or "…"
  if (text.length <= 1 || /^[\W_]+$/.test(text)) text = "";

  const href =
    html instanceof HTMLAnchorElement
      ? cleanText(html.getAttribute("href") || "")
      : "";

  let section = "";
  const heading = html.closest("section, article, [data-section], form");
  if (heading) {
    const h = heading.querySelector("h1, h2, h3, legend, [data-section-title]");
    section = cleanText(h?.textContent || heading.getAttribute("aria-label") || "");
  }
  if (!section) {
    const near = html.closest("li, tr, .requestCard, .navItem, nav");
    const nearText = cleanText(
      (near as HTMLElement | null)?.innerText || "",
    ).slice(0, 60);
    if (nearText && nearText !== text) section = nearText;
  }

  return {
    element_tag: tag,
    element_text: text || dataAction || aria || title,
    element_id: id ? `#${id}` : "",
    aria,
    title,
    href,
    section,
  };
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

const PC_HOST_KEY = "hrm_pc_hostname";

function pcHostname() {
  try {
    return String(localStorage.getItem(PC_HOST_KEY) || "").trim();
  } catch {
    return "";
  }
}

async function refreshPcHostname() {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch("http://127.0.0.1:19501/status", {
      signal: ctrl.signal,
      mode: "cors",
      cache: "no-store",
    });
    window.clearTimeout(t);
    if (!res.ok) return;
    const data = await res.json();
    const host = String(
      data?.hostname || data?.machine_name || data?.pc_name || "",
    ).trim();
    if (host) localStorage.setItem(PC_HOST_KEY, host);
  } catch {
    /* Guard not running */
  }
}

function send(events: Record<string, unknown>[]) {
  try {
    const host = pcHostname();
    const enriched = events.map((e) =>
      host && !e.hostname ? { ...e, hostname: host } : e,
    );
    const body = JSON.stringify({ events: enriched });
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
