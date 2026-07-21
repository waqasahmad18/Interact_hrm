# Interact Presence Agent

Windows tray agent for Interact HRM.

## How presence works (current)

1. **Idle** (no mouse/keyboard for N seconds — admin/settings driven)
2. Agent opens **Chrome/Edge** to HRM: `/presence-silent?employeeId=…`
3. Same face-api models as clock/break (`lib/face-client-engine.ts`)
4. Descriptor checked via **`POST /api/biometric/presence-check`**
5. **Match** → seated toast; **No match** → “Are you there?” flow

## Requirements

- .NET 8 Desktop Runtime
- Chrome or Edge (face check)
- Webcam + face enrollment on the target HRM
- Tray → **Set Employee ID**

## Auto-update

1. Admin → **Presence / Idle** → set version + upload `InteractPresence.exe` → **Publish agent update**
2. Running agents poll `/api/presence-agent/version` (~every 10 min, and on start)
3. If remote version is newer and binary exists → download → replace → restart

Tray → **Check for updates…** forces a check (still throttled lightly).

## Auto-start & exit lock

- On start, agent adds itself to Windows **Startup** (runs again after PC login/restart).
- **Exit** and **Disable auto-start** ask for admin password (synced from HRM Admin → Presence / Idle).
- Default password if unset: `InteractAdmin`
- Note: Task Manager “End task” can still kill the process (Windows limitation without a service).

## Point at Staging, Main HRM, or Localhost

Tray menu:

- **Use Staging HRM** → `https://192.168.10.6:8443`
- **Use Main HRM** → `https://192.168.10.40:8443`
- **Use Localhost HRM** → `http://localhost:3000`
- **Set HRM URL…** → any custom base URL

Only one target at a time (whichever is selected in settings). Admin Presence / Idle settings are read from that HRM.

Settings file: `%LocalAppData%\InteractPresence\settings.json` (`HrmBaseUrl`)

## Build & run

```powershell
cd desktop-presence-agent\InteractPresence
dotnet build -c Release
.\bin\Release\net8.0-windows\InteractPresence.exe
```
