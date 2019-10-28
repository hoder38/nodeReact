import { DOCDB, STOCKDB } from '../constants'
import { DISCORD_TOKEN, DISCORD_CHANNEL } from '../../../ver'
import Discord from 'discord.js'
import Mongo from '../models/mongo-tool'
import { getStockPrice } from '../models/stock-tool'

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

const stockPrice = msg => Mongo('find', STOCKDB, {important: 1}).then(items => {
    const recur_price = (index, ret) => (index >= items.length) ? msg.reply(ret) : getStockPrice(items[index].type, items[index].index, false).then(price => `${ret}\n${items[index].index} ${items[index].name} ${price}`).then(ret => recur_price(index + 1, ret));
    return recur_price(0, '');
}).catch(err => msg.reply(err.message));

export default function discordSend(msg) {
    if (channel) {
        channel.send(msg);
    }
}