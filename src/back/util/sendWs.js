import Ws from 'ws'
import { ENV_TYPE } from '../../../ver.js'
import { FILE_IP, COM_PORT } from '../config.js'
import sendDs, { init as initDs } from '../models/discord-tool.js'
import { handleError } from './utility.js'
import netModule from 'net'
const { connect: NetConnect, createServer: NetCreateServer } = netModule;

let wsServer = null;
let client = null;

export function mainInit(server) {
    wsServer = new Ws.Server({
        perMessageDeflate: false,
        server: server,
        path:'/f',
    });
    wsServer.on('connection', ws => {
        ws.on('message', message => {
            console.log(message);
            try {
                console.log(JSON.parse(message));
            } catch (e) {
                handleError(e, 'Web socket');
            }
        });
        ws.on('close', (reasonCode, description) => console.log(`Peer disconnected with reason: ${reasonCode} ${description}`));
    });
    //client
    const server0 = NetCreateServer(c => {
        console.log('client connected');
        c.on('end', () => console.log('client disconnected'));
        c.on('data', data => {
            try {
                const recvData = JSON.parse(data.toString());
                console.log(`websocket: ${recvData.send}`);
                sendWs(recvData.data, recvData.adultonly, recvData.auth);
            } catch (e) {
                handleError(e, 'Client');
                console.log(data);
            }
        });
    }).listen(COM_PORT(ENV_TYPE));
    initDs();
}

export function init() {
    client = NetConnect(COM_PORT(ENV_TYPE), FILE_IP(ENV_TYPE), () => console.log('connected to server!'));
    client.on('end', () => console.log('disconnected from server'));
}

function sendWs(data, adultonly, auth) {
    if (wsServer) {
        data.level = (auth && adultonly) ? 2 : adultonly ? 1 : 0;
        const sendData = JSON.stringify(data);
        wsServer.clients.forEach(function each(client) {
            client.send(sendData);
        });
    }
}

export default (data, adultonly, auth, ds=false) => {
    if (ds) {
        sendDs(data.toString());
        return;
    }
    sendWs(data, adultonly, auth);
    if (client) {
        client.write(JSON.stringify({
            send: 'web',
            data: data,
            adultonly: adultonly ? 1 : 0,
            auth: auth ? 1 : 0,
        }));
    }
}
