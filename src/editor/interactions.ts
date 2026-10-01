import { GRID } from '../../shared/constants';
import { clampToWorld, roomAt, snap, validateRoom } from '../../shared/geometry';
import type { Point, Room } from '../../shared/types';
import { isTyping } from '../lib/dom';
import { createRoom, deleteRoom, describeRejection, updateRoom } from '../state/actions';
import { canEdit, selfOwner, useStore, type Draft } from '../state/store';
import { camera, panBy, screenToWorld, viewport, zoomAt, zoomBy } from '../world/camera';
import { handleCursor, hitHandle, resizeRect, type Handle } from './handles';

const DRAG_THRESHOLD = 4;
const HANDLE_REACH = 7;

const NUDGE: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

type Gesture =
  | { type: 'idle' }
  | { type: 'pan' }
  | { type: 'move'; origin: Room; grab: Point; start: Point; active: boolean }
  | { type: 'resize'; origin: Room; handle: Handle };

function propose(kind: Draft['kind'], room: Room): Draft {
  const { rooms, world, setDraft } = useStore.getState();
  const result = validateRoom(room, Object.values(rooms), world);
  const draft: Draft = result.ok
    ? { kind, room, valid: true, reason: null, conflicts: [] }
    : { kind, room, valid: false, reason: result.reason, conflicts: result.conflicts };
  setDraft(draft);
  return draft;
}

function explain(draft: Draft): void {
  if (draft.reason) useStore.getState().toast(describeRejection(draft.reason, draft.conflicts));
}

