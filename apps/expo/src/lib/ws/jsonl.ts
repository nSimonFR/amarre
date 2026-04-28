// Split a WebSocket text frame on \n, parse each non-empty line as JSON.
// Per docs/PROTOCOL.md §3.2: receivers MUST split on \n and ignore blank lines.

export function parseJsonl(frame: string): unknown[] {
  const out: unknown[] = [];
  for (const raw of frame.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Malformed JSON → log and skip per §8.1.
      // (No console here; client.ts will surface via onParseError.)
    }
  }
  return out;
}
