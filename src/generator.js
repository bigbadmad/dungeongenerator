import { weightedRoll, rollD, PERIODIC_CHECK, TURN_TYPE, SIDE_PASSAGE, PASSAGE_WIDTH, ROOM_SHAPE, ROOM_SIZE_SMALL, ROOM_SIZE_LARGE, ROOM_EXITS, DOOR_TYPE, TRAP_TYPE, ROOM_DRESSING, roomContentsTable, } from './tables.js';
let _idCounter = 0;
function newId(prefix) {
    return `${prefix}_${++_idCounter}`;
}
export function resetIdCounter() {
    _idCounter = 0;
}
function makeRollRecord(table, diceResult, outcome, outcomeKey, step) {
    return {
        id: newId('roll'),
        table,
        diceResult,
        outcome,
        outcomeKey,
        overridden: false,
        step,
    };
}
// Corridor length in grid units (1 unit = 10ft); each segment is 1-3 units
function corridorLength() {
    return rollD(3);
}
// Move a point in a direction by n units
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
// Build a rect from start pos, direction, width and length (all in grid units)
function corridorRect(start, dir, length, widthUnits) {
    const w = widthUnits < 1 ? 1 : widthUnits;
    switch (dir) {
        case 'north': return { x: start.x - Math.floor(w / 2), y: start.y - length, w, h: length };
        case 'south': return { x: start.x - Math.floor(w / 2), y: start.y, w, h: length };
        case 'east': return { x: start.x, y: start.y - Math.floor(w / 2), w: length, h: w };
        case 'west': return { x: start.x - length, y: start.y - Math.floor(w / 2), w: length, h: w };
    }
}
function corridorEnd(rect, dir) {
    switch (dir) {
        case 'north': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y };
        case 'south': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y + rect.h };
        case 'east': return { x: rect.x + rect.w, y: rect.y + Math.floor(rect.h / 2) };
        case 'west': return { x: rect.x, y: rect.y + Math.floor(rect.h / 2) };
    }
}
// Generate an initial corridor from the entrance
export function generateStart(state) {
    const dir = state.settings.startDirection;
    const origin = { x: 0, y: 0 };
    const len = corridorLength();
    const widthEntry = weightedRoll(PASSAGE_WIDTH);
    const width = widthEntry.value < 1 ? 2 : widthEntry.value;
    const rect = corridorRect(origin, dir, len, width);
    const corridor = {
        id: newId('cor'),
        rect,
        direction: dir,
        fromId: 'entrance',
        toId: null,
    };
    const cursor = {
        type: 'corridor_end',
        corridorId: corridor.id,
        position: corridorEnd(rect, dir),
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
    };
}
// Main step: resolve the next cursor
export function generateNext(state) {
    if (state.cursors.length === 0)
        return state;
    const [cursor, ...remainingCursors] = state.cursors;
    const step = state.stepCount + 1;
    const rolls = [];
    const periodicEntry = weightedRoll(PERIODIC_CHECK);
    rolls.push(makeRollRecord('Periodic Check', rollD(100), periodicEntry.label, periodicEntry.value, step));
    let newRooms = [...state.rooms];
    let newCorridors = [...state.corridors];
    let newCursors = [...remainingCursors];
    switch (periodicEntry.value) {
        case 'continue': {
            const result = extendCorridor(cursor, step, rolls);
            newCorridors = [...newCorridors, result.corridor];
            newCursors = [...newCursors, result.cursor];
            break;
        }
        case 'turn': {
            const result = handleTurn(cursor, step, rolls, state.corridors);
            newCorridors = [...newCorridors, ...result.corridors];
            newCursors = [...newCursors, ...result.cursors];
            break;
        }
        case 'door': {
            const result = extendWithDoor(cursor, step, rolls);
            newCorridors = [...newCorridors, result.corridor];
            newCursors = [...newCursors, result.cursor];
            break;
        }
        case 'side_passage': {
            const result = handleSidePassage(cursor, step, rolls);
            newCorridors = [...newCorridors, ...result.corridors];
            newCursors = [...newCursors, ...result.cursors];
            break;
        }
        case 'chamber': {
            const result = generateRoom(cursor, step, rolls, state.settings.level);
            newRooms = [...newRooms, result.room];
            newCorridors = [...newCorridors, ...result.exitCorridors];
            newCursors = [...newCursors, ...result.exitCursors];
            break;
        }
        case 'dead_end': {
            // Dead end — seal this corridor, no new cursor
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
    };
}
function extendCorridor(cursor, step, rolls) {
    const len = corridorLength();
    const widthEntry = weightedRoll(PASSAGE_WIDTH);
    const width = widthEntry.value < 1 ? 2 : widthEntry.value;
    rolls.push(makeRollRecord('Passage Width', widthEntry.weight, widthEntry.label, widthEntry.value.toString(), step));
    const rect = corridorRect(cursor.position, cursor.direction, len, width);
    const corridor = {
        id: newId('cor'),
        rect,
        direction: cursor.direction,
        fromId: cursor.corridorId,
        toId: null,
    };
    const newCursor = {
        type: 'corridor_end',
        corridorId: corridor.id,
        position: corridorEnd(rect, cursor.direction),
        direction: cursor.direction,
    };
    return { corridor, cursor: newCursor };
}
function extendWithDoor(cursor, step, rolls) {
    const doorEntry = weightedRoll(DOOR_TYPE);
    rolls.push(makeRollRecord('Door Type', rollD(8), doorEntry.label, doorEntry.value, step));
    // Door is a short stub corridor with a door symbol
    const len = 1;
    const rect = corridorRect(cursor.position, cursor.direction, len, 2);
    const corridor = {
        id: newId('cor'),
        rect,
        direction: cursor.direction,
        fromId: cursor.corridorId,
        toId: null,
    };
    const newCursor = {
        type: 'corridor_end',
        corridorId: corridor.id,
        position: corridorEnd(rect, cursor.direction),
        direction: cursor.direction,
    };
    return { corridor, cursor: newCursor };
}
function handleTurn(cursor, step, rolls, existingCorridors) {
    const turnEntry = weightedRoll(TURN_TYPE);
    rolls.push(makeRollRecord('Turn Type', rollD(20), turnEntry.label, turnEntry.value, step));
    const corridors = [];
    const cursors = [];
    const addBranch = (dir) => {
        const len = corridorLength();
        const rect = corridorRect(cursor.position, dir, len, 2);
        const cor = {
            id: newId('cor'),
            rect,
            direction: dir,
            fromId: cursor.corridorId,
            toId: null,
        };
        corridors.push(cor);
        cursors.push({
            type: 'corridor_end',
            corridorId: cor.id,
            position: corridorEnd(rect, dir),
            direction: dir,
        });
    };
    // suppress unused warning
    void existingCorridors;
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
function handleSidePassage(cursor, step, rolls) {
    const sideEntry = weightedRoll(SIDE_PASSAGE);
    rolls.push(makeRollRecord('Side Passage', rollD(20), sideEntry.label, sideEntry.value, step));
    const corridors = [];
    const cursors = [];
    const addBranch = (dir) => {
        const len = corridorLength();
        const rect = corridorRect(cursor.position, dir, len, 2);
        const cor = {
            id: newId('cor'),
            rect,
            direction: dir,
            fromId: cursor.corridorId,
            toId: null,
        };
        corridors.push(cor);
        cursors.push({
            type: 'corridor_end',
            corridorId: cor.id,
            position: corridorEnd(rect, dir),
            direction: dir,
        });
    };
    // Main passage always continues straight
    addBranch(cursor.direction);
    switch (sideEntry.value) {
        case 'left':
            addBranch(turnLeft(cursor.direction));
            break;
        case 'right':
            addBranch(turnRight(cursor.direction));
            break;
        case 'both':
        case 'ahead_left_right':
            addBranch(turnLeft(cursor.direction));
            addBranch(turnRight(cursor.direction));
            break;
        case 'passage_t':
            // T: left + right, no straight (remove the straight we added above)
            corridors.pop();
            cursors.pop();
            addBranch(turnLeft(cursor.direction));
            addBranch(turnRight(cursor.direction));
            break;
    }
    return { corridors, cursors };
}
function generateRoom(cursor, step, rolls, level) {
    // Shape
    const shapeEntry = weightedRoll(ROOM_SHAPE);
    rolls.push(makeRollRecord('Room Shape', rollD(10), shapeEntry.label, shapeEntry.value, step));
    // Size
    const sizeTable = shapeEntry.value === 'circle' ? ROOM_SIZE_SMALL : ROOM_SIZE_LARGE;
    const wEntry = weightedRoll(sizeTable);
    const hEntry = shapeEntry.value === 'rectangle' ? weightedRoll(sizeTable) : wEntry;
    rolls.push(makeRollRecord('Room Width', rollD(10), `${wEntry.value * 10} ft`, wEntry.value.toString(), step));
    if (shapeEntry.value === 'rectangle') {
        rolls.push(makeRollRecord('Room Depth', rollD(10), `${hEntry.value * 10} ft`, hEntry.value.toString(), step));
    }
    // Placement: room centred on where the corridor arrives
    const w = wEntry.value;
    const h = hEntry.value;
    const rect = {
        x: cursor.position.x - Math.floor(w / 2),
        y: cursor.position.y - Math.floor(h / 2),
        w,
        h,
    };
    // Contents
    const contentsTable = roomContentsTable(level);
    const contentsEntry = weightedRoll(contentsTable);
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
    // Number of exits (not counting entrance)
    const exitsEntry = weightedRoll(ROOM_EXITS);
    rolls.push(makeRollRecord('Room Exits', rollD(6), exitsEntry.label, exitsEntry.value.toString(), step));
    const exits = [];
    const exitCorridors = [];
    const exitCursors = [];
    // Exit directions: try to spread them around, skip the direction we came from
    const entryDir = opposite(cursor.direction);
    const possibleDirs = ['north', 'east', 'south', 'west'].filter(d => d !== entryDir);
    const usedDirs = new Set();
    for (let i = 0; i < exitsEntry.value && possibleDirs.length > 0; i++) {
        const idx = Math.floor(Math.random() * possibleDirs.length);
        const exitDir = possibleDirs.splice(idx, 1)[0];
        usedDirs.add(exitDir);
        const hasDoor = Math.random() < 0.5;
        let doorType;
        if (hasDoor) {
            const dEntry = weightedRoll(DOOR_TYPE);
            doorType = dEntry.value;
            rolls.push(makeRollRecord('Exit Door', rollD(8), dEntry.label, dEntry.value, step));
        }
        const corLen = corridorLength();
        const exitStart = roomExitPoint(rect, exitDir);
        const corRect = corridorRect(exitStart, exitDir, corLen, 2);
        const cor = {
            id: newId('cor'),
            rect: corRect,
            direction: exitDir,
            fromId: 'room_' + step,
            toId: null,
        };
        exitCorridors.push(cor);
        exitCursors.push({
            type: 'corridor_end',
            corridorId: cor.id,
            position: corridorEnd(corRect, exitDir),
            direction: exitDir,
        });
        exits.push({ direction: exitDir, doorType, corridorId: cor.id });
    }
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
    // Fix corridor fromId to use actual room id
    exitCorridors.forEach(c => { c.fromId = room.id; });
    return { room, exitCorridors, exitCursors };
}
function roomExitPoint(rect, dir) {
    switch (dir) {
        case 'north': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y };
        case 'south': return { x: rect.x + Math.floor(rect.w / 2), y: rect.y + rect.h };
        case 'east': return { x: rect.x + rect.w, y: rect.y + Math.floor(rect.h / 2) };
        case 'west': return { x: rect.x, y: rect.y + Math.floor(rect.h / 2) };
    }
}
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
