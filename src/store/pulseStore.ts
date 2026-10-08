import { create } from 'zustand';

type PulseMode = 'idle' | 'music' | 'notification' | 'expanded-music' | 'expanded-notification' | 'download' | 'expanded-download' | 'hardware-alert' | 'expanded-hardware' | 'clipboard' | 'expanded-clipboard' | 'system-activity' | 'settings';

export interface MediaState {
  title?: string;
  artist?: string;
  album?: string;
  album_art?: string;
  duration: number;
  position: number;
  playback_status: string;
  can_play: boolean;
  can_pause: boolean;
  can_skip_previous: boolean;
  can_skip_next: boolean;
  timestamp: number;
}

export interface PulseNotification {
  id: string;
  appName: string;
  title: string;
  body: string;
  timestamp: number;
  icon?: string;
}

const NOTIFICATION_HISTORY_KEY = 'pulse-notification-history-v1';
const MAX_NOTIFICATION_HISTORY = 50;

function readNotificationHistory(): PulseNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATION_HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is PulseNotification => {
      if (typeof item !== 'object' || item === null) return false;
      const notification = item as Partial<PulseNotification>;
      return typeof notification.id === 'string'
        && typeof notification.appName === 'string'
        && typeof notification.title === 'string'
        && typeof notification.body === 'string'
        && typeof notification.timestamp === 'number';
    }).slice(0, MAX_NOTIFICATION_HISTORY);
  } catch {
    // Local storage can be unavailable or contain old/corrupt data.
    return [];
  }
}

function writeNotificationHistory(history: PulseNotification[]) {
  try {
    localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn('[Notification] Could not save local history.', error);
  }
}

export interface DownloadItem {
  id: string;
  filename: string;
  status: 'in_progress' | 'complete' | 'interrupted' | string;
  downloadedBytes: number;
  totalBytes: number | null;
  speed: number | null;
  source: string;
  timestamp: number;
  paused: boolean;
  canResume: boolean;
  error?: string;
}

export interface PrivacyState {
  microphone_active: boolean;
  camera_active: boolean;
  active_apps: string[];
}

export interface HardwareAlert {
  type: 'battery';
  data: any;
}

export interface ClipboardData {
  id: string;
  kind: 'text' | 'image' | 'file' | 'multiple_files' | 'other';
  preview?: string | null;
  fileCount?: number | null;
}

export interface SystemActivityData {
  id: string;
  kind: 'bluetooth' | 'usb' | 'screenshot';
  action?: 'connected' | 'disconnected';
  deviceName?: string;
  deviceClass?: 'audio' | 'keyboard' | 'mouse' | 'controller' | 'phone' | 'storage' | 'camera' | 'other';
}

interface PulseStore {
  mode: PulseMode;
  media: MediaState | null;
  notifications: PulseNotification[];
  downloads: DownloadItem[];
  completedDownload: DownloadItem | null;
  hardwareAlert: HardwareAlert | null;
  clipboardData: ClipboardData | null;
  systemActivity: SystemActivityData | null;
  notificationsEnabled: boolean;
  showNotificationContent: boolean;
  notificationHistoryEnabled: boolean;
  notificationHistory: PulseNotification[];
  sensitiveApps: string[];
  privacy: PrivacyState;
  setNotificationsEnabled: (enabled: boolean) => void;
  setShowNotificationContent: (enabled: boolean) => void;
  setNotificationHistoryEnabled: (enabled: boolean) => void;
  clearNotificationHistory: () => void;
  setMode: (mode: PulseMode) => void;
  setMedia: (media: MediaState | null) => void;
  setPrivacy: (privacy: PrivacyState) => void;
  addNotification: (notification: PulseNotification) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  updateDownload: (download: DownloadItem, eventType: string) => void;
  finishDownload: (download: DownloadItem) => void;
  clearDownloadCompletion: (id: string) => void;
  removeDownload: (id: string) => void;
  clearDownloads: () => void;
  setHardwareAlert: (alert: HardwareAlert | null) => void;
  clearHardwareAlert: () => void;
  setClipboardData: (data: ClipboardData | null) => void;
  setSystemActivity: (data: SystemActivityData | null) => void;
}

