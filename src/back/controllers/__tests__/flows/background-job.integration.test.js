/**
 * background-job.integration.test.js — TCP→WS Forwarding Pipeline
 * (§2 of FULL_STACK_TESTING_STRATEGY.md)
 *
 * Tests the infrastructure that background jobs use to push events:
 *   Main server → TCP write → File server TCP server → WS broadcast
 *
 * Replicates the sendWs.mainInit TCP→WS architecture with ephemeral ports.
 * No external dependencies — pure ws + net module integration.
 *
 * Run inside the file-server container:
 *   docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules \
 *     reactnode-file-server npx jest \
 *     src/back/controllers/__tests__/flows/background-job.integration.test.js \
 *     --forceExit --no-cache
 */
import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';

const { default: http } = await import('http');
const { default: Ws } = await import('ws');
const { default: net } = await import('net');

// =====================================================================
// INFRASTRUCTURE — replicates sendWs.mainInit + init
// =====================================================================

let httpServer, wss, tcpServer;
let wsPort, tcpPort;

/**
 * sendWs-equivalent function for the TCP server side.
 * Same logic as the local sendWs() in util/sendWs.js L63-69.
 */
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
    // Create HTTP server for WebSocket
    httpServer = http.createServer();
    wss = new Ws.Server({ server: httpServer, path: '/f' });

    // TCP server — same logic as sendWs.mainInit (L30-44)
    tcpServer = net.createServer(c => {
        c.setKeepAlive(true, 10000);
        c.on('data', data => {
            try {
                const recvData = JSON.parse(data.toString());
                broadcastWs(recvData.data, recvData.adultonly, recvData.auth);
            } catch (e) {
                // Ignore parse errors in tests
            }
        });
    });

    // Start on ephemeral ports
    await new Promise(r => httpServer.listen(0, '127.0.0.1', r));
    await new Promise(r => tcpServer.listen(0, '127.0.0.1', r));
    wsPort = httpServer.address().port;
    tcpPort = tcpServer.address().port;
});

afterAll(async () => {
    // Clean up: close all WS clients, servers, and TCP connections
    if (wss) {
        wss.clients.forEach(c => c.close());
        wss.close();
    }
    if (tcpServer) tcpServer.close();
    if (httpServer) httpServer.close();
    await new Promise(r => setTimeout(r, 100));
});

// =====================================================================
// HELPERS
// =====================================================================

/** Connect a WS test client and wait for 'open' */
function connectWsClient() {
    return new Promise((resolve, reject) => {
        const client = new Ws(`ws://127.0.0.1:${wsPort}/f`);
        client.on('open', () => resolve(client));
        client.on('error', reject);
    });
}

/** Connect a TCP client and wait for 'connect' */
function connectTcpClient() {
    return new Promise((resolve, reject) => {
        const client = net.connect(tcpPort, '127.0.0.1', () => resolve(client));
        client.on('error', reject);
    });
}

/** Wait for a WS message with timeout */
function waitForWsMessage(wsClient, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WS message timeout')), timeout);
        wsClient.once('message', data => {
            clearTimeout(timer);
            resolve(JSON.parse(data.toString()));
        });
    });
}

/** Send a TCP message in the same format as sendWs default export */
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

// =====================================================================
// TESTS
// =====================================================================
describe('Background Job — TCP→WS Forwarding Pipeline', () => {
    let wsClient, tcpClient;

    afterEach(() => {
        if (wsClient && wsClient.readyState === Ws.OPEN) wsClient.close();
        if (tcpClient && !tcpClient.destroyed) tcpClient.destroy();
    });

    test('TCP message is forwarded to WS client', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, { type: 'test', msg: 'hello' });

        const received = await msgPromise;
        expect(received.type).toBe('test');
        expect(received.msg).toBe('hello');
        expect(received.level).toBe(0);
    });

    test('level=0 when adultonly=0 and auth=0', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, { type: 'event' }, 0, 0);

        const received = await msgPromise;
        expect(received.level).toBe(0);
    });

    test('level=1 when adultonly=1 and auth=0', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, { type: 'event' }, 1, 0);

        const received = await msgPromise;
        expect(received.level).toBe(1);
    });

    test('level=2 when adultonly=1 and auth=1', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, { type: 'event' }, 1, 1);

        const received = await msgPromise;
        expect(received.level).toBe(2);
    });

    test('level=0 when adultonly=0 and auth=1', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, { type: 'event' }, 0, 1);

        const received = await msgPromise;
        expect(received.level).toBe(0);
    });

    test('Multiple WS clients all receive the broadcast', async () => {
        const client1 = await connectWsClient();
        const client2 = await connectWsClient();
        const client3 = await connectWsClient();
        tcpClient = await connectTcpClient();

        const msg1 = waitForWsMessage(client1);
        const msg2 = waitForWsMessage(client2);
        const msg3 = waitForWsMessage(client3);

        await sendTcpMessage(tcpClient, { type: 'broadcast', value: 42 });

        const [r1, r2, r3] = await Promise.all([msg1, msg2, msg3]);
        expect(r1.type).toBe('broadcast');
        expect(r1.value).toBe(42);
        expect(r2.type).toBe('broadcast');
        expect(r3.type).toBe('broadcast');

        client1.close();
        client2.close();
        client3.close();
    });

    test('WS client disconnect does not break pipeline for remaining clients', async () => {
        const client1 = await connectWsClient();
        const client2 = await connectWsClient();
        tcpClient = await connectTcpClient();

        // First message — both receive
        const msg1a = waitForWsMessage(client1);
        const msg1b = waitForWsMessage(client2);
        await sendTcpMessage(tcpClient, { type: 'msg1' });
        await Promise.all([msg1a, msg1b]);

        // Disconnect client1
        client1.close();
        await new Promise(r => setTimeout(r, 100));

        // Second message — only client2 receives
        const msg2 = waitForWsMessage(client2);
        await sendTcpMessage(tcpClient, { type: 'msg2' });
        const received = await msg2;
        expect(received.type).toBe('msg2');

        client2.close();
    });

    test('Invalid JSON on TCP does not crash the server', async () => {
        wsClient = await connectWsClient();
        tcpClient = await connectTcpClient();

        // Send invalid JSON
        tcpClient.write('not-json{{{');
        await new Promise(r => setTimeout(r, 200));

        // Pipeline still works for valid messages
        const msgPromise = waitForWsMessage(wsClient);
        await sendTcpMessage(tcpClient, { type: 'after-error' });
        const received = await msgPromise;
        expect(received.type).toBe('after-error');
    });
});
