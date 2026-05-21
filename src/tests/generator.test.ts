import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateStart,
  generateNext,
  advance,
  turnLeft,
  turnRight,
  opposite,
  resetIdCounter,
  buildRoomDescription,
} from '../generator.js';
import type { DungeonState, Direction } from '../types.js';

function makeState(): DungeonState {
  return {
    settings: { level: 1, size: 'medium', startDirection: 'north' },
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

beforeEach(() => {
  resetIdCounter();
});

describe('direction helpers', () => {
  it('advance moves correctly in each direction', () => {
    expect(advance({ x: 0, y: 0 }, 'north', 3)).toEqual({ x: 0, y: -3 });
    expect(advance({ x: 0, y: 0 }, 'south', 3)).toEqual({ x: 0, y: 3 });
    expect(advance({ x: 0, y: 0 }, 'east', 3)).toEqual({ x: 3, y: 0 });
    expect(advance({ x: 0, y: 0 }, 'west', 3)).toEqual({ x: -3, y: 0 });
  });

  it('turnLeft is correct', () => {
    const turns: [Direction, Direction][] = [['north','west'],['west','south'],['south','east'],['east','north']];
    for (const [from, to] of turns) expect(turnLeft(from)).toBe(to);
  });

  it('turnRight is correct', () => {
    const turns: [Direction, Direction][] = [['north','east'],['east','south'],['south','west'],['west','north']];
    for (const [from, to] of turns) expect(turnRight(from)).toBe(to);
  });

  it('opposite is correct', () => {
    const pairs: [Direction, Direction][] = [['north','south'],['south','north'],['east','west'],['west','east']];
    for (const [a, b] of pairs) expect(opposite(a)).toBe(b);
  });
});

describe('generateStart', () => {
  it('produces a started state with one corridor and one cursor', () => {
    const state = generateStart(makeState());
    expect(state.started).toBe(true);
    expect(state.corridors).toHaveLength(1);
    expect(state.cursors).toHaveLength(1);
    expect(state.rollHistory.length).toBeGreaterThan(0);
  });

  it('corridor direction matches settings', () => {
    const s = generateStart({ ...makeState(), settings: { level: 1, size: 'medium', startDirection: 'east' } });
    expect(s.corridors[0].direction).toBe('east');
  });

  it('cursor is positioned one cell beyond the corridor exit end', () => {
    const s = generateStart(makeState());
    const cor = s.corridors[0];
    const cursor = s.cursors[0];
    // North corridor: exit end is rect.y (northernmost row); cursor is one cell further north.
    expect(cursor.position.y).toBe(cor.rect.y - 1);
  });
});

describe('generateNext', () => {
  it('returns same state if no cursors', () => {
    const base = { ...makeState(), started: true };
    const result = generateNext(base);
    expect(result).toBe(base);
  });

  it('consumes one cursor per step', () => {
    let state = generateStart(makeState());
    const before = state.cursors.length;
    state = generateNext(state);
    // Cursors change: could go up or down depending on result
    expect(state.stepCount).toBe(before + 1);
  });

  it('always produces at least one roll record per step', () => {
    let state = generateStart(makeState());
    const beforeRolls = state.rollHistory.length;
    state = generateNext(state);
    expect(state.rollHistory.length).toBeGreaterThan(beforeRolls);
  });

  it('never produces corridors with zero area', () => {
    let state = generateStart(makeState());
    for (let i = 0; i < 20; i++) {
      if (state.cursors.length === 0) break;
      state = generateNext(state);
    }
    for (const cor of state.corridors) {
      expect(cor.rect.w).toBeGreaterThan(0);
      expect(cor.rect.h).toBeGreaterThan(0);
    }
  });

  it('corridors always have a fromId that references something', () => {
    let state = generateStart(makeState());
    for (let i = 0; i < 20; i++) {
      if (state.cursors.length === 0) break;
      state = generateNext(state);
    }
    const validIds = new Set([
      'entrance',
      ...state.rooms.map(r => r.id),
      ...state.corridors.map(c => c.id),
    ]);
    for (const cor of state.corridors) {
      expect(validIds.has(cor.fromId)).toBe(true);
    }
  });

  it('rooms always have a valid shape', () => {
    const validShapes = new Set(['square', 'rectangle', 'circle', 'irregular']);
    let state = generateStart(makeState());
    for (let i = 0; i < 30; i++) {
      if (state.cursors.length === 0) break;
      state = generateNext(state);
    }
    for (const room of state.rooms) {
      expect(validShapes.has(room.shape)).toBe(true);
    }
  });

  it('room rect dimensions are positive', () => {
    let state = generateStart(makeState());
    for (let i = 0; i < 30; i++) {
      if (state.cursors.length === 0) break;
      state = generateNext(state);
    }
    for (const room of state.rooms) {
      expect(room.rect.w).toBeGreaterThan(0);
      expect(room.rect.h).toBeGreaterThan(0);
    }
  });
});

describe('buildRoomDescription', () => {
  it('returns a non-empty string for all content types', () => {
    const types = ['empty','monster','monster_treasure','trap','trap_treasure','special','treasure'] as const;
    for (const contents of types) {
      const room = {
        id: 'room_1',
        shape: 'square' as const,
        rect: { x: 0, y: 0, w: 3, h: 3 },
        contents,
        exits: [],
        notes: '',
        isEntrance: false,
      };
      const desc = buildRoomDescription(room);
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});
