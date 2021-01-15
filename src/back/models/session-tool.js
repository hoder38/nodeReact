import { ENV_TYPE, SESS_SECRET, SESS_PWD } from '../../../ver.js'
import { SESS_IP, SESS_PORT } from '../config.js'
import ConnectRedis from 'connect-redis'
import Redis from 'redis'

export default function (express) {
    const redisStore = ConnectRedis(express)
    return {
        config: {
            secret: SESS_SECRET,
            cookie: {
                maxAge: 86400 * 1000 * 3,
                secure: true,
            },
            store: new redisStore({
                client: Redis.createClient(SESS_PORT(ENV_TYPE), SESS_IP(ENV_TYPE), {auth_pass: SESS_PWD}),
            }),
            resave: false,
            saveUninitialized: false,
        }
    }
}