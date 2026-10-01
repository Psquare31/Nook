import { useEffect, useRef } from 'react';
import { attachEditor } from '../editor/interactions';
import { useStore } from '../state/store';
import { fitRooms, viewport } from './camera';
import { render } from './render';

export function WorldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let framed = false;

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

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const detachEditor = attachEditor(canvas);

    let frame = requestAnimationFrame(function tick() {
      render(ctx);
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      detachEditor();
    };
  }, []);

  return <canvas ref={ref} className="world" />;
}