export const usePulseStore = create<PulseStore>((set) => {
  const consumedNotificationIds = new Set<string>();
  const terminalDownloadIds = new Set<string>();
  const rememberTerminalId = (ids: Set<string>, id: string) => {
    ids.delete(id);
    ids.add(id);
    // Keep recent tombstones bounded while covering delayed OS/bridge events.
    if (ids.size > 4096) ids.delete(ids.values().next().value!);
  };

  return ({
  mode: 'idle',
  media: null,
  notifications: [],
  downloads: [],
  completedDownload: null,
  hardwareAlert: null,
  clipboardData: null,
  systemActivity: null,
  notificationsEnabled: true,
  showNotificationContent: false,
  notificationHistoryEnabled: false,
  notificationHistory: readNotificationHistory(),
  sensitiveApps: ['WhatsApp', 'WhatsApp Beta', 'Telegram', 'Signal', 'Google Pay', 'Paytm', 'Banking', 'Password'],
  privacy: { microphone_active: false, camera_active: false, active_apps: [] },
  setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
  setShowNotificationContent: (enabled) => set((state) => {
    if (enabled) return { showNotificationContent: true };
    const notificationHistory = state.notificationHistory.map((item) => ({ ...item, title: 'Notification', body: '', icon: undefined }));
    writeNotificationHistory(notificationHistory);
    return { showNotificationContent: false, notificationHistory };
  }),
  setNotificationHistoryEnabled: (enabled) => set(() => {
    if (enabled) return { notificationHistoryEnabled: true };
    writeNotificationHistory([]);
    return { notificationHistoryEnabled: false, notificationHistory: [] };
  }),
  clearNotificationHistory: () => set(() => {
    writeNotificationHistory([]);
    return { notificationHistory: [] };
  }),
  setMode: (mode) => set({ mode }),
  setPrivacy: (privacy) => set({ privacy }),
  setMedia: (media) => set(() => {
    return { media };
  }),
  addNotification: (notification) => set((state) => {
    if (consumedNotificationIds.has(notification.id)) return state;

    const safeNotification = notification;

    let nextNotifications = [...state.notifications];
    const existingIndex = nextNotifications.findIndex(n => n.id === safeNotification.id);
    
    if (existingIndex >= 0) {
      nextNotifications[existingIndex] = safeNotification;
    } else {
      nextNotifications.push(safeNotification);
      if (nextNotifications.length > 10) {
        const [evicted] = nextNotifications.splice(1, 1);
        if (evicted) rememberTerminalId(consumedNotificationIds, evicted.id);
      }
    }

    console.log(`[NOTIFICATION]\nreceived id=${safeNotification.id}\nqueue=${nextNotifications.length}`);

    let notificationHistory = state.notificationHistory;
    if (state.notificationHistoryEnabled) {
      // History keeps only content allowed by the preview preference. Icons can
      // contain large image payloads, so history stores text and app metadata only.
      const historyItem = {
        ...safeNotification,
        title: state.showNotificationContent ? safeNotification.title : 'Notification',
        body: state.showNotificationContent ? safeNotification.body : '',
        icon: undefined,
      };
      notificationHistory = [historyItem, ...notificationHistory.filter(item => item.id !== historyItem.id)]
        .slice(0, MAX_NOTIFICATION_HISTORY);
      writeNotificationHistory(notificationHistory);
    }

    return { 
      notifications: nextNotifications,
      notificationHistory,
    };
  }),
  removeNotification: (id) => set((state) => {
    rememberTerminalId(consumedNotificationIds, id);
    const nextNotifications = state.notifications.filter(n => n.id !== id);
    
    // Determine new mode if queue is empty
    let newMode = state.mode;
    if (nextNotifications.length === 0) {
      if (state.mode === 'notification' || state.mode === 'expanded-notification') {
        const downloadAvailable = state.downloads.length > 0;
        const mediaAvailable = state.media?.playback_status !== 'Closed' && !!state.media?.title;
        
        if (downloadAvailable) {
          newMode = 'download';
        } else if (mediaAvailable) {
          newMode = 'music';
        } else {
          newMode = 'idle';
        }
      }
    } else {
      // If there are more notifications, ensure we are in notification mode (if we were in notification mode)
      if (state.mode === 'expanded-notification') {
        newMode = 'expanded-notification';
      } else if (state.mode === 'notification' || state.mode === 'music' || state.mode === 'idle') {
        newMode = 'notification';
      }
    }
    
    console.log(`[NOTIFICATION]\nconsumed id=${id}\nqueue=${nextNotifications.length}`);
    console.log(`[PRESENTATION]\nunderlying=${state.media?.title ? 'music' : (state.downloads.length ? 'download' : 'idle')}\ntemporary=${newMode}`);

    return {
      notifications: nextNotifications,
      mode: newMode
    };
  }),
  clearNotifications: () => set((state) => {
    for (const notification of state.notifications) rememberTerminalId(consumedNotificationIds, notification.id);
    const downloadAvailable = state.downloads.length > 0;
    const mediaAvailable = state.media?.playback_status !== 'Closed' && !!state.media?.title;
    let newMode = state.mode;
    if (state.mode.includes('notification')) {
      if (downloadAvailable) newMode = 'download';
      else if (mediaAvailable) newMode = 'music';
      else newMode = 'idle';
    }
    return {
      notifications: [],
      mode: newMode
    };
  }),
  updateDownload: (download, eventType) => set((state) => {
    if (terminalDownloadIds.has(download.id)) return state;

    // Terminal events remove presentation candidates immediately. Late progress
    // must not reinsert an item after its lifecycle has ended.
    if (['completed', 'complete', 'failed', 'canceled', 'cancelled', 'interrupted'].includes(eventType) ||
        ['complete', 'completed', 'failed', 'canceled', 'cancelled', 'interrupted'].includes(download.status)) {
      rememberTerminalId(terminalDownloadIds, download.id);
      const remaining = state.downloads.filter(item => item.id !== download.id);
      const mode = (state.mode === 'download' || state.mode === 'expanded-download') && remaining.length === 0
        ? (state.media?.playback_status !== 'Closed' && !!state.media?.title ? 'music' : 'idle')
        : state.mode;
      return { downloads: remaining, mode };
    }

    let nextDownloads = [...state.downloads];
    const index = nextDownloads.findIndex(d => d.id === download.id);
    if (index >= 0) {
      nextDownloads[index] = download;
    } else {
      nextDownloads.push(download);
    }
    
    // Sort downloads: in_progress first, then latest
    nextDownloads.sort((a, b) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (a.status !== 'in_progress' && b.status === 'in_progress') return 1;
      return b.timestamp - a.timestamp;
    });

    let nextMode = state.mode;
    
    // Priorities:
    // 1. Settings / Notifications / Expanded modes (don't hijack)
    // 2. Download
    // 3. Music
    // 4. Idle
    
    const isInteracting = state.mode.startsWith('expanded-') || state.mode === 'settings';
    
    if (!isInteracting && state.mode !== 'notification' && state.mode !== 'expanded-notification') {
      if (eventType === 'started' || eventType === 'progress') {
        nextMode = 'download';
      }
    }
    
    return {
      downloads: nextDownloads,
      mode: nextMode
    };
  }),
  finishDownload: (download) => set((state) => {
    rememberTerminalId(terminalDownloadIds, download.id);
    const remainingDownloads = state.downloads.filter(item => item.id !== download.id);
    const canShowCompletion = state.mode === 'download' || state.mode === 'expanded-download';
    return {
      downloads: remainingDownloads,
      completedDownload: canShowCompletion ? download : state.completedDownload,
    };
  }),
  clearDownloadCompletion: (id) => set((state) => {
    if (state.completedDownload?.id !== id) return state;

    let mode = state.mode;
    if (mode === 'download' || mode === 'expanded-download') {
      if (state.downloads.length > 0) {
        mode = state.mode;
      } else if (state.notifications.length > 0) {
        mode = 'notification';
      } else if (state.media?.playback_status !== 'Closed' && !!state.media?.title) {
        mode = 'music';
      } else {
        mode = 'idle';
      }
    }
    return { completedDownload: null, mode };
  }),
  removeDownload: (id) => set((state) => {
    rememberTerminalId(terminalDownloadIds, id);
    console.log(`[Download] removing active id=${id}`);
    const nextDownloads = state.downloads.filter(d => d.id !== id);
    let newMode = state.mode;
    if (nextDownloads.length === 0) {
      if (state.mode === 'download' || state.mode === 'expanded-download') {
        console.log(`[Presentation] recalculating after download completion`);
        const mediaAvailable = state.media?.playback_status !== 'Closed' && !!state.media?.title;
        newMode = mediaAvailable ? 'music' : 'idle';
        console.log(`[Presentation] result=${newMode}`);
      }
    } else if (state.mode === 'expanded-download') {
      newMode = 'expanded-download';
    } else if (state.mode === 'download') {
      newMode = 'download';
    }
    
    return {
      downloads: nextDownloads,
      mode: newMode
    };
  }),
  clearDownloads: () => set((state) => {
    for (const download of state.downloads) rememberTerminalId(terminalDownloadIds, download.id);
    return {
      downloads: [],
      completedDownload: null,
      mode: (state.mode === 'download' || state.mode === 'expanded-download') ?
        ((state.media?.playback_status !== 'Closed' && !!state.media?.title) ? 'music' : 'idle') :
        state.mode,
    };
  }),
  setHardwareAlert: (alert) => set((state) => ({
    hardwareAlert: alert,
    mode: alert ? 'hardware-alert' : state.mode
  })),
  clearHardwareAlert: () => set((state) => ({
    hardwareAlert: null,
    mode: (state.mode === 'hardware-alert' || state.mode === 'expanded-hardware') ? 
      ((state.media?.playback_status !== 'Closed' && !!state.media?.title) ? 'music' : 'idle') : 
      state.mode
  })),
  // Clipboard data is temporary presentation payload only. The Activity Engine
  // owns its lifecycle and the Presentation Manager owns mode transitions.
  setClipboardData: (data) => set({ clipboardData: data }),
  setSystemActivity: (data) => set({ systemActivity: data })
  });
});
