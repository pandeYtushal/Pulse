# Pulse privacy notes

Pulse reads Windows media, notification, clipboard, device, power, and camera/microphone activity so it can display temporary system status. The native listeners and presentation pipeline run on this device. Pulse has no analytics or remote API integration.

## Notifications

- Notification access uses the Windows UserNotificationListener permission. Pulse continues running if the permission is unavailable.
- Notification text is held in process memory while it is being displayed or deduplicated. It is not written to Pulse settings or a notification history.
- Previews are off by default. A small in-memory fingerprint is used to suppress repeat Windows snapshots; it is not cryptographic and is not persisted.
- A built-in sensitive-app list hides message bodies even when previews are on.
- The optional native media diagnostic command writes the current player's title, artist, playback status, and timeline to the process console. Do not share diagnostic output until you have reviewed and redacted it. Normal playback logs do not intentionally print notification content.
- The optional `extension/` browser bridge injects a small script on visited pages to observe calls to the page's `Notification` API. It forwards notification title/body and page hostname to the local Pulse process at `127.0.0.1:40523`. This data remains on the device, but the extension can observe those web notification contents. The extension is separate from the desktop app and can be disabled by removing it from the browser.

## Other activity

- Clipboard text previews are opt-in, sanitized, and temporary. Pulse does not keep clipboard history.
- Download events contain a basename and progress metadata; they are sent from the optional browser extension to the local bridge.
- Screenshot detection watches for Windows screenshot filename patterns and reports an activity event; Pulse does not read or upload screenshot image contents.
- Camera and microphone integration reads Windows privacy-use state only. Pulse does not capture audio or video.
- Pulse settings, including onboarding completion, are persisted by the WebView using browser local storage. Notification, media, and clipboard contents are not stored there.
- Pulse has no file-based diagnostic upload or crash-reporting service configured. Console logs are local process output; some diagnostic commands can print media metadata.

Pulse does not send notification or clipboard content to an AI service, analytics provider, or remote server.
