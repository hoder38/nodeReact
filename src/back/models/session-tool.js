import { ENV_TYPE, SESS_SECRET, SESS_PWD } from '../../../ver'
import { SESS_IP, SESS_PORT } from '../config'
import ConnectRedis from 'connect-redis'

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
                host: SESS_IP(ENV_TYPE),
                port: SESS_PORT(ENV_TYPE),
                pass: SESS_PWD,
            }),
            resave: false,
            saveUninitialized: false,
        }
    }
}