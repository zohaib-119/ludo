import { create } from 'zustand';
import { readJson, writeJson } from './storage';
import type { BoardThemeId, DiceStyleId, PieceStyleId } from './themes';

export interface PersonalSettings {
  soundVolume: number; // 0..1
  haptics: boolean;
  quickMove: boolean;
  autoMove: boolean;
  colorBlindMarkers: boolean;
  /** null = follow the OS. */
  reducedMotion: boolean | null;
  /** Personal look (this browser only). */
  boardTheme: BoardThemeId;
  pieceStyle: PieceStyleId;
  diceStyle: DiceStyleId;
}

const KEY = 'dodice.settings';
const DEFAULTS: PersonalSettings = {
  soundVolume: 0.8,
  haptics: true,
  quickMove: true,
  autoMove: true,
  colorBlindMarkers: false,
  reducedMotion: null,
  boardTheme: 'classic',
  pieceStyle: 'glossy',
  diceStyle: 'tinted',
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
