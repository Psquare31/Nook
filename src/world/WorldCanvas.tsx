import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { fitRooms, panBy, viewport, zoomAt } from './camera';
import { render } from './render';

export function WorldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let framed = false;
    let dragging = false;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      viewport.width = canvas.clientWidth;
      viewport.height = canvas.clientHeight;
      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      if (!framed && viewport.width > 0) {
        fitRooms(Object.values(useStore.getState().rooms));
        framed = true;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) panBy(event.movementX, event.movementY);
    };
    const onPointerUp = () => {
      dragging = false;
      canvas.style.cursor = 'grab';
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      zoomAt(
        event.clientX - bounds.left,
        event.clientY - bounds.top,
        Math.exp(-event.deltaY * 0.0015),
      );
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let frame = requestAnimationFrame(function tick() {
      render(ctx);
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return <canvas ref={ref} className="world" />;
}
