import type { DungeonState } from '../types.js';
import { setState } from '../state.js';
import { describeRoomLines } from '../generator.js';

export function renderRoomKey(state: DungeonState): void {
  const list = document.getElementById('room-key-list') as HTMLDivElement;
  list.innerHTML = '';

  if (state.rooms.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#999;font-size:11px;padding:4px';
    empty.textContent = 'No rooms yet.';
    list.appendChild(empty);
  }

  state.rooms.forEach((room, index) => {
    const entry = document.createElement('div');
    entry.className = 'room-key-entry' + (state.selectedRoomId === room.id ? ' highlighted' : '');
    entry.dataset.roomId = room.id;

    entry.addEventListener('click', (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      setState(s => ({ ...s, selectedRoomId: s.selectedRoomId === room.id ? null : room.id }));
    });

    const headerEl = document.createElement('div');
    headerEl.className = 'room-key-entry-header';
    headerEl.textContent = `Room ${index + 1}`;
    entry.appendChild(headerEl);

    for (const line of describeRoomLines(room)) {
      const bodyEl = document.createElement('div');
      bodyEl.className = 'room-key-entry-body';
      bodyEl.textContent = line;
      entry.appendChild(bodyEl);
    }

    if (room.notes) {
      const notesEl = document.createElement('div');
      notesEl.className = 'room-key-entry-notes';
      notesEl.textContent = room.notes;
      entry.appendChild(notesEl);
    }

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

  renderOrphanedNotes(state, list);
}

/** Notes whose room no longer exists after an override changed the layout. */
function renderOrphanedNotes(state: DungeonState, list: HTMLDivElement): void {
  if (state.orphanedNotes.length === 0) return;

  const box = document.createElement('div');
  box.className = 'room-key-orphans';

  const title = document.createElement('div');
  title.className = 'room-key-entry-header';
  title.textContent = 'Notes from rooms that changed';
  box.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'room-key-entry-body';
  hint.textContent = 'An override altered the layout. These notes return if the room does (e.g. Undo).';
  box.appendChild(hint);

  state.orphanedNotes.forEach((o, i) => {
    const row = document.createElement('div');
    row.className = 'room-key-entry-notes';
    row.textContent = `${o.label} — ${o.notes}`;

    const dismiss = document.createElement('button');
    dismiss.className = 'small secondary';
    dismiss.style.marginLeft = '6px';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => {
      setState(s => ({ ...s, orphanedNotes: s.orphanedNotes.filter((_, j) => j !== i) }));
    });
    row.appendChild(dismiss);
    box.appendChild(row);
  });
  list.appendChild(box);
}

function toggleNotesEditor(entry: HTMLDivElement, roomId: string, currentNotes: string): void {
  const existing = entry.querySelector('.room-key-notes-editor') as HTMLTextAreaElement | null;
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
