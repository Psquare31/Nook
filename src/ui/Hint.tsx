import { canBuild, canEdit, useStore } from '../state/store';

export function Hint() {
  const mode = useStore((state) => state.mode);
  const placing = useStore((state) => state.placing !== null);
  const builder = useStore(canBuild);
  const signInAvailable = useStore((state) => state.auth.googleClientId !== null);
  const noBuilding = signInAvailable ? 'Sign in with Google to build rooms' : 'Building is off on this server';
  const selection = useStore((state) => {
    const room = state.selectedId ? state.rooms[state.selectedId] : undefined;
    if (!room) return 'none';
    return canEdit(state, room) ? 'mine' : 'locked';
  });

  let text = 'Click a room to select it · Drag empty space to pan · Scroll to zoom';
  if (mode === 'play') text = 'WASD or arrow keys to walk · Enter to chat · Scroll to zoom';
  else if (placing) text = 'Click to place · Esc to cancel';
  else if (selection === 'mine') {
    text = 'Drag to move · Pull an edge or corner to resize · Arrows nudge · Del deletes';
  } else if (selection === 'locked') {
    text = builder ? 'You can only change rooms you created' : noBuilding;
  } else if (!builder) {
    text = `${noBuilding} · Drag empty space to pan · Scroll to zoom`;
  }

  return <div className="hint">{text}</div>;
}
