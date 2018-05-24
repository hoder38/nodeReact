import Ws from 'ws'
import { ENV_TYPE } from '../../../ver'
import { FILE_IP, COM_PORT } from '../config'
import { handleError } from './utility'
import { connect as NetConnect } from 'net'

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
}

export function init() {
    client = NetConnect(COM_PORT(ENV_TYPE), FILE_IP(ENV_TYPE), () => console.log('connected to server!'));
    client.on('end', () => console.log('disconnected from server'));
}

export default (data, adultonly, auth) => {
    if (wsServer) {
        data.level = (auth && adultonly) ? 2 : adultonly ? 1 : 0;
        const sendData = JSON.stringify(data);
        wsServer.clients.forEach(function each(client) {
            client.send(sendData);
        });
    }
    if (client) {
        client.write(JSON.stringify({
            send: 'web',
            data: data,
            adultonly: adultonly ? 1 : 0,
            auth: auth ? 1 : 0,
        }));
    }
}
