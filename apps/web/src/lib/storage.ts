/**
 * localStorage that never throws: private windows, blocked storage and quota
 * errors fall back to an in-memory copy for this page session.
 */
const memory = new Map<string, string>();

export function readString(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* storage unavailable */
  }
  return memory.get(key) ?? null;
}

export function writeString(key: string, value: string | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: memory copy still works for this session */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}

/** True when localStorage really persists (false in some private modes). */
export function storagePersists(): boolean {
  try {
    const k = '__dodice_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
