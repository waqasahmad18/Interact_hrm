# Interact HRM 2.0 — UI/UX Requirements Document

| Field | Value |
|-------|-------|
| **Product** | Interact HRM 2.0 |
| **Document type** | UI/UX Technical Requirements (TRD) |
| **Version** | 1.0 |
| **Date** | July 2026 |
| **Audience** | Product, Design, Frontend, QA, Stakeholders |
| **Stack reference** | Next.js App Router, React, CSS Modules |
| **Timezone (all HR dates)** | Asia/Karachi (`SERVER_TIMEZONE`) |

---

## 1. Purpose & Scope

This document defines the **user interface and experience requirements** for Interact HRM 2.0 based on the **latest implemented design** in the repository. It is intended for:

- Aligning new features with the existing visual language
- QA acceptance criteria for layout, responsiveness, and interaction
- Onboarding designers and developers without reading every component file
- Server deployment verification (UI parity between environments)

**In scope:** Layout shells, navigation, design tokens, page-level UX, shared components, responsive rules, states (loading/empty/error), notifications, biometric scan UI, and accessibility baseline.

**Out of scope:** Backend API contracts, database schema, payroll calculation logic, and face-matching algorithms (covered in separate technical documents).

**Related documents:**

- `docs/HRM_Comprehensive_Technical_Report.md` — feature & API inventory
- `docs/HRM_Organizational_Hierarchy_Technical_Document.txt` — org hierarchy model
- `docs/HRM_Centralized_Access_Control_Plan.txt` — RBAC roadmap

---

## 2. Design Philosophy

### 2.1 Visual direction

The product follows a **Slack-inspired enterprise HR aesthetic**:

- **Professional dark sidebar** + **light content canvas**
- **Purple brand** for identity and primary actions
- **Green** for attendance success, on-time status, and positive confirmation
- **Gold/amber** for highlights, active nav accent, and tardy-adjacent emphasis
- **Soft card-based layouts** with generous radius (16–18px) and subtle purple-tinted shadows
- **No heavy animation** on performance-critical flows (face scan, dashboard load); color/width transitions only where they aid comprehension

### 2.2 UX principles

| Principle | Requirement |
|-----------|-------------|
| **Clarity over density** | Primary actions visible above the fold; secondary actions in menus or cards |
| **Role-appropriate surfaces** | Admin sees operational breadth; employee sees self-service bento dashboard |
| **Timezone consistency** | All attendance, leave, and calendar displays use Karachi time — never browser-local midnight for HR records |
| **Biometric gate** | Clock in/out requires face verification modal; UI must not block unrelated navigation while models preload |
| **Real-time awareness** | Ticket updates surface as toasts without full page reload |
| **Mobile-first adaptations** | Sidebar becomes drawer ≤1024px; bento grids stack; clock widgets stack ≤900px |
| **Forgiving empty states** | Every list/table must show a human-readable empty message, not a blank panel |

### 2.3 Legacy coexistence (known)

Two older visual threads remain in codebase and **must not expand**:

- Root `/` login — blue glass card theme (`app/auth/auth.module.css`)
- Nexatech blue tokens (`app/dashboard/nexatech-theme.module.css`)

**Requirement:** All new work uses the Slack-purple shell (`layout-dashboard.module.css`) and shared admin module patterns.

---

## 3. Design System

### 3.1 Color tokens

#### Shell (primary) — `app/layout-dashboard.module.css`

| Token | Hex | Usage |
|-------|-----|-------|
| `--shell-bg` | `#f4f5f7` | Page background |
| `--brand` | `#611f69` | Brand purple, primary buttons, accents |
| `--brand-light` | `#7c3085` | Hover/secondary brand |
| `--brand-soft` | `#f3e8f5` | Soft purple backgrounds |
| `--accent` | `#1264a3` | Links, info actions |
| `--accent-hover` | `#0b4c8c` | Accent hover |
| `--topbar-bg` | `#ffffff` | Fixed header |
| `--text-primary` | `#1d1c1d` | Headings, body |
| `--text-secondary` | `#616061` | Subtitles |
| `--text-muted` | `#8b8b8b` | Hints, meta |
| `--sidebar-bg` | `#1a1d21` | Navigation drawer |
| `--nav-text` | `#f0f0f0` | Sidebar labels |
| `--nav-text-dim` | `#ababad` | Inactive nav |
| `--nav-active-accent` | `#e8912d` | Active item left bar (gold) |

