import { DISCORD_TOKEN, DISCORD_CHANNEL } from '../../../ver'
import Discord from 'discord.js'

let channel = null;
export const init = () => {
    const client = new Discord.Client();
    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}!`);
        channel = client.channels.find(val => val.id === DISCORD_CHANNEL);
        channel.send('Nice to serve you!!!');
    });
    client.on('message', msg=> {
        if (!msg.author.bot) {
            msg.reply(msg.content + '妳妹');
        }
    });
    client.login(DISCORD_TOKEN);
}

export default function discordSend(msg) {
    if (channel) {
        channel.send(msg);
    }
}