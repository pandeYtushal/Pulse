import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { usePulseStore } from "./store/pulseStore";
import { useSettingsStore } from "./settings/store";
import PulseIsland from "./components/PulseIsland";
import { Onboarding } from "./components/Onboarding";

function App() {
  const setMode = usePulseStore(state => state.setMode);
  const hasCompletedOnboarding = useSettingsStore(state => state.hasCompletedOnboarding);
  const isLoaded = useSettingsStore(state => state.isLoaded);
  const position = useSettingsStore(state => state.settings.position);
  const startWithWindows = useSettingsStore(state => state.settings.startWithWindows);
  const horizontalAlignment = position.horizontal === 'left' ? 'justify-start' : position.horizontal === 'right' ? 'justify-end' : 'justify-center';
  const setSetting = useSettingsStore(state => state.setSetting);
  const notificationsEnabled = useSettingsStore(state => state.settings.notificationsEnabled);
  const showNotificationPreview = useSettingsStore(state => state.settings.showNotificationPreview);
  const notificationHistory = useSettingsStore(state => state.settings.notificationHistory);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [windowShown, setWindowShown] = useState(false);
  const [revealToken, setRevealToken] = useState(0);
  const onboardingVisible = isLoaded && (!hasCompletedOnboarding || showOnboarding);

  useEffect(() => {
    if (isLoaded) invoke('set_position_config', { config: position }).catch(error => {
      console.warn('[Pulse Startup] Could not apply position preferences:', error);
    });
  }, [isLoaded, position]);

  // Persistent preferences hydrate before the Pulse event pipeline starts. Keep
  // its runtime gates aligned so a restart cannot briefly expose old defaults.
  useEffect(() => {
    if (!isLoaded) return;
    const state = usePulseStore.getState();
    state.setNotificationsEnabled(notificationsEnabled);
    state.setShowNotificationContent(showNotificationPreview);
    state.setNotificationHistoryEnabled(notificationHistory);
  }, [isLoaded, notificationsEnabled, showNotificationPreview, notificationHistory]);

  useEffect(() => {
    if (!isLoaded) return;
    invoke('set_retraction_enabled', { enabled: !onboardingVisible }).catch((error) => {
      console.warn('[Pulse Startup] Could not update top-edge interaction:', error);
    });
  }, [isLoaded, onboardingVisible]);

  // The transparent native window routes clicks using this region. Keep it in
  // sync whenever onboarding is opened or closed (including from the tray),
  // otherwise controls can render outside the active hit area.
  useEffect(() => {
    if (!isLoaded || !onboardingVisible) return;
    invoke('set_hit_region', { width: 800, height: 600 }).catch((error) => {
      console.warn('[Pulse Startup] Could not update the hit region:', error);
    });
  }, [isLoaded, onboardingVisible]);

  // The native window stays hidden until persisted state and the first real UI
  // surface are ready. This prevents an empty/unstyled WebView frame at startup.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    const showAfterHydration = async () => {
      // Reveal the hydrated surface independently of the native show IPC. The
      // native window is visible from creation, so a transient invoke failure
      // must not leave the transparent Pulse shell collapsed forever.
      if (!cancelled) {
        setWindowShown(true);
        setRevealToken(token => token + 1);
      }
      try {
        await invoke('set_position_config', { config: useSettingsStore.getState().settings.position }).catch((error) => {
          console.warn('[Pulse Startup] Could not apply position preferences:', error);
        });
        await invoke('show_pulse_window');
      } catch (error) {
        console.error('[Pulse Startup] Could not show the main window:', error);
      }
    };
    void showAfterHydration();
    return () => { cancelled = true; };
  }, [isLoaded]);

  // Keep the Windows Run registration synchronized with the persisted choice,
  // and wait until onboarding is finished before applying its default.
  useEffect(() => {
    if (!isLoaded || !hasCompletedOnboarding) return;
    invoke(startWithWindows ? 'enable_autostart' : 'disable_autostart').catch((error) => {
      console.warn('[Pulse Startup] Could not update Windows startup setting:', error);
    });
  }, [isLoaded, hasCompletedOnboarding, startWithWindows]);

  useEffect(() => {
    const unlisten = listen<string>('tray-event', (event) => {
      const state = usePulseStore.getState();
      const mode = state.mode;
      const notifications = state.notifications;

      switch (event.payload) {
        case 'show':
          setWindowShown(true);
          setRevealToken(token => token + 1);
          break;
        case 'hide':
          setWindowShown(false);
          break;
        case 'toggle':
          if (mode === 'idle') setMode('settings');
          else if (mode === 'music') setMode('expanded-music');
          else if (mode === 'notification') setMode('expanded-notification');
          else if (mode === 'download') setMode('expanded-download');
          else if (mode === 'hardware-alert') setMode('expanded-hardware');
          else if (mode === 'clipboard') setMode('expanded-clipboard');
          else if (mode === 'expanded-music') setMode(notifications.length > 0 ? 'notification' : (state.downloads.length ? 'download' : 'music'));
          else if (mode === 'expanded-notification') setMode('notification');
          else if (mode === 'expanded-download') setMode('download');
          else if (mode === 'expanded-hardware') setMode('hardware-alert');
          else if (mode === 'expanded-clipboard') setMode('clipboard');
          else if (mode === 'settings') setMode('idle');
          break;
        case 'settings':
          setMode('settings');
          break;
        case 'pause_notifs':
          setSetting('notificationsEnabled', !state.notificationsEnabled);
          state.setNotificationsEnabled(!state.notificationsEnabled);
          break;
        case 'onboarding':
          setShowOnboarding(true);
          break;
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [setMode, setSetting]);

  // Show nothing until store has hydrated (prevents flash of onboarding)
  if (!isLoaded) return null;

  if (onboardingVisible) {
    return (
      <div className={`flex w-full h-full ${horizontalAlignment} items-start bg-transparent text-white overflow-hidden m-0 p-0`}>
        <OnboardingShell onComplete={() => setShowOnboarding(false)} />
      </div>
    );
  }

  return (
    <div className={`flex w-full h-full ${horizontalAlignment} items-start bg-transparent text-white overflow-hidden m-0 p-0`}>
      <PulseIsland windowShown={windowShown} revealToken={revealToken} />
    </div>
  );
}

// Onboarding renders inside its own fixed-size shell that matches the Pulse window
function OnboardingShell({ onComplete }: { onComplete: () => void }) {
  return (
    <div
      className="relative overflow-hidden text-white"
      style={{
        width: 'min(440px, calc(100vw - 24px))',
        height: 'min(570px, calc(100vh - 24px))',
        borderRadius: 20,
        background: 'rgba(17,17,19,0.985)',
        border: '1px solid rgba(255,255,255,0.085)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <Onboarding onComplete={onComplete} />
    </div>
  );
}

export default App;
