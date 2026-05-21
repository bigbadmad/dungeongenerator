const DEFAULT_SETTINGS = {
    level: 1,
    size: 'medium',
    startDirection: 'north',
};
function createInitialState() {
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
let _state = createInitialState();
const _listeners = [];
export function getState() {
    return _state;
}
export function setState(updater) {
    _state = updater({ ..._state });
    _listeners.forEach(fn => fn());
}
export function subscribe(fn) {
    _listeners.push(fn);
    return () => {
        const idx = _listeners.indexOf(fn);
        if (idx !== -1)
            _listeners.splice(idx, 1);
    };
}
export function resetState() {
    _state = createInitialState();
    _listeners.forEach(fn => fn());
}
export function saveToFile() {
    const json = JSON.stringify(_state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dungeon.json';
    a.click();
    URL.revokeObjectURL(url);
}
export function loadFromJSON(json) {
    try {
        const parsed = JSON.parse(json);
        // minimal shape check
        if (!parsed.rooms || !parsed.corridors || !parsed.settings)
            return false;
        if (!Array.isArray(parsed.occupied))
            parsed.occupied = [];
        _state = parsed;
        _listeners.forEach(fn => fn());
        return true;
    }
    catch {
        return false;
    }
}
