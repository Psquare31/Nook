import { clearSession, saveSession } from '../lib/session';
import { reconnect, socket } from '../net/socket';
import { useStore } from '../state/store';

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const SIGN_IN_TIMEOUT_MS = 10000;

let loading: Promise<GoogleAccountsId> | null = null;
let initializedFor: string | null = null;

function loadGoogle(): Promise<GoogleAccountsId> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google.accounts.id) : reject());
    script.onerror = () => {
      loading = null;
      reject(new Error('Google sign-in could not be loaded'));
    };
    document.head.append(script);
  });
  return loading;
}

async function onCredential({ credential }: GoogleCredentialResponse): Promise<void> {
  const result = await socket
    .timeout(SIGN_IN_TIMEOUT_MS)
    .emitWithAck('auth:google', credential)
    .catch(() => null);

  if (!result?.ok) {
    useStore.getState().toast('Google sign-in could not be verified. Try again.');
    return;
  }
  saveSession(result.session);
  reconnect();
}

export async function renderGoogleButton(parent: HTMLElement, clientId: string): Promise<void> {
  const google = await loadGoogle();
  if (initializedFor !== clientId) {
    google.initialize({ client_id: clientId, callback: (response) => void onCredential(response) });
    initializedFor = clientId;
  }
  google.renderButton(parent, {
    type: 'standard',
    theme: 'filled_black',
    size: 'medium',
    text: 'signin_with',
    shape: 'pill',
  });
}

export function signOut(): void {
  clearSession();
  // Stops Google from signing the same account straight back in on the next visit.
  window.google?.accounts.id.disableAutoSelect();
  reconnect();
}
