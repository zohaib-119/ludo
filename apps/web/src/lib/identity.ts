import { AVATARS, LIMITS, isPlayerAvatar } from '@ludo/protocol';
import { readJson, readString, writeJson, writeString } from './storage';

const TOKEN_KEY = 'dodice.playerToken';
const PROFILE_KEY = 'dodice.profile';
const LAST_ROOM_KEY = 'dodice.lastRoom';

export interface Profile {
  name: string;
  avatar: string;
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** The secret that owns this browser's seats. Created once, kept forever. */
export function playerToken(): string {
  let token = readString(TOKEN_KEY);
  if (!token || token.length < 8) {
    token = randomToken();
    writeString(TOKEN_KEY, token);
  }
  return token;
}

export function loadProfile(): Profile {
  const p = readJson<Partial<Profile>>(PROFILE_KEY, {});
  // Older profiles stored an emoji; they get the first generated avatar instead.
  const avatar = isPlayerAvatar(p.avatar) ? p.avatar : AVATARS[0];
  return { name: typeof p.name === 'string' ? p.name : '', avatar };
}

export function saveProfile(profile: Profile): void {
  writeJson(PROFILE_KEY, profile);
}

export function isValidName(name: string): boolean {
  const n = name.trim();
  return n.length >= LIMITS.nameMin && n.length <= LIMITS.nameMax;
}

/** The last room this browser was in, for "Continue game" on the home page. */
export const lastRoom = {
  get: (): string | null => readString(LAST_ROOM_KEY),
  set: (code: string | null): void => writeString(LAST_ROOM_KEY, code),
};
