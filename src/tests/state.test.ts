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
