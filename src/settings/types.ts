// All persisted Pulse preferences live here. Activity and notification content
// belong to runtime state, not to the settings record.

export interface PulseSettings {
  // General
  startWithWindows: boolean;
  position: {
    horizontal: 'left' | 'center' | 'right';
    verticalOffset: number;
    display: 'primary' | 'active' | `monitor:${string}`;
  };

  // Notifications
  notificationsEnabled: boolean;
  showNotificationPreview: boolean;
  notificationHistory: boolean;
  notificationDuration: 3000 | 4500 | 6000; // ms

  // Privacy
  cameraMicIndicator: boolean;

  // Downloads
  showDownloads: boolean;
  showDownloadSpeed: boolean;
  showDownloadETA: boolean;

  // Clipboard — metadata-only activity by default; preview is explicit opt-in.
  clipboardActivity: boolean;
  clipboardPreview: boolean;
  clipboardDuration: 1500 | 2000 | 2500;

  // Temporary Windows system activities; metadata is transient only.
  bluetoothActivity: boolean;
  usbActivity: boolean;
  screenshotActivity: boolean;

  // Advanced
}
