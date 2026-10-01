import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from '../../settings/store';
import { pulseEventBus } from '../events/bus';
import { EventType } from '../events/types';

type ClipboardKind = 'text' | 'image' | 'file' | 'multiple_files' | 'other';

interface NativeClipboardChange {
  sequence: number;
  kind: ClipboardKind;
  preview: string | null;
  fileCount: number | null;
}

export class ClipboardProvider {
  private unlistenPromise: Promise<() => void> | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private lastSequence: number | null = null;

  public start() {
    if (this.unlistenPromise) return;
    this.stopped = false;
    this.unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
      if (state.settings.clipboardActivity !== previous.settings.clipboardActivity ||
          state.settings.clipboardPreview !== previous.settings.clipboardPreview) {
        this.syncOptions();
        // Remove any visible preview immediately when the feature is disabled or
        // the user turns preview off. The native side never logs or persists it.
        if (!state.settings.clipboardActivity ||
            (previous.settings.clipboardPreview && !state.settings.clipboardPreview)) {
          this.emitClear();
        }
      }
    });

    this.unlistenPromise = listen<NativeClipboardChange>('clipboard-changed', ({ payload }) => {
      const settings = useSettingsStore.getState().settings;
      if (!settings.clipboardActivity || this.lastSequence === payload.sequence) return;
      this.lastSequence = payload.sequence;

      const clipboard = {
        kind: payload.kind,
        preview: settings.clipboardPreview ? payload.preview : null,
        fileCount: payload.fileCount,
        durationMs: settings.clipboardDuration,
      };
      if (import.meta.env.DEV) {
        console.debug(`[Clipboard] change detected kind=${payload.kind}`);
      }
      pulseEventBus.emit({
        id: `clipboard-${payload.sequence}`,
        type: EventType.CLIPBOARD_CHANGED,
        source: 'ClipboardProvider',
        timestamp: Date.now(),
        priority: 'LOW',
        payload: clipboard,
      });
    }).then((unlisten) => {
      this.syncOptions();
      return unlisten;
    }).catch((error) => {
      this.unlistenPromise = null;
      console.error('[Clipboard] listener failed; retrying in 5 seconds', error);
      if (!this.stopped) this.retryTimer = setTimeout(() => this.start(), 5000);
      return () => {};
    });
  }

  private syncOptions() {
    const { clipboardActivity, clipboardPreview } = useSettingsStore.getState().settings;
    void invoke('set_clipboard_options', {
      enabled: clipboardActivity,
      preview: clipboardActivity && clipboardPreview,
    }).catch((error) => {
      if (import.meta.env.DEV) console.warn('[Clipboard] could not update native privacy options', error);
    });
  }

  private emitClear() {
    pulseEventBus.emit({
      id: `clipboard-clear-${Date.now()}`,
      type: EventType.CLIPBOARD_CLEARED,
      source: 'ClipboardProvider',
      timestamp: Date.now(),
      priority: 'LOW',
      payload: null,
    });
  }

  public async stop() {
    this.stopped = true;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void invoke('set_clipboard_options', { enabled: false, preview: false }).catch(() => {});
    const currentListener = this.unlistenPromise;
    if (currentListener) {
      const unlisten = await currentListener;
      unlisten();
      if (this.unlistenPromise === currentListener) this.unlistenPromise = null;
    }
    this.lastSequence = null;
    this.emitClear();
  }
}

export const clipboardProvider = new ClipboardProvider();
