import { existsSync as FsExistsSync, readFileSync as FsReadFileSync } from 'fs'
import { join as PathJoin } from 'path'

if(!FsExistsSync(PathJoin(__dirname, '../../../ver.js'))) {
    throw new Error('can not find ver.js')
}

//config
import { ENV_TYPE, PFX, CA, PFX_PWD } from '../../../ver'
import { NAS_TMP, EXTENT_FILE_IP, EXTENT_FILE_PORT, FILE_IP, FILE_PORT, COM_PORT } from '../config'

//external
import { Agent as HttpsAgent, createServer as HttpsCreateServer } from 'https'
import Express from 'express'
import ExpressSession from 'express-session'
import { urlencoded as BodyParserUrlencoded, json as BodyParserJson } from 'body-parser'
import Passport from 'passport'
import ConnectMultiparty from 'connect-multiparty'
import Ws from 'ws'
import { createServer as NetCreateServer } from 'net'

//model
import SessionStore from '../models/session-tool'

//router
import LoginRouter from './login-router'
import BasicRouter from './file-basic-router'

//util
import { handleError, HoError, isValidString, showLog, checkLogin } from '../util/utility'

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
    showLog(req, next)
})

app.use('/api/basic', BasicRouter)

//login
app.use('/', LoginRouter())

//view
app.all('*', function(req, res, next) {
    handleError(new HoError('page not found', 404))
})

//error handle
app.use(function(err, req, res, next) {
    handleError(err, 'Send')
    err.name === 'HoError' ? res.status(err.code).send(err.message) : res.status(500).send('server error occur')
})
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
process.on('uncaughtException', function(err) {
    handleError(err, 'Threw exception')
})

server.listen(FILE_PORT(ENV_TYPE), FILE_IP(ENV_TYPE))

//client
var server0 = NetCreateServer(function(c) {
    console.log('client connected');
    c.on('end', function() {
        console.log('client disconnected');
    })
    c.on('data', function(data) {
        try {
            const recvData = JSON.parse(data.toString())
            console.log(`websocket: ${recvData.send}`);
            sendWs(recvData.data, recvData.adultonly, recvData.auth)
        } catch (e) {
            handleError(e, 'Client')
            console.log(data);
        }
    });
}).listen(COM_PORT(ENV_TYPE))

const wsServer = new Ws.Server({server: server})
function onWsConnMessage(message) {
    console.log(message);
    try {
        console.log(JSON.parse(message));
    } catch (e) {
        handleError(e, 'Web socket')
    }
}
function onWsConnClose(reasonCode, description) {
    console.log(`Peer disconnected with reason: ${reasonCode}`);
}
wsServer.on('connection', function(ws) {
    ws.on('message', onWsConnMessage)
    ws.on('close', onWsConnClose)
})

function sendWs(data, adultonly, auth) {
    data.level = (auth && adultonly) ? 2 : adultonly ? 1 : 0
    const sendData = JSON.stringify(data)
    wsServer.clients.forEach(function each(client) {
        client.send(sendData)
    })
}

console.log('start express server\n')
console.log(`Server running at https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)} ${new Date()}`)