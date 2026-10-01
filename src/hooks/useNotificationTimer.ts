import { useEffect } from 'react';
import { usePulseStore } from '../store/pulseStore';
import { pulseEventBus } from '../engine/events/bus';
import { EventType } from '../engine/events/types';
import { useSetting } from '../settings/store';

export function useNotificationTimer() {
  const mode = usePulseStore(state => state.mode);
  const notifications = usePulseStore(state => state.notifications);
  const removeNotification = usePulseStore(state => state.removeNotification);
  const duration = useSetting('notificationDuration');
  
  const currentNotification = notifications[0];

  useEffect(() => {
    if (!currentNotification || mode === 'expanded-notification') {
      return; // Pause timer if expanded, or if queue is empty
    }
    console.log('[Timer] Effect running, mode:', mode, 'notification:', currentNotification?.id);

    const timer = setTimeout(() => {
      console.log('[Timer] Firing for:', currentNotification.id);
      const state = usePulseStore.getState();
      if (state.mode !== 'expanded-notification') {
        // Remove from store
        removeNotification(currentNotification.id);
        
        // Let the engine know it was dismissed so it updates activity state
        pulseEventBus.emit({
          id: currentNotification.id,
          type: EventType.NOTIFICATION_DISMISSED,
          source: 'UserTimeout',
          timestamp: Date.now(),
          priority: 'NORMAL',
          payload: null
        });
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [currentNotification, mode, removeNotification, duration]);
}
