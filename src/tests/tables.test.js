import { describe, it, expect } from 'vitest';
import { weightedRoll, rollD, PERIODIC_CHECK, TURN_TYPE, SIDE_PASSAGE, PASSAGE_WIDTH, ROOM_SHAPE, ROOM_SIZE_SMALL, ROOM_SIZE_LARGE, ROOM_CONTENTS_BASE, DOOR_TYPE, TRAP_TYPE, ROOM_DRESSING, ROOM_EXITS, roomContentsTable, } from '../tables.js';
describe('rollD', () => {
    it('returns a value between 1 and sides inclusive', () => {
        for (let i = 0; i < 200; i++) {
            const r = rollD(6);
            expect(r).toBeGreaterThanOrEqual(1);
            expect(r).toBeLessThanOrEqual(6);
        }
    });
});
describe('weightedRoll', () => {
    it('always returns an entry from the table', () => {
        for (let i = 0; i < 100; i++) {
            const entry = weightedRoll(PERIODIC_CHECK);
            expect(PERIODIC_CHECK).toContain(entry);
        }
    });
    it('distributes roughly according to weights over many rolls', () => {
        const counts = {};
        const n = 10000;
        for (let i = 0; i < n; i++) {
            const e = weightedRoll(PERIODIC_CHECK);
            counts[e.value] = (counts[e.value] ?? 0) + 1;
        }
        const total = PERIODIC_CHECK.reduce((s, e) => s + e.weight, 0);
        for (const entry of PERIODIC_CHECK) {
            const expected = entry.weight / total;
            const actual = (counts[entry.value] ?? 0) / n;
            // Allow 20% relative tolerance for random variance
            expect(actual).toBeGreaterThan(expected * 0.6);
            expect(actual).toBeLessThan(expected * 1.6);
        }
    });
});
describe('table shapes', () => {
    const tables = [
        PERIODIC_CHECK, TURN_TYPE, SIDE_PASSAGE, PASSAGE_WIDTH,
        ROOM_SHAPE, ROOM_SIZE_SMALL, ROOM_SIZE_LARGE, ROOM_CONTENTS_BASE,
        DOOR_TYPE, TRAP_TYPE, ROOM_DRESSING, ROOM_EXITS,
    ];
    it('every table has at least one entry', () => {
        for (const t of tables) {
            expect(t.length).toBeGreaterThan(0);
        }
    });
    it('every entry has a positive weight', () => {
        for (const t of tables) {
            for (const e of t) {
                expect(e.weight).toBeGreaterThan(0);
            }
        }
    });
    it('every entry has a non-empty label', () => {
        for (const t of tables) {
            for (const e of t) {
                expect(typeof e.label).toBe('string');
                expect(e.label.length).toBeGreaterThan(0);
            }
        }
    });
});
describe('roomContentsTable', () => {
    it('returns a valid table for all dungeon levels 1-10', () => {
        for (let level = 1; level <= 10; level++) {
            const table = roomContentsTable(level);
            expect(table.length).toBe(ROOM_CONTENTS_BASE.length);
            for (const e of table) {
                expect(e.weight).toBeGreaterThan(0);
            }
        }
    });
    it('increases monster weight at higher levels', () => {
        const low = roomContentsTable(1);
        const high = roomContentsTable(10);
        const monsterLow = low.find(e => e.value === 'monster').weight;
        const monsterHigh = high.find(e => e.value === 'monster').weight;
        expect(monsterHigh).toBeGreaterThan(monsterLow);
    });
});
describe('room dressing', () => {
    it('every dressing entry has at least one flavour string', () => {
        for (const e of ROOM_DRESSING) {
            expect(e.flavours.length).toBeGreaterThan(0);
            for (const f of e.flavours) {
                expect(f.length).toBeGreaterThan(0);
            }
        }
    });
});
