import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { CHAT_MAX } from '../shared/constants';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol';
import type { RoomChange, WorldState } from './world';

export type NookServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Each world room maps to one Socket.IO room, and everyone outside shares another.
function channel(roomId: string | null): string {
  return roomId ? `room:${roomId}` : 'outside';
}

export function registerHandlers(io: NookServer, state: WorldState, onRoomsChanged: () => void) {
  const switchChannel = ({ player, previous }: RoomChange) => {
    const socket = io.sockets.sockets.get(player.id);
    socket?.leave(channel(previous));
    socket?.join(channel(player.roomId));
    io.emit('player:room', { id: player.id, roomId: player.roomId });
  };

  const roomsChanged = () => {
    onRoomsChanged();
    state.refreshOccupancy().forEach(switchChannel);
  };

  io.on('connection', (socket) => {
    const joined = () => state.getPlayer(socket.id) !== undefined;

    socket.on('join', (request, ack) => {
      if (typeof ack !== 'function') return;

      const previous = state.getPlayer(socket.id);
      if (previous) socket.leave(channel(previous.roomId));

      const player = state.addPlayer(socket.id, request);
      socket.join(channel(player.roomId));
      ack({
        selfId: player.id,
        world: state.world,
        rooms: state.listRooms(),
        players: state.listPlayers(),
      });
      socket.broadcast.emit('player:joined', player);
    });

    socket.on('room:create', (room, ack) => {
      if (typeof ack !== 'function' || !joined()) return;
      const result = state.createRoom(room);
      ack(result);
      if (result.ok) {
        socket.broadcast.emit('room:created', result.room);
        roomsChanged();
      }
    });

    socket.on('room:update', (room, ack) => {
      if (typeof ack !== 'function' || !joined()) return;
      const result = state.updateRoom(room);
      ack(result);
      if (result.ok) {
        socket.broadcast.emit('room:updated', result.room);
        roomsChanged();
      }
    });

    socket.on('room:delete', (id, ack) => {
      if (typeof ack !== 'function' || !joined()) return;
      const removed = state.deleteRoom(id);
      ack({ ok: true });
      if (removed) {
        socket.broadcast.emit('room:deleted', id);
        roomsChanged();
      }
    });

    socket.on('player:move', (position) => {
      const change = state.movePlayer(socket.id, position);
      if (!change) return;

      const { player } = change;
      socket.broadcast.volatile.emit('player:moved', { id: player.id, x: player.x, y: player.y });
      if (player.roomId !== change.previous) switchChannel(change);
    });

    socket.on('player:rename', (name) => {
      const player = state.renamePlayer(socket.id, name);
      if (player) io.emit('player:renamed', { id: player.id, name: player.name });
    });

    socket.on('chat:send', (text) => {
      const player = state.getPlayer(socket.id);
      const clean = typeof text === 'string' ? text.trim().slice(0, CHAT_MAX) : '';
      if (!player || !clean) return;

      io.to(channel(player.roomId)).emit('chat:message', {
        id: randomUUID(),
        from: { id: player.id, name: player.name, color: player.color },
        roomId: player.roomId,
        text: clean,
      });
    });

    socket.on('disconnect', () => {
      if (state.removePlayer(socket.id)) io.emit('player:left', socket.id);
    });
  });
}
