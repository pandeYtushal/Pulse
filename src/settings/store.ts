import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PulseSettings } from './types';
import { DEFAULT_SETTINGS } from './defaults';

// Safety: never write sensitive data into settings.
// The `notificationHistory` field only records a boolean preference, never content.

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
      version: 2,
      migrate: (persistedState, version) => {
        const persisted = persistedState as SettingsStore;
        // Version 1 used 10 px as its default. Move that old default to the new
        // flush-to-top anchor once; later user-selected offsets remain intact.
        if (version < 2 && persisted.settings?.topOffset === 10) {
          return { ...persisted, settings: { ...persisted.settings, topOffset: 0 } };
        }
        return persisted;
      },
      // Migration: merge saved settings with defaults so new keys always exist
      merge: (persistedState, currentState) => {
        // A first launch has no persisted value yet. Zustand passes `undefined`
        // to merge in that case, so treat it as an empty settings object.
        const persisted = (persistedState as SettingsStore | undefined)?.settings ?? {};
        return {
          ...currentState,
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
