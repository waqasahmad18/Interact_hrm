// WebSocket server for real-time leave updates
import { Server } from 'ws';

let wss: Server | null = null;

export default function handler(req: any, res: any) {
  if (!res.socket.server.wss) {
    wss = new Server({ server: res.socket.server });
    res.socket.server.wss = wss;
    wss.on('connection', (ws) => {
      ws.on('message', (message) => {
        // Broadcast received message to all clients
        wss?.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(message);
          }
        });
      });
    });
  }
  res.end();
}

export const config = {
  api: {
    bodyParser: false,
  },
};
