import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  generateStart,
  generateNext,
  generateAll,
  regenerate,
  applyOverride,
  clearOverride,
  advance,
  turnLeft,
  turnRight,
  opposite,
  buildRoomDescription,
  roomTarget,
  isComplete,
  SIZE_BUDGET,
} from '../generator.js';
import { roomCells, rectCells, buildLinks, posKey } from '../geometry.js';
import { entryForDie, ROOM_SHAPE } from '../tables.js';
import { TABLE_OPTIONS } from '../tableOptions.js';
import type { DungeonState, DungeonSize, Direction } from '../types.js';

function started(seed = 1, size: DungeonSize = 'medium', overrides: Record<string, string> = {}): DungeonState {
  return generateStart(createInitialState({ size, level: 3 }, seed, overrides));
}

function full(seed: number, size: DungeonSize = 'medium'): DungeonState {
  return generateAll(started(seed, size));
}

const SEEDS = Array.from({ length: 25 }, (_, i) => i * 7919 + 3);

describe('direction helpers', () => {
  it('advance moves correctly in each direction', () => {
    expect(advance({ x: 0, y: 0 }, 'north', 3)).toEqual({ x: 0, y: -3 });
    expect(advance({ x: 0, y: 0 }, 'south', 3)).toEqual({ x: 0, y: 3 });
    expect(advance({ x: 0, y: 0 }, 'east', 3)).toEqual({ x: 3, y: 0 });
    expect(advance({ x: 0, y: 0 }, 'west', 3)).toEqual({ x: -3, y: 0 });
  });

  it('turnLeft / turnRight / opposite are correct', () => {
    const left: [Direction, Direction][] = [['north', 'west'], ['west', 'south'], ['south', 'east'], ['east', 'north']];
    for (const [from, to] of left) {
      expect(turnLeft(from)).toBe(to);
      expect(turnRight(to)).toBe(from);
    }
    const opp: [Direction, Direction][] = [['north', 'south'], ['east', 'west']];
    for (const [a, b] of opp) {
      expect(opposite(a)).toBe(b);
      expect(opposite(b)).toBe(a);
    }
  });
});

describe('generateStart', () => {
  it('produces a started state with one passage and one cursor', () => {
    const state = started();
    expect(state.started).toBe(true);
    expect(state.corridors).toHaveLength(1);
    expect(state.cursors).toHaveLength(1);
    expect(state.corridors[0].fromId).toBe('entrance');
    expect(state.rollHistory.length).toBeGreaterThan(0);
  });

  it('runs in the chosen direction', () => {
    for (const dir of ['north', 'east', 'south', 'west'] as Direction[]) {
      const s = generateStart(createInitialState({ startDirection: dir }, 5));
      expect(s.corridors[0].direction).toBe(dir);
    }
  });

  it('places the cursor on the first free cell beyond the passage', () => {
    const s = started();
    const cor = s.corridors[0];
    expect(s.cursors[0].position.y).toBe(cor.rect.y - 1); // north is the default
  });
});

describe('determinism', () => {
  it('the same seed always gives the same dungeon', () => {
    expect(full(42)).toEqual(full(42));
  });

  it('different seeds give different dungeons', () => {
    expect(full(42).rooms).not.toEqual(full(43).rooms);
  });

  it('a saved state continues exactly as the original would have', () => {
    const s = generateNext(generateNext(started(9)));
    const reloaded = JSON.parse(JSON.stringify(s)) as DungeonState;
    expect(generateNext(reloaded)).toEqual(generateNext(s));
  });

  it('regenerating without overrides reproduces the dungeon exactly', () => {
    const s = full(77);
    expect(regenerate(s)).toEqual(s);
  });
});

describe('dice', () => {
  it('every die result is within its die and reads off the table', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const s = full(seed);
      for (const r of s.rollHistory) {
        if (r.sides === 0) continue;
        expect(r.diceResult).toBeGreaterThanOrEqual(1);
        expect(r.diceResult).toBeLessThanOrEqual(r.sides);
        if (r.table === 'Room Shape' && !r.overridden) {
          expect(entryForDie(ROOM_SHAPE, r.diceResult).label).toBe(r.outcome);
        }
      }
    }
  });

  it('every logged roll can be overridden with its own outcome', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const s = full(seed);
      for (const r of s.rollHistory) {
        if (r.sides === 0) continue;
        const options = TABLE_OPTIONS[r.table];
        expect(options, `no override options for table "${r.table}"`).toBeDefined();
        expect(options.map(o => String(o.value)), `${r.table} → ${r.outcomeKey}`).toContain(r.outcomeKey);
      }
    }
  });
});

