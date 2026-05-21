import type { DungeonState, DungeonSettings } from './types.js';

const DEFAULT_SETTINGS: DungeonSettings = {
  level: 1,
  size: 'medium',
  startDirection: 'north',
};

function createInitialState(): DungeonState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    started: false,
    rooms: [],
    corridors: [],
    cursors: [],
    rollHistory: [],
    stepCount: 0,
    selectedRoomId: null,
    occupied: [],
  };
}

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
  a.download = 'dungeon.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function loadFromJSON(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as DungeonState;
    // minimal shape check
    if (!parsed.rooms || !parsed.corridors || !parsed.settings) return false;
    if (!Array.isArray(parsed.occupied)) parsed.occupied = [];
    _state = parsed;
    _listeners.forEach(fn => fn());
    return true;
  } catch {
    return false;
  }
}
