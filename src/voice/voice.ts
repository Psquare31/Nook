import type { IAgoraRTC, IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import type { VoiceGrant } from '../../shared/protocol';
import { socket } from '../net/socket';
import { selfPlayer, useStore, type VoiceState } from '../state/store';

type Grant = Extract<VoiceGrant, { ok: true }>;

const POLL_MS = 120;
const SPEAKING_LEVEL = 0.06;
const SPEAKING_HOLD_MS = 350;
const TOKEN_TIMEOUT_MS = 8000;
const ROOM_SWITCH_DELAY_MS = 350;

let sdk: IAgoraRTC | null = null;
let client: IAgoraRTCClient | null = null;
let microphone: IMicrophoneAudioTrack | null = null;

// Whether the user has voice switched on. The channel follows them from room to room.
let enabled = false;
// Which player and room the current voice channel belongs to, or null when in none.
let joinedKey: string | null = null;
let joinedChannel: string | null = null;
let joinedUid = 0;

let pending: Promise<void> | null = null;
let again = false;
let poll: ReturnType<typeof setInterval> | null = null;
let switchTimer: ReturnType<typeof setTimeout> | null = null;
const lastHeard = new Map<number, number>();

function setVoice(patch: Partial<VoiceState>): void {
  useStore.getState().setVoice(patch);
}

function keyFor(playerId: string, roomId: string | null): string {
  return `${playerId}|${roomId ?? ''}`;
}

function wantedKey(): string | null {
  const me = selfPlayer(useStore.getState());
  return enabled && me ? keyFor(me.id, me.roomId) : null;
}

// Loaded on demand: the SDK is several times the size of the rest of the app.
async function loadSdk(): Promise<IAgoraRTC> {
  if (sdk) return sdk;
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  AgoraRTC.setLogLevel(3);
  AgoraRTC.onAutoplayFailed = () => {
    useStore.getState().toast('Click anywhere on the page to hear the others');
  };
  sdk = AgoraRTC;
  return AgoraRTC;
}

function getClient(AgoraRTC: IAgoraRTC): IAgoraRTCClient {
  if (client) return client;
  const created = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  created.on('user-published', async (user, mediaType) => {
    if (mediaType !== 'audio') return;
    try {
      await created.subscribe(user, 'audio');
      user.audioTrack?.play();
    } catch {
      // The other person left before the subscription finished.
    }
  });
  created.on('token-privilege-will-expire', () => void renewToken());
  created.on('token-privilege-did-expire', rejoin);
  created.on('connection-state-change', (state) => {
    // Our own leave clears joinedKey first, so this only fires for drops we did not ask for.
    if (state === 'DISCONNECTED' && joinedKey !== null) rejoin();
  });

  client = created;
  return created;
}

async function requestGrant(): Promise<Grant> {
  let grant: VoiceGrant;
  try {
    grant = await socket.timeout(TOKEN_TIMEOUT_MS).emitWithAck('voice:token');
  } catch {
    throw new Error('The server did not answer the voice request');
  }
  if (grant.ok) return grant;
  throw new Error(
    grant.reason === 'disabled'
      ? 'Voice chat is not set up on the server'
      : 'Not connected to the server',
  );
}

async function join(): Promise<void> {
  const grant = await requestGrant();
  const rtc = getClient(await loadSdk());
  if (rtc.connectionState !== 'DISCONNECTED') await rtc.leave();

  await rtc.join(grant.appId, grant.channel, grant.token, grant.uid);
  const playerId = useStore.getState().selfId;
  joinedKey = playerId ? keyFor(playerId, grant.roomId) : null;
  joinedChannel = grant.channel;
  joinedUid = grant.uid;
  if (microphone) await rtc.publish(microphone);
}

async function leave(): Promise<void> {
  joinedKey = null;
  joinedChannel = null;
  lastHeard.clear();
  if (client && client.connectionState !== 'DISCONNECTED') await client.leave();
}

function rejoin(): void {
  joinedKey = null;
  void reconcile();
}

async function renewToken(): Promise<void> {
  try {
    const grant = await requestGrant();
    if (client && grant.channel === joinedChannel && grant.uid === joinedUid) {
      await client.renewToken(grant.token);
    } else {
      rejoin();
    }
  } catch {
    // If the renewal is missed, the expiry event that follows rejoins from scratch.
  }
}

function describeFailure(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string') return `Voice could not connect (${code})`;
  return error instanceof Error ? error.message : 'Voice could not connect';
}

function shutDown(): void {
  enabled = false;
  microphone?.close();
  microphone = null;
  if (poll) clearInterval(poll);
  if (switchTimer) clearTimeout(switchTimer);
  poll = null;
  switchTimer = null;
  setVoice({ status: 'off', muted: false, hasMic: false, members: [], speaking: [] });
}

async function settle(): Promise<void> {
  try {
    for (;;) {
      const wanted = wantedKey();
      if (wanted === joinedKey) break;
      if (joinedKey !== null) {
        await leave();
        continue;
      }

      setVoice({ status: 'connecting' });
      await join();
      // The server picks the channel from where it has the player. If that is not the room
      // this client expected and nothing has changed here meanwhile, stay put: the room
      // update that is on its way will start the next pass.
      if (joinedKey !== wanted && wantedKey() === wanted) break;
    }
    if (enabled) setVoice({ status: joinedKey !== null ? 'on' : 'connecting' });
  } catch (error) {
    await leave().catch(() => undefined);
    shutDown();
    useStore.getState().toast(describeFailure(error));
  }
}

// Brings the voice connection in line with what is wanted: nothing, or the channel of the
// room the player is in. Passes run one after another, so walking through several rooms
// quickly cannot leave two joins racing each other.
function reconcile(): Promise<void> {
  if (pending) {
    again = true;
    return pending;
  }
  pending = (async () => {
    try {
      do {
        again = false;
        await settle();
      } while (again);
    } finally {
      pending = null;
    }
  })();
  return pending;
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

// Works out who is in the channel and who is talking, from the audio levels of each track.
function refreshPresence(): void {
  const state = useStore.getState();
  if (!client || joinedKey === null) {
    if (state.voice.members.length > 0) setVoice({ members: [], speaking: [] });
    return;
  }

  const now = performance.now();
  const playerByUid = new Map(Object.values(state.players).map((player) => [player.voiceUid, player.id]));
  const members: string[] = [];
  const speaking: string[] = [];

  const consider = (uid: number, level: number) => {
    const id = playerByUid.get(uid);
    if (!id) return;
    members.push(id);
    if (level > SPEAKING_LEVEL) lastHeard.set(uid, now);
    if (now - (lastHeard.get(uid) ?? -Infinity) < SPEAKING_HOLD_MS) speaking.push(id);
  };

  consider(joinedUid, microphone && !microphone.muted ? microphone.getVolumeLevel() : 0);
  for (const user of client.remoteUsers) {
    consider(Number(user.uid), user.audioTrack?.getVolumeLevel() ?? 0);
  }

  if (!sameIds(members, state.voice.members) || !sameIds(speaking, state.voice.speaking)) {
    setVoice({ members, speaking });
  }
}

async function start(): Promise<void> {
  enabled = true;
  setVoice({ status: 'connecting' });

  try {
    const AgoraRTC = await loadSdk();
    if (!microphone) {
      try {
        microphone = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
      } catch {
        useStore.getState().toast('No microphone available, so you can listen but not talk');
      }
    }
  } catch (error) {
    shutDown();
    useStore.getState().toast(describeFailure(error));
    return;
  }

  // Voice may have been switched off again while the permission prompt was open.
  if (!enabled) {
    shutDown();
    return;
  }

  setVoice({ hasMic: microphone !== null, muted: false });
  poll ??= setInterval(refreshPresence, POLL_MS);
  await reconcile();
}

async function stop(): Promise<void> {
  enabled = false;
  await reconcile();
  shutDown();
}

export function toggleVoice(): void {
  void (enabled ? stop() : start());
}

export async function toggleMute(): Promise<void> {
  if (!microphone) return;
  const muted = !microphone.muted;
  await microphone.setMuted(muted);
  setVoice({ muted });
}

useStore.subscribe((state, previous) => {
  if (!enabled) return;
  const now = selfPlayer(state);
  const before = selfPlayer(previous);
  if (now?.id === before?.id && now?.roomId === before?.roomId) return;

  // Wait for the player to settle before switching channels, so cutting across a corner
  // or crossing the gap between two rooms does not cause a string of joins and leaves.
  if (switchTimer) clearTimeout(switchTimer);
  switchTimer = setTimeout(() => {
    switchTimer = null;
    void reconcile();
  }, ROOM_SWITCH_DELAY_MS);
});

if (import.meta.hot) import.meta.hot.dispose(() => void stop());
