import type { PulseSettings } from './types';

export const DEFAULT_SETTINGS: PulseSettings = {
  // General
  startWithWindows: true,
  position: { horizontal: 'center', verticalOffset: 10, display: 'active' },

  // Notifications
  notificationsEnabled: true,
  showNotificationPreview: false, // privacy: OFF by default
  notificationDuration: 4500,

  // Privacy — conservative defaults
  cameraMicIndicator: true,

  // Downloads
  showDownloads: true,
  showDownloadSpeed: false,
  showDownloadETA: false,

  clipboardActivity: true,
  clipboardPreview: false,
  clipboardDuration: 2000,
  bluetoothActivity: true,
  usbActivity: true,
  screenshotActivity: true,

};
