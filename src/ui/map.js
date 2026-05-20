import { setState } from '../state.js';
const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL = 20; // px per grid unit (1 grid unit = 10ft)
const PADDING = 4; // grid units of padding around content
let _svg;
let _mapGroup;
// Pan/zoom state
let _viewX = 0;
let _viewY = 0;
let _zoom = 1;
let _dragging = false;
let _dragStart = { x: 0, y: 0 };
let _viewStart = { x: 0, y: 0 };
export function initMap() {
    _svg = document.getElementById('dungeon-map');
    _mapGroup = document.getElementById('map-elements');
    _svg.addEventListener('mousedown', onMouseDown);
    _svg.addEventListener('mousemove', onMouseMove);
    _svg.addEventListener('mouseup', onMouseUp);
    _svg.addEventListener('mouseleave', onMouseUp);
    _svg.addEventListener('wheel', onWheel, { passive: false });
    // Touch support
    _svg.addEventListener('touchstart', onTouchStart, { passive: true });
    _svg.addEventListener('touchmove', onTouchMove, { passive: false });
    _svg.addEventListener('touchend', onTouchEnd);
}
function onMouseDown(e) {
    _dragging = true;
    _dragStart = { x: e.clientX, y: e.clientY };
    _viewStart = { x: _viewX, y: _viewY };
}
function onMouseMove(e) {
    if (!_dragging)
        return;
    _viewX = _viewStart.x + (e.clientX - _dragStart.x);
    _viewY = _viewStart.y + (e.clientY - _dragStart.y);
    applyTransform();
}
function onMouseUp() {
    _dragging = false;
}
function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = _svg.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    _viewX = cx - (cx - _viewX) * factor;
    _viewY = cy - (cy - _viewY) * factor;
    _zoom *= factor;
    applyTransform();
}
let _touchLast = { x: 0, y: 0 };
function onTouchStart(e) {
    if (e.touches.length === 1) {
        _dragging = true;
        _touchLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        _viewStart = { x: _viewX, y: _viewY };
    }
}
function onTouchMove(e) {
    if (!_dragging || e.touches.length !== 1)
        return;
    e.preventDefault();
    _viewX = _viewStart.x + (e.touches[0].clientX - _touchLast.x);
    _viewY = _viewStart.y + (e.touches[0].clientY - _touchLast.y);
    applyTransform();
}
function onTouchEnd() {
    _dragging = false;
}
function applyTransform() {
    _mapGroup.setAttribute('transform', `translate(${_viewX},${_viewY}) scale(${_zoom})`);
}
function gridToSvg(gridX, gridY) {
    return { x: gridX * CELL, y: gridY * CELL };
}
function svgRect(rect) {
    return {
        x: rect.x * CELL,
        y: rect.y * CELL,
        w: rect.w * CELL,
        h: rect.h * CELL,
    };
}
function el(tag) {
    return document.createElementNS(SVG_NS, tag);
}
function setAttrs(elem, attrs) {
    for (const [k, v] of Object.entries(attrs)) {
        elem.setAttribute(k, String(v));
    }
}
export function renderMap(state) {
    // Clear previous
    while (_mapGroup.firstChild)
        _mapGroup.removeChild(_mapGroup.firstChild);
    if (!state.started) {
        renderEntrance();
        return;
    }
    // Draw corridors first (below rooms)
    for (const corridor of state.corridors) {
        renderCorridor(corridor, state);
    }
    // Draw rooms
    for (const room of state.rooms) {
        renderRoom(room, state.selectedRoomId === room.id);
    }
    // Entrance marker
    renderEntrance();
    // Cursor indicators
    for (const cursor of state.cursors) {
        renderCursor(cursor.position);
    }
    autoFit(state);
}
function renderEntrance() {
    const { x, y } = gridToSvg(0, 0);
    const size = CELL * 0.8;
    const g = el('g');
    const circ = el('circle');
    setAttrs(circ, { cx: x, cy: y, r: size / 2, fill: 'white', stroke: '#1a1a1a', 'stroke-width': 1.5 });
    g.appendChild(circ);
    const txt = el('text');
    setAttrs(txt, { x, y, 'font-family': 'Courier New', 'font-size': 10, fill: '#1a1a1a',
        'dominant-baseline': 'middle', 'text-anchor': 'middle', 'font-weight': 'bold' });
    txt.textContent = 'E';
    g.appendChild(txt);
    _mapGroup.appendChild(g);
}
function renderCorridor(corridor, state) {
    const r = svgRect(corridor.rect);
    const rect = el('rect');
    setAttrs(rect, {
        x: r.x, y: r.y, width: Math.max(r.w, 1), height: Math.max(r.h, 1),
        class: 'map-corridor',
    });
    _mapGroup.appendChild(rect);
    // Check if this corridor has a door — look for an exit in a connected room that references it
    const door = findDoorForCorridor(corridor.id, state);
    if (door) {
        renderDoorOnCorridor(r, corridor.direction, door);
    }
}
function findDoorForCorridor(corridorId, state) {
    for (const room of state.rooms) {
        for (const exit of room.exits) {
            if (exit.corridorId === corridorId && exit.doorType) {
                return exit.doorType;
            }
        }
    }
    return null;
}
function renderDoorOnCorridor(r, dir, doorType) {
    const isSecret = doorType === 'stone_secret';
    const isLocked = doorType === 'wooden_locked' || doorType === 'iron';
    let dx, dy, dw, dh;
    if (dir === 'north' || dir === 'south') {
        const mx = r.x + r.w / 2;
        const my = r.y + r.h / 2;
        dx = mx - 1;
        dy = my - CELL * 0.4;
        dw = 2;
        dh = CELL * 0.8;
    }
    else {
        const mx = r.x + r.w / 2;
        const my = r.y + r.h / 2;
        dx = mx - CELL * 0.4;
        dy = my - 1;
        dw = CELL * 0.8;
        dh = 2;
    }
    if (isSecret) {
        const txt = el('text');
        setAttrs(txt, {
            x: r.x + r.w / 2, y: r.y + r.h / 2,
            'font-family': 'Courier New', 'font-size': 9, fill: '#1a1a1a',
            'dominant-baseline': 'middle', 'text-anchor': 'middle',
        });
        txt.textContent = 'S';
        _mapGroup.appendChild(txt);
    }
    else {
        const doorRect = el('rect');
        setAttrs(doorRect, { x: dx, y: dy, width: dw, height: dh, class: 'map-door' });
        _mapGroup.appendChild(doorRect);
        if (isLocked) {
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;
            const circ = el('circle');
            setAttrs(circ, { cx, cy, r: 3, class: 'map-door-circle' });
            _mapGroup.appendChild(circ);
        }
    }
}
function renderRoom(room, selected) {
    const r = svgRect(room.rect);
    if (room.shape === 'circle') {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const rx = r.w / 2;
        const ry = r.h / 2;
        const ellipse = el('ellipse');
        setAttrs(ellipse, {
            cx, cy, rx, ry,
            class: selected ? 'map-room selected' : 'map-room',
            'data-room-id': room.id,
            style: 'cursor:pointer',
        });
        ellipse.addEventListener('click', () => selectRoom(room.id));
        _mapGroup.appendChild(ellipse);
    }
    else {
        const rect = el('rect');
        setAttrs(rect, {
            x: r.x, y: r.y, width: r.w, height: r.h,
            class: selected ? 'map-room selected' : 'map-room',
            'data-room-id': room.id,
            style: 'cursor:pointer',
        });
        rect.addEventListener('click', () => selectRoom(room.id));
        _mapGroup.appendChild(rect);
    }
    // Room number label
    const roomIndex = parseInt(room.id.split('_')[1] ?? '0');
    const txt = el('text');
    setAttrs(txt, {
        x: r.x + r.w / 2,
        y: r.y + r.h / 2,
        class: 'map-label',
        'pointer-events': 'none',
    });
    txt.textContent = String(roomIndex);
    _mapGroup.appendChild(txt);
}
function renderCursor(pos) {
    const { x, y } = gridToSvg(pos.x, pos.y);
    const diamond = el('polygon');
    const s = CELL * 0.3;
    diamond.setAttribute('points', `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`);
    diamond.setAttribute('fill', '#888');
    diamond.setAttribute('opacity', '0.5');
    _mapGroup.appendChild(diamond);
}
function selectRoom(roomId) {
    setState(s => ({ ...s, selectedRoomId: s.selectedRoomId === roomId ? null : roomId }));
}
function getBounds(state) {
    const rects = [
        ...state.rooms.map(r => r.rect),
        ...state.corridors.map(c => c.rect),
    ];
    if (rects.length === 0)
        return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rects) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
    }
    // Include origin (entrance)
    minX = Math.min(minX, -1);
    minY = Math.min(minY, -1);
    maxX = Math.max(maxX, 1);
    maxY = Math.max(maxY, 1);
    return { minX, minY, maxX, maxY };
}
function autoFit(state) {
    const bounds = getBounds(state);
    if (!bounds)
        return;
    const { minX, minY, maxX, maxY } = bounds;
    const contentW = (maxX - minX + PADDING * 2) * CELL;
    const contentH = (maxY - minY + PADDING * 2) * CELL;
    const svgRect_ = _svg.getBoundingClientRect();
    if (svgRect_.width === 0 || svgRect_.height === 0)
        return;
    const scaleX = svgRect_.width / contentW;
    const scaleY = svgRect_.height / contentH;
    _zoom = Math.min(scaleX, scaleY, 2);
    _viewX = (-minX + PADDING) * CELL * _zoom + (svgRect_.width - contentW * _zoom) / 2;
    _viewY = (-minY + PADDING) * CELL * _zoom + (svgRect_.height - contentH * _zoom) / 2;
    applyTransform();
}
export function exportPNG() {
    const svgEl = document.getElementById('dungeon-map');
    const bbox = svgEl.getBoundingClientRect();
    const scale = 2;
    const w = bbox.width * scale;
    const h = bbox.height * scale;
    const serialiser = new XMLSerializer();
    const svgStr = serialiser.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#faf8f3';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        // Scale bar
        const barW = 100 * scale;
        const barH = 8 * scale;
        const bx = 20 * scale;
        const by = h - 30 * scale;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#faf8f3';
        ctx.font = `${10 * scale}px Courier New`;
        ctx.fillText('100 ft', bx + barW + 6 * scale, by + barH);
        const link = document.createElement('a');
        link.download = 'dungeon.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        URL.revokeObjectURL(url);
    };
    img.src = url;
}
