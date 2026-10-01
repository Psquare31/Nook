import { useEffect } from 'react';
import { isTyping } from '../lib/dom';
import { useStore } from '../state/store';
import { toggleMute, toggleVoice } from './voice';

export function MicIcon({ off = false }: { off?: boolean }) {
  return (
    <svg
      className="mic-icon"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function VoiceControl() {
  const available = useStore((state) => state.voice.available);
  const status = useStore((state) => state.voice.status);
  const muted = useStore((state) => state.voice.muted);
  const hasMic = useStore((state) => state.voice.hasMic);

  useEffect(() => {
    if (status !== 'on') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyM' && !event.repeat && !isTyping(event.target)) void toggleMute();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [status]);

  if (!available) return null;

  if (status === 'off') {
    return (
      <button type="button" className="voice-button" onClick={toggleVoice}>
        <MicIcon />
        Join voice
      </button>
    );
  }

  if (status === 'connecting') {
    return (
      <button type="button" className="voice-button" disabled>
        <MicIcon />
        Connecting…
      </button>
    );
  }

  return (
    <div className="voice-group">
      <button
        type="button"
        className={muted || !hasMic ? 'voice-button muted' : 'voice-button live'}
        onClick={() => void toggleMute()}
        disabled={!hasMic}
        title={hasMic ? 'Press M to mute or unmute' : 'No microphone, listening only'}
      >
        <MicIcon off={muted || !hasMic} />
        {hasMic ? (muted ? 'Unmute' : 'Mute') : 'Listening'}
      </button>
      <button type="button" className="voice-button" onClick={toggleVoice}>
        Leave voice
      </button>
    </div>
  );
}
