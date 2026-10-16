import type { DungeonState } from './types.js';
import { createInitialState } from './generator.js';
import { validateState } from './validate.js';

export type LoadResult = { ok: true } | { ok: false; reason: string };

/** Autosave slot. A dungeon is only held in memory otherwise, and browsers discard background tabs. */
export const STORAGE_KEY = 'dungeon-generator.autosave';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // access can throw when site data is blocked
  }
}

/**
 * Saves from the build that had roll overrides may hold user-written text in
 * `orphanedNotes` (notes parked when an override removed their room). Nothing
 * displays that list any more, so fold the text into an ordinary note on the
 * first room, where it stays visible and editable, and drop the dead fields.
 * If there is no room to put it in, leave the data alone rather than lose it.
 */
function migrateLegacyNotes(p: Record<string, unknown>): void {
  const legacy = p.orphanedNotes;
  if (legacy === undefined) return;
  const rooms = p.rooms;
  const first: unknown = Array.isArray(rooms) ? rooms[0] : undefined;
  const recovered = (Array.isArray(legacy) ? legacy : []).flatMap((o: unknown) => {
    if (typeof o !== 'object' || o === null) return [];
    const { label, notes } = o as { label?: unknown; notes?: unknown };
    if (typeof notes !== 'string' || notes.trim() === '') return [];
    return [`[Recovered note${typeof label === 'string' && label ? ` from ${label}` : ''}] ${notes}`];
  });

  if (recovered.length > 0) {
    if (typeof first !== 'object' || first === null) return;
    const room = first as { notes?: unknown };
    const existing = typeof room.notes === 'string' ? room.notes : '';
    room.notes = [existing, ...recovered].filter(Boolean).join('\n');
  }
  delete p.orphanedNotes;
  delete p.overrides;
  delete p.targetSteps;
}

function parseState(json: string): { ok: true; state: DungeonState } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'The file could not be read.' };
  }
  const p = parsed as Partial<DungeonState> | null;
  if (typeof p !== 'object' || p === null || !p.rooms || !p.corridors || !p.settings) {
    return { ok: false, reason: 'This does not look like a dungeon file.' };
  }
  if (p.version !== 2) {
    return { ok: false, reason: 'This file was saved by an older version and can no longer be opened.' };
  }
  migrateLegacyNotes(parsed as Record<string, unknown>);
  const problem = validateState(parsed);
  if (problem) return { ok: false, reason: `This dungeon file is damaged (${problem}).` };
  return { ok: true, state: parsed as DungeonState };
}

/**
 * Reads the autosave. Runs while the module initialises, so nothing in here may
 * throw: any failure (blocked storage, damaged entry, failing cleanup) must
 * fall back to a fresh, in-memory dungeon rather than stop the app starting.
 */
function readAutosave(): DungeonState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const result = parseState(raw);
    if (result.ok && result.state.started) return result.state;
    discardAutosave(store); // unreadable or stale: do not keep tripping over it
  } catch (err) {
    console.warn('Could not read the autosaved dungeon; starting fresh.', err);
  }
  return null;
}

function discardAutosave(store: Storage): void {
  try {
    store.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Could not remove the damaged autosave.', err);
  }
}

function autosave(): void {
  const store = storage();
  if (!store) return;
  try {
    if (_state.started) store.setItem(STORAGE_KEY, JSON.stringify(_state));
    else store.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Could not autosave the dungeon (storage full or blocked).', err);
  }
}

let _state: DungeonState = readAutosave() ?? createInitialState();
const _listeners: Array<() => void> = [];

function notify(): void {
  autosave();
  _listeners.forEach(fn => fn());
}

export function getState(): Readonly<DungeonState> {
  return _state;
}

export function setState(updater: (s: DungeonState) => DungeonState): void {
  _state = updater({ ..._state });
  notify();
}

export function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx !== -1) _listeners.splice(idx, 1);
  };
}

export function resetState(): void {
  _state = createInitialState();
  notify();
}

export function saveToFile(): void {
  const json = JSON.stringify(_state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dungeon-${_state.seed}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function loadFromJSON(json: string): LoadResult {
  const result = parseState(json);
  if (!result.ok) return result;
  _state = result.state;
  notify();
  return { ok: true };
}
