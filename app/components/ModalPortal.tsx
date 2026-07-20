"use client";

import React from "react";
import { createPortal } from "react-dom";

/**
 * Renders modal overlays on document.body so position:fixed is viewport-relative
 * and not clipped by scroll/overflow ancestors (e.g. .contentArea).
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
