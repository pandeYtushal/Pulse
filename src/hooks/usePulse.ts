import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePulseStore } from '../store/pulseStore';

export function usePulse() {
  const mode = usePulseStore(state => state.mode);
  const notifications = usePulseStore(state => state.notifications);
  const media = usePulseStore(state => state.media);

  useEffect(() => {
    const updateWindowSize = async () => {
      try {
        let targetWidth = 500;
        let targetHeight = 420;

        if (mode === 'idle') {
          targetWidth = 136;
          targetHeight = 48;
        } else if (mode === 'music') {
          targetWidth = 360;
          targetHeight = 54;
        } else if (mode === 'notification') {
          targetWidth = 350;
          targetHeight = 54;
        } else if (mode === 'download') {
          targetWidth = 340;
          targetHeight = 54;
        } else if (mode === 'hardware-alert') {
          targetWidth = 300;
          targetHeight = 54;
        } else if (mode === 'clipboard') {
          targetWidth = 224;
          targetHeight = 52;
        } else if (mode === 'system-activity') {
          targetWidth = 300;
          targetHeight = 54;
        } else if (mode === 'expanded-music') {
          targetWidth = 380;
          targetHeight = 256;
        } else if (mode === 'expanded-notification') {
          targetWidth = 360;
          if (notifications.length > 1) {
            targetHeight = Math.min(120 + (notifications.length * 60), 400);
          } else {
            const mediaAvailable = media?.playback_status !== 'Closed' && !!media?.title;
            targetHeight = mediaAvailable ? 240 : 180;
          }
        } else if (mode === 'expanded-download') {
          targetWidth = 360;
          targetHeight = 168;
        } else if (mode === 'expanded-hardware') {
          targetWidth = 360;
          targetHeight = 140;
        } else if (mode === 'expanded-clipboard') {
          targetWidth = 360;
          targetHeight = 140;
        } else if (mode === 'settings') {
          targetWidth = 360;
          targetHeight = 440;
        }

        // Hit region should exactly match the interactive island size (no extra padding)
        let hitWidth = targetWidth;
        let hitHeight = targetHeight;
        
        // Add a tiny bit of padding (4px) just for usability
        hitWidth += 8;
        hitHeight += 8;

        const isExpanded = mode.startsWith('expanded') || mode === 'settings';
        if (isExpanded) {
          // Allow receiving pointer events in the safe zone (must match the native window size)
          hitWidth = 800;
          hitHeight = 600;
        }

        const isShrinking = ['idle', 'music', 'notification'].includes(mode);
        
        if (isShrinking) {
          setTimeout(async () => {
             await invoke('set_hit_region', { width: hitWidth, height: hitHeight });
          }, 350); // wait for spring to settle
        } else {
          await invoke('set_hit_region', { width: hitWidth, height: hitHeight });
        }
      } catch (e) {
        console.error("Failed to setup hit region:", e);
      }
    };
    
    updateWindowSize();
  }, [mode, notifications.length, media?.playback_status, media?.title]);
}
