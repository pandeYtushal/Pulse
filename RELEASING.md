# Preparing a Pulse release

The public repository is [pandeYtushal/Pulse](https://github.com/pandeYtushal/Pulse). Version `v1.0.0` is published; its installer asset is named `Pulse_0.1.0_x64-setup.exe`. The ordinary CI workflow builds and tests the Windows NSIS installer as a temporary artifact. The tagged release workflow publishes a release only after a matching version tag is pushed.

## Release checklist

1. Review the changes and update `CHANGELOG.md` for the release.
2. Ensure the same semantic version is set in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
3. Run the checks in `CONTRIBUTING.md` and `npm run build:windows` on Windows.
4. Confirm the local NSIS output is named `Pulse_<version>_x64-setup.exe` and test that installer.
5. Push a matching version tag such as `v1.0.1` only after reviewing the version and release notes. The tagged release workflow verifies the version, builds the installer, and attaches `Pulse-Setup.exe` plus its SHA-256 checksum to the GitHub Release.
6. After GitHub shows the new release asset, update `WINDOWS_DOWNLOAD_URL` in `website/config.js` to `https://github.com/pandeYtushal/Pulse/releases/latest/download/Pulse-Setup.exe`.
7. GitHub Pages deploys automatically on pushes to `main` once Pages is enabled with the Actions source; the workflow can also be run manually.

The application is currently unsigned: Windows reports the built executable as not digitally signed. No code-signing certificate or secret is configured. The release workflow does not sign binaries or create update-signing keys. Configure signing with securely stored secrets before broad public distribution; never commit certificates or private keys.
