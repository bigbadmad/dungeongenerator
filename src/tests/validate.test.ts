import { describe, it, expect } from 'vitest';
import { createInitialState, generateAll, generateStart } from '../generator.js';
import { validateState } from '../validate.js';
import type { DungeonSize } from '../types.js';

function sample(seed = 5, size: DungeonSize = 'small') {
  return generateAll(generateStart(createInitialState({ size }, seed)));
}

/** A deep copy that tests can safely break. */
function clone(): any {
  return JSON.parse(JSON.stringify(sample()));
}

describe('validateState accepts real dungeons', () => {
  it('every kind of generated dungeon, finished or half-built', () => {
    for (const size of ['small', 'medium', 'large'] as DungeonSize[]) {
      for (let seed = 0; seed < 25; seed++) {
        const done = sample(seed * 31 + 7, size);
        expect(validateState(JSON.parse(JSON.stringify(done))), `${size} seed ${seed}`).toBeNull();
        const begun = generateStart(createInitialState({ size }, seed));
        expect(validateState(JSON.parse(JSON.stringify(begun)))).toBeNull();
      }
    }
  });

  it('an unstarted dungeon and one with notes and a selection', () => {
    expect(validateState(JSON.parse(JSON.stringify(createInitialState())))).toBeNull();
    const s = clone();
    s.rooms[0].notes = 'ambush';
    s.selectedRoomId = s.rooms[0].id;
    expect(validateState(s)).toBeNull();
  });
});

describe('validateState rejects damaged state', () => {
  const breakers: [string, (s: any) => void][] = [
    ['missing cursors', s => { delete s.cursors; }],
    ['missing rollHistory', s => { delete s.rollHistory; }],
    ['missing rooms', s => { delete s.rooms; }],
    ['corridors is not an array', s => { s.corridors = {}; }],
    ['wrong version', s => { s.version = 1; }],
    ['started is not a boolean', s => { s.started = 'yes'; }],
    ['seed is NaN', s => { s.seed = Number.NaN; }],
    ['stepCount missing', s => { delete s.stepCount; }],
    ['selectedRoomId is a number', s => { s.selectedRoomId = 7; }],
    ['zones missing', s => { delete s.zones; }],
    ['unknown size', s => { s.settings.size = 'enormous'; }],
    ['unknown start direction', s => { s.settings.startDirection = 'up'; }],
    ['room without a rect', s => { delete s.rooms[0].rect; }],
    ['room with zero width', s => { s.rooms[0].rect.w = 0; }],
    ['room with a bad shape', s => { s.rooms[0].shape = 'blob'; }],
    ['room cutouts not an array', s => { s.rooms[0].cutouts = null; }],
    ['room notes not a string', s => { s.rooms[0].notes = 3; }],
    ['room exits missing', s => { delete s.rooms[0].exits; }],
    ['room with an unknown trap', s => { s.rooms[0].trap = 'laser'; }],
    ['corridor with a bad direction', s => { s.corridors[0].direction = 'sideways'; }],
    ['corridor joins not an array', s => { s.corridors[0].joins = 'x'; }],
    ['corridor without a rect', s => { s.corridors[1].rect = null; }],
    ['cursor without a position', s => { delete s.cursors[0].position; }],
    ['cursor with a bad forced action', s => { s.cursors[0].forced = { kind: 'explode' }; }],
    ['roll with non-numeric die', s => { s.rollHistory[0].diceResult = 'six'; }],
    ['roll with no table', s => { delete s.rollHistory[0].table; }],
    ['null entry in rollHistory', s => { s.rollHistory[1] = null; }],
  ];

  for (const [name, brk] of breakers) {
    it(`rejects: ${name}`, () => {
      // Use a dungeon that is still part-built so cursors exist to be broken.
      const s = JSON.parse(JSON.stringify(generateStart(createInitialState({ size: 'small' }, 5))));
      const full = clone();
      s.rooms = full.rooms;
      s.corridors = full.corridors;
      s.rollHistory = full.rollHistory;
      expect(validateState(s), 'test setup should start valid').toBeNull();
      brk(s);
      expect(validateState(s)).not.toBeNull();
    });
  }

  it('rejects things that are not objects', () => {
    for (const v of [null, undefined, 3, 'dungeon', [], true]) expect(validateState(v)).not.toBeNull();
  });

  it('says what is wrong', () => {
    const s = clone();
    s.rooms[0].rect.w = 0;
    expect(validateState(s)).toContain('rooms[0].rect');
  });
});
