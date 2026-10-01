# Preparing a Pulse release

The repository does not yet have a verified GitHub URL or a published release. The CI workflow builds and tests the Windows NSIS installer and stores it as a temporary workflow artifact. It does not create a release or publish the installer.

## Release checklist

1. Confirm the real GitHub repository is configured and Actions are enabled.
2. Review the pending changes and update `CHANGELOG.md`.
3. Set the same version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
4. Run the checks in `CONTRIBUTING.md` and `npm run build:windows` on Windows.
5. Create and push a matching version tag (for example, `v0.1.0`) only after maintainers approve that release number.
6. Review the Windows CI artifact. For the first public release, create a GitHub Release manually, attach the tested NSIS installer, and publish reviewed release notes.
7. Configure `WINDOWS_DOWNLOAD_URL` in `website/config.js` to the exact HTTPS release asset URL, then deploy the website using the manual Pages workflow after enabling GitHub Pages with the Actions source.

The repository has no code-signing certificate or secret configured. This workflow does not sign binaries, publish GitHub Releases automatically, or create update-signing keys. Decide on signing and distribution requirements before advertising the installer as a production download. No signing secret is required for the current CI-only artifact build.
