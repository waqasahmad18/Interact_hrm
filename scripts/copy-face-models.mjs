import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "node_modules", "@vladmandic", "face-api", "model");
const dest = path.join(root, "public", "models", "face-api");

const patterns = [
  // Detectors: tiny (fast, live counting) + SSD MobileNet (more accurate,
  // better at off-centre / angled faces — used for descriptor extraction).
  "tiny_face_detector",
  "ssd_mobilenetv1",
  // Landmarks: full 68-point net (better alignment → better descriptors) and
  // the tiny variant (kept for any lightweight path).
  "face_landmark_68",
  // Recognition: 128-D embedding model.
  "face_recognition",
];

fs.mkdirSync(dest, { recursive: true });

for (const file of fs.readdirSync(src)) {
  if (patterns.some((p) => file.startsWith(p))) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
    console.log("copied", file);
  }
}

console.log("Face models ready in public/models/face-api");
