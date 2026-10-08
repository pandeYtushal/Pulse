# Changelog

Changes for each release will be documented here. Version 1.0.0 was published with application metadata 0.1.0; version 1.0.1 corrected the version mismatch.

## [1.0.1] - 2026-10-02

### Fixed

- Made the production window visible from startup so a delayed frontend IPC call cannot leave Pulse hidden.
- Removed scale-based zoom from music hover controls; replaced it with a subtle fade and slide.

### Changed

- Website download follows the latest published `Pulse-Setup.exe` installer.
- GitHub Pages deploys automatically when changes reach `main`.

## [1.0.2] - 2026-10-02

### Added

- Onboarding controls for Pulse placement, monitor selection, vertical offset, and privacy preferences.
- Animated marketing site with an updated installer download callout.

### Fixed

- Reopening onboarding restores its native click area so its controls remain interactive.
- Onboarding navigation ignores rapid repeat clicks instead of skipping steps.
- Privacy switches visibly move their indicators when toggled.
- Improved position recovery across display selection, DPI, and work-area changes.

### Changed

- Updated the website and application metadata for the v1.0.2 installer release.

## [1.0.3] - 2026-10-08

### Added

- Optional local notification history with a 50-entry limit and a clear-history control.
- A smooth top-edge startup reveal in development and production builds.

### Fixed

- Preserved onboarding completion when settings are restored at startup.
- Collapsed rapid duplicate USB connection events into one visible activity.
- Delivered Windows notifications from change events instead of waiting for the next full poll.
- Prevented the white flash while the transparent Windows window initializes.

### Changed

- Removed the unused Tauri opener integration and obsolete window commands.
- Updated privacy documentation to describe notification history and local storage.

### Added

- Static Pulse landing page with a verified repository/releases fallback and browser-setup guide.
- Tag-triggered Windows release workflow that prepares an installer and SHA-256 checksum.
- Windows CI for frontend checks, Rust checks, and NSIS installer artifacts.
- Contribution, security, and issue-reporting guidance.
- Manual GitHub Pages deployment and release checklists.

### Changed

- Replaced the development-focused README with user installation, architecture, privacy, and contributor guidance.
- Documented actual data handling and unpublished extension/release status.

## [Unreleased]
