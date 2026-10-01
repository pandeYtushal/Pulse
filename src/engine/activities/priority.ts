import { ActivityClassification, ActivityState, type PulseActivity } from './types.ts';
import type { PulseEvent } from '../events/types.ts';
import { presentationManager } from './presentation.ts';

class PriorityEngine {
  public stop() {
    presentationManager.stop();
  }

  public expireClipboard(id: string) {
    presentationManager.expireClipboard(id);
  }

  public expireSystemActivity(id: string) {
    presentationManager.expireSystemActivity(id);
  }

  public evaluate(activity: PulseActivity, event: PulseEvent) {
    // 1. Determine base priority if not strictly provided by the event
    let activePriority = event.priority;

    // 2. Adjust priority based on activity state
    if (activity.classification === ActivityClassification.AMBIENT) {
      activePriority = 'AMBIENT';
    }

    // High importance temporary states (like download completed or charging started)
    if (activity.classification === ActivityClassification.TEMPORARY && 
       (activity.state === ActivityState.COMPLETED || activity.state === ActivityState.ACTIVE || activity.state === ActivityState.FAILED)) {
      if (activePriority === 'NORMAL') activePriority = 'HIGH';
    }

    // 3. Delegate to presentation manager
    // The Presentation Manager uses the priority to decide whether to SHOW_NOW, QUEUE, IGNORE, or UPDATE
    presentationManager.decide(activity, activePriority);
  }
}

export const priorityEngine = new PriorityEngine();
