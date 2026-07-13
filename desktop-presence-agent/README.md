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

## Point at Staging or Localhost

Tray menu:

- **Use Staging HRM** → `https://192.168.10.6:8443`
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
