import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import puppeteer from 'puppeteer';

dotenv.config();

const MAPS = [
    "surf_kloakk", "surf_cannonball", "surf_placid", "surf_andromeda", "surf_physics", "surf_inferno", "surf_zoomathon"
];

// CHANGE THIS to your map page URL!
const PAGE_URL = "https://showdown.flowstatecs.com/maps";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let session = null; // { users: [id1, id2], turn: 0, actions: [], browser, page }

async function sendMapAction(page, mapName, action, userText) {
    await page.evaluate((mapName, action, text) => {
        window.postMessage({ type: "map_action", mapName, action, text }, "*");
    }, mapName, action, userText);
    return true;
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    console.log(`[DEBUG] Received command: ${interaction.commandName}`);

    try {
        if (interaction.commandName === 'startmap') {
            if (session) return interaction.reply({ content: "A session is already running!", ephemeral: true });
            const user1 = interaction.options.getUser('user1');
            const user2 = interaction.options.getUser('user2');
            if (!user1 || !user2) {
                return interaction.reply({ content: "Both users must be specified to start a session.", ephemeral: true });
            }
            session = { users: [user1.id, user2.id], turn: 0, actions: [], browser: null, page: null };

            await interaction.deferReply();

            session.browser = await puppeteer.launch({ headless: "new" });
            session.page = await session.browser.newPage();
            await session.page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

            await interaction.editReply(`Session started for <@${user1.id}> and <@${user2.id}>. First ban: <@${user1.id}>, use /banmap map`);
            return;
        }

        if (interaction.commandName === 'banmap') {
            if (!session) return interaction.reply({ content: "No session running. Use /startmap.", ephemeral: true });
            const mapName = interaction.options.getString('map');
            if (!MAPS.includes(mapName)) return interaction.reply({ content: "Invalid map name.", ephemeral: true });
            const expectedUser = session.users[session.turn % 2];
            if (interaction.user.id !== expectedUser)
                return interaction.reply({ content: `It's <@${expectedUser}>'s turn.`, ephemeral: true });

            await interaction.deferReply();

            session.actions.push({ user: interaction.user.id, map: mapName, action: "ban" });
            await sendMapAction(session.page, mapName, "ban", `<@${interaction.user.username}>`);

            session.turn++;
            switch (session.turn) {
                case 1:
                    await interaction.editReply(`Next ban: <@${session.users[1]}>, use /banmap map`);
                    break;
                case 2:
                    await interaction.editReply(`Pick: <@${session.users[0]}>, use /pickmap map`);
                    break;
                case 3:
                    await interaction.editReply(`Pick: <@${session.users[1]}>, use /pickmap map`);
                    break;
                case 4:
                    await interaction.editReply(`Next ban: <@${session.users[0]}>, use /banmap map`);
                    break;
                case 5:
                    await interaction.editReply(`Next ban: <@${session.users[1]}>, use /banmap map`);
                    break;
                case 6: {
                    const pickedOrBanned = session.actions.map(a => a.map);
                    const tiebreaker = MAPS.find(m => !pickedOrBanned.includes(m));
                    if (tiebreaker) {
                        await sendMapAction(session.page, tiebreaker, "pick", "Tie Breaker");
                        await interaction.editReply(`Tie Breaker auto-picked: ${tiebreaker}`);
                    }
                    await interaction.followUp("Map selection complete!");
                    await session.browser.close();
                    session = null;
                    break;
                }
            }
            return;
        }

        if (interaction.commandName === 'pickmap') {
            if (!session) return interaction.reply({ content: "No session running. Use /startmap.", ephemeral: true });
            const mapName = interaction.options.getString('map');
            if (!MAPS.includes(mapName)) return interaction.reply({ content: "Invalid map name.", ephemeral: true });
            const expectedUser = session.users[session.turn % 2];
            if (interaction.user.id !== expectedUser)
                return interaction.reply({ content: `It's <@${expectedUser}>'s turn.`, ephemeral: true });

            await interaction.deferReply();

            session.actions.push({ user: interaction.user.id, map: mapName, action: "pick" });
            await sendMapAction(session.page, mapName, "pick", `<@${interaction.user.username}>`);

            session.turn++;
            switch (session.turn) {
                case 3:
                    await interaction.editReply(`Pick: <@${session.users[1]}>, use /pickmap map`);
                    break;
                case 4:
                    await interaction.editReply(`Next ban: <@${session.users[0]}>, use /banmap map`);
                    break;
                case 5:
                    await interaction.editReply(`Next ban: <@${session.users[1]}>, use /banmap map`);
                    break;
                case 6:
                    // Tie Breaker handled in ban
                    break;
            }
            return;
        }
    } catch (err) {
        console.error('[ERROR]', err);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply('An error occurred. Please check the bot logs.');
        } else {
            await interaction.reply({ content: 'An error occurred. Please check the bot logs.', ephemeral: true });
        }
    }
});
if (!process.env.DISCORD_TOKEN) {
    console.error("DISCORD_TOKEN is not set in your environment variables.");
    process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);