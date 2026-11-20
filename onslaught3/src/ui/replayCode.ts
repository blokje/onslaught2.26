// Replay codes: replay JSON, gzip-compressed when the browser can (CompressionStream), as base64url text with a
// prefix ("OS1." gzip, "OS0." plain), so a replay can be copied and pasted. Works in Node 22 too (tested).

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Turn replay data into a short text code. */
export async function encodeReplay(data: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') return 'OS1.' + toB64(await pipe(json, new CompressionStream('gzip')));
  return 'OS0.' + toB64(json);
}

/** Parse a replay code (or plain replay JSON) back into untrusted data; validate it before use. */
export async function decodeReplay(code: string): Promise<unknown> {
  const t = code.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  if (t.length > 4_000_000) throw new Error('Replay code too long');
  if (t.startsWith('OS0.')) return JSON.parse(new TextDecoder().decode(fromB64(t.slice(4))));
  if (t.startsWith('OS1.')) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read compressed replay codes');
    return JSON.parse(new TextDecoder().decode(await pipe(fromB64(t.slice(4)), new DecompressionStream('gzip'))));
  }
  throw new Error('Not a replay code');
}
