import { createHash } from 'node:crypto';
import agoraToken from 'agora-token';
import type { VoiceGrant } from '../shared/protocol';

const { RtcRole, RtcTokenBuilder } = agoraToken;

export type VoiceConfig = { appId: string; certificate: string; tokenTtlSeconds?: number };

// Short on purpose. A token only keeps its holder in one room's channel until it expires,
// and a new one is only issued for the room the player is standing in at that moment.
const TOKEN_TTL_SECONDS = 600;

const CREDENTIAL = /^[0-9a-f]{32}$/i;

export function readVoiceConfig(env: NodeJS.ProcessEnv): VoiceConfig | null {
  const appId = env.AGORA_APP_ID?.trim() ?? '';
  const certificate = env.AGORA_APP_CERTIFICATE?.trim() ?? '';
  if (!appId && !certificate) return null;

  if (!CREDENTIAL.test(appId) || !CREDENTIAL.test(certificate)) {
    console.warn('AGORA_APP_ID and AGORA_APP_CERTIFICATE must both be 32 hex characters. Voice is off.');
    return null;
  }
  return { appId, certificate };
}

// Room ids come from clients, so the channel name is a digest of the id rather than the id.
export function voiceChannel(roomId: string | null): string {
  if (roomId === null) return 'outside';
  return `room-${createHash('sha256').update(roomId).digest('hex').slice(0, 32)}`;
}

export function grantVoice(config: VoiceConfig, roomId: string | null, uid: number): VoiceGrant {
  const channel = voiceChannel(roomId);
  const ttl = config.tokenTtlSeconds ?? TOKEN_TTL_SECONDS;
  const token = RtcTokenBuilder.buildTokenWithUid(
    config.appId,
    config.certificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    ttl,
    ttl,
  );
  return { ok: true, appId: config.appId, channel, token, uid, roomId };
}
