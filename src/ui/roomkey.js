import { setState } from '../state.js';
import { buildRoomDescription } from '../generator.js';
export function renderRoomKey(state) {
    const list = document.getElementById('room-key-list');
    list.innerHTML = '';
    if (state.rooms.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#999;font-size:11px;padding:4px';
        empty.textContent = 'No rooms yet.';
        list.appendChild(empty);
        return;
    }
    state.rooms.forEach((room, index) => {
        const entry = document.createElement('div');
        entry.className = 'room-key-entry' + (state.selectedRoomId === room.id ? ' highlighted' : '');
        entry.dataset.roomId = room.id;
        entry.addEventListener('click', (e) => {
            if (e.target.tagName === 'TEXTAREA' ||
                e.target.tagName === 'BUTTON')
                return;
            setState(s => ({ ...s, selectedRoomId: s.selectedRoomId === room.id ? null : room.id }));
        });
        const headerEl = document.createElement('div');
        headerEl.className = 'room-key-entry-header';
        headerEl.textContent = `Room ${index + 1}`;
        entry.appendChild(headerEl);
        const bodyEl = document.createElement('div');
        bodyEl.className = 'room-key-entry-body';
        bodyEl.textContent = buildRoomDescription(room);
        entry.appendChild(bodyEl);
        // Notes
        if (room.notes) {
            const notesEl = document.createElement('div');
            notesEl.className = 'room-key-entry-notes';
            notesEl.textContent = room.notes;
            entry.appendChild(notesEl);
        }
        // Edit notes
        const editBtn = document.createElement('button');
        editBtn.className = 'small secondary';
        editBtn.style.marginTop = '4px';
        editBtn.textContent = room.notes ? 'Edit notes' : 'Add notes';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNotesEditor(entry, room.id, room.notes);
        });
        entry.appendChild(editBtn);
        list.appendChild(entry);
    });
}
function toggleNotesEditor(entry, roomId, currentNotes) {
    const existing = entry.querySelector('.room-key-notes-editor');
    if (existing) {
        existing.remove();
        entry.querySelector('.notes-save-btn')?.remove();
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.className = 'room-key-notes-editor';
    textarea.value = currentNotes;
    textarea.placeholder = 'Add notes for this room…';
    entry.appendChild(textarea);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'small notes-save-btn';
    saveBtn.style.marginTop = '4px';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
        const notes = textarea.value.trim();
        setState(s => ({
            ...s,
            rooms: s.rooms.map(r => r.id === roomId ? { ...r, notes } : r),
        }));
    });
    entry.appendChild(saveBtn);
    textarea.focus();
}
