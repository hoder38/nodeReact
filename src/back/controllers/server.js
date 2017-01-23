import { existsSync as FsExistsSync, readFileSync as FsReadFileSync, createReadStream as FsCreateReadStream } from 'fs'
import { join as PathJoin } from 'path'

if(!FsExistsSync(PathJoin(__dirname, '../../../ver.js'))) {
    throw new Error('can not find ver.js')
}

//config
import { ENV_TYPE, PFX, CA, PFX_PWD } from '../../../ver'
import { EXTENT_FILE_IP, EXTENT_FILE_PORT, EXTENT_IP, EXTENT_PORT, IP, PORT, FILE_IP, COM_PORT } from '../config'

//external
import { Agent as HttpsAgent, createServer as HttpsCreateServer } from 'https'
import Express from 'express'
import ExpressSession from 'express-session'
import { urlencoded as BodyParserUrlencoded, json as BodyParserJson } from 'body-parser'
import Passport from 'passport'
import { connect as NetConnect } from 'net'

//model
import Mongo, { objectID } from '../models/mongo-tool'
import SessionStore from '../models/session-tool'

//router
import LoginRouter from './login-router'
import HomeRouter from './home-router'
import BasicRouter from './basic-router'
import UserRouter from './user-router'

//util
import { handleError, showLog, checkLogin } from '../util/utility'

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
const staticPath = PathJoin(__dirname, '../../../public')

app.use(BodyParserUrlencoded({ extended: true }))
app.use(BodyParserJson({ extended: true }))
app.use(ExpressSession(SessionStore(ExpressSession).config))
app.use(Passport.initialize())
app.use(Passport.session())
app.use(Express.static(staticPath))

app.use(function(req, res, next) {
    showLog(req, next)
})

app.use('/api/homepage', HomeRouter)

app.use('/api/basic', BasicRouter)

app.use('/api/user', UserRouter)

app.get('/refresh', function (req, res, next) {
    console.log('refresh');
    res.end('refresh')
})

//login
app.use('/', LoginRouter(`https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)}`))

//view
app.get('*', function(req, res, next) {
    console.log('view');
    const stream = FsCreateReadStream(`${staticPath}/app.html`)
    stream.on('error', function(err){
        handleError(err)
    })
    stream.pipe(res)
})

//error handle
app.use(function(err, req, res, next) {
    handleError(err, 'Send')
    err.name === 'HoError' ? res.status(err.code).send(err.message) : res.status(500).send('server error occur')
})
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
process.on('uncaughtException', function(err) {
    handleError(err, 'Threw exception')
})

server.listen(PORT(ENV_TYPE), IP(ENV_TYPE))

//client
const client = NetConnect(COM_PORT(ENV_TYPE), FILE_IP(ENV_TYPE), function() {
    console.log('connected to server!');
})
client.on('end', function() {
    console.log('disconnected from server');
})
const sendWs = (data, adultonly, auth) => client.write(JSON.stringify({
    send: 'web',
    data: data,
    adultonly: adultonly ? 1 : 0,
    auth: auth ? 1 : 0,
}))

console.log('start express server\n');
console.log(`Server running at https://${EXTENT_IP(ENV_TYPE)}:${EXTENT_PORT(ENV_TYPE)} ${new Date()}`);

