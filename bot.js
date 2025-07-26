import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import { v4 as uuidv4 } from "uuid";
import { updateSessionState, sendMapAction } from "./websocket-server.js";

dotenv.config();

const MAPS = [
  "surf_nyx",
  "surf_tuxedo",
  "surf_utopia_njv",
  "surf_slob",
  "surf_reytx",
  "surf_grassland",
  "surf_facility",
  "surf_kloakk",
  "surf_cannonball",
  "surf_placid",
  "surf_andromeda",
  "surf_physics",
  "surf_inferno",
  "surf_cyberwave",
  "surf_olympics",
  "surf_quilavar",
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let session = null; // { id, users: [id1, id2], turn: 0, actions: [] }

function generateSessionId() {
  return uuidv4();
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  console.log(`[DEBUG] Received command: ${interaction.commandName}`);

  try {
    if (interaction.commandName === "startmap") {
      if (session)
        return interaction.reply({
          content: "A session is already running!",
          ephemeral: true,
        });

      const user1 = interaction.options.getUser("user1");
      const user2 = interaction.options.getUser("user2");
      if (!user1 || !user2) {
        return interaction.reply({
          content: "Both users must be specified to start a session.",
          ephemeral: true,
        });
      }

      const sessionId = generateSessionId();
      session = {
        id: sessionId,
        users: [user1.id, user2.id],
        turn: 0,
        actions: [],
      };

      // Update WebSocket clients with new session
      updateSessionState(sessionId, {
        users: [user1.username, user2.username],
        turn: 0,
        actions: [],
        phase: "ban",
      });

      await interaction.reply({
        content:
          `Session started for <@${user1.id}> and <@${user2.id}>!\n` +
          `Session ID: \`${sessionId}\` (use this to connect to the web page)\n` +
          `First ban: <@${user1.id}>, use /banmap map`,
        ephemeral: false,
      });
      return;
    }

    if (interaction.commandName === "banmap") {
      if (!session)
        return interaction.reply({
          content: "No session running. Use /startmap.",
          ephemeral: true,
        });

      const mapName = interaction.options.getString("map");
      if (!MAPS.includes(mapName))
        return interaction.reply({
          content: "Invalid map name.",
          ephemeral: true,
        });

      const expectedUser = session.users[session.turn % 2];
      if (interaction.user.id !== expectedUser)
        return interaction.reply({
          content: `It's <@${expectedUser}>'s turn.`,
          ephemeral: true,
        });

      await interaction.deferReply();

      // Add action to session
      const actionData = {
        user: interaction.user.id,
        map: mapName,
        action: "ban",
      };
      session.actions.push(actionData);

      // Send map action to WebSocket clients
      sendMapAction(session.id, mapName, "ban", interaction.user.username);

      session.turn++;
      let nextMessage = "";
      let phase = "ban";

      switch (session.turn) {
        case 1:
          nextMessage = `Next ban: <@${session.users[1]}>, use /banmap map`;
          phase = "ban";
          break;
        case 2:
          nextMessage = `Pick: <@${session.users[0]}>, use /pickmap map`;
          phase = "pick";
          break;
        case 3:
          nextMessage = `Pick: <@${session.users[1]}>, use /pickmap map`;
          phase = "pick";
          break;
        case 4:
          nextMessage = `Next ban: <@${session.users[0]}>, use /banmap map`;
          phase = "ban";
          break;
        case 5:
          nextMessage = `Next ban: <@${session.users[1]}>, use /banmap map`;
          phase = "ban";
          break;
        case 6: {
          const pickedOrBanned = session.actions.map((a) => a.map);
          const tiebreaker = MAPS.find((m) => !pickedOrBanned.includes(m));
          if (tiebreaker) {
            sendMapAction(session.id, tiebreaker, "pick", "Tie Breaker");
            nextMessage = `Tie Breaker auto-picked: ${tiebreaker}`;
            phase = "complete";
          }
          break;
        }
      }

      // Update session state for WebSocket clients
      updateSessionState(session.id, {
        users: session.users.map(
          (id) => client.users.cache.get(id)?.username || id
        ),
        turn: session.turn,
        actions: session.actions.map((a) => ({
          ...a,
          username: client.users.cache.get(a.user)?.username || a.user,
        })),
        phase,
      });

      await interaction.editReply(nextMessage);

      if (session.turn >= 6) {
        await interaction.followUp("Map selection complete!");
        session = null;
      }
      return;
    }

    if (interaction.commandName === "pickmap") {
      if (!session)
        return interaction.reply({
          content: "No session running. Use /startmap.",
          ephemeral: true,
        });

      const mapName = interaction.options.getString("map");
      if (!MAPS.includes(mapName))
        return interaction.reply({
          content: "Invalid map name.",
          ephemeral: true,
        });

      const expectedUser = session.users[session.turn % 2];
      if (interaction.user.id !== expectedUser)
        return interaction.reply({
          content: `It's <@${expectedUser}>'s turn.`,
          ephemeral: true,
        });

      await interaction.deferReply();

      // Add action to session
      const actionData = {
        user: interaction.user.id,
        map: mapName,
        action: "pick",
      };
      session.actions.push(actionData);

      // Send map action to WebSocket clients
      sendMapAction(session.id, mapName, "pick", interaction.user.username);

      session.turn++;
      let nextMessage = "";
      let phase = "pick";

      switch (session.turn) {
        case 3:
          nextMessage = `Pick: <@${session.users[1]}>, use /pickmap map`;
          phase = "pick";
          break;
        case 4:
          nextMessage = `Next ban: <@${session.users[0]}>, use /banmap map`;
          phase = "ban";
          break;
        case 5:
          nextMessage = `Next ban: <@${session.users[1]}>, use /banmap map`;
          phase = "ban";
          break;
        case 6:
          // Tie Breaker handled in ban command
          phase = "complete";
          break;
      }

      // Update session state for WebSocket clients
      updateSessionState(session.id, {
        users: session.users.map(
          (id) => client.users.cache.get(id)?.username || id
        ),
        turn: session.turn,
        actions: session.actions.map((a) => ({
          ...a,
          username: client.users.cache.get(a.user)?.username || a.user,
        })),
        phase,
      });

      await interaction.editReply(nextMessage);
      return;
    }

    // New command to get session info
    if (interaction.commandName === "sessioninfo") {
      if (!session) {
        return interaction.reply({
          content: "No active session.",
          ephemeral: true,
        });
      }

      const user1 = client.users.cache.get(session.users[0]);
      const user2 = client.users.cache.get(session.users[1]);

      await interaction.reply({
        content:
          `**Current Session Info:**\n` +
          `Session ID: \`${session.id}\`\n` +
          `Users: ${user1?.username} vs ${user2?.username}\n` +
          `Turn: ${session.turn + 1}\n` +
          `Actions: ${session.actions.length}`,
        ephemeral: true,
      });
    }
  } catch (err) {
    console.error("[ERROR]", err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        "An error occurred. Please check the bot logs."
      );
    } else {
      await interaction.reply({
        content: "An error occurred. Please check the bot logs.",
        ephemeral: true,
      });
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is not set in your environment variables.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
