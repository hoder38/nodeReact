import { ENV_TYPE, SESS_PWD } from '../../../ver.js'
import { SESS_IP, SESS_PORT } from '../config.js'
import createLogger from '../util/logger.js'

import Redis from 'redis'

const log = createLogger('redis')

const client = Redis.createClient(SESS_PORT(ENV_TYPE), SESS_IP(ENV_TYPE), {auth_pass: SESS_PWD});
client.on('error', err => log.error({ err }, 'redis error'));
client.on('ready', () => log.info('redis ready'));
client.on('connect', () => {
    log.info('redis connect');
    client.config('SET', 'maxmemory', '100mb');
    client.config('SET', 'maxmemory-policy', 'allkeys-lru');
});

export default function(functionName, ...args) {
    if (functionName === 'multi') {
        let multi = client.multi();
        args[0].forEach(a => {
            const [b, ...c] = a;
            multi = multi[b](...c);
        });
        return new Promise((resolve, reject) => multi.exec((err, data) => err ? reject(err) : resolve(data)));
    } else {
        return new Promise((resolve, reject) => client[functionName](...args, (err, data) => err ? reject(err) : resolve(data)));
    }
}