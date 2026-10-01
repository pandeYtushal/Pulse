export const EventType = {
  // Media
  MEDIA_STARTED: 'MEDIA_STARTED',
  MEDIA_CHANGED: 'MEDIA_CHANGED',
  MEDIA_PLAYING: 'MEDIA_PLAYING',
  MEDIA_PAUSED: 'MEDIA_PAUSED',
  MEDIA_STOPPED: 'MEDIA_STOPPED',

  // Notifications
  NOTIFICATION_RECEIVED: 'NOTIFICATION_RECEIVED',
  NOTIFICATION_UPDATED: 'NOTIFICATION_UPDATED',
  NOTIFICATION_DISMISSED: 'NOTIFICATION_DISMISSED',

  // Downloads
  DOWNLOAD_STARTED: 'DOWNLOAD_STARTED',
  DOWNLOAD_PROGRESS: 'DOWNLOAD_PROGRESS',
  DOWNLOAD_COMPLETED: 'DOWNLOAD_COMPLETED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  DOWNLOAD_CANCELED: 'DOWNLOAD_CANCELED',

  // Power
  POWER_SOURCE_CHANGED: 'POWER_SOURCE_CHANGED',
  CHARGING_STARTED: 'CHARGING_STARTED',
  CHARGING_STOPPED: 'CHARGING_STOPPED',
  BATTERY_LOW: 'BATTERY_LOW',
  BATTERY_FULL: 'BATTERY_FULL',

  // Privacy (Ambient)
  CAMERA_ACTIVE: 'CAMERA_ACTIVE',
  CAMERA_INACTIVE: 'CAMERA_INACTIVE',
  MICROPHONE_ACTIVE: 'MICROPHONE_ACTIVE',
  MICROPHONE_INACTIVE: 'MICROPHONE_INACTIVE',

  // Temporary clipboard activity (payload contains metadata only by default)
  CLIPBOARD_CHANGED: 'CLIPBOARD_CHANGED',
  CLIPBOARD_CLEARED: 'CLIPBOARD_CLEARED',
  BLUETOOTH_ACTIVITY: 'BLUETOOTH_ACTIVITY',
  USB_ACTIVITY: 'USB_ACTIVITY',
  SCREENSHOT_ACTIVITY: 'SCREENSHOT_ACTIVITY',
} as const;

export type EventType = typeof EventType[keyof typeof EventType];

export type EventPriority = 'CRITICAL' | 'IMPORTANT' | 'HIGH' | 'NORMAL' | 'LOW' | 'AMBIENT';

export interface PulseEvent {
  id: string; // A stable/unique identifier for this event sequence (e.g. download-123)
  type: EventType;
  source: string; // The provider that emitted the event (e.g., 'MediaProvider', 'DownloadProvider')
  timestamp: number;
  priority: EventPriority;
  payload: any; // Context-specific data
}
