export const ActivityState = {
  STARTED: 'STARTED',
  ACTIVE: 'ACTIVE',
  UPDATED: 'UPDATED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
  PAUSED: 'PAUSED',
  STOPPED: 'STOPPED',
  PENDING: 'PENDING',
  DISPLAYED: 'DISPLAYED',
  DISMISSED: 'DISMISSED',
  INACTIVE: 'INACTIVE',
} as const;
export type ActivityState = typeof ActivityState[keyof typeof ActivityState];

export const ActivityClassification = {
  TEMPORARY: 'TEMPORARY',
  PERSISTENT: 'PERSISTENT',
  AMBIENT: 'AMBIENT',
} as const;
export type ActivityClassification = typeof ActivityClassification[keyof typeof ActivityClassification];

export const ActivityType = {
  MEDIA: 'MEDIA',
  NOTIFICATION: 'NOTIFICATION',
  DOWNLOAD: 'DOWNLOAD',
  POWER: 'POWER',
  PRIVACY: 'PRIVACY',
  CLIPBOARD: 'CLIPBOARD',
  SYSTEM_ACTIVITY: 'SYSTEM_ACTIVITY',
} as const;
export type ActivityType = typeof ActivityType[keyof typeof ActivityType];

export interface PulseActivity {
  id: string; // The same ID as the underlying event sequence
  type: ActivityType;
  classification: ActivityClassification;
  state: ActivityState;
  startedAt: number;
  updatedAt: number;
  payload: any; // The latest accumulated state of the activity
}
