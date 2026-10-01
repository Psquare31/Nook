import { useStore } from '../state/store';

export function Hint() {
  const placing = useStore((state) => state.placing !== null);
  const selected = useStore((state) => state.selectedId !== null);

  const text = placing
    ? 'Click to place · Esc to cancel'
    : selected
      ? 'Drag to move · Pull an edge or corner to resize · Arrows nudge · Del deletes'
      : 'Click a room to select it · Drag empty space to pan · Scroll to zoom';

  return <div className="hint">{text}</div>;
}
