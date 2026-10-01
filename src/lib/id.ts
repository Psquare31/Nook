// crypto.randomUUID needs a secure context, which a plain http LAN address is not.
export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
