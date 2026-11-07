import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@ludo/engine';
import { PRESETS, parseRoomCode, presetOf } from '../src';

describe('parseRoomCode', () => {
  it('accepts codes in any case, with spaces or dashes', () => {
    expect(parseRoomCode('k7qx9m')).toBe('K7QX9M');
    expect(parseRoomCode(' K7Q-X9M ')).toBe('K7QX9M');
  });
  it('accepts pasted links, even upper-cased by the input box', () => {
    expect(parseRoomCode('https://dodice.app/r/k7qx9m')).toBe('K7QX9M');
    expect(parseRoomCode('HTTPS://DODICE.APP/R/K7QX9M')).toBe('K7QX9M');
  });
  it('rejects wrong lengths and look-alike characters', () => {
    expect(parseRoomCode('ABC')).toBeNull();
    expect(parseRoomCode('K7QX9MM')).toBeNull();
    expect(parseRoomCode('K7QX0M')).toBeNull(); // 0 is not in the alphabet
    expect(parseRoomCode('K7QXIM')).toBeNull(); // I is not in the alphabet
    expect(parseRoomCode('')).toBeNull();
  });
});

describe('presets', () => {
  it('each preset is detected after applying it', () => {
    for (const [id, rules] of Object.entries(PRESETS)) {
      expect(presetOf({ ...DEFAULT_SETTINGS, ...rules })).toBe(id);
    }
  });
  it('1-die mode ignores the 2-dice endgame rule', () => {
    expect(presetOf({ ...DEFAULT_SETTINGS, ...PRESETS.classic, singleDieWhenAllInColumn: false })).toBe('classic');
  });
  it('anything else is custom', () => {
    expect(presetOf({ ...DEFAULT_SETTINGS, ...PRESETS.hardcore, extraTurnOnFinish: true })).toBe('custom');
  });
});
