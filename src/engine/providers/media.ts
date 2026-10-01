import { listen } from '@tauri-apps/api/event';
import { pulseEventBus } from '../events/bus';
import { EventType } from '../events/types';
import { MediaState } from '../../store/pulseStore';

export class MediaProvider {
  private unlistenPromise: Promise<() => void> | null = null;
  private lastState: string = 'Closed';
  private lastTitle: string = '';
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  public start() {
    if (this.unlistenPromise) return;
    this.stopped = false;
    this.unlistenPromise = listen<MediaState>('media-state', (event) => {
      const media = event.payload;
      
      let eventType: EventType = EventType.MEDIA_CHANGED;

      if (media.playback_status === 'Playing' && this.lastState !== 'Playing') {
        eventType = EventType.MEDIA_PLAYING;
      } else if (media.playback_status === 'Paused' && this.lastState !== 'Paused') {
        eventType = EventType.MEDIA_PAUSED;
      } else if ((media.playback_status === 'Closed' || media.playback_status === 'Stopped' || !media.title) &&
        (this.lastState !== media.playback_status || !!this.lastTitle)) {
        eventType = EventType.MEDIA_STOPPED;
      } else if (media.title !== this.lastTitle) {
        eventType = EventType.MEDIA_CHANGED;
      }

      pulseEventBus.emit({
        id: 'system-media',
        type: eventType,
        source: 'MediaProvider',
        timestamp: Date.now(),
        priority: 'NORMAL',
        payload: media
      });

      this.lastState = media.playback_status;
      this.lastTitle = media.title || '';
    }).catch((error) => {
      this.unlistenPromise = null;
      console.error('[Media] listener failed; retrying in 5 seconds', error);
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

export const mediaProvider = new MediaProvider();
