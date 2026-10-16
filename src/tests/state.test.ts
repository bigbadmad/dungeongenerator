import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInitialState, generateAll, generateStart } from '../generator.js';

// Minimal in-memory localStorage, so state.ts can be exercised in node.
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

// A fresh import is a "page reload": module state is rebuilt from storage.
async function freshModule() {
  vi.resetModules();
  return import('../state.js');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('autosave', () => {
  it('a generated dungeon survives the page being reloaded', async () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);

    const first = await freshModule();
    const dungeon = generateAll(generateStart(createInitialState({ size: 'small' }, 123)));
    first.setState(() => dungeon);
    expect(store.data.has(first.STORAGE_KEY)).toBe(true);

    const second = await freshModule();
    expect(second.getState()).toEqual(dungeon);
  });

  it('keeps room selection and notes too', async () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    const first = await freshModule();
    first.setState(() => generateAll(generateStart(createInitialState({ size: 'small' }, 9))));
    const id = first.getState().rooms[0].id;
    first.setState(s => ({
      ...s,
      selectedRoomId: id,
      rooms: s.rooms.map(r => (r.id === id ? { ...r, notes: 'ambush' } : r)),
    }));

    const second = await freshModule();
    expect(second.getState().selectedRoomId).toBe(id);
    expect(second.getState().rooms.find(r => r.id === id)!.notes).toBe('ambush');
  });

  it('a half-generated step-by-step dungeon can be continued after a reload', async () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    const first = await freshModule();
    first.setState(() => generateStart(createInitialState({ size: 'small' }, 31)));

    const second = await freshModule();
    expect(second.getState().cursors.length).toBeGreaterThan(0);
    expect(generateAll(second.getState() as never).cursors).toHaveLength(0);
  });

  it('starting a new dungeon clears the autosave', async () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    const mod = await freshModule();
    mod.setState(() => generateStart(createInitialState({}, 4)));
    expect(store.data.size).toBe(1);
    mod.resetState();
    expect(store.data.size).toBe(0);
    expect((await freshModule()).getState().started).toBe(false);
  });

  it('ignores and discards a corrupt or outdated autosave', async () => {
    const bad = ['{not json', JSON.stringify({ version: 1, rooms: [], corridors: [], settings: {} })];
    for (const value of bad) {
      const store = fakeStorage({ 'dungeon-generator.autosave': value });
      vi.stubGlobal('localStorage', store);
      const mod = await freshModule();
      expect(mod.getState().started).toBe(false);
      expect(store.data.size).toBe(0);
    }
  });

  it('discards a version-2 autosave that is missing required fields', async () => {
    // Valid JSON, right version, "started" - but no cursors or roll history.
    // Accepting this used to crash the first render, on every reload.
    const incomplete = JSON.stringify({
      version: 2, started: true, rooms: [], corridors: [],
      settings: { level: 1, size: 'small', startDirection: 'north' },
    });
    const store = fakeStorage({ 'dungeon-generator.autosave': incomplete });
    vi.stubGlobal('localStorage', store);
    const mod = await freshModule();
    expect(mod.getState().started).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it('discards an autosave with a damaged nested record', async () => {
    const dungeon = JSON.parse(JSON.stringify(generateAll(generateStart(createInitialState({ size: 'small' }, 12)))));
    delete dungeon.rooms[0].rect;
    const store = fakeStorage({ 'dungeon-generator.autosave': JSON.stringify(dungeon) });
    vi.stubGlobal('localStorage', store);
    const mod = await freshModule();
    expect(mod.getState().started).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it('starts fresh when reading the autosave throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {},
      removeItem: () => {},
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await freshModule();
    expect(mod.getState().started).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('starts fresh when cleaning up a damaged autosave throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{not json',
      setItem: () => {},
      removeItem: () => { throw new Error('SecurityError'); },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await freshModule();
    expect(mod.getState().started).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('rejects a damaged file on load with a reason, leaving the current dungeon alone', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const mod = await freshModule();
    mod.setState(() => generateStart(createInitialState({}, 4)));
    const before = mod.getState();
    const damaged = JSON.parse(JSON.stringify(before));
    delete damaged.cursors;
    const result = mod.loadFromJSON(JSON.stringify(damaged));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('damaged');
    expect(mod.getState()).toBe(before);
  });

  it('keeps working when storage is full', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await freshModule();
    expect(() => mod.setState(() => generateStart(createInitialState({}, 4)))).not.toThrow();
    expect(mod.getState().started).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('keeps working with no localStorage at all', async () => {
    vi.stubGlobal('localStorage', undefined);
    const mod = await freshModule();
    expect(() => mod.setState(() => generateStart(createInitialState({}, 4)))).not.toThrow();
    expect(mod.getState().started).toBe(true);
  });

  it('loading a saved file replaces and autosaves the dungeon', async () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    const mod = await freshModule();
    const file = JSON.stringify(generateAll(generateStart(createInitialState({ size: 'small' }, 77))));
    expect(mod.loadFromJSON(file)).toEqual({ ok: true });
    expect(mod.getState().seed).toBe(77);
    expect(store.data.has(mod.STORAGE_KEY)).toBe(true);
    expect(mod.loadFromJSON('nope').ok).toBe(false);
  });
});
