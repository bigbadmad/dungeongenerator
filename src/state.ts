import type { DungeonState } from './types.js';
import { createInitialState } from './generator.js';

let _state: DungeonState = createInitialState();
const _listeners: Array<() => void> = [];

export function getState(): Readonly<DungeonState> {
  return _state;
}

export function setState(updater: (s: DungeonState) => DungeonState): void {
  _state = updater({ ..._state });
  _listeners.forEach(fn => fn());
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
  _listeners.forEach(fn => fn());
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

export type LoadResult = { ok: true } | { ok: false; reason: string };

export function loadFromJSON(json: string): LoadResult {
  try {
    const parsed = JSON.parse(json) as Partial<DungeonState>;
    if (!parsed.rooms || !parsed.corridors || !parsed.settings) {
      return { ok: false, reason: 'This does not look like a dungeon file.' };
    }
    if (parsed.version !== 2) {
      return { ok: false, reason: 'This file was saved by an older version and can no longer be opened.' };
    }
    const loaded = parsed as DungeonState;
    loaded.targetSteps ??= loaded.stepCount;
    loaded.orphanedNotes ??= [];
    for (const c of loaded.cursors) c.path ??= 'e';
    _state = loaded;
    _listeners.forEach(fn => fn());
    return { ok: true };
  } catch {
    return { ok: false, reason: 'The file could not be read.' };
  }
}
