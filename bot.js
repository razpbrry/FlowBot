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

// Define the exact turn sequence
const TURN_SEQUENCE = [
  { user: 0, action: "ban", description: "First ban" }, // Turn 0: User 1 bans
  { user: 1, action: "ban", description: "Second ban" }, // Turn 1: User 2 bans
  { user: 0, action: "pick", description: "First pick" }, // Turn 2: User 1 picks
  { user: 1, action: "pick", description: "Second pick" }, // Turn 3: User 2 picks
  { user: 0, action: "ban", description: "Third ban" }, // Turn 4: User 1 bans
  { user: 1, action: "ban", description: "Fourth ban" }, // Turn 5: User 2 bans
];

function getCurrentTurnInfo(session) {
  if (!session || session.turn >= TURN_SEQUENCE.length) {
    return null;
  }

  const turnInfo = TURN_SEQUENCE[session.turn];
  const expectedUserId = session.users[turnInfo.user];
  const expectedUser = client.users.cache.get(expectedUserId);

  return {
    expectedUserId,
    expectedUsername: expectedUser?.username || expectedUserId,
    expectedAction: turnInfo.action,
    description: turnInfo.description,
    phase: turnInfo.action,
  };
}

function getNextTurnMessage(session) {
  if (session.turn >= TURN_SEQUENCE.length) {
    return { message: "All turns completed!", phase: "complete" };
  }

  const turnInfo = getCurrentTurnInfo(session);
  if (!turnInfo) {
    return { message: "Session complete!", phase: "complete" };
  }

  const command = turnInfo.expectedAction === "ban" ? "/banmap" : "/pickmap";
  return {
    message: `${turnInfo.description}: <@${turnInfo.expectedUserId}>, use ${command} map`,
    phase: turnInfo.phase,
  };
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Register slash commands
  const commands = [
    {
      name: "startmap",
      description: "Start a map selection session",
      options: [
        {
          name: "user1",
          description: "First user",
          type: 6, // USER type
          required: true,
        },
        {
          name: "user2",
          description: "Second user",
          type: 6, // USER type
          required: true,
        },
      ],
    },
    {
      name: "banmap",
      description: "Ban a map",
      options: [
        {
          name: "map",
          description: "Map to ban",
          type: 3, // STRING type
          required: true,
          choices: MAPS.map((map) => ({ name: map, value: map })),
        },
      ],
    },
    {
      name: "pickmap",
      description: "Pick a map",
      options: [
        {
          name: "map",
          description: "Map to pick",
          type: 3, // STRING type
          required: true,
          choices: MAPS.map((map) => ({ name: map, value: map })),
        },
      ],
    },
    {
      name: "sessioninfo",
      description: "Get current session information",
    },
  ];

  try {
    console.log("Registering slash commands...");
    await client.application.commands.set(commands);
    console.log("Successfully registered slash commands.");
  } catch (error) {
    console.error("Error registering slash commands:", error);
  }
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

      const nextTurn = getNextTurnMessage(session);

      await interaction.reply({
        content:
          `Session started for <@${user1.id}> and <@${user2.id}>!\n` +
          `Session ID: \`${sessionId}\` (use this to connect to the web page)\n` +
          `${nextTurn.message}`,
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

      const turnInfo = getCurrentTurnInfo(session);
      if (!turnInfo) {
        return interaction.reply({
          content: "All turns have been completed!",
          ephemeral: true,
        });
      }

      // Check if it's the right user's turn
      if (interaction.user.id !== turnInfo.expectedUserId) {
        return interaction.reply({
          content: `It's <@${turnInfo.expectedUserId}>'s turn for ${turnInfo.description}.`,
          ephemeral: true,
        });
      }

      // Check if the expected action is "ban"
      if (turnInfo.expectedAction !== "ban") {
        return interaction.reply({
          content: `It's time for ${turnInfo.description}. Use /pickmap instead of /banmap.`,
          ephemeral: true,
        });
      }

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

      // Handle tiebreaker if this is the last turn
      if (session.turn >= TURN_SEQUENCE.length) {
        const pickedOrBanned = session.actions.map((a) => a.map);
        const tiebreaker = MAPS.find((m) => !pickedOrBanned.includes(m));
        if (tiebreaker) {
          sendMapAction(session.id, tiebreaker, "pick", "Tie Breaker");
        }
      }

      const nextTurn = getNextTurnMessage(session);

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
        phase: nextTurn.phase,
      });

      await interaction.editReply(
        `**${interaction.user.username}** banned **${mapName}**\n\n${nextTurn.message}`
      );

      if (session.turn >= TURN_SEQUENCE.length) {
        const tiebreaker = MAPS.find(
          (m) => !session.actions.map((a) => a.map).includes(m)
        );
        if (tiebreaker) {
          await interaction.followUp(
            `**Tie Breaker auto-picked: ${tiebreaker}**\n\nMap selection complete!`
          );
        } else {
          await interaction.followUp("Map selection complete!");
        }
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

      const turnInfo = getCurrentTurnInfo(session);
      if (!turnInfo) {
        return interaction.reply({
          content: "All turns have been completed!",
          ephemeral: true,
        });
      }

      // Check if it's the right user's turn
      if (interaction.user.id !== turnInfo.expectedUserId) {
        return interaction.reply({
          content: `It's <@${turnInfo.expectedUserId}>'s turn for ${turnInfo.description}.`,
          ephemeral: true,
        });
      }

      // Check if the expected action is "pick"
      if (turnInfo.expectedAction !== "pick") {
        return interaction.reply({
          content: `It's time for ${turnInfo.description}. Use /banmap instead of /pickmap.`,
          ephemeral: true,
        });
      }

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

      const nextTurn = getNextTurnMessage(session);

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
        phase: nextTurn.phase,
      });

      await interaction.editReply(
        `**${interaction.user.username}** picked **${mapName}**\n\n${nextTurn.message}`
      );

      if (session.turn >= TURN_SEQUENCE.length) {
        await interaction.followUp("Map selection complete!");
        session = null;
      }
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
      const turnInfo = getCurrentTurnInfo(session);

      let turnDescription = "Session complete";
      if (turnInfo) {
        turnDescription = `${turnInfo.description} - <@${turnInfo.expectedUserId}> should use /${turnInfo.expectedAction}map`;
      }

      await interaction.reply({
        content:
          `**Current Session Info:**\n` +
          `Session ID: \`${session.id}\`\n` +
          `Users: ${user1?.username} vs ${user2?.username}\n` +
          `Turn: ${session.turn + 1}/${TURN_SEQUENCE.length}\n` +
          `Current Turn: ${turnDescription}\n` +
          `Actions Completed: ${session.actions.length}`,
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
