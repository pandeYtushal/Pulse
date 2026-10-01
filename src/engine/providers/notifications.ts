import { listen } from '@tauri-apps/api/event';
import { pulseEventBus } from '../events/bus';
import { EventType } from '../events/types';
import { PulseNotification, usePulseStore } from '../../store/pulseStore';
import { invoke } from '@tauri-apps/api/core';

export class NotificationProvider {
  private unlistenPromise: Promise<() => void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  public start() {
    if (this.unlistenPromise) return;
    this.stopped = false;
    this.checkPermission();

    this.unlistenPromise = listen<PulseNotification>('pulse://notification', (event) => {
      const store = usePulseStore.getState();
      if (!store.notificationsEnabled) return; // Completely drop if disabled

      let notif = event.payload;
      
      // Notification identity comes from the OS. Content equality is not identity:
      // repeated messages in the same app/conversation are separate notifications.
      // Privacy Filter BEFORE emitting to the Event Bus.
      const isSensitiveApp = store.sensitiveApps.some(app => 
        notif.appName.toLowerCase().includes(app.toLowerCase())
      );

      if (!store.showNotificationContent || isSensitiveApp) {
        notif = {
          ...notif,
          body: "New message"
        };
      }

      // Ensure stable ID for Windows notifications, fallback for web notifications
      if (!notif.id) {
        notif.id = crypto.randomUUID();
      }

      // Emit without logging private notification content.
      pulseEventBus.emit({
        id: notif.id,
        type: EventType.NOTIFICATION_RECEIVED,
        source: 'NotificationProvider',
        timestamp: Date.now(),
        priority: 'HIGH',
        payload: notif
      });
    }).catch((error) => {
      this.unlistenPromise = null;
      console.error('[Notification] listener failed; retrying in 5 seconds', error);
      if (!this.stopped) this.retryTimer = setTimeout(() => this.start(), 5000);
      return () => {};
    });
  }

  private async checkPermission() {
    try {
      const status = await invoke('check_notification_permission');
      if (status === 'Denied' || status === 'Unspecified') {
        console.warn("[Pulse] Notification access is required.");
      }
    } catch (e) {
      console.error("Failed to check notification permission", e);
    }
  }

  public async stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const currentListener = this.unlistenPromise;
    if (currentListener) {
      const unlisten = await currentListener;
      unlisten();
      if (this.unlistenPromise === currentListener) this.unlistenPromise = null;
    }
  }
}

export const notificationProvider = new NotificationProvider();
