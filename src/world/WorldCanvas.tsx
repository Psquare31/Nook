import { useEffect, useRef } from 'react';
import { attachEditor } from '../editor/interactions';
import { attachMovement, stepMovement } from '../play/movement';
import { useStore } from '../state/store';
import { self } from './avatars';
import { centerOn, follow, viewport } from './camera';
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
        centerOn(self);
        framed = true;
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const detachEditor = attachEditor(canvas);
    const detachMovement = attachMovement();

    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      stepMovement(dt);
      if (useStore.getState().mode === 'play') follow(self, dt);
      render(ctx, now);
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      detachEditor();
      detachMovement();
    };
  }, []);

  return <canvas ref={ref} className="world" />;
}
