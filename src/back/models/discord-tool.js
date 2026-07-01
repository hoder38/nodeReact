import { DISCORD_TOKEN, DISCORD_CHANNEL } from '../../../ver.js'
import Discord from 'discord.js'
import { generateAuthUrl, getToken } from '../models/tdameritrade-tool.js'
import createLogger from '../util/logger.js'

const log = createLogger('discord')

let channel = null;
export const init = () => {
    const client = new Discord.Client();
    client.on('ready', () => {
        log.info({ tag: client.user.tag }, 'Discord bot connected')
        channel = client.channels.cache.get(DISCORD_CHANNEL);
        channel.send('Nice to serve you!!!');
    });
    client.on('message', msg=> {
        log.debug({ content: msg.content }, 'Discord message received')
        log.debug({ isBot: msg.author.bot }, 'message author type')
        if (!msg.author.bot) {
            const cmd = msg.content.match(/\<\@.*\> ([^\s]*)(.*)/);
            if (cmd) {
                switch (cmd[1].toLowerCase()) {
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
        log.error({ err: error }, 'Discord WebSocket error')
    });
    client.on('error', error => {
        log.error({ err: error }, 'Discord client error')
    });
    client.login(DISCORD_TOKEN);
}

const help = msg => msg.reply('\nCommand:\nschwab\nschwabCode code');

const schwabAuth = msg => msg.reply(generateAuthUrl());

const schwabCode = (msg, code) => (code) ? getToken(code).then(ret => msg.reply("Update token Successed!!!")).catch(err => msg.reply(err.message)) : msg.reply("Need input code!!!");

export default function discordSend(msg) {
    if (channel) {
        channel.send(msg);
    }
}