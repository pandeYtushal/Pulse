import { powerProvider } from './providers/power';
import { mediaProvider } from './providers/media';
import { notificationProvider } from './providers/notifications';
import { downloadProvider } from './providers/downloads';
import { privacyProvider } from './providers/privacy';
import { clipboardProvider } from './providers/clipboard';
import { systemActivitiesProvider } from './providers/systemActivities';

import { activityEngine } from './activities/engine';

export class EngineOrchestrator {
  private requested = false;
  private running = false;
  private transition: Promise<void> | null = null;

  public start() {
    this.requested = true;
    return this.reconcile();
  }

  public stop() {
    this.requested = false;
    return this.reconcile();
  }

  private reconcile(): Promise<void> {
    if (this.transition) return this.transition;

    this.transition = (async () => {
      while (this.running !== this.requested) {
        if (this.requested) {
          console.log('[Engine] Starting Pulse providers...');
          activityEngine.start();
          powerProvider.start();
          mediaProvider.start();
          notificationProvider.start();
          downloadProvider.start();
          privacyProvider.start();
          clipboardProvider.start();
          systemActivitiesProvider.start();
          this.running = true;
        } else {
          await Promise.all([
            powerProvider.stop(),
            mediaProvider.stop(),
            notificationProvider.stop(),
            downloadProvider.stop(),
            privacyProvider.stop(),
            clipboardProvider.stop(),
            systemActivitiesProvider.stop(),
          ]);
          activityEngine.stop();
          this.running = false;
        }
      }
    })().finally(() => {
      this.transition = null;
      if (this.running !== this.requested) void this.reconcile();
    });

    return this.transition;
  }
}

export const pulseEngine = new EngineOrchestrator();
