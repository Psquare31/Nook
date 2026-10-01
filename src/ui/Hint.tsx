import { useStore } from '../state/store';

export function Hint() {
  const mode = useStore((state) => state.mode);
  const placing = useStore((state) => state.placing !== null);
  const selected = useStore((state) => state.selectedId !== null);

  const text =
    mode === 'play'
      ? 'WASD or arrow keys to walk · Enter to chat · Scroll to zoom'
      : placing
        ? 'Click to place · Esc to cancel'
        : selected
          ? 'Drag to move · Pull an edge or corner to resize · Arrows nudge · Del deletes'
          : 'Click a room to select it · Drag empty space to pan · Scroll to zoom';

  return <div className="hint">{text}</div>;
}