#### Admin report modules — `app/break-summary/break-summary.module.css`

| Token | Hex | Usage |
|-------|-----|-------|
| `--brand-purple` | `#611f69` | Headers, export accents |
| `--brand-purple-dark` | `#4a1850` | Deep purple |
| `--brand-green` | `#007a5a` | Excel export, success CTAs |
| `--brand-gold` | `#e8912d` | Highlights |
| `--color-bg` | `#f4f6f9` | Page fill |
| `--color-text` | `#0f172a` | Primary text |
| `--color-text-secondary` | `#64748b` | Secondary text |
| `--color-border` | `#e8edf3` | Card/table borders |
| `--radius-card` | `18px` | Standard card radius |
| `--shadow-card` | `0 8px 32px rgba(97,31,105,0.08)` | Card elevation |

#### Semantic status colors

| State | Color | Where used |
|-------|-------|------------|
| On-time / success | `#22c55e`, `#34d399`, `#007a5a` | Attendance bars, face verify success |
| Late / error | `#ef4444`, `#dc2626`, `#f87171` | Tardy pills, blocked face scan |
| Pending (today, no clock-in) | `#c4b5fd` dashed border, `#a78bfa` tint | Week attendance chart |
| Absent | `#e2e8f0` grey bar | Week chart |
| Scan in progress | `rgb(236, 72, 153)` pink | Face HUD before match |
| Info / prayer | Blue tones in clock widget | Prayer break card |

#### Org chart role tier accents — `system-control-data.ts`

| Tier | Accent |
|------|--------|
| Board | `#a78bfa` |
| Partner | `#1a1a1a` |
| Director | `#b91c1c` |
| Manager | `#ea580c` |
| Lead / Staff | `#2b6cb0` |
| Support / Junior | `#38a169` |

### 3.2 Typography

| Context | Font | Size / weight |
|---------|------|----------------|
| Global body | `system-ui` stack (Segoe UI, Roboto…) | 14px base on employee dashboard |
| Auth (primary `/auth`) | Inter (Google Fonts) | Brand title up to ~2.75rem; form labels 0.875rem |
| Page titles | `--font-main` | 1.5–1.6rem, weight 700, letter-spacing −0.02em |
| Nav items | `--font-main` | 0.875rem (14px) |
| Stat values | Bold | 1.5–2rem |
| Micro labels (HUD, badges) | Uppercase | 0.58–0.75rem, letter-spacing 0.08–0.14em |
| Table headers | Semi-bold | 0.8–0.875rem |

**Requirement:** Do not reintroduce Google Geist fonts for production offline builds; system stack is intentional.

### 3.3 Spacing & layout grid

| Element | Specification |
|---------|---------------|
| Top bar height | 58px desktop; 52px ≤1024px |
| Sidebar width | 260px fixed; drawer 272px max 86vw on mobile |
| Admin page padding | `20px 28px 40px` |
| Employee page padding | 16px ≤560px |
| Card internal padding | 22–32px |
| Widget grid gap | 12–16px |
| Bento grid | 12-column CSS grid on employee dashboard |
| Max content width | 1100–1320px centered inner containers on wide reports |

### 3.4 Elevation & borders

- Cards: white `#ffffff` on `#f4f5f7` / `#f4f6f9` canvas
- Borders: `1px solid #e8edf3` or `rgba(148,163,184,0.32)` on top bar
- Modals: overlay `rgba(15, 23, 42, 0.38–0.55)`; card radius 18–22px
- Hover: subtle `translateY(-2px)` + shadow lift on stat cards (dashboard)

### 3.5 Iconography

- **Primary:** `react-icons/fa` (Font Awesome)
- **Chevrons / UI chrome:** `react-icons/fi`
- **Excel export:** `FaFileExcel` on green gradient buttons
- Icons in nav: 16–18px, aligned with label baseline

