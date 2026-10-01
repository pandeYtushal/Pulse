import { listen } from '@tauri-apps/api/event';
import { pulseEventBus } from '../events/bus';
import { EventType } from '../events/types';
import { usePulseStore, type PrivacyState } from '../../store/pulseStore';

export class PrivacyProvider {
  private unlistenPromise: Promise<() => void> | null = null;
  private lastCamera: boolean = false;
  private lastMic: boolean = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  public start() {
    if (this.unlistenPromise) return;
    this.stopped = false;
    this.unlistenPromise = listen<PrivacyState>('privacy-state', (event) => {
      const state = event.payload;

      // Reconcile the current snapshot on every native poll. Change events below
      // still feed the activity engine, while this prevents stale ambient UI if
      // an event was missed during listener startup or recovery.
      usePulseStore.getState().setPrivacy(state);

      if (state.camera_active !== this.lastCamera) {
        console.log(`[Privacy UI] cameraActive=${state.camera_active}`);
        pulseEventBus.emit({
          id: 'system-camera',
          type: state.camera_active ? EventType.CAMERA_ACTIVE : EventType.CAMERA_INACTIVE,
          source: 'PrivacyProvider',
          timestamp: Date.now(),
          priority: 'AMBIENT',
          payload: { camera: state.camera_active, active_apps: state.active_apps }
        });
        this.lastCamera = state.camera_active;
      }

      if (state.microphone_active !== this.lastMic) {
        console.log(`[Privacy UI] microphoneActive=${state.microphone_active}`);
        pulseEventBus.emit({
          id: 'system-microphone',
          type: state.microphone_active ? EventType.MICROPHONE_ACTIVE : EventType.MICROPHONE_INACTIVE,
          source: 'PrivacyProvider',
          timestamp: Date.now(),
          priority: 'AMBIENT',
          payload: { microphone: state.microphone_active, active_apps: state.active_apps }
        });
        this.lastMic = state.microphone_active;
      }
    }).catch((error) => {
      this.unlistenPromise = null;
      console.error('[CameraMic] listener failed; retrying in 5 seconds', error);
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

export const privacyProvider = new PrivacyProvider();
