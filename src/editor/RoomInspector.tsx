import { useEffect, useState, type KeyboardEvent } from 'react';
import { GRID, ROOM_NAME_MAX } from '../../shared/constants';
import { snap } from '../../shared/geometry';
import type { Room } from '../../shared/types';
import { deleteRoom, updateRoom } from '../state/actions';
import { canEdit, useStore } from '../state/store';

type Fields = { name: string; x: string; y: string; width: string; height: string };

const NUMERIC = ['x', 'y', 'width', 'height'] as const;

function toFields(room: Room): Fields {
  return {
    name: room.name,
    x: String(room.x),
    y: String(room.y),
    width: String(room.width),
    height: String(room.height),
  };
}

function toRoom(room: Room, fields: Fields): Room | null {
  const next: Room = { ...room, name: fields.name.trim() };
  for (const key of NUMERIC) {
    const parsed = Number(fields[key]);
    if (fields[key].trim() === '' || !Number.isFinite(parsed)) return null;
    next[key] = snap(parsed);
  }
  return next;
}

function InspectorForm({ room }: { room: Room }) {
  const [fields, setFields] = useState(() => toFields(room));

  useEffect(() => setFields(toFields(room)), [room]);

  const commit = () => {
    const next = toRoom(room, fields);
    const changed =
      next !== null &&
      (next.name !== room.name || NUMERIC.some((key) => next[key] !== room[key]));
    if (!next || !changed || !updateRoom(next)) setFields(toFields(room));
  };

  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const bind = (key: keyof Fields) => ({
    value: fields[key],
    onChange: (event: { target: { value: string } }) =>
      setFields({ ...fields, [key]: event.target.value }),
    onBlur: commit,
    onKeyDown: blurOnEnter,
  });

  return (
    <section className="card">
      <h2>Your room</h2>
      <label className="field">
        <span>Name</span>
        <input maxLength={ROOM_NAME_MAX} {...bind('name')} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>X</span>
          <input type="number" step={GRID} {...bind('x')} />
        </label>
        <label className="field">
          <span>Y</span>
          <input type="number" step={GRID} {...bind('y')} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <input type="number" step={GRID} {...bind('width')} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" step={GRID} {...bind('height')} />
        </label>
      </div>
      <button type="button" className="button danger" onClick={() => deleteRoom(room.id)}>
        Delete room
      </button>
    </section>
  );
}

function LockedRoom({ room }: { room: Room }) {
  return (
    <section className="card">
      <h2>{room.owner ? 'Room' : 'Built-in room'}</h2>
      <p className="locked-name">{room.name}</p>
      <dl className="facts">
        <dt>Size</dt>
        <dd>
          {room.width} × {room.height}
        </dd>
        <dt>Position</dt>
        <dd>
          {room.x}, {room.y}
        </dd>
        {room.owner && (
          <>
            <dt>Created by</dt>
            <dd>{room.owner.name}</dd>
          </>
        )}
      </dl>
      <p className="help locked-note">
        {room.owner
          ? 'Only the person who created a room can move, resize, rename or delete it.'
          : 'Built-in rooms cannot be changed.'}
      </p>
    </section>
  );
}

export function RoomInspector() {
  const room = useStore((state) =>
    state.selectedId ? state.rooms[state.selectedId] : undefined,
  );
  const editable = useStore((state) => room !== undefined && canEdit(state, room));
  if (!room) return null;

  return (
    <aside className="panel panel-right">
      {editable ? <InspectorForm key={room.id} room={room} /> : <LockedRoom room={room} />}
    </aside>
  );
}
