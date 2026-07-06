/** Broadcast JSON events to all connected WebSocket clients (Next.js custom server). */

type WsClient = { readyState: number; send: (msg: string) => void };

function getWss(): { clients: Iterable<WsClient> } | null {
  const g = globalThis as {
    __hrmWss?: { clients: Iterable<WsClient> };
  };
  return g.__hrmWss ?? null;
}

export function broadcastWsEvent(payload: Record<string, unknown>) {
  try {
    const wss = getWss();
    if (!wss) return;
    const message = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  } catch {
    /* optional realtime */
  }
}
