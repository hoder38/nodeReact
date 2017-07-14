import { readFileSync as FsReadFileSync, createReadStream as FsCreateReadStream } from 'fs'
import { join as PathJoin } from 'path'

//constant
import { STATIC_PATH } from '../constants'

//config
import { ENV_TYPE, PFX, CA, PFX_PWD } from '../ver'
import { EXTENT_FILE_IP, EXTENT_FILE_PORT, EXTENT_IP, EXTENT_PORT, IP, PORT } from '../config'

//external
import { Agent as HttpsAgent, createServer as HttpsCreateServer } from 'https'
import Express from 'express'
import ExpressSession from 'express-session'
import { urlencoded as BodyParserUrlencoded, json as BodyParserJson } from 'body-parser'
import Passport from 'passport'

//model
import Mongo, { objectID } from '../models/mongo-tool'
import SessionStore from '../models/session-tool'

//router
import LoginRouter from './login-router'
import HomeRouter from './home-router'
import BasicRouter from './basic-router'
import UserRouter from './user-router'
import StorageRouter from './storage-router'
import PasswordRouter from './password-router'
import StockRouter from './stock-router'
import BookmarkRouter from './bookmark-router'
import ParentRouter from './parent-router'
import OtherRouter from './other-router'

//util
import { handleError, showLog } from '../util/utility'
import { init as WsInit } from '../util/sendWs'

//global
const credentials = {
    pfx: FsReadFileSync(PFX),
    passphrase: PFX_PWD,
    ca: FsReadFileSync(CA),
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
credentials.agent = new HttpsAgent(credentials)
const app = Express()
const server = HttpsCreateServer(credentials, app)
WsInit();

app.use(BodyParserUrlencoded({ extended: true }))
app.use(BodyParserJson({ extended: true }))
app.use(ExpressSession(SessionStore(ExpressSession).config))
app.use(Passport.initialize())
app.use(Passport.session())
app.use(Express.static(STATIC_PATH))

app.use(function(req, res, next) {
    showLog(req, next);
});

app.use('/api', BasicRouter);

app.use('/api/homepage', HomeRouter);

app.use('/api/user', UserRouter);

app.use('/api/storage', StorageRouter);

app.use('/api/password', PasswordRouter);

app.use('/api/stock', StockRouter);

app.use('/api/bookmark', BookmarkRouter);

app.use('/api/parent', ParentRouter);

//other
app.use('/', OtherRouter);
//login
app.use('/', LoginRouter(`https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)}`));

//view
app.get('*', function(req, res, next) {
    console.log('view');
    const stream = FsCreateReadStream(`${STATIC_PATH}/app.html`);
    stream.on('error', function(err) {
        handleError(err);
    });
    stream.pipe(res);
})

//error handle
app.use(function(err, req, res, next) {
    handleError(err, 'Send');
    err.name === 'HoError' ? res.status(err.code).send(err.message.toString()) : res.status(500).send('server error occur');
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('uncaughtException', err => handleError(err, 'Threw exception'));

server.listen(PORT(ENV_TYPE), IP(ENV_TYPE));
console.log('start express server\n');
console.log(`Server running at https://${EXTENT_IP(ENV_TYPE)}:${EXTENT_PORT(ENV_TYPE)} ${new Date()}`);