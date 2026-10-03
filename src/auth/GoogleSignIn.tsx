import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { renderGoogleButton } from './google';

// Google draws its own button into this element, which keeps the button within Google's
// branding rules and lets it remember the account used last time.
export function GoogleSignIn() {
  const clientId = useStore((state) => state.auth.googleClientId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    renderGoogleButton(ref.current, clientId).catch(() => {
      useStore.getState().toast('Google sign-in could not be loaded');
    });
  }, [clientId]);

  if (!clientId) return null;
  return <div className="google-button" ref={ref} />;
}
