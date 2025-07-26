require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
  {
    name: 'startmap',
    description: 'Start a map selection session',
    options: [
      {
        name: 'user1',
        description: 'First user',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'user2',
        description: 'Second user',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
  {
    name: 'banmap',
    description: 'Ban a map',
    options: [
      {
        name: 'map',
        description: 'Map name',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: 'surf_kloakk', value: 'surf_kloakk' },
          { name: 'surf_cannonball', value: 'surf_cannonball' },
          { name: 'surf_placid', value: 'surf_placid' },
          { name: 'surf_andromeda', value: 'surf_andromeda' },
          { name: 'surf_physics', value: 'surf_physics' },
          { name: 'surf_inferno', value: 'surf_inferno' },
          { name: 'surf_zoomathon', value: 'surf_zoomathon' },
        ],
      },
    ],
  },
  {
    name: 'pickmap',
    description: 'Pick a map',
    options: [
      {
        name: 'map',
        description: 'Map name',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: 'surf_kloakk', value: 'surf_kloakk' },
          { name: 'surf_cannonball', value: 'surf_cannonball' },
          { name: 'surf_placid', value: 'surf_placid' },
          { name: 'surf_andromeda', value: 'surf_andromeda' },
          { name: 'surf_physics', value: 'surf_physics' },
          { name: 'surf_inferno', value: 'surf_inferno' },
          { name: 'surf_zoomathon', value: 'surf_zoomathon' },
        ],
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error(error);
  }
})();