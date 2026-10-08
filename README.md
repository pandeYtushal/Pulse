# Pulse

**A quiet system layer for Windows.** Pulse brings media, notifications, and system activity into one compact surface at the top of your screen.

## What Pulse does

Pulse is a Windows desktop application built with Tauri 2, React, TypeScript, and Rust. The React interface presents the current activity; native Rust services read supported Windows system state and report it to the interface.

Pulse can show Windows media sessions and playback controls, notification activity and optional local notification history, optional notification previews, clipboard activity and optional sanitized text previews, power/battery alerts, Bluetooth and USB connection changes, screenshot events, and browser download progress through the optional extension source in `extension/`.

Pulse also reads Windows camera and microphone usage state to display an indicator. It does not capture audio or video. See [PRIVACY.md](PRIVACY.md) for data handling, including the browser extension's access to web notifications.

## Screenshots

No product screenshots are included yet. The website will use real application captures when they are available.

## Installation

### For Windows users

Download the latest Windows installer from [GitHub Releases](https://github.com/pandeYtushal/Pulse/releases/latest), run it, and complete Pulse's first-run setup. Pulse then appears at the top of the screen. The optional **Start Pulse with Windows** setting is available in Settings.

### For developers

See [Development](#development) for prerequisites and source-build instructions. Normal users do not need Node.js, Rust, or a terminal once a public installer is available.

## Features

### Everyday

- Windows media metadata and playback controls
- Windows notification activity; previews are opt-in and sensitive-app message bodies are redacted
- Clipboard change indicators and optional sanitized text previews
- Browser download progress through the source-only extension

### Windows system activity

- Battery and power events
- Bluetooth, including connected audio-device identification where available
- USB connection events
- Screenshot events for the Windows Screenshots folder
- Camera and microphone usage indicators based on Windows privacy state

Features depend on Windows permissions, available APIs, device support, and (for browser downloads) installing and configuring the optional extension. The Chrome extension is **not** published in the Chrome Web Store. Pulse does not currently provide system-volume controls.

## Development

### Requirements

- A Windows PC (the minimum supported Windows release has not yet been formally verified)
- Node.js 22 or newer
- Rust stable with the MSVC Windows target and Visual Studio C++ Build Tools
- WebView2 Runtime

Install dependencies and run the desktop app in development mode:

```powershell
npm install
npm run tauri dev
```

Run checks:

```powershell
npm run typecheck
npm test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## Production build

Build the Windows NSIS installer:

```powershell
npm run build:windows
```

The installer is written under `src-tauri/target/release/bundle/nsis/`; the bundled executable is `src-tauri/target/release/Pulse.exe`. Production uses the built `dist/` frontend; Vite and Node.js are build-time tools, not application runtime requirements.

## Architecture

```text
Windows APIs → Rust services → Tauri events → React providers and activity engine → Pulse presentation
```

- `src-tauri/src/` owns native Windows listeners, the top-edge window, tray, global shortcut, startup registration, and the loopback browser bridge.
- `src/engine/providers/` owns Tauri event subscriptions and converts native events to typed activity events.
- `src/engine/activities/` applies activity lifecycles and presentation priority.
- `src/store/` holds current system and temporary presentation data; `src/settings/` persists user settings and onboarding completion.
- `website/` is a standalone static landing page, separate from the Tauri frontend in `src/`.

## Website

The static landing page is in [`website/`](website/). Its Download button links directly to the latest `Pulse-Setup.exe` Windows installer.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for local checks, [SECURITY.md](SECURITY.md) for responsible vulnerability reporting, and [RELEASING.md](RELEASING.md) for the release checklist. Windows CI validates main-branch changes; the tagged release workflow publishes GitHub Releases.

## License

No license file is present. Until the maintainers add one, the repository has no stated open-source license; do not assume permission to redistribute or relicense it.

## Version

The current application version is `1.0.2`. The earlier `v1.0.0` release contained an installer labeled `0.1.0`; the `v1.0.1` release aligned the tag and installer versions.
