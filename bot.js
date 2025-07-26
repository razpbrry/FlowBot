require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer');

const MAPS = [
    "surf_kloakk", "surf_cannonball", "surf_placid", "surf_andromeda", "surf_physics", "surf_inferno", "surf_zoomathon"
];

// CHANGE THIS to your map page URL!
const PAGE_URL = "https://flowstatecs.com/themaps";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let session = null; // { users: [id1, id2], turn: 0, actions: [], browser, page }

async function sendMapAction(page, mapName, action, userText) {
    const idx = MAPS.indexOf(mapName);
    if (idx === -1) return false;
    await page.evaluate((mapIndex, action, text) => {
        window.postMessage({ type: "map_action", mapIndex, action, text }, "*");
    }, idx, action, userText);
    return true;
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith('/')) return;

    // Start command
    if (message.content.startsWith('/startmap')) {
        if (session) return message.reply("A session is already running!");
        const args = message.content.split(" ").slice(1);
        if (args.length < 2) return message.reply("Usage: /startmap @user1 @user2");
        const users = args.map(s => s.replace(/[<#@!>]/g, ""));
        if (users.length !== 2) return message.reply("You need two users to start.");

        session = { users, turn: 0, actions: [], browser: null, page: null };

        session.browser = await puppeteer.launch({ headless: "new" });
        session.page = await session.browser.newPage();
        await session.page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

        await message.reply(`Session started for <@${users[0]}> and <@${users[1]}>. First ban: <@${users[0]}>, use /banmap map_name`);
        return;
    }

    // Ban command
    if (message.content.startsWith('/banmap')) {
        if (!session) return message.reply("No session running. Use /startmap.");
        const mapName = message.content.split(" ")[1];
        if (!MAPS.includes(mapName)) return message.reply("Invalid map name.");
        const expectedUser = session.users[session.turn % 2];
        if (message.author.id !== expectedUser)
            return message.reply(`It's <@${expectedUser}>'s turn.`);

        session.actions.push({ user: message.author.id, map: mapName, action: "ban" });
        await sendMapAction(session.page, mapName, "ban", `<@${message.author.id}>`);

        session.turn++;
        switch (session.turn) {
            case 1:
                await message.reply(`Next ban: <@${session.users[1]}>, use /banmap map_name`);
                break;
            case 2:
                await message.reply(`Pick: <@${session.users[0]}>, use /pickmap map_name`);
                break;
            case 3:
                await message.reply(`Pick: <@${session.users[1]}>, use /pickmap map_name`);
                break;
            case 4:
                await message.reply(`Next ban: <@${session.users[0]}>, use /banmap map_name`);
                break;
            case 5:
                await message.reply(`Next ban: <@${session.users[1]}>, use /banmap map_name`);
                break;
            case 6: {
                // Tie Breaker
                const pickedOrBanned = session.actions.map(a => a.map);
                const tiebreaker = MAPS.find(m => !pickedOrBanned.includes(m));
                if (tiebreaker) {
                    await sendMapAction(session.page, tiebreaker, "pick", "Tie Breaker");
                    await message.reply(`Tie Breaker auto-picked: ${tiebreaker}`);
                }
                await message.reply("Map selection complete!");
                await session.browser.close();
                session = null;
                break;
            }
        }
        return;
    }

    // Pick command
    if (message.content.startsWith('/pickmap')) {
        if (!session) return message.reply("No session running. Use /startmap.");
        const mapName = message.content.split(" ")[1];
        if (!MAPS.includes(mapName)) return message.reply("Invalid map name.");
        const expectedUser = session.users[session.turn % 2];
        if (message.author.id !== expectedUser)
            return message.reply(`It's <@${expectedUser}>'s turn.`);

        session.actions.push({ user: message.author.id, map: mapName, action: "pick" });
        await sendMapAction(session.page, mapName, "pick", `<@${message.author.id}>`);

        session.turn++;
        switch (session.turn) {
            case 3:
                await message.reply(`Pick: <@${session.users[1]}>, use /pickmap map_name`);
                break;
            case 4:
                await message.reply(`Next ban: <@${session.users[0]}>, use /banmap map_name`);
                break;
            case 5:
                await message.reply(`Next ban: <@${session.users[1]}>, use /banmap map_name`);
                break;
            case 6: {
                // Tie Breaker handled in ban
                break;
            }
        }
        return;
    }
});



client.login(process.env.DISCORD_TOKEN);