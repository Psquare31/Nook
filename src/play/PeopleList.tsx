import { useMemo } from 'react';
import { useStore } from '../state/store';

export function PeopleList() {
  const players = useStore((state) => state.players);
  const selfId = useStore((state) => state.selfId);
  const rooms = useStore((state) => state.rooms);
  const connected = useStore((state) => state.connection === 'online');

  const roomId = (selfId && players[selfId]?.roomId) || null;
  const here = useMemo(
    () =>
      Object.values(players)
        .filter((player) => player.roomId === roomId)
        .sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId) || a.name.localeCompare(b.name)),
    [players, roomId, selfId],
  );
  const online = Object.keys(players).length;
  const title = (roomId && rooms[roomId]?.name) || 'Outside';

  return (
    <section className="card people">
      <h2>
        {title} · {here.length}
      </h2>
      <ul>
        {here.map((player) => (
          <li key={player.id}>
            <span className="dot" style={{ background: player.color }} />
            <span className="person-name">{player.name}</span>
            {player.id === selfId && <span className="you">you</span>}
          </li>
        ))}
      </ul>
      <p className="help">
        {connected ? `${online} online in this world` : 'Not connected to the server'}
      </p>
    </section>
  );
}
