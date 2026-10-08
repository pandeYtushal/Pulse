import { ActivityState, ActivityType, type PulseActivity } from './types.ts';
import { usePulseStore } from '../../store/pulseStore.ts';
import type { EventPriority } from '../events/types.ts';

class PresentationManager {
  private completionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private hardwareAlertTimer: ReturnType<typeof setTimeout> | null = null;

  public stop() {
    for (const [id, timer] of this.completionTimers) {
      clearTimeout(timer);
      usePulseStore.getState().clearDownloadCompletion(id);
    }
    this.completionTimers.clear();
    if (this.hardwareAlertTimer) {
      clearTimeout(this.hardwareAlertTimer);
      usePulseStore.getState().clearHardwareAlert();
    }
    this.hardwareAlertTimer = null;
    const store = usePulseStore.getState();
    if (store.systemActivity) this.expireSystemActivity(store.systemActivity.id);
  }

  public expireClipboard(id: string) {
    const store = usePulseStore.getState();
    if (store.clipboardData?.id !== id) return;
    store.setClipboardData(null);
    if (store.mode === 'clipboard' || store.mode === 'expanded-clipboard') {
      const current = usePulseStore.getState();
      if (current.notifications.length > 0) current.setMode('notification');
      else if (current.hardwareAlert) current.setMode('hardware-alert');
      else if (current.completedDownload || current.downloads.length > 0) current.setMode('download');
      else if (current.media?.playback_status !== 'Closed' && !!current.media?.title) current.setMode('music');
      else current.setMode('idle');
    }
  }

  public expireSystemActivity(id: string) {
    const store = usePulseStore.getState();
    if (store.systemActivity?.id !== id) return;
    store.setSystemActivity(null);
    if (store.mode === 'system-activity') store.setMode(this.currentUnderlyingMode());
  }

  private currentUnderlyingMode(): 'notification' | 'hardware-alert' | 'download' | 'music' | 'idle' {
    const store = usePulseStore.getState();
    if (store.notifications.length) return 'notification';
    if (store.hardwareAlert) return 'hardware-alert';
    if (store.completedDownload || store.downloads.length) return 'download';
    if (store.media?.playback_status !== 'Closed' && store.media?.title) return 'music';
    return 'idle';
  }

  public decide(activity: PulseActivity, priority: EventPriority) {
    const store = usePulseStore.getState();
    const currentMode = store.mode;

    // AMBIENT activities don't change the main content mode.
    if (priority === 'AMBIENT') {
      if (activity.type === ActivityType.PRIVACY) {
        // Privacy events update the indicators without replacing the current activity.
        const currentPrivacy = { ...store.privacy };
        if (activity.payload?.camera !== undefined) currentPrivacy.camera_active = activity.payload.camera;
        if (activity.payload?.microphone !== undefined) currentPrivacy.microphone_active = activity.payload.microphone;
        store.setPrivacy(currentPrivacy);
      }
      return;
    }

    // Is the user actively interacting? (expanded modes except maybe notifications that auto-expanded)
    const isInteracting = currentMode.startsWith('expanded-') && currentMode !== 'expanded-notification';

    if (isInteracting && priority !== 'CRITICAL') {
      // QUEUE or UPDATE_BACKGROUND
      this.updateBackgroundState(activity);
      return;
    }

    // SHOW_NOW or UPDATE_CURRENT
    this.presentActivity(activity);
  }

