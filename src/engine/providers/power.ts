import { listen } from '@tauri-apps/api/event';
import { pulseEventBus } from '../events/bus';
import { EventType } from '../events/types';

export interface BatteryStatus {
  percentage: number;
  isCharging: boolean;
  isLow: boolean;
}

export class PowerProvider {
  private unlistenPromise: Promise<() => void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  public start() {
    if (this.unlistenPromise) return;
    this.stopped = false;
    this.unlistenPromise = listen<BatteryStatus>('battery-alert', (event) => {
      const status = event.payload;
      
      const eventType = status.isCharging 
        ? EventType.CHARGING_STARTED 
        : (status.percentage <= 20 ? EventType.BATTERY_LOW : EventType.CHARGING_STOPPED);

      // Determine priority
      const priority = (status.percentage <= 20 && !status.isCharging) ? 'CRITICAL' : 'HIGH';

      pulseEventBus.emit({
        id: 'system-power',
        type: eventType,
        source: 'PowerProvider',
        timestamp: Date.now(),
        priority,
        payload: status
      });
    }).catch((error) => {
      this.unlistenPromise = null;
      console.error('[Power] listener failed; retrying in 5 seconds', error);
      if (!this.stopped) this.retryTimer = setTimeout(() => this.start(), 5000);
      return () => {};
    });
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

export const powerProvider = new PowerProvider();