function sameRect(a: Room, b: Room): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function attachEditor(canvas: HTMLCanvasElement): () => void {
  let gesture: Gesture = { type: 'idle' };
  let pointer: Point | null = null;

  const toLocal = (event: MouseEvent): Point => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const lastPointer = (): Point => pointer ?? { x: viewport.width / 2, y: viewport.height / 2 };

  const placeGhost = (screen: Point): Draft | null => {
    const state = useStore.getState();
    const { placing, world } = state;
    if (!placing) return null;
    const center = screenToWorld(screen.x, screen.y);
    const rect = clampToWorld(
      {
        x: snap(center.x - placing.width / 2),
        y: snap(center.y - placing.height / 2),
        width: placing.width,
        height: placing.height,
      },
      world,
    );
    return propose('place', {
      id: placing.id,
      name: placing.name,
      ...rect,
      owner: selfOwner(state),
    });
  };

  // Only the creator gets handles and drag-to-move; anyone can still select a room to inspect it.
  const editableSelection = (): Room | undefined => {
    const state = useStore.getState();
    const selected = state.selectedId ? state.rooms[state.selectedId] : undefined;
    return selected && canEdit(state, selected) ? selected : undefined;
  };

  const cursorAt = (screen: Point): string => {
    const state = useStore.getState();
    if (state.mode === 'play') return 'default';
    if (state.placing) return state.draft?.valid === false ? 'not-allowed' : 'copy';
    if (gesture.type === 'pan') return 'grabbing';
    if (gesture.type === 'move') return 'move';
    if (gesture.type === 'resize') return handleCursor(gesture.handle);

    const at = screenToWorld(screen.x, screen.y);
    const selected = editableSelection();
    const handle = selected ? hitHandle(selected, at, HANDLE_REACH / camera.zoom) : null;
    if (handle) return handleCursor(handle);

    const room = roomAt(at, Object.values(state.rooms));
    if (!room) return 'grab';
    return canEdit(state, room) ? 'move' : 'pointer';
  };

  const refreshCursor = () => {
    canvas.style.cursor = cursorAt(lastPointer());
  };

  const cancelGesture = () => {
    gesture = { type: 'idle' };
    useStore.getState().setDraft(null);
  };

  const onPointerDown = (event: PointerEvent) => {
    const screen = toLocal(event);
    const state = useStore.getState();
    pointer = screen;
    if (state.mode !== 'edit') return;

    if (event.button === 2) {
      if (state.placing) state.stopPlacing();
      return;
    }
    canvas.setPointerCapture(event.pointerId);

    if (event.button === 1) {
      gesture = { type: 'pan' };
      refreshCursor();
      return;
    }
    if (event.button !== 0) return;

    if (state.placing) {
      const draft = placeGhost(screen);
      if (draft?.valid && createRoom(draft.room)) state.stopPlacing(draft.room.id);
      else if (draft) explain(draft);
      refreshCursor();
      return;
    }

    const at = screenToWorld(screen.x, screen.y);
    const selected = editableSelection();
    const handle = selected ? hitHandle(selected, at, HANDLE_REACH / camera.zoom) : null;
    const room = roomAt(at, Object.values(state.rooms));

    if (selected && handle) {
      gesture = { type: 'resize', origin: selected, handle };
    } else if (room && canEdit(state, room)) {
      state.select(room.id);
      gesture = {
        type: 'move',
        origin: room,
        grab: { x: at.x - room.x, y: at.y - room.y },
        start: screen,
        active: false,
      };
    } else if (room) {
      // Someone else's room: a click selects it, and dragging pans the map instead.
      state.select(room.id);
      gesture = { type: 'pan' };
    } else {
      state.select(null);
      gesture = { type: 'pan' };
    }
    refreshCursor();
  };

  const onPointerMove = (event: PointerEvent) => {
    const screen = toLocal(event);
    const previous = pointer ?? screen;
    pointer = screen;
    const state = useStore.getState();
    if (state.mode !== 'edit') return;

    if (state.placing) {
      placeGhost(screen);
    } else if (gesture.type === 'pan') {
      panBy(screen.x - previous.x, screen.y - previous.y);
    } else if (gesture.type === 'move') {
      const travelled = Math.hypot(screen.x - gesture.start.x, screen.y - gesture.start.y);
      if (gesture.active || travelled >= DRAG_THRESHOLD) {
        gesture.active = true;
        const at = screenToWorld(screen.x, screen.y);
        const moved = clampToWorld(
          { ...gesture.origin, x: snap(at.x - gesture.grab.x), y: snap(at.y - gesture.grab.y) },
          state.world,
        );
        propose('move', moved);
      }
    } else if (gesture.type === 'resize') {
      const at = screenToWorld(screen.x, screen.y);
      const rect = resizeRect(gesture.origin, gesture.handle, at, state.world);
      propose('resize', { ...gesture.origin, ...rect });
    }
    refreshCursor();
  };

  const onPointerUp = () => {
    const { draft, setDraft } = useStore.getState();

    if (draft && (gesture.type === 'move' || gesture.type === 'resize')) {
      if (!draft.valid) explain(draft);
      else if (!sameRect(draft.room, gesture.origin)) updateRoom(draft.room);
      setDraft(null);
    }
    gesture = { type: 'idle' };
    refreshCursor();
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const screen = toLocal(event);
    const factor = Math.exp(-event.deltaY * 0.0015);
    const { mode, placing } = useStore.getState();

    // In play mode the camera follows the avatar, so zooming stays centred on it.
    if (mode === 'play') zoomBy(factor);
    else zoomAt(screen.x, screen.y, factor);
    if (placing) placeGhost(screen);
  };

  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  const onKeyDown = (event: KeyboardEvent) => {
    const state = useStore.getState();
    if (state.mode !== 'edit' || isTyping(event.target)) return;

    if (event.key === 'Escape') {
      if (state.placing) state.stopPlacing();
      else if (gesture.type !== 'idle') cancelGesture();
      else state.select(null);
      refreshCursor();
      return;
    }

    const selected = state.selectedId ? state.rooms[state.selectedId] : undefined;
    if (!selected || state.placing || gesture.type !== 'idle') return;

    if (event.key === 'Delete') {
      event.preventDefault();
      deleteRoom(selected.id);
      return;
    }

    const direction = NUDGE[event.key];
    if (direction) {
      event.preventDefault();
      const step = GRID * (event.shiftKey ? 5 : 1);
      const moved = clampToWorld(
        { ...selected, x: selected.x + direction.x * step, y: selected.y + direction.y * step },
        state.world,
      );
      if (!sameRect(moved, selected)) updateRoom(moved);
    }
  };

  const unsubscribe = useStore.subscribe((state, previous) => {
    if (state.placing && state.placing !== previous.placing) placeGhost(lastPointer());
    if (state.mode !== previous.mode) gesture = { type: 'idle' };
    if (state.placing !== previous.placing || state.mode !== previous.mode) refreshCursor();
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  refreshCursor();

  return () => {
    unsubscribe();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
  };
}
