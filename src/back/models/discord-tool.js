import { DOCDB } from '../constants.js'
import { DISCORD_TOKEN, DISCORD_CHANNEL } from '../../../ver.js'
import Discord from 'discord.js'
import Mongo from '../models/mongo-tool.js'
import { generateAuthUrl, getToken } from '../models/tdameritrade-tool.js'

let channel = null;
export const init = () => {
    const client = new Discord.Client();
    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}!`);
        channel = client.channels.cache.get(DISCORD_CHANNEL);
        channel.send('Nice to serve you!!!');
    });
    client.on('message', msg=> {
        console.log(msg.content);
        console.log(msg.author.bot);
        if (!msg.author.bot) {
            const cmd = msg.content.match(/\<\@.*\> ([^\s]*)(.*)/);
            if (cmd) {
                switch (cmd[1].toLowerCase()) {
                    case 'checkdoc':
                    checkDoc(msg);
                    break;
                    case 'schwab':
                    schwabAuth(msg);
                    break;
                    case 'schwabcode':
                    schwabCode(msg, cmd[2].trim());
                    break;
                    case 'help':
                    default:
                    help(msg);
                    break;
                }
            }
        }
    });
    client.on('shardError', error => {
        console.error('A discord websocket connection encountered an error:', error);
    });
    client.on('error', error => {
        console.error('discord error:', error);
    });
    client.login(DISCORD_TOKEN);
}

const help = msg => msg.reply('\nCommand:\ncheckDoc\nschwab\nschwabCode code');

const checkDoc = msg => Mongo('find', DOCDB).then(doclist => msg.reply(doclist.reduce((a, v) => `${a}\ntype: ${v.type}, date: ${v.date}`, ''))).catch(err => msg.reply(err.message));

const schwabAuth = msg => msg.reply(generateAuthUrl());

const schwabCode = (msg, code) => (code) ? getToken(code).then(ret => msg.reply("Update token Successed!!!")).catch(err => msg.reply(err.message)) : msg.reply("Need input code!!!");

export default function discordSend(msg) {
    if (channel) {
        channel.send(msg);
    }
}