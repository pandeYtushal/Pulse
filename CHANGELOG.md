# Changelog

Changes for each release will be documented here. Version 1.0.0 was published with application metadata 0.1.0; version 1.0.1 corrects the version mismatch.

## [1.0.1] - 2026-10-02

### Fixed

- Made the production window visible from startup so a delayed frontend IPC call cannot leave Pulse hidden.
- Removed scale-based zoom from music hover controls; replaced it with a subtle fade and slide.

### Changed

- Website download follows the latest published `Pulse-Setup.exe` installer.
- GitHub Pages deploys automatically when changes reach `main`.

## [Unreleased]

### Added

- Static Pulse landing page with a verified repository/releases fallback and browser-setup guide.
- Tag-triggered Windows release workflow that prepares an installer and SHA-256 checksum.
- Windows CI for frontend checks, Rust checks, and NSIS installer artifacts.
- Contribution, security, and issue-reporting guidance.
- Manual GitHub Pages deployment and release checklists.

### Changed

- Replaced the development-focused README with user installation, architecture, privacy, and contributor guidance.
- Documented actual data handling and unpublished extension/release status.