---

## 4. Application Architecture (UI Surfaces)

### 4.1 Surface map

```
┌─────────────────────────────────────────────────────────────┐
│                     /auth (Primary Login)                    │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
        Admin Shell                   Employee Shell
   (LayoutDashboard)            (employee-dashboard/layout)
                │                             │
    /dashboard, /admin/*,          /employee-dashboard/*
    /attendance-*, /leave,         tabs + hero + clock dock
    /recruitment, etc.
```

### 4.2 Authentication UX — `/auth`

**Layout:** Split screen — left brand panel (dark purple gradient `#1a1d21` → `#4a154b`), right white form.

**Required elements:**

- Login ID / password fields with show/hide password toggle
- Remember me checkbox
- Saved logins picker (device-scoped credentials panel)
- Role-based redirect after success:
  - Admin → `/dashboard`
  - BOD/CEO → `/bod-dashboard` *(route planned, not yet built)*
  - HOD → `/hod-dashboard` *(planned)*
  - Management → `/management-dashboard` *(planned)*
  - Leader → `/leader-dashboard` *(planned)*
  - Default employee → `/employee-dashboard`

**States:**

| State | UX requirement |
|-------|----------------|
| Loading | Submit button disabled; loading indicator on button |
| Error | Inline red message below form; no toast-only errors |
| Empty saved logins | Picker hidden or shows empty guidance |

**Responsive:**

- ≤980px: single-column; brand panel stacks or hides
- ≤480px: reduced form padding

### 4.3 Admin shell — `LayoutDashboard`

**Structure:**

```
┌──────────────────────────────────────────────────┐
│ Top bar: [☰] Logo    Profile name + avatar [⋮]   │  58px fixed
├────────────┬─────────────────────────────────────┤
│  Sidebar   │  Scrollable <main> content           │
│  260px     │                                      │
│  dark nav  │                                      │
└────────────┴─────────────────────────────────────┘
```

**Top bar requirements:**

- Company logo upload via `ShellImageUpload` (variant `logo`)
- Hamburger visible ≤1024px; toggles sidebar drawer
- Profile menu: logout → `/auth`
- Profile name hidden on very small screens (≤480px); avatar remains

**Sidebar requirements:**

- Group labels: **Main**, **HR**, **Personal**
- Expandable sections with animated `max-height`: PTO, Attendance, Onboard, Shifts, Payroll
- Active route: gold left accent bar (`#e8912d`), brighter background
- Auto-close drawer on navigation (mobile)
- Dark overlay behind drawer when open

**Navigation inventory (admin):**

| Group | Routes |
|-------|--------|
| Main | `/dashboard`, `/admin` |
| HR — PTO | `/leave`, `/admin/manage-leaves`, `/admin/calendar`, `/admin/monthly-leave-summary` |
| HR — Attendance | `/attendance-summary`, `/break-summary`, `/prayer-summary`, `/admin/manage-attendance`, `/admin/manage-breaks`, `/admin/monthly-attendance`, `/admin/tungsten-in-out`, `/attendance/employee-report` |
| HR — Recruitment | `/recruitment` |
| HR — Onboard | `/add-employee`, `/admin/employee-list`, `/admin/face-enrollment`, `/admin/employee-credentials` |
| HR — Shifts | `/admin/shift-scheduler`, `/admin/shift-management`, `/shift-setup` (+ create/assign sub-routes) |
| HR — Payroll | `/admin/monthly-payroll`, `/admin/commissions`, `/admin/advance`, `/admin/loan`, `/admin/financial-requests` |
| HR — Other | `/admin/events`, `/admin/departments`, `/admin/system-control`, `/admin/company-policy`, `/admin/employment-status-update`, `/admin/tickets` |
| Personal | `/my-info`, `/performance` |

### 4.4 Employee shell — `employee-dashboard/layout.tsx`

**Sidebar tabs (primary nav):**

