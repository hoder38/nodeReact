import { DOCDB } from '../constants.js'
import { DISCORD_TOKEN, DISCORD_CHANNEL } from '../../../ver.js'
import Discord from 'discord.js'
import Mongo from '../models/mongo-tool.js'
import { stockShow } from '../models/stock-tool.js'

let channel = null;
export const init = () => {
    const client = new Discord.Client();
    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}!`);
        channel = client.channels.cache.get(DISCORD_CHANNEL);
        channel.send('Nice to serve you!!!');
    });
    client.on('message', msg=> {
        if (!msg.author.bot) {
            const cmd = msg.content.toLowerCase();
            switch (cmd) {
                case 'checkdoc':
                checkDoc(msg);
                break;
                case 'stock':
                stockPrice(msg);
                break;
                case 'help':
                default:
                help(msg);
                break;
            }
        }
    });
    client.login(DISCORD_TOKEN);
}

const help = msg => msg.reply('\nCommand:\ncheckdoc\nstock');

const checkDoc = msg => Mongo('find', DOCDB).then(doclist => msg.reply(doclist.reduce((a, v) => `${a}\ntype: ${v.type}, date: ${v.date}`, ''))).catch(err => msg.reply(err.message));

const stockPrice = msg => stockShow().then(ret => (ret.length > 0) ? msg.reply(ret) : Promise.resolve()).catch(err => msg.reply(err.message));

export default function discordSend(msg) {
    if (channel) {
        channel.send(msg);
    }
}