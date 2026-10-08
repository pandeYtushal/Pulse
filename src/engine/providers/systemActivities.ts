import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from '../../settings/store';
import { pulseEventBus } from '../events/bus';
import { EventType } from '../events/types';

interface NativeSystemActivity {
  id: string;
  kind: 'bluetooth' | 'usb' | 'screenshot';
  action: 'connected' | 'disconnected' | null;
  deviceName: string | null;
  deviceClass: 'audio' | 'keyboard' | 'mouse' | 'controller' | 'phone' | 'storage' | 'camera' | 'other' | null;
}

export class SystemActivitiesProvider {
  private static readonly USB_CONNECT_DEBOUNCE_MS = 10_000;
  private listener: Promise<() => void> | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private recentIds = new Set<string>();
  private lastUsbConnectAt = 0;

  start() {
    if (this.listener) return;
    this.stopped = false;
    this.unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
      const a = state.settings;
      const b = previous.settings;
      if (a.bluetoothActivity !== b.bluetoothActivity || a.usbActivity !== b.usbActivity || a.screenshotActivity !== b.screenshotActivity) this.syncOptions();
    });
    this.listener = listen<NativeSystemActivity>('system-activity', ({ payload }) => {
      if (this.stopped) return;
      const settings = useSettingsStore.getState().settings;
      // Windows may report several interface arrivals for one USB device (and
      // can re-enumerate them in a burst after sleep). Pulse presents a single
      // generic USB activity, so collapse that burst into one visible event.
      const now = Date.now();
      if (payload.kind === 'usb' && payload.action === 'connected'
        && now - this.lastUsbConnectAt < SystemActivitiesProvider.USB_CONNECT_DEBOUNCE_MS) return;
      if (this.recentIds.has(payload.id)) return;
      if ((payload.kind === 'bluetooth' && !settings.bluetoothActivity) || (payload.kind === 'usb' && !settings.usbActivity) || (payload.kind === 'screenshot' && !settings.screenshotActivity)) return;
      this.recentIds.add(payload.id);
      if (payload.kind === 'usb' && payload.action === 'connected') this.lastUsbConnectAt = now;
      if (this.recentIds.size > 512) this.recentIds.delete(this.recentIds.values().next().value!);
      const type = payload.kind === 'bluetooth' ? EventType.BLUETOOTH_ACTIVITY : payload.kind === 'usb' ? EventType.USB_ACTIVITY : EventType.SCREENSHOT_ACTIVITY;
      pulseEventBus.emit({
        id: payload.id,
        type,
        source: 'SystemActivitiesProvider',
        timestamp: Date.now(),
        priority: 'LOW',
        payload: { kind: payload.kind, action: payload.action, deviceName: payload.deviceName, deviceClass: payload.deviceClass },
      });
    }).then((unlisten) => {
      this.syncOptions();
      return unlisten;
    }).catch((error) => {
      this.listener = null;
      this.unsubscribeSettings?.();
      this.unsubscribeSettings = null;
      if (import.meta.env.DEV) console.warn('[SystemActivity] native event subscription failed', error);
      if (!this.stopped) this.retryTimer = setTimeout(() => this.start(), 5000);
      return () => {};
    });
  }

  private syncOptions() {
    const { bluetoothActivity, usbActivity, screenshotActivity } = useSettingsStore.getState().settings;
    void invoke('set_system_activity_options', { bluetooth: bluetoothActivity, usb: usbActivity, screenshots: screenshotActivity }).catch((error) => {
      if (import.meta.env.DEV) console.warn('[SystemActivity] could not update native watcher options', error);
    });
  }

  async stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    void invoke('set_system_activity_options', { bluetooth: false, usb: false, screenshots: false }).catch(() => {});
    const current = this.listener;
    if (current) {
      const unlisten = await current;
      unlisten();
      if (this.listener === current) this.listener = null;
    }
    this.recentIds.clear();
    this.lastUsbConnectAt = 0;
  }
}

export const systemActivitiesProvider = new SystemActivitiesProvider();