| Tab | Route |
|-----|-------|
| Dashboard | `/employee-dashboard` |
| My Team | `/employee-dashboard/my-team` |
| My Info | `/employee-dashboard/my-info` |
| Time | `/employee-dashboard/time` |
| Generate Ticket | `/employee-dashboard/generate-ticket` |

**Secondary routes (linked from widgets, not sidebar):**

- `/employee-dashboard/leave`
- `/employee-dashboard/request-loan`
- `/employee-dashboard/request-advance`
- `/employee-dashboard/my-credentials`

**Hero strip (dashboard home only):**

- Time-based greeting ("Good morning/afternoon/evening")
- Employee display name
- Current date (Karachi)
- "Reports to" manager card with avatar

**Attendance dock (persistent widget):**

- Shown on `/employee-dashboard` and `/employee-dashboard/time` only
- Contains `ClockBreakPrayerWidget` + `TardyNoteWidget`
- **Requirement:** Widget must not remount when switching Dashboard ↔ Time (timers and face preload preserved)

**Auth guard:**

- Missing `localStorage.loginId` → redirect `/auth`
- Employee name/id hydrated from API + localStorage cache

---

## 5. Page-Level UX Requirements

### 5.1 Admin Dashboard — `/dashboard`

**Purpose:** Executive snapshot of workforce health.

**Required sections:**

1. **Header banner** — greeting, date chip with live green dot
2. **Animated stat row** — total employees, today's attendance %, open tickets, pending leaves (count-up animation ~700ms)
3. **Quick links** — Add Employee, Leave Requests, Ticket Inbox, Recruitment
4. **Attendance trend** — weekday bar chart + sparkline + conic donut for today %
5. **Employee snapshot** — active / on leave / probation rings
6. **Widget cards** — Support tickets, Leave requests, Financial requests, Birthdays, Announcements

**Real-time:**

- WebSocket subscription for ticket events; list refreshes without manual reload
- Demo query param `?demoTicketToast=1` for QA toast preview

**Acceptance:**

- Stats show "Loading…" until API returns
- Empty widget lists show friendly copy (e.g. "No birthdays in the next 30 days")

### 5.2 Employee Dashboard — `/employee-dashboard` (Nova Bento)

**Layout zones (12-column grid):**

| Zone | Span | Content |
|------|------|---------|
| Stat ribbon | 4 cards | Annual leave, Casual leave, Tardies, Team size — gradient cards with progress rings |
| Pulse strip | Full width | Last 5 **weekdays** (Karachi): day pills + weekly score ring |
| Attendance chart | 8 cols | Bar chart for week hours |
| Leave balance | 4 cols | Ring charts per leave type |
| Calendar | 5 cols | Month grid with late-day markers |
| People | 3 cols | Reports-to + team preview |
| Quick actions | 4 cols | Leave, loan, advance shortcuts |
| Feed | 12 cols | Events, reminders, policies, tickets |

**Attendance week chart — business rules (UI):**

| Day status | Visual | Rule |
|------------|--------|------|
| `onTime` | Green gradient bar | Clocked in, not late |
| `tardy` | Red gradient bar + late dot on pill | `is_late` true |
| `absent` | Grey thin bar | Past weekday, no clock-in |
| `pending` | Dashed purple bar, "…" on pill | **Today** without clock-in yet |

**Data fetch:** Current month `fromDate` → `today` with `employeeId` query (Karachi keys).

**Responsive:**

- ≤1100px: bento cards full width; stat grid 2-col
- ≤560px: stat grid 1-col; smaller day pills

### 5.3 Attendance & time modules (admin)

**Shared pattern** (`break-summary.module.css` and siblings):

- Filter bar: date range, employee search, department filters where applicable
- **Green Excel export** button (prominent, top-right)
- Data table with horizontal scroll on narrow viewports
- `EmployeeTableNameCell` — avatar + name; click opens `EmployeeDetailPopup`

**Pages:**

| Page | Primary UX |
|------|------------|
| `/attendance-summary` | Daily attendance overview |
| `/break-summary` | Break usage report |
| `/prayer-summary` | Prayer break report |
| `/admin/manage-attendance` | Corrections, manual entries |
| `/admin/manage-breaks` | Break administration |
| `/admin/monthly-attendance` | Monthly grid, deductions, OT column |
| `/admin/tungsten-in-out` | External device sync view |
| `/attendance/employee-report` | Per-employee drill-down |

