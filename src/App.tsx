import { CreateRoomPanel } from './editor/CreateRoomPanel';
import { RoomInspector } from './editor/RoomInspector';
import { RoomList } from './editor/RoomList';
import { Chat } from './play/Chat';
import { PeopleList } from './play/PeopleList';
import { useStore } from './state/store';
import { Hint } from './ui/Hint';
import { Toasts } from './ui/Toasts';
import { TopBar } from './ui/TopBar';
import { WorldCanvas } from './world/WorldCanvas';
import { ZoomControls } from './world/ZoomControls';

export function App() {
  const mode = useStore((state) => state.mode);

  return (
    <div className="app">
      <TopBar />
      <main className="stage">
        <WorldCanvas />
        {mode === 'edit' ? (
          <>
            <aside className="panel panel-left">
              <CreateRoomPanel />
              <RoomList />
            </aside>
            <RoomInspector />
          </>
        ) : (
          <>
            <aside className="panel panel-left">
              <PeopleList />
            </aside>
            <Chat />
          </>
        )}
        <Hint />
        <ZoomControls />
        <Toasts />
      </main>
    </div>
  );
}
