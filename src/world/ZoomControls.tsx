import { useStore } from '../state/store';
import { fitRooms, zoomBy } from './camera';

export function ZoomControls() {
  return (
    <div className="zoom-controls">
      <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
        +
      </button>
      <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
        −
      </button>
      <button
        type="button"
        className="wide"
        onClick={() => fitRooms(Object.values(useStore.getState().rooms))}
      >
        Fit
      </button>
    </div>
  );
}