**OT display rule (monthly attendance UI):** Overtime shown/counted only when **≥ 1 hour** beyond assigned shift (`OVERTIME_MIN_SECONDS = 3600`).

### 5.4 Payroll & financial (admin)

| Page | UX focus |
|------|----------|
| `/admin/monthly-payroll` | Monthly sheet, commission integration, export |
| `/admin/commissions` | Commission calculation |
| `/admin/advance` | Advance tracking |
| `/admin/loan` | Loan schedules |
| `/admin/financial-requests` | Unified inbox for employee advance/loan requests |

**Requirement:** Financial request widgets on admin dashboard deep-link to inbox with pending filter.

### 5.5 Leave management

| Surface | UX |
|---------|-----|
| `/leave` | Admin leave overview |
| `/admin/manage-leaves` | Approval workflow |
| `/admin/calendar` | Calendar visualization |
| `/admin/monthly-leave-summary` | Monthly rollup |
| `/employee-dashboard/leave` | Employee self-service apply |

**Requirement:** Leave balance rings on employee dashboard reflect API values; clicking navigates to leave page.

### 5.6 Recruitment & onboarding

| Page | UX |
|------|-----|
| `/recruitment` | Pipeline / applicants |
| `/add-employee` | Multi-step or form-based employee creation |
| `/admin/employee-list` | Searchable roster |
| `/admin/face-enrollment` | Employee picker + live enrollment camera |
| `/admin/employee-credentials` | Login credential management |

**Employee detail sub-routes:** `/employee-details/{personal,contact,emergency,dependents,job,salary,credentials}`

### 5.7 System Control — `/admin/system-control` (alias `/admin/roles-permissions`)

**Tab structure:**

| Tab ID | Label | UX |
|--------|-------|-----|
| `roles` | Org Chart | Drag-drop hierarchy, role cards, photo upload, inline rename, department grouping |
| `permissions` | Permissions | Role selector + searchable employee assignment + per-module permission toggles |
| `features` | Features | Global feature flags table |
| `settings` | Settings | Session timeout, default role, 2-step leave, system control roles |

**Org chart UX requirements:**

- Role cards show tier color accent on footer
- Drag-drop updates parent-child; cycle-safe validation
- Hide role: only card disappears; reports shift up (no orphan lines)
- Photo upload per role card via branding API pattern

**Permissions UX requirements:**

- Expandable feature modules (Attendance, Leave, Payroll, Team, System, etc.)
- Each permission shows label + description from `PERM_HINTS` in `system-control-data.ts`
- Save confirmation via inline toast
- Searchable dropdowns for role and employee assignment

**Note:** Current implementation uses demo/in-memory state for some saves; UI must still behave as if persistent (loading, success toast, error alert).

### 5.8 Ticketing

#### Admin — `/admin/tickets`

- Filters: Pending / All
- Master-detail: list left, thread right (or stacked mobile)
- Actions: Reply, Resolve
- WebSocket live refresh
- "Preview notification" button for QA (`?demoTicketToast=1`)

#### Employee — `/employee-dashboard/generate-ticket`

- Form: category, type, subject, description
- Ticket list with status badges: `pending`, `in_progress`, `resolved`, `closed`, `rejected`
- `TicketThread` messaging component
- Unread admin reply: pulse highlight on list item (~3.5s)

**Status badge colors:**

| Status | Treatment |
|--------|-----------|
| Pending | Purple tint |
| In progress | Blue/info |
| Resolved | Green |
| Closed | Grey |
| Rejected | Red |

### 5.9 Clock / break / prayer — employee widgets

**Component:** `ClockBreakPrayerWidget` (`clock-widgets-slack.module.css`)

**Layout:** 3-card row:

| Card | Color theme | Actions |
|------|-------------|---------|
| Clock In/Out | Green | Opens face verify modal |
| Break | Amber | Confirm modal |
| Prayer | Blue | Confirm modal |

