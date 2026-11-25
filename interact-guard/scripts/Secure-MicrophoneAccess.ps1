#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Lock Windows microphone access so standard employees cannot turn off
  app / desktop-app mic permission in Settings.

  This does NOT hide the taskbar mic privacy icon or the app name in the
  Windows privacy flyout (those are OS privacy indicators).

  Effect:
  - Force Allow microphone for Windows apps (GPO-style)
  - Allow desktop (Win32) apps mic via ConsentStore
  - Hide Settings → Privacy → Microphone page from non-admin users (optional)

.NOTES
  Domain/MDM can override. Local Administrators can still change policy.
#>
param(
  [switch]$HideSettingsPage = $true,
  [switch]$Revert
)

$ErrorActionPreference = "Stop"
$PolicyKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy"
$ConsentMic = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone"
$ConsentNonPackaged = "$ConsentMic\NonPackaged"
$ExplorerPol = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer"

function Ensure-Key([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }
}

Write-Host "=== Interact Guard — Secure Microphone Access ==="

if ($Revert) {
  Write-Host "Reverting Force-Allow mic policy..."
  if (Test-Path $PolicyKey) {
    Remove-ItemProperty -Path $PolicyKey -Name "LetAppsAccessMicrophone" -ErrorAction SilentlyContinue
  }
  if (Test-Path $ExplorerPol) {
    $vis = (Get-ItemProperty -Path $ExplorerPol -Name "SettingsPageVisibility" -ErrorAction SilentlyContinue).SettingsPageVisibility
    if ($vis) {
      $parts = @($vis -split ';' | Where-Object {
        $_ -and ($_ -notmatch '^\s*hide:privacy-microphone\s*$')
      })
      if ($parts.Count) {
        Set-ItemProperty -Path $ExplorerPol -Name "SettingsPageVisibility" -Value ($parts -join ';') -Type String
      } else {
        Remove-ItemProperty -Path $ExplorerPol -Name "SettingsPageVisibility" -ErrorAction SilentlyContinue
      }
    }
  }
  Write-Host "Done (reverted). gpupdate /force recommended."
  exit 0
}

Ensure-Key $PolicyKey
# 1 = Force Allow (user cannot disable in Settings)
Set-ItemProperty -Path $PolicyKey -Name "LetAppsAccessMicrophone" -Value 1 -Type DWord
Write-Host "Set LetAppsAccessMicrophone = Force Allow (1)"

Ensure-Key $ConsentMic
Set-ItemProperty -Path $ConsentMic -Name "Value" -Value "Allow" -Type String
Ensure-Key $ConsentNonPackaged
Set-ItemProperty -Path $ConsentNonPackaged -Name "Value" -Value "Allow" -Type String
Write-Host "ConsentStore microphone + NonPackaged = Allow"

# Soften per-user Deny if present (best-effort; HKCU for logged-on users is harder from SYSTEM)
try {
  $cu = "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone"
  if (Test-Path $cu) {
    Set-ItemProperty -Path $cu -Name "Value" -Value "Allow" -Type String -ErrorAction SilentlyContinue
  }
  $cuNp = "$cu\NonPackaged"
  if (Test-Path $cuNp) {
    Set-ItemProperty -Path $cuNp -Name "Value" -Value "Allow" -Type String -ErrorAction SilentlyContinue
  }
} catch { }

if ($HideSettingsPage) {
  Ensure-Key $ExplorerPol
  $hide = "hide:privacy-microphone"
  $existing = (Get-ItemProperty -Path $ExplorerPol -Name "SettingsPageVisibility" -ErrorAction SilentlyContinue).SettingsPageVisibility
  if ([string]::IsNullOrWhiteSpace($existing)) {
    Set-ItemProperty -Path $ExplorerPol -Name "SettingsPageVisibility" -Value $hide -Type String
  } elseif ($existing -notmatch 'privacy-microphone') {
    Set-ItemProperty -Path $ExplorerPol -Name "SettingsPageVisibility" -Value "$existing;$hide" -Type String
  }
  Write-Host "Settings page privacy-microphone hidden for users"
}

try {
  Start-Process gpupdate.exe -ArgumentList "/target:computer","/force" -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
} catch { }

Write-Host ""
Write-Host "Done. Standard users should no longer be able to turn off mic access in Settings."
Write-Host "Taskbar mic icon / app name in privacy flyout still show (Windows OS) — that is expected."
Write-Host "Revert: Secure-MicrophoneAccess.ps1 -Revert"
