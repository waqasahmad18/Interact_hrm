import "server-only";

import crypto from "crypto";

const ALGO = "aes-256-gcm";

function encryptionKey(): Buffer {
  const secret = process.env.SAVED_LOGIN_SECRET || "interact-hrm-saved-login-change-me";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSavedPassword(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSavedPassword(payload: string): string {
  const [ivB64, tagB64, encB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !encB64) {
    throw new Error("Invalid encrypted password payload");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
