import { useEffect, useState } from 'react';
import { PLAYER_NAME_MAX } from '../../shared/constants';
import { rename } from '../state/actions';
import { useStore, type Mode } from '../state/store';
import { VoiceControl } from '../voice/VoiceControl';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'play', label: 'Play' },
  { mode: 'edit', label: 'Edit world' },
];

function Status() {
  const connection = useStore((state) => state.connection);
  const online = useStore((state) => Object.keys(state.players).length);

  const label =
    connection === 'online'
      ? `${online} online`
      : connection === 'connecting'
        ? 'Connecting…'
        : 'Offline · retrying';

  return (
    <span className={`status ${connection}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function NameField() {
  const name = useStore((state) => state.name);
  const [value, setValue] = useState(name);

  useEffect(() => setValue(name), [name]);

  return (
    <label className="name-field">
      <span>Name</span>
      <input
        value={value}
        maxLength={PLAYER_NAME_MAX}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (!rename(value)) setValue(name);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function TopBar() {
  const mode = useStore((state) => state.mode);
  const setMode = useStore((state) => state.setMode);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        Nook
      </div>
      <div className="segmented">
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            className={option.mode === mode ? 'active' : undefined}
            onClick={() => setMode(option.mode)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="spacer" />
      <VoiceControl />
      <Status />
      <NameField />
    </header>
  );
}
