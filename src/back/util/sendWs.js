import Ws from 'ws'
import { ENV_TYPE } from '../../../ver.js'
import { FILE_IP, COM_PORT } from '../config.js'
import sendDs, { init as initDs } from '../models/discord-tool.js'
import { handleError } from './utility.js'
import createLogger from './logger.js'
import netModule from 'net'

const { connect: NetConnect, createServer: NetCreateServer } = netModule
const log = createLogger('websocket')

let wsServer = null
let client = null

export function mainInit(server) {
    wsServer = new Ws.Server({
        perMessageDeflate: false,
        server,
        path: '/f',
    })
    wsServer.on('connection', ws => {
        ws.on('message', message => {
            log.debug({ rawMessage: message }, 'ws message received')
            try {
                const parsed = JSON.parse(message)
                log.debug({ parsed }, 'ws message parsed')
            } catch (e) {
                handleError(e, 'Web socket')
            }
        })
        ws.on('close', (reasonCode, description) => log.info({ reasonCode, description }, 'ws peer disconnected'))
    })
    NetCreateServer(c => {
        c.setKeepAlive(true, 10000)
        c.on('data', data => {
            try {
                const recvData = JSON.parse(data.toString())
                log.debug({ channel: recvData.send }, 'tcp→ws relay')
                sendWs(recvData.data, recvData.adultonly, recvData.auth)
            } catch (e) {
                handleError(e, 'Client')
                log.error({ rawData: data.toString() }, 'tcp parse failed')
            }
        })
    }).listen(COM_PORT(ENV_TYPE), '0.0.0.0')
    initDs()
}

export function init() {
    client = NetConnect(COM_PORT(ENV_TYPE), FILE_IP(ENV_TYPE), () => {
        log.info('tcp client connected to file-server')
        client.setKeepAlive(true, 10000)
    })
    client.on('end', () => log.warn('tcp client disconnected'))
    client.on('error', err => handleError(err, 'TCP client'))
    client.on('close', () => {
        log.info({ delaySec: 10 }, 'tcp reconnecting')
        setTimeout(() => {
            init() // Recursive reconnect after TCP disconnect
        }, 10000)
    })
}

function sendWs(data, adultonly, auth) {
    if (!wsServer || !data) {
        return
    }
    data.level = auth && adultonly ? 2 : adultonly ? 1 : 0
    const sendData = JSON.stringify(data)
    wsServer.clients.forEach(client => {
        client.send(sendData)
    })
}

export default (data, adultonly, auth, ds = false) => {
    if (ds) {
        sendDs(data.toString())
        return
    }
    sendWs(data, adultonly, auth)
    if (client) {
        client.write(JSON.stringify({
            send: 'web',
            data,
            adultonly: adultonly ? 1 : 0,
            auth: auth ? 1 : 0,
        }))
    }
}
