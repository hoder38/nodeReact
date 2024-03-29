import fsModule from 'fs'
const { readFileSync: FsReadFileSync, createReadStream: FsCreateReadStream } = fsModule;

//constant
import { STATIC_PATH } from '../constants.js'

//config
import { ENV_TYPE, CA, CERT, PKEY/*, PKEY_PWD*/ } from '../../../ver.js'
import { EXTENT_FILE_IP, EXTENT_FILE_PORT, EXTENT_IP, EXTENT_PORT, IP, PORT, APP_HTML } from '../config.js'

//external
import httpsModule from 'https'
const { Agent: HttpsAgent, createServer: HttpsCreateServer } = httpsModule;
import Express from 'express'
import ExpressSession from 'express-session'
import bodyParser from 'body-parser'
const { urlencoded: BodyParserUrlencoded, json: BodyParserJson } = bodyParser;
import Passport from 'passport'

//model
import Mongo, { objectID } from '../models/mongo-tool.js'
import SessionStore from '../models/session-tool.js'

//router
import LoginRouter from './login-router.js'
import HomeRouter from './home-router.js'
import BasicRouter from './basic-router.js'
import UserRouter from './user-router.js'
import StorageRouter from './storage-router.js'
import PasswordRouter from './password-router.js'
import StockRouter from './stock-router.js'
//import FitnessRouter from './fitness-router.js'
//import RankRouter from './rank-router.js'
import BookmarkRouter from './bookmark-router.js'
import ParentRouter from './parent-router.js'
import LotteryRouter from './lottery-router.js'
import OtherRouter from './other-router.js'

//util
import { handleError, showLog } from '../util/utility.js'
import { init as WsInit } from '../util/sendWs.js'

//global
const credentials = {
    cert: FsReadFileSync(CERT),
    ca: FsReadFileSync(CA),
    key: FsReadFileSync(PKEY),
    //passphrase: FsReadFileSync(PKEY_PWD, 'utf-8').slice(0, -1),
    ciphers: [
        "ECDHE-RSA-AES256-SHA384",
        "DHE-RSA-AES256-SHA384",
        "ECDHE-RSA-AES256-SHA256",
        "DHE-RSA-AES256-SHA256",
        "ECDHE-RSA-AES128-SHA256",
        "DHE-RSA-AES128-SHA256",
        "HIGH",
        "!aNULL",
        "!eNULL",
        "!EXPORT",
        "!DES",
        "!RC4",
        "!MD5",
        "!PSK",
        "!SRP",
        "!CAMELLIA"
    ].join(':'),
    honorCipherOrder: true,
}
//credentials.agent = new HttpsAgent(credentials)
const app = Express()
const server = HttpsCreateServer(credentials, app)
//const server = HttpsCreateServer({}, app)
WsInit();
app.use(BodyParserUrlencoded({ extended: true }))
app.use(BodyParserJson({ extended: true }))
app.use(ExpressSession(SessionStore(ExpressSession).config))
app.use(Passport.initialize())
app.use(Passport.session())
//app.use(Express.static(STATIC_PATH))


app.use(function(req, res, next) {
    showLog(req, next);
});

app.use('/api', BasicRouter);

app.use('/api/homepage', HomeRouter);

app.use('/api/user', UserRouter);

app.use('/api/storage', StorageRouter);

app.use('/api/password', PasswordRouter);

app.use('/api/stock', StockRouter);

//app.use('/api/fitness', FitnessRouter);

//app.use('/api/rank', RankRouter);

app.use('/api/bookmark', BookmarkRouter);

app.use('/api/parent', ParentRouter);

//app.use('/api/lottery', LotteryRouter);

//other
app.use('/', OtherRouter);
//login
app.use('/', LoginRouter(`https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)}/f`));

//view
/*app.get('*', function(req, res, next) {
    console.log('view');
    const stream = FsCreateReadStream(`${STATIC_PATH}/${APP_HTML(ENV_TYPE)}`);
    stream.on('error', err => handleError(err, next));
    stream.pipe(res);
})*/

//error handle
app.use(function(err, req, res, next) {
    handleError(err, 'Send');
    err.name === 'HoError' ? res.status(err.code).send(err.message.toString()) : res.status(500).send('server error occur');
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('uncaughtException', err => handleError(err, 'Threw exception'));

server.listen(PORT(ENV_TYPE), IP(ENV_TYPE));
//app.listen(PORT(ENV_TYPE), IP(ENV_TYPE));
console.log('start express server\n');
console.log(`Server running at https://${EXTENT_IP(ENV_TYPE)}:${EXTENT_PORT(ENV_TYPE)} ${new Date()}`);