**Responsive:** 3-col → stacked ≤900px → compact ≤520px

**Face verify gate:** `useBiometricGate` — clock actions blocked until modal success

**Tardy note:** `TardyNoteWidget` in dock — late clock-in note entry (Slack-styled)

### 5.10 Face verification UI

**Modal:** `FaceVerifyModal` — fixed overlay `z-index: 10000`, ~420px white card, 18px radius

**Viewport:** `FaceScanViewport` + `FaceScanHud`

**Scan HUD requirements (latest design):**

| Requirement | Specification |
|-------------|---------------|
| Shape position | **Fixed center** — not face-tracking (performance) |
| Shape size | ~68% width × 88% height of viewport — full head fits inside oval |
| Guidance text | **"CENTER FACE IN OVAL"** during scan |
| Color progression | Pink (`rgb(236,72,153)`) → green (`#22c55e`) by verification stage |
| Animation policy | **No CSS keyframe animations**; only color/width transitions |
| Multi-face | Red blocked state, `role="alert"` message |
| Success | Brief green "VERIFIED" (~750ms) before callback |
| Mirror | Video `scaleX(-1)`; user sees mirrored preview |

**Modal states:**

`initializing` → `scanning` → `capturing` → `verifying` → `success` | `blocked` | `adjust`

**Enrollment UI:** `/admin/face-enrollment` — same HUD on admin webcam flow

---

## 6. Shared Component Specifications

### 6.1 Modals

| Component | z-index | Close behavior |
|-----------|---------|----------------|
| FaceVerifyModal | 10000 | Cancel button; backdrop optional |
| Clock/Break/Prayer confirm | 12000 | Yes/No; portal to body |
| EmployeeDetailPopup | 12000 | × button; backdrop click |
| NewRoleModal | — | System control |
| Policy read-more | — | Inline employee dashboard |
| ShellImageUpload | — | Logo/avatar picker |

**Convention:** Backdrop `rgba(15,23,42,0.38–0.55)`; click on card does not close unless specified; backdrop click closes where safe.

### 6.2 Toasts — `TicketToastHost`

| Property | Value |
|----------|-------|
| Position | Bottom-right stack |
| z-index | 10050 |
| Max visible | 4 |
| Auto-dismiss | 9 seconds |
| Trigger | WebSocket `ticket_created`, `ticket_update` |
| Sound | Optional via `ticket-toast-sound.ts` |
| a11y | `aria-live="polite"` |
| Click action | Navigate to relevant ticket page |
| Style | Purple left border, gradient background, avatar, badge |

### 6.3 Avatars — `EmployeeAvatar`

| Size | Usage |
|------|-------|
| sm / md / lg / xl | Tables, hero, org chart |
| Ring variants | purple / green / gold |
| Status dot | online / offline / late (optional) |

### 6.4 Tables

- Wrapper: `.tableWrap` with horizontal scroll
- Sticky header where dataset is long
- Name column always uses `EmployeeTableNameCell` for consistency
- Empty: centered message row, not zero-height table

### 6.5 Empty states — `admin-module-page.module.css`

```
┌─────────────────────────┐
│      (icon bubble)      │
│       Title text        │
│    Description text     │
│   [ optional CTA ]      │
└─────────────────────────┘
```

**Required copy examples:**

- "No pending tickets"
- "No attendance records found"
- "Select an employee"
- "No announcements"

### 6.6 Loading states

| Pattern | When |
|---------|------|
| `"Loading…"` text | Widget headers, lists |
| `"Loading your information…"` | Employee profile |
| `"Initializing sensors…"` | Face HUD |
| Button `disabled` + label change | Upload, submit |
| No skeleton screens | Current standard — do not add skeletons without design approval |

### 6.7 Error states

| Context | Pattern |
|---------|---------|
| Auth form | Inline red text |
| Face verify | Red `.error` text; blocked banner for multi-face |
| API branding save | `window.alert()` |
| Enrollment | `setError()` inline |

---

## 7. Responsive Design Requirements

### 7.1 Breakpoint matrix

