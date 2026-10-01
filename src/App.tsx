import { WorldCanvas } from './world/WorldCanvas';
import { ZoomControls } from './world/ZoomControls';

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          Nook
        </div>
      </header>
      <main className="stage">
        <WorldCanvas />
        <ZoomControls />
      </main>
    </div>
  );
}
