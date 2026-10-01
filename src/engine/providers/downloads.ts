import { listen } from '@tauri-apps/api/event';
import { pulseEventBus } from '../events/bus';
import { EventType } from '../events/types';
import { DownloadItem } from '../../store/pulseStore';
import { useSettingsStore } from '../../settings/store';

export interface DownloadEventPayload {
  eventType: string; // 'started', 'progress', 'completed', 'failed', 'canceled'
  download: DownloadItem;
}

export class DownloadProvider {
  private unlistenPromise: Promise<() => void> | null = null;
  private completedDownloads = new Set<string>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  private rememberCompleted(id: string) {
    this.completedDownloads.delete(id);
    this.completedDownloads.add(id);
    if (this.completedDownloads.size > 4096) {
      this.completedDownloads.delete(this.completedDownloads.values().next().value!);
    }
  }

  public start() {
    if (this.unlistenPromise) return;
    this.stopped = false;
    this.unlistenPromise = listen<DownloadEventPayload>('download-event', (event) => {
      const settings = useSettingsStore.getState().settings;
      if (!settings.showDownloads) return;

      const payload = event.payload;
      const { eventType, download } = payload;
      
      // If we already finished this download, ignore stray late progress events
      if (this.completedDownloads.has(download.id)) {
        return;
      }
      
      let mappedType: EventType = EventType.DOWNLOAD_PROGRESS;
      let priority: 'NORMAL' | 'HIGH' = 'NORMAL';

      let status = download.status;
      
      // Force completion if progress reaches 100% but backend hasn't emitted 'completed' yet
      const isProgress100 = eventType === 'progress' && download.totalBytes && download.downloadedBytes >= download.totalBytes;
      const effectiveEventType = isProgress100 ? 'completed' : eventType;

      switch (effectiveEventType) {
        case 'started': 
          console.log(`[Download] started id=${download.id}`);
          mappedType = EventType.DOWNLOAD_STARTED; 
          status = 'in_progress';
          break;
        case 'progress': 
          console.log(`[Download] progress id=${download.id}`);
          mappedType = EventType.DOWNLOAD_PROGRESS; 
          status = 'in_progress';
          break;
        case 'completed': 
          console.log(`[Download] completed id=${download.id}`);
          mappedType = EventType.DOWNLOAD_COMPLETED; 
          priority = 'HIGH';
          status = 'complete';
          this.rememberCompleted(download.id);
          break;
        case 'failed': 
          mappedType = EventType.DOWNLOAD_FAILED; 
          priority = 'HIGH';
          status = 'interrupted';
          this.rememberCompleted(download.id);
          break;
        case 'canceled': 
          mappedType = EventType.DOWNLOAD_CANCELED; 
          priority = 'HIGH';
          status = 'interrupted';
          this.rememberCompleted(download.id);
          break;
      }

      const finalDownload = { ...download, status };

      pulseEventBus.emit({
        id: `download-${download.id}`,
        type: mappedType,
        source: 'DownloadProvider',
        timestamp: Date.now(),
        priority,
        payload: finalDownload
      });
    }).catch((error) => {
      this.unlistenPromise = null;
      console.error('[Download] listener failed; retrying in 5 seconds', error);
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

export const downloadProvider = new DownloadProvider();
