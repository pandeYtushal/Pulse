# Security policy

## Reporting a vulnerability

Please do not report security vulnerabilities in public issues or pull requests. Once this project is hosted on GitHub, use the repository's **Security → Report a vulnerability** flow for a private report. Include the affected version or commit, Windows version, impact, and a minimal reproduction. Do not include notification text, clipboard contents, credentials, or other personal data.

There is currently no verified public repository URL or separate security contact configured. If private vulnerability reporting is unavailable when the repository is published, maintainers should configure it before announcing the public release.

## Scope

Reports involving native Windows listeners, Tauri commands and events, the localhost download/notification bridge, settings persistence, installer behavior, or the optional browser extension are especially relevant. The local bridge binds to loopback and is intended for the extension; it does not currently authenticate other local processes.
