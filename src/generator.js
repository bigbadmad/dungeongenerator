import { weightedRoll, rollD, PERIODIC_CHECK, TURN_TYPE, SIDE_PASSAGE, PASSAGE_WIDTH, ROOM_SHAPE, ROOM_SIZE_SMALL, ROOM_SIZE_LARGE, ROOM_EXITS, DOOR_TYPE, TRAP_TYPE, ROOM_DRESSING, roomContentsTable, } from './tables.js';
// ── ID counter ──────────────────────────────────────────────────────────────
let _idCounter = 0;
function newId(prefix) { return `${prefix}_${++_idCounter}`; }
export function resetIdCounter() { _idCounter = 0; }
// ── Occupancy helpers ───────────────────────────────────────────────────────
function posKey(x, y) { return `${x},${y}`; }
function isRectFree(rect, occupied) {
    for (let dy = 0; dy < rect.h; dy++)
        for (let dx = 0; dx < rect.w; dx++)
            if (occupied.has(posKey(rect.x + dx, rect.y + dy)))
                return false;
    return true;
}
function registerRect(rect, occupied) {
    for (let dy = 0; dy < rect.h; dy++)
        for (let dx = 0; dx < rect.w; dx++)
            occupied.add(posKey(rect.x + dx, rect.y + dy));
}
// ── Direction helpers ───────────────────────────────────────────────────────
export function advance(pos, dir, n) {
    switch (dir) {
        case 'north': return { x: pos.x, y: pos.y - n };
        case 'south': return { x: pos.x, y: pos.y + n };
        case 'east': return { x: pos.x + n, y: pos.y };
        case 'west': return { x: pos.x - n, y: pos.y };
    }
}
export function turnLeft(dir) {
    const map = { north: 'west', west: 'south', south: 'east', east: 'north' };
    return map[dir];
}
export function turnRight(dir) {
    const map = { north: 'east', east: 'south', south: 'west', west: 'north' };
    return map[dir];
}
export function opposite(dir) {
    const map = { north: 'south', south: 'north', east: 'west', west: 'east' };
    return map[dir];
}
// ── Geometry ────────────────────────────────────────────────────────────────
//
// Convention: `start` is the ENTRY cell of the corridor — the cell closest to
// the previous element (the cursor position). The corridor extends away from
// start in the given direction. This means:
//   north — start is the southernmost cell; corridor extends to lower y values
//   south — start is the northernmost cell; corridor extends to higher y values
//   east  — start is the westernmost cell; corridor extends to higher x values
//   west  — start is the easternmost cell; corridor extends to lower x values
export function corridorRect(start, dir, length, widthUnits) {
    const w = Math.max(widthUnits, 1);
    switch (dir) {
        case 'north': return { x: start.x - Math.floor(w / 2), y: start.y - length + 1, w, h: length };
        case 'south': return { x: start.x - Math.floor(w / 2), y: start.y, w, h: length };
        case 'east': return { x: start.x, y: start.y - Math.floor(w / 2), w: length, h: w };
        case 'west': return { x: start.x - length + 1, y: start.y - Math.floor(w / 2), w: length, h: w };
    }
}
// Returns the first FREE cell beyond the exit end of the corridor — this
// becomes the cursor.position / start for the next element.
export function corridorEnd(rect, dir) {
    switch (dir) {
        case 'north': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y - 1 };
        case 'south': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y + rect.h };
        case 'east': return { x: rect.x + rect.w, y: rect.y + Math.floor(rect.h / 2) };
        case 'west': return { x: rect.x - 1, y: rect.y + Math.floor(rect.h / 2) };
    }
}
// Room rect where `start` is the entry cell (first free cell beyond the
// arrival corridor). The room is placed so its entry wall aligns with start.
function roomRect(start, dir, w, h) {
    switch (dir) {
        // Arriving from south: entry wall is the south wall; room extends north.
        case 'north': return { x: start.x - Math.floor(w / 2), y: start.y - h + 1, w, h };
        // Arriving from north: entry wall is the north wall; room extends south.
        case 'south': return { x: start.x - Math.floor(w / 2), y: start.y, w, h };
        // Arriving from west: entry wall is the west wall; room extends east.
        case 'east': return { x: start.x, y: start.y - Math.floor(h / 2), w, h };
        // Arriving from east: entry wall is the east wall; room extends west.
        case 'west': return { x: start.x - w + 1, y: start.y - Math.floor(h / 2), w, h };
    }
}
// Returns the first free cell beyond the given wall of the room — the entry
// cell for an exit corridor in that direction.
function roomExitPoint(rect, dir) {
    switch (dir) {
        case 'north': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y - 1 };
        case 'south': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y + rect.h };
        case 'east': return { x: rect.x + rect.w, y: rect.y + Math.floor(rect.h / 2) };
        case 'west': return { x: rect.x - 1, y: rect.y + Math.floor(rect.h / 2) };
    }
}
// ── Roll records ────────────────────────────────────────────────────────────
function makeRollRecord(table, diceResult, outcome, outcomeKey, step) {
    return { id: newId('roll'), table, diceResult, outcome, outcomeKey, overridden: false, step };
}
function corridorLength() { return rollD(3); }
// ── Placement with collision detection ──────────────────────────────────────
//
// Tries lengths from maxLen down to 1. Registers the rect in `occupied` on
// success. Returns null if every length is blocked.
function tryPlaceCorridor(start, dir, maxLen, width, occupied) {
    for (let len = maxLen; len >= 1; len--) {
        const rect = corridorRect(start, dir, len, width);
        if (isRectFree(rect, occupied)) {
            registerRect(rect, occupied);
            return { rect };
        }
    }
    return null;
}
// ── generateStart ───────────────────────────────────────────────────────────
export function generateStart(state) {
    const dir = state.settings.startDirection;
    const entrance = { x: 0, y: 0 };
    const occupied = new Set(state.occupied);
    // The entrance cell belongs to the dungeon; nothing else may occupy it.
    occupied.add(posKey(entrance.x, entrance.y));
    const widthEntry = weightedRoll(PASSAGE_WIDTH);
    const width = widthEntry.value < 1 ? 2 : widthEntry.value;
    const len = corridorLength();
    // Corridor starts at the first cell away from the entrance.
    const firstCell = advance(entrance, dir, 1);
    const placed = tryPlaceCorridor(firstCell, dir, len, width, occupied);
    if (!placed) {
        return { ...state, started: true, occupied: [...occupied] };
    }
    const corridor = {
        id: newId('cor'),
        rect: placed.rect,
        direction: dir,
        fromId: 'entrance',
        toId: null,
    };
    const cursor = {
        type: 'corridor_end',
        corridorId: corridor.id,
        position: corridorEnd(placed.rect, dir),
        direction: dir,
    };
    const roll = makeRollRecord('Passage Width', widthEntry.weight, widthEntry.label, widthEntry.value.toString(), 0);
    return {
        ...state,
        started: true,
        corridors: [corridor],
        cursors: [cursor],
        rollHistory: [roll],
        stepCount: 1,
        occupied: [...occupied],
    };
}
// ── generateNext ────────────────────────────────────────────────────────────
export function generateNext(state) {
    if (state.cursors.length === 0)
        return state;
    const [cursor, ...remainingCursors] = state.cursors;
    const step = state.stepCount + 1;
    const rolls = [];
    const occupied = new Set(state.occupied);
    // If another element has grown into this cursor's position since it was
    // created, drop it silently rather than placing something impossible.
    if (occupied.has(posKey(cursor.position.x, cursor.position.y))) {
        return {
            ...state,
            cursors: remainingCursors,
            rollHistory: [
                ...state.rollHistory,
                makeRollRecord('Path', 0, 'Path blocked — skipped', 'blocked', step),
            ],
            stepCount: step,
            occupied: [...occupied],
        };
    }
    const periodicEntry = weightedRoll(PERIODIC_CHECK);
    rolls.push(makeRollRecord('Periodic Check', rollD(100), periodicEntry.label, periodicEntry.value, step));
    let newRooms = [...state.rooms];
    let newCorridors = [...state.corridors];
    let newCursors = [...remainingCursors];
    switch (periodicEntry.value) {
        case 'continue': {
            const r = extendCorridor(cursor, step, rolls, occupied);
            if (r) {
                newCorridors.push(r.corridor);
                newCursors.push(r.cursor);
            }
            break;
        }
        case 'turn': {
            const r = handleTurn(cursor, step, rolls, occupied);
            newCorridors.push(...r.corridors);
            newCursors.push(...r.cursors);
            break;
        }
        case 'door': {
            const r = extendWithDoor(cursor, step, rolls, occupied);
            if (r) {
                newCorridors.push(r.corridor);
                newCursors.push(r.cursor);
            }
            break;
        }
        case 'side_passage': {
            const r = handleSidePassage(cursor, step, rolls, occupied);
            newCorridors.push(...r.corridors);
            newCursors.push(...r.cursors);
            break;
        }
        case 'chamber': {
            const r = generateRoom(cursor, step, rolls, state.settings.level, occupied);
            if (r) {
                newRooms.push(r.room);
                newCorridors.push(...r.exitCorridors);
                newCursors.push(...r.exitCursors);
            }
            break;
        }
        case 'dead_end': {
            rolls.push(makeRollRecord('Dead End', 0, 'Passage ends', 'dead_end', step));
            break;
        }
    }
    return {
        ...state,
        rooms: newRooms,
        corridors: newCorridors,
        cursors: newCursors,
        rollHistory: [...state.rollHistory, ...rolls],
        stepCount: step,
        occupied: [...occupied],
    };
}
// ── Branch functions ─────────────────────────────────────────────────────────
// Each receives the live `occupied` Set and mutates it as placements succeed.
function extendCorridor(cursor, step, rolls, occupied) {
    const len = corridorLength();
    const widthEntry = weightedRoll(PASSAGE_WIDTH);
    const width = widthEntry.value < 1 ? 2 : widthEntry.value;
    rolls.push(makeRollRecord('Passage Width', widthEntry.weight, widthEntry.label, widthEntry.value.toString(), step));
    const placed = tryPlaceCorridor(cursor.position, cursor.direction, len, width, occupied);
    if (!placed)
        return null;
    const corridor = {
        id: newId('cor'),
        rect: placed.rect,
        direction: cursor.direction,
        fromId: cursor.corridorId,
        toId: null,
    };
    return {
        corridor,
        cursor: {
            type: 'corridor_end',
            corridorId: corridor.id,
            position: corridorEnd(placed.rect, cursor.direction),
            direction: cursor.direction,
        },
    };
}
function extendWithDoor(cursor, step, rolls, occupied) {
    const doorEntry = weightedRoll(DOOR_TYPE);
    rolls.push(makeRollRecord('Door Type', rollD(8), doorEntry.label, doorEntry.value, step));
    const placed = tryPlaceCorridor(cursor.position, cursor.direction, 1, 2, occupied);
    if (!placed)
        return null;
    const corridor = {
        id: newId('cor'),
        rect: placed.rect,
        direction: cursor.direction,
        fromId: cursor.corridorId,
        toId: null,
        doorType: doorEntry.value,
    };
    return {
        corridor,
        cursor: {
            type: 'corridor_end',
            corridorId: corridor.id,
            position: corridorEnd(placed.rect, cursor.direction),
            direction: cursor.direction,
        },
    };
}
function handleTurn(cursor, step, rolls, occupied) {
    const turnEntry = weightedRoll(TURN_TYPE);
    rolls.push(makeRollRecord('Turn Type', rollD(20), turnEntry.label, turnEntry.value, step));
    const corridors = [];
    const cursors = [];
    const addBranch = (dir) => {
        const placed = tryPlaceCorridor(cursor.position, dir, corridorLength(), 2, occupied);
        if (!placed)
            return;
        const cor = {
            id: newId('cor'), rect: placed.rect, direction: dir,
            fromId: cursor.corridorId, toId: null,
        };
        corridors.push(cor);
        cursors.push({
            type: 'corridor_end', corridorId: cor.id,
            position: corridorEnd(placed.rect, dir), direction: dir,
        });
    };
    switch (turnEntry.value) {
        case 'left_90':
        case 'left_45_ahead':
            addBranch(turnLeft(cursor.direction));
            break;
        case 'right_90':
        case 'right_45_ahead':
            addBranch(turnRight(cursor.direction));
            break;
        case 'y_intersection':
            addBranch(turnLeft(cursor.direction));
            addBranch(turnRight(cursor.direction));
            break;
        case 't_intersection':
            addBranch(turnLeft(cursor.direction));
            addBranch(cursor.direction);
            addBranch(turnRight(cursor.direction));
            break;
        case 'x_intersection':
            addBranch(turnLeft(cursor.direction));
            addBranch(cursor.direction);
            addBranch(turnRight(cursor.direction));
            break;
    }
    return { corridors, cursors };
}
function handleSidePassage(cursor, step, rolls, occupied) {
    const sideEntry = weightedRoll(SIDE_PASSAGE);
    rolls.push(makeRollRecord('Side Passage', rollD(20), sideEntry.label, sideEntry.value, step));
    const corridors = [];
    const cursors = [];
    const addBranch = (dir) => {
        const placed = tryPlaceCorridor(cursor.position, dir, corridorLength(), 2, occupied);
        if (!placed)
            return;
        const cor = {
            id: newId('cor'), rect: placed.rect, direction: dir,
            fromId: cursor.corridorId, toId: null,
        };
        corridors.push(cor);
        cursors.push({
            type: 'corridor_end', corridorId: cor.id,
            position: corridorEnd(placed.rect, dir), direction: dir,
        });
    };
    switch (sideEntry.value) {
        case 'left':
            addBranch(cursor.direction);
            addBranch(turnLeft(cursor.direction));
            break;
        case 'right':
            addBranch(cursor.direction);
            addBranch(turnRight(cursor.direction));
            break;
        case 'both':
        case 'ahead_left_right':
            addBranch(cursor.direction);
            addBranch(turnLeft(cursor.direction));
            addBranch(turnRight(cursor.direction));
            break;
        case 'passage_t':
            addBranch(turnLeft(cursor.direction));
            addBranch(turnRight(cursor.direction));
            break;
    }
    return { corridors, cursors };
}
function generateRoom(cursor, step, rolls, level, occupied) {
    const shapeEntry = weightedRoll(ROOM_SHAPE);
    rolls.push(makeRollRecord('Room Shape', rollD(10), shapeEntry.label, shapeEntry.value, step));
    const sizeTable = shapeEntry.value === 'circle' ? ROOM_SIZE_SMALL : ROOM_SIZE_LARGE;
    const wEntry = weightedRoll(sizeTable);
    const hEntry = shapeEntry.value === 'rectangle' ? weightedRoll(sizeTable) : wEntry;
    rolls.push(makeRollRecord('Room Width', rollD(10), `${wEntry.value * 10} ft`, wEntry.value.toString(), step));
    if (shapeEntry.value === 'rectangle') {
        rolls.push(makeRollRecord('Room Depth', rollD(10), `${hEntry.value * 10} ft`, hEntry.value.toString(), step));
    }
    // Try the rolled size, then progressively smaller fallbacks.
    const sizeCandidates = [
        { w: wEntry.value, h: hEntry.value },
        { w: Math.max(2, wEntry.value - 1), h: Math.max(2, hEntry.value - 1) },
        { w: 2, h: 2 },
    ];
    let rect = null;
    for (const sz of sizeCandidates) {
        const candidate = roomRect(cursor.position, cursor.direction, sz.w, sz.h);
        if (isRectFree(candidate, occupied)) {
            rect = candidate;
            break;
        }
    }
    if (!rect)
        return null;
    registerRect(rect, occupied);
    // Contents
    const contentsEntry = weightedRoll(roomContentsTable(level));
    rolls.push(makeRollRecord('Room Contents', rollD(100), contentsEntry.label, contentsEntry.value, step));
    let trap = undefined;
    if (contentsEntry.value === 'trap' || contentsEntry.value === 'trap_treasure') {
        const trapEntry = weightedRoll(TRAP_TYPE);
        rolls.push(makeRollRecord('Trap Type', rollD(12), trapEntry.label, trapEntry.value, step));
        trap = trapEntry.value;
    }
    let dressing = undefined;
    if (contentsEntry.value === 'empty' || contentsEntry.value === 'treasure') {
        const dressingEntry = weightedRoll(ROOM_DRESSING);
        const flavour = dressingEntry.flavours[Math.floor(Math.random() * dressingEntry.flavours.length)];
        rolls.push(makeRollRecord('Room Dressing', rollD(12), `${dressingEntry.label}: ${flavour}`, dressingEntry.value, step));
        dressing = { type: dressingEntry.value, flavour };
    }
    // Exits — only directions whose first external cell is currently free.
    const exitsEntry = weightedRoll(ROOM_EXITS);
    rolls.push(makeRollRecord('Room Exits', rollD(6), exitsEntry.label, exitsEntry.value.toString(), step));
    const exits = [];
    const exitCorridors = [];
    const exitCursors = [];
    const entryDir = opposite(cursor.direction);
    const possibleDirs = ['north', 'east', 'south', 'west'].filter(d => {
        if (d === entryDir)
            return false;
        const ep = roomExitPoint(rect, d);
        return !occupied.has(posKey(ep.x, ep.y));
    });
    for (let i = 0; i < exitsEntry.value && possibleDirs.length > 0; i++) {
        const idx = Math.floor(Math.random() * possibleDirs.length);
        const exitDir = possibleDirs.splice(idx, 1)[0];
        const exitPt = roomExitPoint(rect, exitDir);
        const hasDoor = Math.random() < 0.5;
        let doorType;
        if (hasDoor) {
            const dEntry = weightedRoll(DOOR_TYPE);
            doorType = dEntry.value;
            rolls.push(makeRollRecord('Exit Door', rollD(8), dEntry.label, dEntry.value, step));
        }
        const placed = tryPlaceCorridor(exitPt, exitDir, corridorLength(), 2, occupied);
        if (!placed)
            continue;
        const cor = {
            id: newId('cor'),
            rect: placed.rect,
            direction: exitDir,
            fromId: 'pending',
            toId: null,
        };
        exitCorridors.push(cor);
        exitCursors.push({
            type: 'corridor_end',
            corridorId: cor.id,
            position: corridorEnd(placed.rect, exitDir),
            direction: exitDir,
        });
        exits.push({ direction: exitDir, doorType, corridorId: cor.id, exitPoint: exitPt });
    }
    // The corridor that brought the cursor here needs an opening in the entry wall.
    // Add it as a no-door exit so renderExitOpening will cut the gap.
    exits.push({
        direction: entryDir,
        corridorId: cursor.corridorId,
        exitPoint: roomExitPoint(rect, entryDir),
    });
    const room = {
        id: newId('room'),
        shape: shapeEntry.value,
        rect,
        contents: contentsEntry.value,
        trap,
        dressing,
        exits,
        notes: '',
        isEntrance: false,
    };
    exitCorridors.forEach(c => { c.fromId = room.id; });
    return { room, exitCorridors, exitCursors };
}
// ── Public utilities ────────────────────────────────────────────────────────
export function applyOverride(state, rollId, value) {
    return {
        ...state,
        rollHistory: state.rollHistory.map(r => r.id === rollId ? { ...r, overridden: true, overrideValue: value } : r),
    };
}
export function buildRoomDescription(room) {
    const shapeLabel = {
        square: 'Square', rectangle: 'Rectangular', circle: 'Circular', irregular: 'Irregular',
    };
    const contentsLabel = {
        empty: 'Empty', monster: 'Monster', monster_treasure: 'Monster w/ Treasure',
        trap: 'Trap', trap_treasure: 'Trap w/ Treasure', special: 'Special', treasure: 'Unguarded Treasure',
    };
    let desc = `${shapeLabel[room.shape] ?? room.shape} room, ${room.rect.w * 10}×${room.rect.h * 10} ft. `;
    desc += contentsLabel[room.contents] ?? room.contents;
    if (room.trap)
        desc += ` (${room.trap.replace(/_/g, ' ')})`;
    if (room.dressing)
        desc += `. ${room.dressing.flavour}`;
    return desc;
}
