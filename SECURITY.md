# Security policy

## Reporting a vulnerability

Please do not report security vulnerabilities in public issues or pull requests. The public repository is [pandeYtushal/Pulse](https://github.com/pandeYtushal/Pulse). Use its **Security → Report a vulnerability** flow for a private report if private vulnerability reporting is enabled. Include the affected version or commit, Windows version, impact, and a minimal reproduction. Do not include notification text, clipboard contents, credentials, or other personal data.

There is no separate security contact configured. Repository maintainers should enable private vulnerability reporting before announcing a public release. If the private reporting option is not available, do not post sensitive details publicly; contact the maintainers through a private channel first.

## Scope

Reports involving native Windows listeners, Tauri commands and events, the localhost download/notification bridge, settings persistence, installer behavior, or the optional browser extension are especially relevant. The local bridge binds to loopback and is intended for the extension; it does not currently authenticate other local processes.
