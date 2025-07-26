const { SlashCommandBuilder } = require('discord.js');
// Use the ws library for websocket client connection
const WebSocket = require('ws');

// You may want to organize session websockets per match/session.
// For this example, we'll just use a global connection. Adjust as necessary!
const wsUrl = 'wss://57071dd8d173.ngrok-free.app/'; // Your backend websocket URL
let ws; // WebSocket instance

function getWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;
  ws = new WebSocket(wsUrl);
  ws.on('open', () => console.log('WebSocket connected'));
  ws.on('close', () => console.log('WebSocket closed'));
  ws.on('error', err => console.error('WebSocket error:', err));
  return ws;
}

// Utility to send a map_action message
function sendMapAction(mapName, action, userText) {
  const wsClient = getWebSocket();
  const msg = {
    type: "map_action",
    mapName,
    action,     // "ban" or "pick"
    userText    // "banned by username" or "picked by username"
  };
  // If not open, wait for open event
  if (wsClient.readyState === WebSocket.CONNECTING) {
    wsClient.once('open', () => wsClient.send(JSON.stringify(msg)));
  } else if (wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify(msg));
  }
}

// /banmap command
module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('banmap')
      .setDescription('Ban a map (red X on overlay)')
      .addStringOption(opt =>
        opt.setName('map_name')
          .setDescription('The name of the map to ban')
          .setRequired(true)
      ),
    async execute(interaction) {
      const mapName = interaction.options.getString('map_name');
      sendMapAction(mapName, 'ban', `banned by ${interaction.user.displayName || interaction.user.username}`);
      await interaction.reply({ content: `Map **${mapName}** banned!`, ephemeral: true });
    }
  },
  // /pickmap command
  {
    data: new SlashCommandBuilder()
      .setName('pickmap')
      .setDescription('Pick a map (green border on overlay)')
      .addStringOption(opt =>
        opt.setName('map_name')
          .setDescription('The name of the map to pick')
          .setRequired(true)
      ),
    async execute(interaction) {
      const mapName = interaction.options.getString('map_name');
      sendMapAction(mapName, 'pick', `picked by ${interaction.user.displayName || interaction.user.username}`);
      await interaction.reply({ content: `Map **${mapName}** picked!`, ephemeral: true });
    }
  }
];