  private updateBackgroundState(activity: PulseActivity) {
    const store = usePulseStore.getState();
    
    // Even if we don't switch the UI, we must update the underlying data model
    // so it's ready if the user switches to it.
    if (activity.type === ActivityType.MEDIA) {
      if (activity.state === ActivityState.STOPPED) {
        store.setMedia(null);
      } else {
        store.setMedia(activity.payload);
      }
    } else if (activity.type === ActivityType.NOTIFICATION && activity.state === ActivityState.PENDING) {
      store.addNotification(activity.payload);
    } else if (activity.type === ActivityType.DOWNLOAD &&
      ([ActivityState.COMPLETED, ActivityState.FAILED, ActivityState.CANCELED] as ActivityState[]).includes(activity.state)) {
      const status = activity.state === ActivityState.COMPLETED ? 'complete' : 'interrupted';
      const completedDownload = { ...activity.payload, status };
      store.finishDownload(completedDownload);
      const previousTimer = this.completionTimers.get(activity.payload.id);
      if (previousTimer) clearTimeout(previousTimer);
      const timer = setTimeout(() => {
        this.completionTimers.delete(activity.payload.id);
        usePulseStore.getState().clearDownloadCompletion(activity.payload.id);
      }, 2500);
      this.completionTimers.set(activity.payload.id, timer);
    } else if (activity.type === ActivityType.DOWNLOAD) {
      let eventTypeStr = 'progress';
      if (activity.state === ActivityState.STARTED) eventTypeStr = 'started';
      if (activity.state === ActivityState.COMPLETED) eventTypeStr = 'completed';
      if (activity.state === ActivityState.FAILED) eventTypeStr = 'failed';
      if (activity.state === ActivityState.CANCELED) eventTypeStr = 'canceled';
      
      store.updateDownload(activity.payload, eventTypeStr);
      
    } else if (activity.type === ActivityType.POWER) {
      store.setHardwareAlert({ type: 'battery', data: activity.payload });
      
      // Auto-dismiss the alert after 4 seconds (like an iOS charging notification)
      if (this.hardwareAlertTimer) clearTimeout(this.hardwareAlertTimer);
      this.hardwareAlertTimer = setTimeout(() => {
        this.hardwareAlertTimer = null;
        usePulseStore.getState().clearHardwareAlert();
      }, 4000);
    }
  }

  private presentActivity(activity: PulseActivity) {
    const store = usePulseStore.getState();

    if (activity.type === ActivityType.CLIPBOARD) {
      // Clipboard is deliberately lower priority than ongoing/interactive activities.
      if (!['idle', 'music', 'clipboard'].includes(store.mode)) return;
      store.setClipboardData({ id: activity.id, ...activity.payload });
      store.setMode('clipboard');
      return;
    }

    if (activity.type === ActivityType.SYSTEM_ACTIVITY) {
      // Device changes can replace passive activity surfaces. Preserve notifications
      // and active interaction, which are guarded earlier in decide().
      if (store.mode === 'notification' || store.mode === 'expanded-notification' || store.mode === 'settings') return;
      store.setSystemActivity({ id: activity.id, ...activity.payload });
      store.setMode('system-activity');
      return;
    }

    // First update the data model
    this.updateBackgroundState(activity);

    // Then decide if we need to switch the visual mode
    console.log(`[PRESENTATION]
underlying=${store.media?.title ? 'music' : (store.downloads.length ? 'download' : 'idle')}
temporary=${store.mode}
notificationId=${store.notifications[0]?.id || 'none'}`);

    if (activity.type === ActivityType.POWER && activity.state === ActivityState.ACTIVE) {
      store.setMode('hardware-alert');
    } else if (activity.type === ActivityType.NOTIFICATION && activity.state === ActivityState.PENDING) {
      // Only switch if we aren't already looking at it, AND the user isn't actively interacting
      const isInteracting = store.mode.startsWith('expanded-') || store.mode === 'settings';
      if (!store.mode.includes('notification') && !isInteracting) {
        store.setMode('notification');
      }
    } else if (activity.type === ActivityType.DOWNLOAD &&
      ([ActivityState.COMPLETED, ActivityState.FAILED, ActivityState.CANCELED] as ActivityState[]).includes(activity.state)) {
      // Terminal downloads are removed in updateBackgroundState.
    } else if (activity.type === ActivityType.MEDIA) {
      // If idle and media starts playing, show it
      if (store.mode === 'idle' && (activity.state === ActivityState.ACTIVE || activity.state === ActivityState.UPDATED)) {
        store.setMode('music');
      } else if (activity.state === ActivityState.STOPPED) {
        if (store.mode === 'music' || store.mode === 'expanded-music') {
          store.setMode('idle');
        }
      }
    }
  }
}

export const presentationManager = new PresentationManager();
