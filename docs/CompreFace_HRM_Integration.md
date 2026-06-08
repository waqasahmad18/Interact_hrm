# CompreFace — Overview & Interact HRM Integration Guide

**Document purpose:** Explain what [Exadel CompreFace](https://github.com/exadel-inc/CompreFace) is, which parts of our face-attendance requirement it satisfies, and how it will connect to Interact HRM2. Written for HR, management, and developers in clear paragraphs with headings.

**Related product goal:** When an employee presses **Clock In**, **Start Break**, or **Start Prayer Break** on the Employee Dashboard, the device camera should open, the system should verify that the live face matches the enrolled employee, and only then should the existing HRM attendance or break action complete.

**Local copy in repository:** `CompreFace-master/CompreFace-master/` (release **1.2.0**, Apache 2.0 license).

**Interact HRM stack (unchanged):** Next.js App Router, React client components, MySQL (`employee_attendance`, breaks, shifts). CompreFace runs as a **separate local service** on port **8000**; HRM remains on port **3000** (or your dev port).

---

## 1. What Is CompreFace?

CompreFace is a free, open-source, self-hosted face recognition platform published by Exadel. It is not a full HR or attendance product. It is a **face intelligence layer**: it detects faces in images, stores known people as **subjects**, compares a new photo against those subjects, and returns a **similarity score** and identity match through a REST API and an admin web UI.

The project is designed to run with **Docker Compose**. On a typical Windows setup, one command starts PostgreSQL (for CompreFace’s own data), Java API services, the machine-learning **core** worker, and a web front end. After startup, administrators open **http://localhost:8000/login**, create an account, define an **application**, and create a **Face Recognition** service that receives a dedicated **API key**. All face matching then happens on your LAN or server; there is no per-call charge to Azure, Google, or third-party SaaS attendance vendors.

Under the hood, CompreFace uses established models such as **FaceNet** and **InsightFace**. Our team does not need to train neural networks from scratch. We configure services, enroll photos, set similarity thresholds, and call HTTP endpoints from Interact HRM. That matches our goal of owning the integration while keeping biometric accuracy at industry level.

---

## 2. What Is Inside the Repository We Added?

The folder `CompreFace-master/CompreFace-master/` is the upstream CompreFace source and deployment bundle. The important pieces for us are not every Java or UI file, but the following:

**Docker deployment** — The file `docker-compose.yml` defines containers for PostgreSQL, `compreface-api`, `compreface-admin`, `compreface-fe` (UI on port 8000), and `compreface-core` (ML inference). The `.env` file pins image versions to **1.2.0** and sets limits such as maximum upload size (**5 MB** per image) and detection size.

**Documentation** — The `docs/` directory contains the official integration guide (`How-to-Use-CompreFace.md`), full **REST API** description (`Rest-API-description.md`), similarity threshold tuning (`Face-Recognition-Similarity-Threshold.md`), face services overview (`Face-services-and-plugins.md`), and HTML demos including **webcam** recognition (`docs/demos/webcam_demo.html`). Those demos are useful prototypes for “camera on, then recognize” before we embed the same behavior in `ClockBreakPrayer`.

**SDKs (optional)** — CompreFace publishes JavaScript, Python, and .NET SDKs on separate GitHub repositories. Interact HRM can integrate via plain `fetch` from Next.js API routes or via the JavaScript SDK; both approaches talk to the same REST API.

**What we do not run from this folder in daily HR work** — We do not compile the entire Java monorepo for attendance. For production-style use, we run **pre-built Docker images** from the compose file. The HRM codebase stays in Next.js; CompreFace stays a sidecar service, similar in spirit to how ZKBio/Tungsten is a separate physical channel today.

---

## 3. CompreFace Features and How They Map to Our Requirements

### 3.1 Face detection

CompreFace can find face bounding boxes in an uploaded image. For attendance we rely on detection indirectly: the recognition pipeline locates the face before matching. This aligns with our need to reject empty or non-face camera frames before clock-in is allowed.

### 3.2 Face recognition (primary service for HRM)

Face **recognition** is the main service type we will create in the CompreFace UI. We maintain a **collection** of known subjects. Each **subject** maps to one logical person—for example `employee_5` for Interact employee id `5`. We upload multiple **examples** (photos) per subject; the documentation states that one photo can work, but **several photos improve accuracy**, which matches our plan of **five enrollment images** per employee (front, slight angles, with and without glasses where possible).

At clock-in time we send one live frame from the browser. CompreFace returns the best-matching subject(s) and a **similarity** value. If the top match is the logged-in employee and similarity exceeds our configured threshold, we treat verification as passed and proceed with the normal HRM clock-in API. This directly supports “recognize karay, wohi hai to clock in successful.”

### 3.3 Face verification

Verification compares a face against a **specific** subject rather than searching the whole gallery. We can use this for stricter checks—for example, force comparison only to `employee_5` when employee 5 is logged in, which reduces the risk of another enrolled person’s face being accepted on a shared kiosk PC. Recognition plus optional verify is enough for v1; verify is recommended when multiple employees enroll on one device.

### 3.4 Additional plugins (optional, later)

CompreFace can expose **mask detection**, **head pose**, **age**, and **gender** plugins on the same API. These are not required for basic clock-in but may help future policies (e.g. log mask status). They do **not** replace dedicated **liveness** (blink / anti-spoof) products; we should plan liveness as a later phase if buddy punching via phone screens becomes a concern.

### 3.5 Admin UI and API keys

The built-in UI supports applications, services, roles, and per-service **API keys**. HR or IT can enroll faces through the UI for pilots, while Interact HRM will eventually offer an **admin enrollment screen** that calls the same REST endpoints. Role management on CompreFace is separate from HRM roles; only trusted admins should access port 8000.

### 3.6 Self-hosted operation and data locality

Because CompreFace runs on our infrastructure, employee face templates and optional stored images remain under our control, subject to company privacy policy and consent. This aligns with preferring local operation over DutyPar-style cloud-only apps. CompreFace uses its **own PostgreSQL database**; it does not replace Interact’s MySQL `employee_attendance` tables.

---

## 4. What CompreFace Does Not Do (Remain in Interact HRM)

CompreFace does not perform clock-in, clock-out, break timers, prayer break rules, shift assignment, auto-presence popup, Tungsten punch pairing, payroll, or leave management. Those remain in existing modules: `ClockBreakPrayer`, `/api/attendance`, `/api/breaks`, shift tables, and reporting pages.

CompreFace does not open the employee’s webcam by itself. The browser camera UX must be implemented in React on the Employee Dashboard. CompreFace only receives the captured image bytes.

CompreFace does not know Interact `employee_id` until we define a naming convention (recommended: subject name `employee_<id>` or plain numeric string `"5"` consistent everywhere).

Therefore the integrated product is **Interact HRM + CompreFace as biometric gate**, not a replacement HRM.

---

## 5. End-to-End Integration Architecture

### 5.1 Runtime layout

On the same office network or machine, **Interact HRM** (Next.js) listens on port **3000** and **CompreFace** on port **8000**. The employee browser talks only to HRM over HTTPS or localhost. HRM server-side API routes call CompreFace with the service API key so the key is not exposed to the client. This is important for security: the browser sends the snapshot to `/api/biometric/verify` on HRM; HRM forwards to CompreFace.

### 5.2 Enrollment flow (one-time per employee)

Human Resources or the employee completes enrollment before mandatory biometric clock-in. For each `employee_id`, we create a CompreFace **subject** and upload **five** face images via `POST /api/v1/recognition/faces?subject=<name>` with header `x-api-key: <recognition_service_key>`. Interact should store a mapping row, for example `employee_id`, `compreface_subject`, `enrolled_at`, `enrolled_by`, so support staff can see who is ready for face clock-in. Images should be JPEG or PNG, one face per image, under 5 MB, reasonable lighting.

### 5.3 Clock-in flow (employee dashboard)

When the employee clicks **Clock In**, the UI does not immediately call `/api/attendance`. Instead it opens a **Face Verify** modal, starts `getUserMedia` video, captures a frame (or short burst of frames), and posts it to a new HRM endpoint such as `POST /api/biometric/verify` with `employee_id` and the image. The server calls CompreFace `POST /api/v1/recognition/recognize` (or verify against the known subject). If the best match subject equals the mapped subject for that employee and `similarity` ≥ threshold (documented in CompreFace threshold guide, often tuned around 0.6–0.85 depending on model), HRM returns `{ verified: true }` and the client then runs the existing `handleClockIn` logic. If verification fails, show a clear message and allow retry; optional fallback policy (supervisor override or device punch only) is a business decision outside CompreFace.

### 5.4 Break and prayer break

The same verification step runs immediately before **Start Break** and **Start Prayer Break** API calls. Each action can be logged in a small `biometric_audit` table: timestamp, `employee_id`, action type (`clock_in`, `break`, `prayer`), similarity score, pass/fail. That supports disputes without storing every raw image long term if policy prefers embeddings-only.

### 5.5 Coexistence with ZKBio / Tungsten

Interact already ingests physical device punches for reports and T.Punch columns. CompreFace does not remove Tungsten. Policy can be: office staff must use device **or** web face; remote staff use web face only; or web face required in addition to device for high-security sites. Integration is policy, not technical conflict.

---

## 6. REST API Summary (Interact Developers)

All paths below use base URL **http://localhost:8000** when CompreFace runs locally. Replace host in production with the internal server name. Every request to recognition endpoints requires header **`x-api-key`** from the Face Recognition service created in the UI.

**Create subject (optional; subject can auto-create on first upload):**

`POST /api/v1/recognition/subjects` with JSON body `{ "subject": "employee_5" }`.

**Add enrollment photo (repeat five times per employee):**

`POST /api/v1/recognition/faces?subject=employee_5` with `multipart/form-data` field `file`.

**Recognize live clock-in frame:**

`POST /api/v1/recognition/recognize` with `file` = camera capture. Parse `result[].subjects[].subject` and `similarity`.

**Stricter check for logged-in user only:**

Use recognition verify variant documented in `Rest-API-description.md` (verify faces for a given image against a specific subject) when we want to avoid accepting any other enrolled colleague on a shared PC.

Full parameter list, Base64 upload, and embedding-based calls are in `CompreFace-master/CompreFace-master/docs/Rest-API-description.md`. Postman collection: [CompreFace Postman docs](https://documenter.getpostman.com/view/17578263/UUxzAnde).

---

## 7. Proposed Interact HRM Changes (Implementation Outline)

This section describes work **to be built** in Interact HRM; it is not yet in production code unless explicitly marked done elsewhere.

**New environment variables** — `COMPREFACE_BASE_URL` (e.g. `http://localhost:8000`), `COMPREFACE_API_KEY` (recognition service key). Optional `COMPREFACE_SIMILARITY_MIN` for server-side threshold enforcement.

**New API routes** — `POST /api/biometric/enroll` (admin: upload up to five images for an employee), `POST /api/biometric/verify` (employee: image + employee id → pass/fail + score), `GET /api/biometric/status` (whether employee is enrolled).

**New UI components** — `FaceVerifyModal` (camera preview, capture, loading, error states); hook into `app/components/ClockBreakPrayer.tsx` before `handleClockIn` and break handlers. Admin page under HR for enrollment and re-enrollment when appearance changes significantly.

**Database** — Table such as `employee_face_enrollment` linking `employee_id` to CompreFace subject and enrollment metadata; optional `biometric_verification_log` for audits.

**Feature flag** — Company or per-employee setting `biometric_required` so pilot groups use face gate while others stay button-only during rollout.

---

## 8. Installation and Pilot Checklist (Operations)

Install **Docker Desktop** on Windows and ensure virtualization is enabled. Open a terminal in `CompreFace-master/CompreFace-master` and run `docker-compose up -d`. Wait until containers are healthy, then browse to **http://localhost:8000/login**, register the first admin, create an **Application** (e.g. “Interact HRM”), add a **Recognition** service, and copy the API key into HRM environment config.

Enroll one test employee with five photos in the CompreFace UI (subject `employee_<id>`). Open `docs/demos/webcam_demo.html` from the CompreFace folder, paste the API key, and confirm recognition in the browser. Then implement HRM `FaceVerifyModal` and call the same recognize endpoint from Next.js.

For production, run CompreFace on a dedicated LAN server with firewall rules so only HRM app servers can reach port 8000. Back up the Docker volume for PostgreSQL if face images are stored in CompreFace’s DB (`save_images_to_db=true` in `.env`). Document employee consent for biometric processing.

---

## 9. Security, Privacy, and Limitations

Employees must be informed that face images or mathematical face templates are processed for attendance. Retention period and whether raw photos are stored in CompreFace versus only used to generate templates should be written in HR policy. The CompreFace admin port should not be exposed to the public internet without VPN or reverse proxy and authentication.

Similarity thresholds must be tuned on real office lighting; too high causes false rejections, too low allows wrong-person acceptance. CompreFace improves with multiple enrollment photos but does not fully stop presentation attacks (holding a photo to the camera) without additional liveness technology.

AVX-capable CPU is recommended per CompreFace README. First Docker pull and model load can take time and disk space. The CompreFace folder is large; consider adding `CompreFace-master/` to `.gitignore` in the main HRM repository if only Docker deployment is needed on servers, keeping this documentation file under `docs/` as the canonical integration reference.

---

## 10. Requirement Alignment Summary

| Business requirement | CompreFace capability | Interact HRM responsibility |
|---------------------|----------------------|---------------------------|
| Camera on when Clock In pressed | Browser camera in HRM modal | `FaceVerifyModal`, `getUserMedia` |
| Five photos per employee | Multiple examples per subject | Admin enroll UI + mapping table |
| Face must match logged-in employee | Recognition / verify + similarity | Pass/fail gate before `/api/attendance` |
| Same for Break / Prayer | Same recognize API | Hook break/prayer handlers |
| Local, no SaaS API fees | Docker self-hosted | Host + env config |
| Accurate matching | FaceNet / InsightFace models | Threshold tuning, re-enrollment |
| Attendance records, shifts, reports | Not provided | Existing attendance module |
| Buddy punch reduction | Strong matching; weak liveness | Future liveness phase |
| Tungsten / ZKBio | Not replaced | Existing sync and reports |

---

## 11. Phased Rollout Recommendation

**Phase 1 — Infrastructure:** Deploy CompreFace with Docker, create Recognition service, document API key, enroll IT test users.

**Phase 2 — HRM gate on Clock In only:** `FaceVerifyModal`, verify API route, audit log, feature flag.

**Phase 3 — Break and Prayer:** Apply same verify step to break start actions.

**Phase 4 — Admin enrollment in HRM:** Replace manual CompreFace UI enrollment for daily HR workflow.

**Phase 5 — Optional:** Liveness checks, geofencing on mobile, stricter verify-only mode for shared kiosks.

---

## 12. References

- CompreFace GitHub: https://github.com/exadel-inc/CompreFace  
- Local docs in repo: `CompreFace-master/CompreFace-master/docs/`  
- Interact attendance widget: `app/components/ClockBreakPrayer.tsx`  
- Interact attendance API: `app/api/attendance/route.ts`  
- Interact comprehensive report: `docs/HRM_Comprehensive_Technical_Report.md`  

---

*Document version: 1.0 — CompreFace 1.2.0 alignment with Interact HRM2 face-attendance initiative.*
