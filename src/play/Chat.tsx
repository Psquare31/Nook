import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX } from '../../shared/constants';
import { isTyping } from '../lib/dom';
import { sendChat } from '../state/actions';
import { selfPlayer, useStore } from '../state/store';

export function Chat() {
  const lines = useStore((state) => state.chat);
  const roomName = useStore((state) => {
    const roomId = selfPlayer(state)?.roomId;
    return (roomId && state.rooms[roomId]?.name) || 'Outside';
  });
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !isTyping(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendChat(text);
    setText('');
    inputRef.current?.blur();
  };

  return (
    <section className="card chat">
      <h2>Chat · {roomName}</h2>
      <div className="chat-lines" ref={listRef}>
        {lines.length === 0 && <p className="help">Messages reach everyone in this room.</p>}
        {lines.map((line) =>
          line.kind === 'system' ? (
            <p key={line.id} className="chat-system">
              {line.text}
            </p>
          ) : (
            <p key={line.id} className="chat-message">
              <strong style={{ color: line.from.color }}>{line.from.name}</strong>
              {line.text}
            </p>
          ),
        )}
      </div>
      <form onSubmit={submit}>
        <input
          ref={inputRef}
          value={text}
          maxLength={CHAT_MAX}
          placeholder="Press Enter to chat"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
        />
      </form>
    </section>
  );
}