describe('size budget', () => {
  for (const size of ['small', 'medium', 'large'] as DungeonSize[]) {
    it(`${size} dungeons finish with a sensible number of rooms`, () => {
      const { min, max } = SIZE_BUDGET[size];
      for (const seed of SEEDS) {
        const s = full(seed, size);
        expect(isComplete(s), `seed ${seed} did not finish`).toBe(true);
        expect(s.rooms.length, `seed ${seed}`).toBeGreaterThanOrEqual(min);
        // Forced side-door chambers may overshoot the target slightly.
        expect(s.rooms.length, `seed ${seed}`).toBeLessThanOrEqual(max + 6);
      }
    });
  }

  it('the target varies by seed but stays inside the range', () => {
    const targets = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const t = roomTarget('medium', seed);
      expect(t).toBeGreaterThanOrEqual(SIZE_BUDGET.medium.min);
      expect(t).toBeLessThanOrEqual(SIZE_BUDGET.medium.max);
      targets.add(t);
    }
    expect(targets.size).toBeGreaterThan(3);
  });
});

describe('geometry of generated dungeons', () => {
  it('never overlaps two areas', () => {
    for (const seed of SEEDS) {
      const s = full(seed, 'large');
      const seen = new Set<string>();
      const all = [...s.corridors.map(c => rectCells(c.rect)), ...s.rooms.map(r => roomCells(r))];
      for (const cells of all) {
        for (const c of cells) {
          const k = posKey(c.x, c.y);
          expect(seen.has(k), `seed ${seed}: overlap at ${k}`).toBe(false);
          seen.add(k);
        }
      }
    }
  });

  it('is one connected dungeon', () => {
    for (const seed of SEEDS) {
      const s = full(seed, 'large');
      const adj = new Map<string, string[]>();
      for (const l of buildLinks(s.rooms, s.corridors)) {
        const [a, b] = l.split('|');
        adj.set(a, [...(adj.get(a) ?? []), b]);
        adj.set(b, [...(adj.get(b) ?? []), a]);
      }
      const seen = new Set([s.corridors[0].id]);
      const stack = [s.corridors[0].id];
      while (stack.length) {
        for (const n of adj.get(stack.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
      }
      for (const id of [...s.corridors.map(c => c.id), ...s.rooms.map(r => r.id)]) {
        expect(seen.has(id), `seed ${seed}: ${id} is cut off`).toBe(true);
      }
    }
  });

  it('every passage and room has positive area and a valid parent', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const s = full(seed);
      const ids = new Set(['entrance', ...s.rooms.map(r => r.id), ...s.corridors.map(c => c.id)]);
      for (const c of s.corridors) {
        expect(c.rect.w).toBeGreaterThan(0);
        expect(c.rect.h).toBeGreaterThan(0);
        expect(ids.has(c.fromId)).toBe(true);
        for (const j of c.joins) expect(ids.has(j)).toBe(true);
      }
      for (const r of s.rooms) expect(roomCells(r).length).toBeGreaterThan(0);
    }
  });

  it('keeps irregular and circular rooms in one piece', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      for (const room of full(seed, 'large').rooms) {
        if (room.shape !== 'irregular' && room.shape !== 'circle') continue;
        seen++;
        const cells = new Set(roomCells(room).map(c => posKey(c.x, c.y)));
        const [first] = cells;
        const reached = new Set([first]);
        const stack = [first];
        while (stack.length) {
          const [x, y] = stack.pop()!.split(',').map(Number);
          for (const d of ['north', 'east', 'south', 'west'] as Direction[]) {
            const n = advance({ x, y }, d, 1);
            const k = posKey(n.x, n.y);
            if (cells.has(k) && !reached.has(k)) { reached.add(k); stack.push(k); }
          }
        }
        expect(reached.size).toBe(cells.size);
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('produces some loops and some doors across many dungeons', () => {
    let loops = 0, doors = 0, stairs = 0;
    for (const seed of SEEDS) {
      const s = full(seed, 'large');
      loops += s.corridors.filter(c => c.joins.length > 0).length;
      doors += s.corridors.filter(c => c.doorType).length;
      stairs += s.corridors.filter(c => c.kind === 'stairs').length;
    }
    expect(loops).toBeGreaterThan(0);
    expect(doors).toBeGreaterThan(0);
    expect(stairs).toBeGreaterThan(0);
  });
});

describe('passage branches', () => {
  // Step 1 resolves the cursor left by generateStart; force what it rolls.
  const force = (periodic: string, extra: Record<string, string> = {}) =>
    generateNext(started(11, 'medium', { '1|Periodic Check|1': periodic, ...extra }));

  it('an X intersection grows three branches', () => {
    const s = force('turn', { '1|Turn Type|1': 'x_intersection' });
    expect(s.cursors).toHaveLength(3);
    expect(new Set(s.cursors.map(c => c.direction)).size).toBe(3);
  });

  it('a T intersection grows two branches, neither straight ahead', () => {
    const s = force('turn', { '1|Turn Type|1': 't_intersection' });
    expect(s.cursors).toHaveLength(2);
    expect(s.cursors.map(c => c.direction).sort()).toEqual(['east', 'west']);
  });

  it('a side passage keeps the main passage going', () => {
    const s = force('side_passage', { '1|Side Passage|1': 'left' });
    expect(s.cursors.map(c => c.direction).sort()).toEqual(['north', 'west']);
  });

  it('a 45° turn is a jog that bends back to the original heading', () => {
    const s = force('turn', { '1|Turn Type|1': 'left_45_ahead' });
    expect(s.cursors).toHaveLength(1);
    expect(s.cursors[0].direction).toBe('west');
    expect(s.cursors[0].forced).toEqual({ kind: 'bend', dir: 'north' });
    const after = generateNext(s);
    expect(after.cursors).toHaveLength(1);
    expect(after.cursors[0].direction).toBe('north');
  });

  it('a side door leads straight into a chamber', () => {
    const s = force('door', { '1|Door Location|1': 'left' });
    const forced = s.cursors.find(c => c.forced?.kind === 'chamber');
    expect(forced).toBeDefined();
    const after = generateNext({ ...s, cursors: [forced!] });
    expect(after.rooms).toHaveLength(1);
  });

  it('a pending room is created when a chamber is rolled', () => {
    const s = force('chamber');
    expect(s.rooms).toHaveLength(1);
    expect(s.rooms[0].exits.length).toBeGreaterThan(0);
  });
});

describe('overrides', () => {
  it('forcing a result changes the dungeon and is flagged in the log', () => {
    const base = generateNext(started(11));
    const key = '1|Periodic Check|1';
    const forced = applyOverride(base, key, 'chamber');
    const r = forced.rollHistory.find(x => x.key === key)!;
    expect(r.overridden).toBe(true);
    expect(r.outcomeKey).toBe('chamber');
    expect(forced.rooms).toHaveLength(1);
    expect(forced.stepCount).toBe(base.stepCount);
  });

  it('can be undone', () => {
    const base = generateNext(started(11));
    const key = '1|Periodic Check|1';
    const undone = clearOverride(applyOverride(base, key, 'chamber'), key);
    expect(undone).toEqual(base);
  });

  it('keeps room notes when the dungeon is regenerated', () => {
    const forced = applyOverride(generateNext(started(11)), '1|Periodic Check|1', 'chamber');
    const withNote = { ...forced, rooms: forced.rooms.map(r => ({ ...r, notes: 'dragon!' })) };
    const again = regenerate(withNote);
    expect(again.rooms[0].notes).toBe('dragon!');
  });
});

describe('minimum size', () => {
  it('a dungeon below its minimum sprouts a new passage instead of stopping', () => {
    const base = started(5, 'large');
    const stopped = generateNext({
      ...base,
      overrides: { '1|Periodic Check|1': 'dead_end', '1|Dead End|1': 'dead_end' },
    });
    expect(stopped.rollHistory.some(r => r.table === 'Extra Passage')).toBe(true);
    expect(stopped.cursors.length).toBeGreaterThan(0);
  });
});

describe('buildRoomDescription', () => {
  it('describes every generated room', () => {
    for (const room of full(21, 'large').rooms) {
      const desc = buildRoomDescription(room);
      expect(desc.length).toBeGreaterThan(0);
      if (room.monster) expect(desc).toContain(room.monster);
      if (room.treasure) expect(desc).toContain(room.treasure);
    }
  });
});
