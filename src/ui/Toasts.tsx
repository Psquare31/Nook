import { useStore } from '../state/store';

export function Toasts() {
  const toasts = useStore((state) => state.toasts);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      ))}
    </div>
  );
}
