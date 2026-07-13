# Interact Presence Agent

Windows tray agent for Interact HRM.

## How presence works (current)

1. **Idle** (no mouse/keyboard for N seconds — default 10 for testing)
2. Agent opens a **hidden WebView2** to HRM: `/presence-silent?employeeId=…`
3. That page uses the **same face-api models** as clock/break (`lib/face-client-engine.ts`)
4. Descriptor is checked via **`POST /api/biometric/presence-check`** against **face enrollment**
5. **Match** → no popup (at seat even if idle)
6. **No match** (twice) → “Are you there?” notification

OpenCV is **not** used.

## Requirements

- .NET 8 SDK / runtime
- WebView2 Runtime (usually already on Windows 10/11)
- **HRM running** locally: `npm run dev` → `http://localhost:3000`
- Employee face **enrolled** in HRM (same as clock-in)
- Tray → **Set Employee ID** (must match enrolled employee)

## Build & run

```powershell
cd desktop-presence-agent
dotnet build -c Release
.\InteractPresence\bin\Release\net8.0-windows\InteractPresence.exe
```

Settings: `%LocalAppData%\InteractPresence\settings.json`