| Breakpoint | Components affected | Behavior |
|------------|---------------------|----------|
| **≤1200px** | Shift management, credentials grids | Column reduction |
| **≤1100px** | Employee bento | Single column cards |
| **≤1024px** | Admin + employee shell | Sidebar → drawer; hamburger; overlay |
| **≤980px** | Auth login | Single column |
| **≤900px** | Attendance summary, org chart, face enrollment | Stacked panels |
| **≤768px** | Admin modules, leave, system control | Reduced padding; stacked toolbars |
| **≤560px** | Employee dashboard | 1-col stats; compact pills |
| **≤520px** | Clock widgets | Compact stacked cards |
| **≤480px** | Top bar, auth | Smaller avatar; compact form |

### 7.2 Mobile sidebar drawer

- Off-canvas `translateX(-100%)` → `0` when open
- Width: 272px, max 86vw
- Semi-transparent backdrop; tap closes
- Must close on `pathname` change
- Focus trap: recommended future enhancement

### 7.3 Touch targets

- Minimum interactive height: **44px** for primary buttons on mobile
- Day pills and clock cards: adequate padding for finger tap
- Hamburger menu: full touch area, not just icon glyph

---

## 8. Interaction & Motion

### 8.1 Allowed motion

| Effect | Duration | Usage |
|--------|----------|-------|
| Color transition | 0.35s ease | HUD, nav active, brand elements |
| Width transition | 0.3s ease | Progress bar fill |
| Count-up numbers | 700ms cubic | Dashboard stats |
| Pulse (ticket new) | 3.5s | List item highlight |
| Sidebar dropdown | max-height + opacity | Nav groups |

### 8.2 Prohibited motion (performance)

- CSS `@keyframes` on face scan HUD
- Continuous face-shape tracking loops for UI overlay
- Backdrop blur on fixed top bar (explicitly removed for scroll performance)
- Heavy parallax or page transition animations

---

## 9. Accessibility Requirements

### 9.1 Baseline (implemented)

- `lang="en"` on HTML root
- `aria-label` on menu toggle, profile, toast dismiss
- `aria-live="polite"` on toast stack
- `role="alert"` on face verify blocked state
- `role="menu"` / `menuitem` on profile dropdown
- `aria-hidden` on decorative HUD/chart elements
- Keyboard: Enter/Space on hamburger and toast cards

### 9.2 Gaps & recommended improvements

| Gap | Priority | Requirement |
|-----|----------|-------------|
| Sidebar nav keyboard roving tabindex | Medium | Full keyboard nav without mouse |
| Table `scope` on headers | Low | Screen reader table context |
| Focus trap in modals | Medium | Tab cycle within modal |
| Color-only status | Medium | Pair color with icon/text (partially done) |
| Contrast on `#64748b` muted text | Low | Verify WCAG AA on small text |

---

## 10. Real-Time & Notifications

### 10.1 WebSocket — `/api/ws`

| Event | Admin UX | Employee UX |
|-------|----------|-------------|
| `ticket_created` | Toast + dashboard widget refresh | — |
| `ticket_update` | Toast if admin view | Toast on employee dashboard |

### 10.2 Demo / QA routes

| Route | Purpose |
|-------|---------|
| `/notification-demo` | Toast style preview |
| `/demo-ticket-toast` | Interactive toast demo |
| `?demoTicketToast=1` on dashboard/tickets/employee-dashboard | Live toast simulation |

---

## 11. Branding & Customization

**API:** `app/shell-branding-api.ts`

| Asset | Who can upload | Where shown |
|-------|----------------|-------------|
| Company logo | Admin | Top bar (both shells) |
| Admin avatar | Admin | Admin profile |
| Employee avatar | Employee | Employee profile, hero |
| Org chart photos | System control | Role cards |

**Requirement:** Upload shows loading on button; failure uses alert; success updates image without full page reload.

---

