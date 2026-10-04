import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { isEmbeddedBrowser, renderGoogleButton } from './google';

// Google draws its own button into this element, which keeps the button within Google's
// branding rules and lets it remember the account used last time.
export function GoogleSignIn() {
  const clientId = useStore((state) => state.auth.googleClientId);
  const ref = useRef<HTMLDivElement>(null);
  const embedded = isEmbeddedBrowser();

  useEffect(() => {
    if (!clientId || embedded || !ref.current) return;
    renderGoogleButton(ref.current, clientId).catch(() => {
      useStore.getState().toast('Google sign-in could not be loaded');
    });
  }, [clientId, embedded]);

  if (!clientId) return null;

  if (embedded) {
    return (
      <a className="sign-in-elsewhere" href={window.location.href} target="_blank" rel="noreferrer">
        Sign-in needs a normal browser tab. Open this page in Chrome or Edge.
      </a>
    );
  }

  return <div className="google-button" ref={ref} />;
}
