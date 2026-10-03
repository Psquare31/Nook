import { useState, type FormEvent } from 'react';
import { GRID, ROOM_MAX, ROOM_MIN, ROOM_NAME_MAX } from '../../shared/constants';
import { clamp, snap } from '../../shared/geometry';
import { newId } from '../lib/id';
import { GoogleSignIn } from '../auth/GoogleSignIn';
import { canBuild, useStore } from '../state/store';

function normalizeSize(value: string): number | null {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed)) return null;
  return clamp(snap(parsed), ROOM_MIN, ROOM_MAX);
}

function SignInToBuild() {
  return (
    <section className="card">
      <h2>Create room</h2>
      <p className="help">
        Sign in with Google to build rooms. Rooms you create stay yours on any device.
      </p>
      <GoogleSignIn />
    </section>
  );
}

export function CreateRoomPanel() {
  const allowed = useStore(canBuild);
  return allowed ? <CreateRoomForm /> : <SignInToBuild />;
}

function CreateRoomForm() {
  const placing = useStore((state) => state.placing);
  const roomCount = useStore((state) => Object.keys(state.rooms).length);
  const startPlacing = useStore((state) => state.startPlacing);
  const stopPlacing = useStore((state) => state.stopPlacing);
  const [name, setName] = useState('');
  const [width, setWidth] = useState('400');
  const [height, setHeight] = useState('250');

  const fallbackName = `Room ${roomCount + 1}`;
  const sizeValid = normalizeSize(width) !== null && normalizeSize(height) !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextWidth = normalizeSize(width);
    const nextHeight = normalizeSize(height);
    if (nextWidth === null || nextHeight === null) return;

    setWidth(String(nextWidth));
    setHeight(String(nextHeight));
    setName('');
    startPlacing({
      id: newId(),
      name: name.trim() || fallbackName,
      width: nextWidth,
      height: nextHeight,
    });
  };

  if (placing) {
    return (
      <section className="card">
        <h2>Place room</h2>
        <p className="placing-summary">
          <strong>{placing.name}</strong>
          <span>
            {placing.width} × {placing.height}
          </span>
        </p>
        <p className="help">
          Move over the map and click a free spot. Green means it fits, red means it overlaps.
        </p>
        <button type="button" className="button" onClick={() => stopPlacing()}>
          Cancel
        </button>
      </section>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Create room</h2>
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          maxLength={ROOM_NAME_MAX}
          placeholder={fallbackName}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Width</span>
          <input
            type="number"
            min={ROOM_MIN}
            max={ROOM_MAX}
            step={GRID}
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            onBlur={() => setWidth(String(normalizeSize(width) ?? 400))}
          />
        </label>
        <label className="field">
          <span>Height</span>
          <input
            type="number"
            min={ROOM_MIN}
            max={ROOM_MAX}
            step={GRID}
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            onBlur={() => setHeight(String(normalizeSize(height) ?? 250))}
          />
        </label>
      </div>
      <button type="submit" className="button primary" disabled={!sizeValid}>
        Create room
      </button>
    </form>
  );
}