## 12. Non-Functional UX Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-UX-01 | First face verify after tab open | Models preload in background; clock buttons not blocked during download |
| NFR-UX-02 | Face scan modal | No keyframe animations; centered guide only |
| NFR-UX-03 | Dashboard initial paint | Show loading text within 100ms of navigation |
| NFR-UX-04 | Date consistency | All HR dates in Asia/Karachi |
| NFR-UX-05 | Offline fonts | System font stack only in production |
| NFR-UX-06 | Toast stacking | Max 4; oldest dismissed first |
| NFR-UX-07 | Excel export | One-click from filter bar; green button visible without scroll |

---

## 13. QA Acceptance Checklist (UI)

### 13.1 Global

- [ ] `/auth` loads split layout; mobile collapses at 980px
- [ ] Sidebar drawer works at 1024px; closes on route change
- [ ] Company logo renders from branding API
- [ ] Logout returns to `/auth`

### 13.2 Admin dashboard

- [ ] Stat cards animate on load
- [ ] Ticket widget shows pending count
- [ ] WebSocket toast fires on new ticket (with demo flag or live event)

### 13.3 Employee dashboard

- [ ] Week chart shows last 5 Karachi weekdays
- [ ] Today without clock-in shows **pending** (dashed), not absent
- [ ] Clock widget persists when switching to Time tab and back
- [ ] Face modal shows centered oval + "CENTER FACE IN OVAL"

### 13.4 System Control

- [ ] Org chart drag-drop works; hide role shifts children up
- [ ] Permissions tab searchable dropdowns function
- [ ] Tab switch preserves scroll where reasonable

### 13.5 Reports

- [ ] Excel export button visible and styled green
- [ ] Employee name click opens detail popup
- [ ] Empty tables show message

### 13.6 Tickets

- [ ] Admin reply reflects in employee thread
- [ ] Toast appears bottom-right with sound (if enabled)
- [ ] Status badges match spec colors

---

## 14. Known Gaps & Future UX Work

| Item | Status | Notes |
|------|--------|-------|
| Role dashboards (`/bod-dashboard`, `/hod-dashboard`, etc.) | Not built | Auth redirects exist; pages missing |
| Server-side RBAC enforcement | Partial | UI shows controls; API not uniformly gated |
| System Control persistence | Demo-grade | UI complete; backend wiring planned |
| Legacy `/` login | Deprecated | Should redirect to `/auth` |
| Skeleton loaders | Not used | Consider for slow reports only |
| Face HUD dynamic tracking | Reverted | Centered guide chosen for speed |

---

## 15. File Reference (Design Implementation)

| Area | Primary files |
|------|---------------|
| Global tokens | `app/globals.css` |
| Shell layout | `app/layout-dashboard.tsx`, `app/layout-dashboard.module.css` |
| Admin dashboard | `app/dashboard/page.tsx`, `app/dashboard/dashboard.module.css` |
| Employee dashboard | `app/employee-dashboard/page.tsx`, `employee-dashboard.module.css` |
| Employee shell | `app/employee-dashboard/layout.tsx`, `emp-shell.module.css` |
| Auth | `app/auth/page.tsx`, `app/auth/login.module.css` |
| Admin reports | `app/break-summary/break-summary.module.css` |
| System Control | `app/admin/roles-permissions/*`, `system-control-data.ts` |
| Face verify | `app/components/FaceVerifyModal.tsx`, `FaceScanHud.tsx`, `face-*-modal.module.css` |
| Clock widgets | `app/components/ClockBreakPrayer.tsx`, `clock-widgets-slack.module.css` |
| Toasts | `app/components/TicketToastHost.tsx`, `admin-ticket-toast.module.css` |
| Tickets | `app/admin/tickets/page.tsx`, `app/employee-dashboard/generate-ticket/` |
| Shared admin pages | `app/components/admin-module-page.module.css` |
| Avatars / tables | `EmployeeAvatar.tsx`, `EmployeeTableNameCell.tsx`, `EmployeeDetailPopup.tsx` |

---

## 16. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jul 2026 | Interact HRM Team | Initial UI/UX TRD from latest implemented design |

**Export to Word/PDF:** Open this file in Microsoft Word or VS Code Markdown PDF extension. For stakeholder distribution, print from browser with table of contents navigation.

---

*End of document*
