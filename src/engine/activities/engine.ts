import { pulseEventBus } from '../events/bus.ts';
import { EventType, type PulseEvent } from '../events/types.ts';
import { ActivityState, ActivityClassification, ActivityType, type PulseActivity } from './types.ts';
import { priorityEngine } from './priority.ts';

export class ActivityEngine {
  // In-memory store of current activities
  private activeActivities: Map<string, PulseActivity> = new Map();
  private expiryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private unsubscribe: (() => void) | null = null;
  private clipboardTimer: ReturnType<typeof setTimeout> | null = null;
  private activeClipboardId: string | null = null;
  private terminalClipboardIds = new Set<string>();
  private systemActivityTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSystemActivityId: string | null = null;
  private terminalSystemActivityIds = new Set<string>();

  private handleEventBound = (event: PulseEvent) => this.handleEvent(event);

  public start() {
    if (this.unsubscribe) return;
    this.unsubscribe = pulseEventBus.subscribe(this.handleEventBound);
  }

  public stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    pulseEventBus.clearPending();
    priorityEngine.stop();
    if (this.clipboardTimer) clearTimeout(this.clipboardTimer);
    this.clipboardTimer = null;
    if (this.activeClipboardId) priorityEngine.expireClipboard(this.activeClipboardId);
    this.activeClipboardId = null;
    this.terminalClipboardIds.clear();
    if (this.systemActivityTimer) clearTimeout(this.systemActivityTimer);
    this.systemActivityTimer = null;
    if (this.activeSystemActivityId) {
      const active = this.activeActivities.get(this.activeSystemActivityId);
      if (active) active.state = ActivityState.EXPIRED;
      priorityEngine.expireSystemActivity(this.activeSystemActivityId);
    }
    this.activeSystemActivityId = null;
    this.terminalSystemActivityIds.clear();
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.activeActivities.clear();
  }

  public get activeCount() {
    return this.activeActivities.size;
  }

  private handleEvent(event: PulseEvent) {
    if (event.type === EventType.CLIPBOARD_CLEARED) {
      if (this.clipboardTimer) clearTimeout(this.clipboardTimer);
      this.clipboardTimer = null;
      if (this.activeClipboardId) {
        this.rememberTerminalClipboard(this.activeClipboardId);
        priorityEngine.expireClipboard(this.activeClipboardId);
        this.activeActivities.delete(this.activeClipboardId);
      }
      this.activeClipboardId = null;
      return;
    }
    if (event.type === EventType.CLIPBOARD_CHANGED && this.terminalClipboardIds.has(event.id)) return;
    if ([EventType.BLUETOOTH_ACTIVITY, EventType.USB_ACTIVITY, EventType.SCREENSHOT_ACTIVITY].includes(event.type as never) && this.terminalSystemActivityIds.has(event.id)) return;

    let activity = this.activeActivities.get(event.id);

    if (activity && event.timestamp < activity.updatedAt) return;
    // A terminal event closes this activity sequence. A new sequence needs a new ID.
    if (activity && activity.type === ActivityType.DOWNLOAD && this.isActivityFinished(activity.state)) return;

    const previousTimer = this.expiryTimers.get(event.id);
    if (previousTimer) {
      clearTimeout(previousTimer);
      this.expiryTimers.delete(event.id);
    }

    // If this is a new activity sequence
    if (!activity) {
      const newActivity = this.createActivityFromEvent(event);
      if (!newActivity) return; // Ignore unhandled event types
      activity = newActivity;
      this.activeActivities.set(activity.id, activity);
    } else {
      // Update existing activity
      this.updateActivityFromEvent(activity, event);
    }

    // Pass the updated activity to the Priority Engine for presentation decision
    priorityEngine.evaluate(activity, event);

    if (activity.type === ActivityType.CLIPBOARD) {
      // Clipboard is a replaceable temporary activity, never a persistent source state.
      if (this.activeClipboardId && this.activeClipboardId !== activity.id) {
        if (this.clipboardTimer) clearTimeout(this.clipboardTimer);
        this.rememberTerminalClipboard(this.activeClipboardId);
        priorityEngine.expireClipboard(this.activeClipboardId);
        this.activeActivities.delete(this.activeClipboardId);
      }
      this.activeClipboardId = activity.id;
      if (this.clipboardTimer) clearTimeout(this.clipboardTimer);
      const expectedUpdatedAt = activity.updatedAt;
      const requestedDuration = Number(activity.payload?.durationMs);
      const duration = [1500, 2000, 2500].includes(requestedDuration) ? requestedDuration : 2000;
      this.clipboardTimer = setTimeout(() => {
        this.clipboardTimer = null;
        const current = this.activeActivities.get(activity!.id);
        if (!current || current.updatedAt !== expectedUpdatedAt) return;
        current.state = ActivityState.EXPIRED;
        this.rememberTerminalClipboard(current.id);
        this.activeActivities.delete(current.id);
        priorityEngine.expireClipboard(current.id);
        if (this.activeClipboardId === current.id) this.activeClipboardId = null;
      }, duration);
      return;
    }

    if (activity.type === ActivityType.SYSTEM_ACTIVITY) {
      if (this.activeSystemActivityId && this.activeSystemActivityId !== activity.id) {
        this.rememberTerminalSystemActivity(this.activeSystemActivityId);
        const replaced = this.activeActivities.get(this.activeSystemActivityId);
        if (replaced) replaced.state = ActivityState.EXPIRED;
        this.activeActivities.delete(this.activeSystemActivityId);
      }
      this.activeSystemActivityId = activity.id;
      if (this.systemActivityTimer) clearTimeout(this.systemActivityTimer);
      const expectedUpdatedAt = activity.updatedAt;
      this.systemActivityTimer = setTimeout(() => {
        this.systemActivityTimer = null;
        const current = this.activeActivities.get(activity!.id);
        if (!current || current.updatedAt !== expectedUpdatedAt) return;
        current.state = ActivityState.EXPIRED;
        this.rememberTerminalSystemActivity(current.id);
        this.activeActivities.delete(current.id);
        priorityEngine.expireSystemActivity(current.id);
        if (this.activeSystemActivityId === current.id) this.activeSystemActivityId = null;
      }, 2500);
      return;
    }

    // Keep a finished activity briefly so its exit animation can complete.
    // Remove it only if no newer event has updated the same activity meanwhile.
    if (this.isActivityFinished(activity.state)) {
      const expectedUpdatedAt = activity.updatedAt;
      const timer = setTimeout(() => {
        this.expiryTimers.delete(activity!.id);
        const current = this.activeActivities.get(activity!.id);
        if (current?.updatedAt === expectedUpdatedAt && this.isActivityFinished(current.state)) {
          this.activeActivities.delete(activity!.id);
        }
      }, 10000);
      this.expiryTimers.set(activity.id, timer);
    }
  }

  private createActivityFromEvent(event: PulseEvent): PulseActivity | null {
    const base = {
      id: event.id,
      startedAt: event.timestamp,
      updatedAt: event.timestamp,
      payload: event.payload
    };

    switch (event.type) {
      case EventType.MEDIA_STARTED:
      case EventType.MEDIA_PLAYING:
      case EventType.MEDIA_CHANGED:
        return { ...base, type: ActivityType.MEDIA, classification: ActivityClassification.PERSISTENT, state: ActivityState.ACTIVE };
      case EventType.MEDIA_PAUSED:
        return { ...base, type: ActivityType.MEDIA, classification: ActivityClassification.PERSISTENT, state: ActivityState.PAUSED };
      case EventType.MEDIA_STOPPED:
        return { ...base, type: ActivityType.MEDIA, classification: ActivityClassification.PERSISTENT, state: ActivityState.STOPPED };

      case EventType.NOTIFICATION_RECEIVED:
        return { ...base, type: ActivityType.NOTIFICATION, classification: ActivityClassification.TEMPORARY, state: ActivityState.PENDING };
      
      case EventType.DOWNLOAD_STARTED:
        return { ...base, type: ActivityType.DOWNLOAD, classification: ActivityClassification.PERSISTENT, state: ActivityState.STARTED };
      case EventType.DOWNLOAD_PROGRESS:
        return { ...base, type: ActivityType.DOWNLOAD, classification: ActivityClassification.PERSISTENT, state: ActivityState.ACTIVE };
      case EventType.DOWNLOAD_COMPLETED:
        return { ...base, type: ActivityType.DOWNLOAD, classification: ActivityClassification.TEMPORARY, state: ActivityState.COMPLETED };
      case EventType.DOWNLOAD_FAILED:
        return { ...base, type: ActivityType.DOWNLOAD, classification: ActivityClassification.TEMPORARY, state: ActivityState.FAILED };
      case EventType.DOWNLOAD_CANCELED:
        return { ...base, type: ActivityType.DOWNLOAD, classification: ActivityClassification.TEMPORARY, state: ActivityState.CANCELED };

      case EventType.POWER_SOURCE_CHANGED:
      case EventType.CHARGING_STARTED:
      case EventType.CHARGING_STOPPED:
      case EventType.BATTERY_LOW:
      case EventType.BATTERY_FULL:
        return { ...base, type: ActivityType.POWER, classification: ActivityClassification.TEMPORARY, state: ActivityState.ACTIVE };

      case EventType.CAMERA_ACTIVE:
      case EventType.MICROPHONE_ACTIVE:
        return { ...base, type: ActivityType.PRIVACY, classification: ActivityClassification.AMBIENT, state: ActivityState.ACTIVE };
      case EventType.CAMERA_INACTIVE:
      case EventType.MICROPHONE_INACTIVE:
        return { ...base, type: ActivityType.PRIVACY, classification: ActivityClassification.AMBIENT, state: ActivityState.INACTIVE };

      case EventType.CLIPBOARD_CHANGED:
        return { ...base, type: ActivityType.CLIPBOARD, classification: ActivityClassification.TEMPORARY, state: ActivityState.ACTIVE };
      case EventType.BLUETOOTH_ACTIVITY:
      case EventType.USB_ACTIVITY:
      case EventType.SCREENSHOT_ACTIVITY:
        return { ...base, type: ActivityType.SYSTEM_ACTIVITY, classification: ActivityClassification.TEMPORARY, state: ActivityState.ACTIVE };

      default:
        return null;
    }
  }

  private rememberTerminalClipboard(id: string) {
    this.terminalClipboardIds.delete(id);
    this.terminalClipboardIds.add(id);
    if (this.terminalClipboardIds.size > 256) {
      this.terminalClipboardIds.delete(this.terminalClipboardIds.values().next().value!);
    }
  }

  private rememberTerminalSystemActivity(id: string) {
    this.terminalSystemActivityIds.delete(id);
    this.terminalSystemActivityIds.add(id);
    if (this.terminalSystemActivityIds.size > 512) this.terminalSystemActivityIds.delete(this.terminalSystemActivityIds.values().next().value!);
  }


  private updateActivityFromEvent(activity: PulseActivity, event: PulseEvent) {
    activity.updatedAt = event.timestamp;
    
    // Merge or replace payload depending on type
    if (activity.type === ActivityType.DOWNLOAD && event.payload) {
      activity.payload = { ...activity.payload, ...event.payload };
    } else {
      activity.payload = event.payload;
    }

    switch (event.type) {
      case EventType.MEDIA_PLAYING: activity.state = ActivityState.ACTIVE; break;
      case EventType.MEDIA_CHANGED: activity.state = ActivityState.UPDATED; break;
      case EventType.MEDIA_PAUSED: activity.state = ActivityState.PAUSED; break;
      case EventType.MEDIA_STOPPED: activity.state = ActivityState.STOPPED; break;
      
      case EventType.NOTIFICATION_UPDATED: activity.state = ActivityState.UPDATED; break;
      case EventType.NOTIFICATION_DISMISSED: activity.state = ActivityState.DISMISSED; break;
      
      case EventType.DOWNLOAD_PROGRESS: activity.state = ActivityState.ACTIVE; break;
      case EventType.DOWNLOAD_COMPLETED: 
        activity.state = ActivityState.COMPLETED; 
        activity.classification = ActivityClassification.TEMPORARY; // Becomes temporary upon completion
        break;
      case EventType.DOWNLOAD_FAILED: 
        activity.state = ActivityState.FAILED;
        activity.classification = ActivityClassification.TEMPORARY;
        break;
      case EventType.DOWNLOAD_CANCELED: 
        activity.state = ActivityState.CANCELED;
        activity.classification = ActivityClassification.TEMPORARY;
        break;
        
      case EventType.CHARGING_STARTED:
      case EventType.CHARGING_STOPPED:
      case EventType.POWER_SOURCE_CHANGED:
      case EventType.BATTERY_LOW:
      case EventType.BATTERY_FULL:
        activity.state = ActivityState.ACTIVE; break;

      case EventType.CAMERA_ACTIVE:
      case EventType.MICROPHONE_ACTIVE:
        activity.state = ActivityState.ACTIVE; break;
      case EventType.CAMERA_INACTIVE:
      case EventType.MICROPHONE_INACTIVE:
        activity.state = ActivityState.INACTIVE; break;
    }
  }

  private isActivityFinished(state: ActivityState): boolean {
    const finishedStates: ActivityState[] = [
      ActivityState.COMPLETED, 
      ActivityState.FAILED, 
      ActivityState.CANCELED, 
      ActivityState.EXPIRED, 
      ActivityState.DISMISSED,
      ActivityState.STOPPED,
      ActivityState.INACTIVE
    ];
    return finishedStates.includes(state);
  }
}

export const activityEngine = new ActivityEngine();
