import fsModule from 'fs'
const { readFileSync: FsReadFileSync } = fsModule;

import { ENV_TYPE, CA, CERT, PKEY } from '../../../ver.js'
import { NAS_TMP, EXTENT_FILE_IP, EXTENT_FILE_PORT, FILE_IP, FILE_PORT } from '../config.js'
import httpsModule from 'https'
const { createServer: HttpsCreateServer } = httpsModule;
import Express from 'express'
import ExpressSession from 'express-session'
import bodyParser from 'body-parser'
const { urlencoded: BodyParserUrlencoded, json: BodyParserJson } = bodyParser;
import Passport from 'passport'
import multer from 'multer'
import SessionStore from '../models/session-tool.js'
import LoginRouter from './login-router.js'
import BasicRouter from './file-basic-router.js'
import OtherRouter from './file-other-router.js'
import FileRouter from './file-router.js'
import ExternalRouter from './external-router.js'
import PlaylistRouter from './playlist-router.js'
import BitfinexRouter from './bitfinex-router.js'
import createLogger from '../util/logger.js'
import { handleError, HoError, showLog } from '../util/utility.js'
import { mainInit } from '../util/sendWs.js'
import { autoUpload, checkMedia, updateStock, filterStock, dbBackup, checkStock, rateCalculator, setUserOffer, filterBitfinex, usseInit, twseInit, updateStockList } from '../cmd/background.js'
const log = createLogger('file-server')
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
mainInit(server);
autoUpload();
checkMedia();
updateStock();
updateStockList();
filterStock();
dbBackup();
checkStock();
rateCalculator();
setUserOffer();
filterBitfinex();
usseInit();
twseInit();

// Reject URLs containing backslashes to prevent path confusion attacks
app.use((req, res, next) => /\\|%5c/i.test(req.originalUrl) ? res.status(400).json({ error: 'Invalid URL' }) : next());
app.use(BodyParserUrlencoded({ extended: true }))
app.use(BodyParserJson({ extended: true }))
app.use(ExpressSession(SessionStore(ExpressSession).config))
app.use(multer({ dest: NAS_TMP(ENV_TYPE) }).single('file'))
app.use(Passport.initialize())
app.use(Passport.session())
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Credentials', true)
    res.header('Access-Control-Allow-Origin', req.headers.origin)
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept')
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    req.method === 'OPTIONS' ? res.json({apiOK: true}) : next()
})

app.use(function(req, res, next) {
    showLog(req, next);
});

app.use('/f/api', BasicRouter);
app.use('/f/api/torrent', PlaylistRouter);
app.use('/f/api/external', ExternalRouter);
app.use('/f/api/file', FileRouter);
app.use('/f/api/bitfinex', BitfinexRouter);
app.use('/f', OtherRouter);
app.use('/f', LoginRouter());

app.all('*', function(req, res, next) {
    return handleError(new HoError('page not found', {code: 404}), next);
});

app.use(function(err, req, res, next) {
    handleError(err, 'Send');
    err.name === 'HoError' ? res.status(err.code).send(err.message.toString()) : res.status(500).send('server error occur');
});
// Allow connections to untrusted TLS endpoints (internal services)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('uncaughtException', err => handleError(err, 'Threw exception'));

server.listen(FILE_PORT(ENV_TYPE), FILE_IP(ENV_TYPE));
log.info({ url: `https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)}` }, 'file server started')