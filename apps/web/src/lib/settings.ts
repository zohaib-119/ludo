import { create } from 'zustand';
import { readJson, writeJson } from './storage';

export type Theme = 'system' | 'light' | 'dark';

export interface PersonalSettings {
  theme: Theme;
  soundVolume: number; // 0..1
  haptics: boolean;
  quickMove: boolean;
  autoMove: boolean;
  colorBlindMarkers: boolean;
  /** null = follow the OS. */
  reducedMotion: boolean | null;
}

const KEY = 'dodice.settings';
const DEFAULTS: PersonalSettings = {
  theme: 'system',
  soundVolume: 0.8,
  haptics: true,
  quickMove: true,
  autoMove: true,
  colorBlindMarkers: false,
  reducedMotion: null,
};

interface SettingsStore extends PersonalSettings {
  update(patch: Partial<PersonalSettings>): void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  ...readJson<Partial<PersonalSettings>>(KEY, {}),
  update(patch) {
    set(patch);
    const { update: _u, ...values } = { ...get() };
    writeJson(KEY, values);
  },
}));

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
