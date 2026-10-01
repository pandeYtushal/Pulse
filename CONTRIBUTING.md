# Contributing to Pulse

Thanks for taking the time to improve Pulse. Contributions should preserve the compact Windows-first experience and keep native system access inside the Rust/Tauri layer.

## Before you start

- Check existing [issues](https://github.com/pandeYtushal/Pulse/issues) before starting work.
- For larger changes, describe the problem and intended approach before opening a pull request.
- Do not include real notification text, clipboard contents, private screenshots, credentials, or personal data in issues, logs, or test fixtures.

## Local development

Use a Windows PC with Node.js 22+, Rust stable/MSVC, WebView2, and the Visual Studio C++ build tools. The minimum supported Windows release has not yet been formally verified.

```powershell
npm install
npm run tauri dev
```

Before opening a pull request, run:

```powershell
npm run typecheck
npm test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

For installer changes, also run `npm run build:windows` and describe the result. Avoid drive-by rewrites of working Windows integrations; include focused tests for state or lifecycle changes.

## Pull requests

Keep each pull request focused. Explain the user-visible change, the Windows behavior affected, how it was verified, and any limitations. Include sanitized screenshots only when they help review a visual change.

## Licensing

The repository does not yet include a license. Maintainers need to choose and add a license before accepting contributions under an open-source contribution model.
