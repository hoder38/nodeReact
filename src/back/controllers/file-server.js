import { readFileSync as FsReadFileSync } from 'fs'

//config
import { ENV_TYPE, CA, CERT, PKEY, PKEY_PWD } from '../../../ver'
import { NAS_TMP, EXTENT_FILE_IP, EXTENT_FILE_PORT, FILE_IP, FILE_PORT } from '../config'

//external
import { Agent as HttpsAgent, createServer as HttpsCreateServer } from 'https'
import Express from 'express'
import ExpressSession from 'express-session'
import { urlencoded as BodyParserUrlencoded, json as BodyParserJson } from 'body-parser'
import Passport from 'passport'
import ConnectMultiparty from 'connect-multiparty'

//model
import SessionStore from '../models/session-tool'

//router
import LoginRouter from './login-router'
import BasicRouter from './file-basic-router'
import OtherRouter from './file-other-router'
import FileRouter from './file-router'
import ExternalRouter from './external-router'
import PlaylistRouter from './playlist-router'

//util
import { handleError, HoError, showLog } from '../util/utility'
import { mainInit } from '../util/sendWs'

//background
import { autoUpload, checkMedia, updateExternal, autoDownload, updateStock, filterStock, dbBackup, checkStock, rateCalculator, setUserOffer } from '../cmd/background'

//global
const credentials = {
    cert: FsReadFileSync(CERT),
    ca: FsReadFileSync(CA),
    key: FsReadFileSync(PKEY),
    passphrase: PKEY_PWD,
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
mainInit(server);
autoUpload();
checkMedia();
updateExternal();
autoDownload();
updateStock();
filterStock();
dbBackup();
checkStock();
rateCalculator();
setUserOffer();

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
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('uncaughtException', err => handleError(err, 'Threw exception'));

server.listen(FILE_PORT(ENV_TYPE), FILE_IP(ENV_TYPE));
console.log('start express server\n');
console.log(`Server running at https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)} ${new Date()}`);