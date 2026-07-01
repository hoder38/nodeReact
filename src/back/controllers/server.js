import fsModule from 'fs'
const { readFileSync: FsReadFileSync } = fsModule;

import { ENV_TYPE, CA, CERT, PKEY } from '../../../ver.js'
import { EXTENT_FILE_IP, EXTENT_FILE_PORT, EXTENT_IP, EXTENT_PORT, IP, PORT } from '../config.js'
import httpsModule from 'https'
const { createServer: HttpsCreateServer } = httpsModule;
import Express from 'express'
import ExpressSession from 'express-session'
import bodyParser from 'body-parser'
const { urlencoded: BodyParserUrlencoded, json: BodyParserJson } = bodyParser;
import Passport from 'passport'
import SessionStore from '../models/session-tool.js'
import LoginRouter from './login-router.js'
import HomeRouter from './home-router.js'
import BasicRouter from './basic-router.js'
import UserRouter from './user-router.js'
import StorageRouter from './storage-router.js'
import PasswordRouter from './password-router.js'
import StockRouter from './stock-router.js'
import BookmarkRouter from './bookmark-router.js'
import ParentRouter from './parent-router.js'
import OtherRouter from './other-router.js'
import createLogger from '../util/logger.js'
import { handleError, showLog } from '../util/utility.js'
import { init as WsInit } from '../util/sendWs.js'

const log = createLogger('server')
const credentials = {
    cert: FsReadFileSync(CERT),
    ca: FsReadFileSync(CA),
    key: FsReadFileSync(PKEY),
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
const app = Express()
const server = HttpsCreateServer(credentials, app)
WsInit();
// Reject URLs containing backslashes to prevent path confusion attacks
app.use((req, res, next) => /\\|%5c/i.test(req.originalUrl) ? res.status(400).json({ error: 'Invalid URL' }) : next());
app.use(BodyParserUrlencoded({ extended: true }))
app.use(BodyParserJson({ extended: true }))
app.use(ExpressSession(SessionStore(ExpressSession).config))
app.use(Passport.initialize())
app.use(Passport.session())


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

app.use('/', OtherRouter);
app.use('/', LoginRouter(`https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)}/f`));
app.use(function(err, req, res, next) {
    handleError(err, 'Send');
    err.name === 'HoError' ? res.status(err.code).send(err.message.toString()) : res.status(500).send('server error occur');
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('uncaughtException', err => handleError(err, 'Threw exception'));

server.listen(PORT(ENV_TYPE), IP(ENV_TYPE));
log.info({ url: `https://${EXTENT_IP(ENV_TYPE)}:${EXTENT_PORT(ENV_TYPE)}` }, 'main server started')