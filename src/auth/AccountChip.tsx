import type { Account } from '../../shared/types';
import { signOut } from './google';

export function AccountChip({ account }: { account: Account }) {
  return (
    <div className="account">
      {account.picture ? (
        // Google serves profile pictures only to requests that carry no referrer.
        <img className="account-picture" src={account.picture} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="account-picture placeholder">{account.name.slice(0, 1)}</span>
      )}
      <span className="account-name">{account.name}</span>
      <button type="button" className="button-link" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
