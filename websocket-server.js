// websocket-server.js
import WebSocket, { WebSocketServer } from "ws";
import http from "http";

const server = http.createServer();
const wss = new WebSocketServer({ server });

// Store active sessions and connected clients
const sessions = new Map(); // sessionId -> session data
const clients = new Map(); // sessionId -> Set of WebSocket connections

wss.on("connection", function connection(ws, request) {
  let sessionId = null;

  ws.on("message", function message(data) {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "join_session") {
        sessionId = msg.sessionId;

        // Add client to session
        if (!clients.has(sessionId)) {
          clients.set(sessionId, new Set());
        }
        clients.get(sessionId).add(ws);

        // Send current session state if exists
        if (sessions.has(sessionId)) {
          ws.send(
            JSON.stringify({
              type: "session_state",
              data: sessions.get(sessionId),
            })
          );
        }

        console.log(`Client joined session: ${sessionId}`);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", function () {
    if (sessionId && clients.has(sessionId)) {
      clients.get(sessionId).delete(ws);
      if (clients.get(sessionId).size === 0) {
        clients.delete(sessionId);
      }
    }
  });
});

// Function to broadcast updates to all clients in a session
export function broadcastToSession(sessionId, message) {
  if (clients.has(sessionId)) {
    const sessionClients = clients.get(sessionId);
    const messageStr = JSON.stringify(message);

    sessionClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }
}

// Function to update session state
export function updateSessionState(sessionId, sessionData) {
  sessions.set(sessionId, sessionData);

  // Broadcast to all connected clients
  broadcastToSession(sessionId, {
    type: "session_update",
    data: sessionData,
  });
}

// Function to send map action to clients
export function sendMapAction(sessionId, mapName, action, userText) {
  broadcastToSession(sessionId, {
    type: "map_action",
    mapName,
    action,
    userText,
  });
}

const PORT = process.env.WEBSOCKET_PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
