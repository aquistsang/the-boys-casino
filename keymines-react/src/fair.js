/**
 * Provably fair (simulated): mines are derived deterministically
 * from SHA-256(serverSeed:clientSeed:nonce) via a hash-driven
 * Fisher-Yates shuffle.
 */
export function genSeed() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(str) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (const c of str) h = ((h << 5) + h) ^ c.charCodeAt(0);
  return (h >>> 0).toString(16).padStart(64, '0');
}

export async function placeMines(totalKeys, count, serverSeed, clientSeed, nonce) {
  const hash = await sha256(`${serverSeed}:${clientSeed}:${nonce}`);
  const idx = [...Array(totalKeys).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = (parseInt(hash.slice((i * 2) % 60, (i * 2) % 60 + 4), 16) || 0) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return new Set(idx.slice(0, count));
}
