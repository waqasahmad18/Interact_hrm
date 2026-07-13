/**
 * Presence check sessions for desktop agent ↔ Chrome bridge.
 * File-backed so Next.js HMR / multiple workers don't lose the result
 * (in-memory Map was why agent often got timeout → no success/fail toast).
 */

import fs from "fs";
import path from "path";
import os from "os";

export type PresenceSessionResult = {
  cameraOk: boolean;
  atSeat: boolean;
  code: string;
  error?: string | null;
  similarity?: number | null;
};

type Session = {
  employeeId: string;
  createdAt: number;
  result: PresenceSessionResult | null;
};

const DIR = path.join(os.tmpdir(), "interact-hrm-presence-sessions");
const TTL_MS = 5 * 60 * 1000;

function ensureDir() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function fileFor(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DIR, `${safe}.json`);
}

function readSession(id: string): Session | null {
  try {
    const raw = fs.readFileSync(fileFor(id), "utf8");
    const s = JSON.parse(raw) as Session;
    if (!s || typeof s.createdAt !== "number") return null;
    if (Date.now() - s.createdAt > TTL_MS) {
      try {
        fs.unlinkSync(fileFor(id));
      } catch {
        /* ignore */
      }
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function writeSession(id: string, s: Session) {
  ensureDir();
  fs.writeFileSync(fileFor(id), JSON.stringify(s), "utf8");
}

export function createPresenceSession(employeeId: string): string {
  ensureDir();
  const id = `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  writeSession(id, {
    employeeId: String(employeeId).trim(),
    createdAt: Date.now(),
    result: null,
  });
  return id;
}

export function getPresenceSession(id: string): Session | null {
  return readSession(id);
}

export function completePresenceSession(
  id: string,
  result: PresenceSessionResult
): boolean {
  const s = readSession(id);
  if (!s) return false;
  s.result = result;
  writeSession(id, s);
  return true;
}

export function takePresenceSessionResult(id: string): PresenceSessionResult | null {
  const s = readSession(id);
  if (!s?.result) return null;
  const r = s.result;
  try {
    fs.unlinkSync(fileFor(id));
  } catch {
    /* ignore */
  }
  return r;
}
