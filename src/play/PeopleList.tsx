import { useMemo } from 'react';
import { useStore } from '../state/store';
import { MicIcon } from '../voice/VoiceControl';

export function PeopleList() {
  const players = useStore((state) => state.players);
  const selfId = useStore((state) => state.selfId);
  const rooms = useStore((state) => state.rooms);
  const connected = useStore((state) => state.connection === 'online');
  const inVoice = useStore((state) => state.voice.members);
  const speaking = useStore((state) => state.voice.speaking);
  const selfMuted = useStore((state) => state.voice.muted || !state.voice.hasMic);

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
          <li key={player.id} className={speaking.includes(player.id) ? 'speaking' : undefined}>
            <span className="dot" style={{ background: player.color }} />
            <span className="person-name">{player.name}</span>
            {player.id === selfId && <span className="you">you</span>}
            {inVoice.includes(player.id) && (
              <span className="in-voice" title="In voice">
                <MicIcon off={player.id === selfId && selfMuted} />
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="help">
        {connected ? `${online} online in this world` : 'Not connected to the server'}
      </p>
    </section>
  );
}
