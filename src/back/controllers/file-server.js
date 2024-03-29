import fsModule from 'fs'
const { readFileSync: FsReadFileSync } = fsModule;

//config
import { ENV_TYPE, CA, CERT, PKEY/*, PKEY_PWD*/ } from '../../../ver.js'
import { NAS_TMP, EXTENT_FILE_IP, EXTENT_FILE_PORT, FILE_IP, FILE_PORT } from '../config.js'

//external
import httpsModule from 'https'
const { Agent: HttpsAgent, createServer: HttpsCreateServer } = httpsModule;
import Express from 'express'
import ExpressSession from 'express-session'
import bodyParser from 'body-parser'
const { urlencoded: BodyParserUrlencoded, json: BodyParserJson } = bodyParser;
import Passport from 'passport'
import ConnectMultiparty from 'connect-multiparty'

//model
import SessionStore from '../models/session-tool.js'

//router
import LoginRouter from './login-router.js'
import BasicRouter from './file-basic-router.js'
import OtherRouter from './file-other-router.js'
import FileRouter from './file-router.js'
import ExternalRouter from './external-router.js'
import PlaylistRouter from './playlist-router.js'
import BitfinexRouter from './bitfinex-router.js'

//util
import { handleError, HoError, showLog } from '../util/utility.js'
import { mainInit } from '../util/sendWs.js'

//background
import { autoUpload, checkMedia/*, updateExternal*/, autoDownload, updateStock, filterStock, dbBackup, checkStock, rateCalculator, setUserOffer, filterBitfinex, usseInit, twseInit, updateStockList } from '../cmd/background.js'
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
mainInit(server);
//mainInit(app);
autoUpload();
checkMedia();
//updateExternal();
autoDownload();
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

app.use(BodyParserUrlencoded({ extended: true }))
app.use(BodyParserJson({ extended: true }))
app.use(ExpressSession(SessionStore(ExpressSession).config))
app.use(ConnectMultiparty({ uploadDir: NAS_TMP(ENV_TYPE) }))
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
//torrent
app.use('/f/api/torrent', PlaylistRouter);
//external&subtitle&upload
app.use('/f/api/external', ExternalRouter);
//file&media
app.use('/f/api/file', FileRouter);
//bitfinex
app.use('/f/api/bitfinex', BitfinexRouter);
//other&stock
app.use('/f', OtherRouter);
//login
app.use('/f', LoginRouter());

//view
app.all('*', function(req, res, next) {
    return handleError(new HoError('page not found', {code: 404}), next);
});

//error handle
app.use(function(err, req, res, next) {
    handleError(err, 'Send');
    err.name === 'HoError' ? res.status(err.code).send(err.message.toString()) : res.status(500).send('server error occur');
});
//為了連接非認證的tls
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('uncaughtException', err => handleError(err, 'Threw exception'));

server.listen(FILE_PORT(ENV_TYPE), FILE_IP(ENV_TYPE));
//app.listen(FILE_PORT(ENV_TYPE), FILE_IP(ENV_TYPE));
console.log('start express server\n');
console.log(`Server running at https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)} ${new Date()}`);