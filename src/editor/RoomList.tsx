import { useMemo } from 'react';
import type { Room } from '../../shared/types';
import { useStore } from '../state/store';
import { focusOn } from '../world/camera';

export function RoomList() {
  const rooms = useStore((state) => state.rooms);
  const selectedId = useStore((state) => state.selectedId);
  const select = useStore((state) => state.select);

  const sorted = useMemo(
    () => Object.values(rooms).sort((a, b) => a.name.localeCompare(b.name)),
    [rooms],
  );

  const focus = (room: Room) => {
    select(room.id);
    focusOn({ x: room.x + room.width / 2, y: room.y + room.height / 2 });
  };

  return (
    <section className="card room-list">
      <h2>Rooms · {sorted.length}</h2>
      {sorted.length === 0 ? (
        <p className="help">No rooms yet. Create the first one above.</p>
      ) : (
        <ul>
          {sorted.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                className={room.id === selectedId ? 'row active' : 'row'}
                onClick={() => focus(room)}
              >
                <span className="row-name">{room.name}</span>
                <span className="row-meta">
                  {room.width} × {room.height}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
