import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePulseStore } from "../store/pulseStore";
import { usePulse } from "../hooks/usePulse";
import { PulseShell } from "./PulseIsland/PulseShell";
import { MusicContent } from "./MusicContent";
import { NotificationContent } from "./NotificationContent";
import { DownloadContent } from "./DownloadContent";
import { HardwareContent } from "./HardwareContent";
import { ClipboardContent } from "./ClipboardContent";
import { Bluetooth, Cable, Camera, Headphones } from "lucide-react";
import { SettingsPanel } from "./SettingsPanel";
import { useSetting } from "../settings/store";

import { useNotificationTimer } from '../hooks/useNotificationTimer';
import { pulseEngine } from '../engine';

interface PulseIslandProps {
  windowShown: boolean;
  revealToken: number;
}

type PulsePresentationState = 'visible' | 'retracting' | 'retracted' | 'returning';

export default function PulseIsland({ windowShown, revealToken }: PulseIslandProps) {
  usePulse();
  useNotificationTimer();

  useEffect(() => {
    pulseEngine.start();
    return () => {
      pulseEngine.stop();
    };
  }, []);

  const mode = usePulseStore(state => state.mode);
  const media = usePulseStore(state => state.media);
  const notifications = usePulseStore(state => state.notifications);
  const downloads = usePulseStore(state => state.downloads);
  const completedDownload = usePulseStore(state => state.completedDownload);
  const hardwareAlert = usePulseStore(state => state.hardwareAlert);
  const clipboardData = usePulseStore(state => state.clipboardData);
  const systemActivity = usePulseStore(state => state.systemActivity);
  const setMode = usePulseStore(state => state.setMode);
  const clearNotifications = usePulseStore(state => state.clearNotifications);

  const sensitiveApps = usePulseStore(state => state.sensitiveApps);
  const showNotificationContent = usePulseStore(state => state.showNotificationContent);
  const privacy = usePulseStore(state => state.privacy);
  const privacyActive = privacy?.microphone_active || privacy?.camera_active;
  const cameraMicEnabled = useSetting('cameraMicIndicator');

  const [time, setTime] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [presentationState, setPresentationState] = useState<PulsePresentationState>('visible');

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<boolean>('pulse-proximity', event => {
      setPresentationState(event.payload ? 'retracting' : 'returning');
    }).then(stopListening => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    const updateTime = () => {
      setTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const pulseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const state = usePulseStore.getState();
        if (state.mode === 'expanded-music') {
          state.setMode(state.notifications.length > 0 ? 'notification' : (state.downloads.length > 0 ? 'download' : 'music'));
        }
        if (state.mode === 'expanded-notification') state.clearNotifications();
        if (state.mode === 'expanded-download') {
           state.setMode(state.notifications.length > 0 ? 'notification' : 'download');
        }
        if (state.mode === 'settings') state.setMode('idle');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isExpanded = mode.startsWith('expanded-') || mode === 'settings';

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    let rafId: number;
    
    const handlePointerMove = (e: PointerEvent) => {
      if (!pulseRef.current) return;
      
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!pulseRef.current) return;

        // Suppress collapse while any mouse button is held (e.g. dragging a slider)
        if (e.buttons !== 0) return;
        
        const rect = pulseRef.current.getBoundingClientRect();
        const pointerX = e.clientX;
        const pointerY = e.clientY;

        const dx = Math.max(rect.left - pointerX, 0, pointerX - rect.right);
        const dy = Math.max(rect.top - pointerY, 0, pointerY - rect.bottom);
        const distance = Math.sqrt(dx * dx + dy * dy);

        const COLLAPSE_DISTANCE = 100;
        
        if (distance > COLLAPSE_DISTANCE) {
          console.log("[Pulse Interaction] COLLAPSE");
          const state = usePulseStore.getState();
          if (state.mode === 'expanded-music') {
            state.setMode(state.notifications.length > 0 ? 'notification' : (state.downloads.length > 0 ? 'download' : 'music'));
          }
          if (state.mode === 'expanded-notification') state.clearNotifications();
          if (state.mode === 'expanded-download') {
             state.setMode(state.notifications.length > 0 ? 'notification' : 'download');
          }
          if (state.mode === 'settings') state.setMode('idle');
        }
      });
    };

    const handlePointerLeave = (e: PointerEvent) => {
      // If a button is held (dragging), do not collapse — pointer may leave window during drag
      if (e.buttons !== 0) return;
      const state = usePulseStore.getState();
      if (state.mode === 'expanded-music') {
        state.setMode(state.notifications.length > 0 ? 'notification' : (state.downloads.length > 0 ? 'download' : 'music'));
      }
      if (state.mode === 'expanded-notification') state.clearNotifications();
      if (state.mode === 'expanded-download') {
         state.setMode(state.notifications.length > 0 ? 'notification' : 'download');
      }
      if (state.mode === 'settings') state.setMode('idle');
    };

    console.log("[Pulse Interaction] Expanded");
    window.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerleave', handlePointerLeave);
    
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
      cancelAnimationFrame(rafId);
    };
  }, [isExpanded, mode]);

  const handleToggleExpand = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (mode === 'music') setMode('expanded-music');
    else if (mode === 'notification') setMode('expanded-notification');
    else if (mode === 'download') setMode('expanded-download');
    else if (mode === 'hardware-alert') setMode('expanded-hardware');
    else if (mode === 'clipboard') setMode('expanded-clipboard');
    else if (mode === 'expanded-music') setMode(notifications.length > 0 ? 'notification' : (downloads.length > 0 ? 'download' : 'music'));
    else if (mode === 'expanded-notification') setMode('notification');
    else if (mode === 'expanded-download') setMode('download');
    else if (mode === 'expanded-hardware') setMode('hardware-alert');
    else if (mode === 'expanded-clipboard') setMode('clipboard');
  };

  const handleShellKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.target !== e.currentTarget) return;
    e.preventDefault();
    if (mode === 'idle') setMode('settings');
    else handleToggleExpand(e);
  };

  const currentNotification = notifications[0];
  const showPreview = currentNotification 
    ? (showNotificationContent && !sensitiveApps.includes(currentNotification.appName))
    : false;

  const getVariants = () => {
    switch (mode) {
      case "expanded-music":
        return { width: 380, height: 256, borderRadius: 24 };
      case "expanded-notification":
        if (notifications.length > 1) {
          return { width: 360, height: Math.min(96 + (notifications.length * 56), 320), borderRadius: 24 };
        }
        return { width: 360, height: 168, borderRadius: 24 };
      case "expanded-download":
        if (downloads.length > 1) {
          return { width: 360, height: Math.min(96 + (downloads.length * 72), 320), borderRadius: 24 };
        }
        return { width: 360, height: 168, borderRadius: 24 };
      case "expanded-hardware":
        return { width: 320, height: 112, borderRadius: 24 };
      case "expanded-clipboard":
        return { width: 300, height: 104, borderRadius: 24 };
      case "idle":
        return { width: 136, height: 48, borderRadius: 24 };
      case "music":
        return { width: 360, height: 54, borderRadius: 27 };
      case "notification":
        return { width: 350, height: 54, borderRadius: 27 };
      case "download":
        return { width: 340, height: 54, borderRadius: 27 };
      case "hardware-alert":
        return { width: 300, height: 54, borderRadius: 27 };
      case "clipboard":
        return { width: 224, height: 52, borderRadius: 26 };
      case "system-activity":
        return { width: 300, height: 54, borderRadius: 27 };
      case "settings":
        return { width: 360, height: 440, borderRadius: 22 };
      default:
        return { width: 136, height: 48, borderRadius: 24 };
    }
  };

  const variants = getVariants();

  useEffect(() => {
    void invoke('set_hit_region', { width: variants.width, height: variants.height }).catch((error) => {
      console.warn('[Pulse Interaction] Could not update hit region:', error);
    });
    void invoke('set_retraction_enabled', { enabled: !isExpanded }).catch((error) => {
      console.warn('[Pulse Interaction] Could not update retraction state:', error);
    });
  }, [variants.width, variants.height, isExpanded]);

  const handlePresentationAnimationComplete = () => {
    setPresentationState(state => {
      if (state === 'retracting') return 'retracted';
      if (state === 'returning') return 'visible';
      return state;
    });
  };

  return (
    <div className="w-full h-full flex justify-center items-start pt-0 pointer-events-none">
      <div ref={pulseRef} className="pointer-events-auto">
        <PulseShell 
          width={variants.width} 
          height={variants.height} 
          borderRadius={variants.borderRadius} 
          onClick={handleToggleExpand}
          onKeyDown={handleShellKeyDown}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          windowShown={windowShown}
          revealToken={revealToken}
          presentationState={presentationState}
          onPresentationAnimationComplete={handlePresentationAnimationComplete}
        >
          {/* Main State Layer - Always mounted underneath */}
          <div 
            className="absolute inset-0 z-0 transition-opacity duration-300 pointer-events-none"
            style={{ opacity: (mode === 'idle' || mode === 'music' || mode === 'expanded-music') ? 1 : 0 }}
          >
            {media && media.playback_status !== 'Closed' && media.title ? (
              <div className="w-full h-full pointer-events-auto" role="region" aria-label={`Now playing: ${media.title}`}>
                <MusicContent media={media} mode={mode} isHovered={isHovered} />
              </div>
            ) : (
              <div className="w-full h-full relative">
                <div 
                  className="flex items-center justify-center w-full h-full text-[13px] font-medium tracking-wide text-white/70 hover:text-white transition-colors pointer-events-auto cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label="Open Pulse settings"
                  onClick={(e) => { e.stopPropagation(); setMode('settings'); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setMode('settings');
                    }
                  }}
                >
                  {time}
                </div>

                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                  <AnimatePresence>
                    {privacyActive && cameraMicEnabled && (
                      <motion.div
                        key="privacy-dot"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: [1, 0.45, 1], scale: [1, 1.15, 1] }}
                        exit={{ opacity: 0, scale: 0 }}
                        transition={{
                          opacity: { repeat: Infinity, duration: 1.4, ease: "easeInOut" },
                          scale:   { repeat: Infinity, duration: 1.4, ease: "easeInOut" },
                        }}
                        className="w-[5px] h-[5px] rounded-full bg-emerald-400/75 flex-shrink-0"
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>

          {/* Temporary Activity / Overlay Layer */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            <AnimatePresence mode="sync" initial={false}>
              {(mode === "notification" || mode === "expanded-notification") && notifications.length > 0 && (
                <motion.div key="notification-container" className="absolute inset-0 w-full h-full pointer-events-auto" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2, pointerEvents: 'none' }} transition={{ duration: 0.18, ease: 'easeOut' }}>
                  <NotificationContent 
                    notifications={notifications} 
                    mode={mode} 
                    showPreview={showPreview} 
                    onClear={clearNotifications} 
                  />
                </motion.div>
              )}

              {(mode === "download" || mode === "expanded-download") && (downloads.length > 0 || completedDownload) && (
                <motion.div key="download-container" className="absolute inset-0 w-full h-full pointer-events-auto" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2, pointerEvents: 'none' }} transition={{ duration: 0.18, ease: 'easeOut' }}>
                  <DownloadContent 
                    downloads={completedDownload ? [completedDownload, ...downloads] : downloads} 
                    mode={mode} 
                  />
                </motion.div>
              )}

              {(mode === "hardware-alert" || mode === "expanded-hardware") && hardwareAlert && (
                <motion.div key="hardware-container" className="absolute inset-0 w-full h-full pointer-events-auto" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2, pointerEvents: 'none' }} transition={{ duration: 0.18, ease: 'easeOut' }}>
                  <HardwareContent 
                    alert={hardwareAlert} 
                    mode={mode} 
                  />
                </motion.div>
              )}

          {(mode === "clipboard" || mode === "expanded-clipboard") && clipboardData && (
            <motion.div key="clipboard-container" className="absolute inset-0 w-full h-full pointer-events-auto" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2, pointerEvents: 'none' }} transition={{ duration: 0.18, ease: 'easeOut' }}>
              <ClipboardContent 
                data={clipboardData} 
                mode={mode} 
              />
            </motion.div>
          )}

          {mode === 'system-activity' && systemActivity && (
            <motion.div key="system-activity" className="absolute inset-0 w-full h-full flex items-center justify-center gap-2.5 text-white/90 text-[13px] font-medium pointer-events-auto" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2, pointerEvents: 'none' }} transition={{ duration: 0.18 }} aria-live="polite">
              {systemActivity.kind === 'bluetooth' && systemActivity.deviceClass === 'audio'
                ? <Headphones size={16} className="text-white/75" />
                : systemActivity.kind === 'bluetooth'
                  ? <Bluetooth size={16} className="text-white/75" />
                  : systemActivity.kind === 'usb'
                    ? <Cable size={16} className="text-white/65" />
                    : <Camera size={16} className="text-white/65" />}
              <span className="truncate max-w-[245px]">
                {systemActivity.kind === 'screenshot' ? 'Screenshot captured' : `${systemActivity.deviceName || (systemActivity.kind === 'bluetooth' ? 'Bluetooth device' : 'USB device')} ${systemActivity.action === 'disconnected' ? 'disconnected' : 'connected'}`}
              </span>
            </motion.div>
          )}

          {mode === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full"
              style={{ pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <SettingsPanel onClose={() => setMode('idle')} />
            </motion.div>
          )}
        </AnimatePresence>
          </div>
      </PulseShell>
      </div>
    </div>
  );
}
