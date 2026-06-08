/**
 * Standalone sweep — run via Windows Task Scheduler every 1–5 min.
 * Works even when no browser is open (Next.js must be running OR use this script directly).
 *
 *   node scripts/auto-presence-sweep.js
 */
const http = require("http");

const port = process.env.PORT || "3000";
const host = process.env.HRM_HOST || "localhost";
const path = "/api/cron/auto-presence-sweep";

const req = http.get({ host, port, path, timeout: 20000 }, (res) => {
  let body = "";
  res.on("data", (c) => (body += c));
  res.on("end", () => {
    console.log(body);
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on("error", (e) => {
  console.error("[auto-presence-sweep] Failed:", e.message);
  process.exit(1);
});

req.on("timeout", () => {
  req.destroy();
  console.error("[auto-presence-sweep] Request timed out");
  process.exit(1);
});
