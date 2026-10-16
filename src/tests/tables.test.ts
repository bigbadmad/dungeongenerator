import { describe, it, expect } from 'vitest';
import {
  rollTable,
  entryForDie,
  tableSides,
  PERIODIC_CHECK,
  TURN_TYPE,
  SIDE_PASSAGE,
  DOOR_LOCATION,
  DEAD_END,
  PASSAGE_COLLISION,
  PASSAGE_LENGTH,
  PASSAGE_WIDTH,
  SPECIAL_PASSAGE,
  ROOM_SHAPE,
  IRREGULAR_VARIANT,
  ROOM_SIZE_SMALL,
  ROOM_SIZE_LARGE,
  ROOM_CONTENTS_BASE,
  DOOR_TYPE,
  EXIT_DOOR,
  TRAP_TYPE,
  ROOM_DRESSING,
  ROOM_EXITS,
  EXIT_WIDTH,
  STAIR_TYPE,
  roomContentsTable,
} from '../tables.js';
import { monsterTable, treasureTable, describeMonsters, describeTreasure, SPECIAL_FEATURE, TRAP_DETAIL } from '../content.js';
import { Rng, hashSeed } from '../rng.js';

describe('Rng', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it('int stays within bounds and reaches both ends', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('shuffle keeps every item', () => {
    expect(new Rng(1).shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('hashSeed is stable and spreads inputs', () => {
    expect(hashSeed('dragon')).toBe(hashSeed('dragon'));
    expect(hashSeed('dragon')).not.toBe(hashSeed('dragons'));
  });
});

describe('dice and tables', () => {
  it('a die maps onto the band that contains it', () => {
    const table = [
      { weight: 2, value: 'a', label: 'A' },
      { weight: 3, value: 'b', label: 'B' },
      { weight: 1, value: 'c', label: 'C' },
    ];
    expect(tableSides(table)).toBe(6);
    expect([1, 2, 3, 4, 5, 6].map(d => entryForDie(table, d).value)).toEqual(['a', 'a', 'b', 'b', 'b', 'c']);
  });

  it('skips zero-weight entries', () => {
    const table = [
      { weight: 0, value: 'never', label: 'Never' },
      { weight: 3, value: 'yes', label: 'Yes' },
    ];
    for (let d = 1; d <= 3; d++) expect(entryForDie(table, d).value).toBe('yes');
  });

  it('rolls roughly according to the weights', () => {
    const rng = new Rng(2024);
    const counts: Record<string, number> = {};
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const { entry } = rollTable(PERIODIC_CHECK, rng);
      counts[entry.value] = (counts[entry.value] ?? 0) + 1;
    }
    const total = tableSides(PERIODIC_CHECK);
    for (const e of PERIODIC_CHECK) {
      const expected = e.weight / total;
      const actual = (counts[e.value] ?? 0) / n;
      expect(actual).toBeGreaterThan(expected * 0.7);
      expect(actual).toBeLessThan(expected * 1.3);
    }
  });
});

describe('table shapes', () => {
  const tables = {
    PERIODIC_CHECK, TURN_TYPE, SIDE_PASSAGE, DOOR_LOCATION, DEAD_END, PASSAGE_COLLISION, PASSAGE_LENGTH,
    PASSAGE_WIDTH, SPECIAL_PASSAGE, ROOM_SHAPE, IRREGULAR_VARIANT, ROOM_SIZE_SMALL, ROOM_SIZE_LARGE,
    ROOM_CONTENTS_BASE, DOOR_TYPE, EXIT_DOOR, TRAP_TYPE, ROOM_DRESSING, ROOM_EXITS, EXIT_WIDTH, STAIR_TYPE,
    SPECIAL_FEATURE,
  };

  it('every table has entries with positive weights and labels', () => {
    for (const [name, t] of Object.entries(tables)) {
      expect(t.length, name).toBeGreaterThan(0);
      for (const e of t) {
        expect(e.weight, name).toBeGreaterThan(0);
        expect(e.label.length, name).toBeGreaterThan(0);
      }
    }
  });

  it('values within a table are unique', () => {
    for (const [name, t] of Object.entries(tables)) {
      const values = t.map(e => String(e.value));
      expect(new Set(values).size, name).toBe(values.length);
    }
  });

  it('every trap has a description', () => {
    for (const e of TRAP_TYPE) expect(TRAP_DETAIL[e.value].length).toBeGreaterThan(0);
  });
});

describe('roomContentsTable', () => {
  it('returns a valid table for all dungeon levels 1-10', () => {
    for (let level = 1; level <= 10; level++) {
      const table = roomContentsTable(level);
      expect(table.length).toBe(ROOM_CONTENTS_BASE.length);
      for (const e of table) expect(e.weight).toBeGreaterThan(0);
    }
  });

  it('increases monster weight at higher levels', () => {
    const low = roomContentsTable(1).find(e => e.value === 'monster')!.weight;
    const high = roomContentsTable(10).find(e => e.value === 'monster')!.weight;
    expect(high).toBeGreaterThan(low);
  });
});

describe('room dressing', () => {
  it('every dressing entry has at least one flavour string', () => {
    for (const e of ROOM_DRESSING) {
      expect(e.flavours.length).toBeGreaterThan(0);
      for (const f of e.flavours) expect(f.length).toBeGreaterThan(0);
    }
  });
});

describe('monsters and treasure', () => {
  it('every dungeon level has monsters to meet', () => {
    for (let level = 1; level <= 10; level++) expect(monsterTable(level).length).toBeGreaterThan(0);
  });

  it('monsters get tougher with depth', () => {
    const names = (level: number) => monsterTable(level).map(e => e.value);
    expect(names(1)).toContain('Kobold');
    expect(names(1)).not.toContain('Troll');
    expect(names(8)).toContain('Troll');
  });

  it('describes a group with a count', () => {
    expect(describeMonsters('Goblin', new Rng(3))).toMatch(/^\d+ Goblins?$/);
    expect(describeMonsters('Vampire', new Rng(3))).toBe('1 Vampire');
  });

  it('treasure always reads as something', () => {
    const rng = new Rng(8);
    for (let level = 1; level <= 10; level++) {
      for (const e of treasureTable(level)) expect(describeTreasure(e.value, level, rng).length).toBeGreaterThan(0);
    }
  });
});
