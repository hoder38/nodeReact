/**
 * bitfinex-publish.smoke.test.js — WebSocket Forwarding Smoke Tests
 * (§3 of FULL_STACK_TESTING_STRATEGY.md)
 *
 * Verifies the TCP→WS event forwarding pipeline works against
 * real network infrastructure. Creates ephemeral servers to test
 * the exact data flow used by bitfinex publishing:
 *
 *   background.js → TCP write → file-server TCP listener → WS broadcast
 *
 * This is a smoke-level validation that the infrastructure primitives
 * (net, ws, JSON serialization) work correctly in the container environment.
 *
 * Run inside the dev container:
 *   docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules \
 *     reactnode-file-server npx jest --config jest.smoke.cjs \
 *     test/smoke/bitfinex-publish.smoke.test.js --forceExit --no-cache
 */
import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import http from 'http';
import Ws from 'ws';
import net from 'net';

let httpServer, wss, tcpServer;
let wsPort, tcpPort;

function broadcastWs(data, adultonly, auth) {
    if (!wss || !data) return;
    data.level = (auth && adultonly) ? 2 : adultonly ? 1 : 0;
    const sendData = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === Ws.OPEN) {
            client.send(sendData);
        }
    });
}

beforeAll(async () => {
    httpServer = http.createServer();
    wss = new Ws.Server({ server: httpServer, path: '/f' });

    tcpServer = net.createServer(c => {
        c.setKeepAlive(true, 10000);
        c.on('data', data => {
            try {
                const recvData = JSON.parse(data.toString());
                broadcastWs(recvData.data, recvData.adultonly, recvData.auth);
            } catch (e) { /* ignore parse errors */ }
        });
    });

    await new Promise(r => httpServer.listen(0, '127.0.0.1', r));
    await new Promise(r => tcpServer.listen(0, '127.0.0.1', r));
    wsPort = httpServer.address().port;
    tcpPort = tcpServer.address().port;
});

afterAll(async () => {
    if (wss) {
        wss.clients.forEach(c => c.close());
        wss.close();
    }
    if (tcpServer) tcpServer.close();
    if (httpServer) httpServer.close();
    await new Promise(r => setTimeout(r, 100));
});

function connectWsClient() {
    return new Promise((resolve, reject) => {
        const client = new Ws(`ws://127.0.0.1:${wsPort}/f`);
        client.on('open', () => resolve(client));
        client.on('error', reject);
    });
}

function connectTcpClient() {
    return new Promise((resolve, reject) => {
        const client = net.connect(tcpPort, '127.0.0.1', () => resolve(client));
        client.on('error', reject);
    });
}

function waitForWsMessage(wsClient, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WS message timeout')), timeout);
        wsClient.once('message', data => {
            clearTimeout(timer);
            resolve(JSON.parse(data.toString()));
        });
    });
}

function sendTcpMessage(tcpClient, data, adultonly = 0, auth = 0) {
    return new Promise((resolve, reject) => {
        tcpClient.write(JSON.stringify({
            send: 'web',
            data: data,
            adultonly: adultonly,
            auth: auth,
        }), err => err ? reject(err) : resolve());
    });
}

describe('Bitfinex Publish — TCP→WS Smoke Tests', () => {
    let wsClient, tcpClient;

    afterEach(() => {
        if (wsClient && wsClient.readyState === Ws.OPEN) wsClient.close();
        if (tcpClient && !tcpClient.destroyed) tcpClient.destroy();
    });

    test('bitfinex-style loan event forwards through TCP→WS', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, {
            type: 'bitfinex',
            event: 'loan',
            currency: 'fUSD',
            rate: 0.00025,
            amount: 1000,
        });

        const received = await msgPromise;
        expect(received.type).toBe('bitfinex');
        expect(received.event).toBe('loan');
        expect(received.currency).toBe('fUSD');
        expect(received.rate).toBe(0.00025);
        expect(received.level).toBe(0);
    });

    test('bitfinex-style trade event forwards through TCP→WS', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, {
            type: 'bitfinex',
            event: 'trade',
            pair: 'tBTCUSD',
            price: 65000,
            amount: 0.5,
        });

        const received = await msgPromise;
        expect(received.type).toBe('bitfinex');
        expect(received.event).toBe('trade');
        expect(received.pair).toBe('tBTCUSD');
        expect(received.level).toBe(0);
    });

    test('bitfinex event with adultonly=1 gets level=1', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, {
            type: 'bitfinex',
            event: 'status',
        }, 1, 0);

        const received = await msgPromise;
        expect(received.level).toBe(1);
    });

    test('large bitfinex payload preserves all fields', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const largePayload = {
            type: 'bitfinex',
            event: 'wallet_snapshot',
            wallets: Array.from({ length: 10 }, (_, i) => ({
                type: i % 2 === 0 ? 'funding' : 'exchange',
                currency: `currency_${i}`,
                balance: Math.random() * 10000,
                unsettledInterest: Math.random() * 100,
            })),
        };

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, largePayload);

        const received = await msgPromise;
        expect(received.wallets).toHaveLength(10);
        expect(received.wallets[0].type).toBe('funding');
        expect(received.wallets[1].type).toBe('exchange');
    });

    test('rapid sequential messages all arrive in order', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const messages = [];
        const count = 5;

        const collectPromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout collecting messages')), 5000);
            wsClient.on('message', data => {
                messages.push(JSON.parse(data.toString()));
                if (messages.length === count) {
                    clearTimeout(timer);
                    resolve();
                }
            });
        });

        // Send with small delays to avoid TCP stream concatenation
        for (let i = 0; i < count; i++) {
            await sendTcpMessage(tcpClient, { type: 'seq', seq: i });
            await new Promise(r => setTimeout(r, 50));
        }

        await collectPromise;
        expect(messages).toHaveLength(count);
        for (let i = 0; i < count; i++) {
            expect(messages[i].seq).toBe(i);
        }
    });

    test('multiple WS clients all receive bitfinex broadcast', async () => {
        const clients = await Promise.all([
            connectWsClient(),
            connectWsClient(),
            connectWsClient(),
        ]);
        tcpClient = await connectTcpClient();

        const promises = clients.map(c => waitForWsMessage(c));
        await sendTcpMessage(tcpClient, { type: 'bitfinex', event: 'broadcast' });

        const results = await Promise.all(promises);
        results.forEach(r => {
            expect(r.type).toBe('bitfinex');
            expect(r.event).toBe('broadcast');
        });

        clients.forEach(c => c.close());
    });
});
