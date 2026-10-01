import { CreateRoomPanel } from './editor/CreateRoomPanel';
import { RoomInspector } from './editor/RoomInspector';
import { RoomList } from './editor/RoomList';
import { Hint } from './ui/Hint';
import { Toasts } from './ui/Toasts';
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
        <aside className="panel panel-left">
          <CreateRoomPanel />
          <RoomList />
        </aside>
        <RoomInspector />
        <Hint />
        <ZoomControls />
        <Toasts />
      </main>
    </div>
  );
}
