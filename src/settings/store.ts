import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PulseSettings } from './types';
import { DEFAULT_SETTINGS } from './defaults';

// Settings contain preferences only. Notification history is stored separately
// and only when the user enables it.

interface SettingsStore {
  settings: PulseSettings;
  hasCompletedOnboarding: boolean;
  setSetting: <K extends keyof PulseSettings>(key: K, value: PulseSettings[K]) => void;
  resetSettings: () => void;
  completeOnboarding: () => void;
  reopenOnboarding: () => void;
  isLoaded: boolean;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      hasCompletedOnboarding: false,
      isLoaded: false,
      setSetting: (key, value) =>
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        })),
      resetSettings: () =>
        set({ settings: { ...DEFAULT_SETTINGS } }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      reopenOnboarding: () => set({ hasCompletedOnboarding: false }),
    }),
    {
      name: 'pulse-settings-v1',
      version: 3,
      migrate: (persistedState, version) => {
        const persisted = persistedState as SettingsStore;
        if (version < 3 && persisted.settings) {
          const oldSettings = persisted.settings as unknown as Record<string, unknown>;
          let oldOffset = typeof oldSettings.topOffset === 'number' ? oldSettings.topOffset : 10;
          if (version < 2 && oldOffset === 10) oldOffset = 0;
          const migratedSettings: Record<string, unknown> = {
            ...oldSettings,
            position: { horizontal: 'center', verticalOffset: Math.max(0, Math.min(40, oldOffset)), display: 'active' },
          };
          delete migratedSettings.topOffset;
          return {
            ...persisted,
            settings: migratedSettings as unknown as PulseSettings,
          };
        }
        return persisted;
      },
      // Migration: merge saved settings with defaults so new keys always exist
      merge: (persistedState, currentState) => {
        // A first launch has no persisted value yet. Zustand passes `undefined`
        // to merge in that case, so treat it as an empty settings object.
        const savedState = (persistedState as Partial<SettingsStore> | undefined) ?? {};
        const persisted = savedState.settings ?? {};
        return {
          ...currentState,
          ...savedState,
          isLoaded: true,
          settings: { ...DEFAULT_SETTINGS, ...persisted },
        };
      },
      // Storage can also be unavailable or contain invalid JSON. In every case,
      // release the native startup-window gate and continue with defaults.
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Pulse Startup] Could not hydrate settings; using defaults.', error);
        }
        if (!state?.isLoaded) {
          useSettingsStore.setState({ isLoaded: true });
        }
      },
    }
  )
);

// Convenience hook for reading a single setting
export const useSetting = <K extends keyof PulseSettings>(key: K): PulseSettings[K] =>
  useSettingsStore((state) => state.settings[key]);
