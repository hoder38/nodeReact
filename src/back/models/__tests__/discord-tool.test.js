/**
 * discord-tool.test.js — Comprehensive tests for discord-tool.js
 * ESM mocking pattern: jest.unstable_mockModule() BEFORE dynamic import().
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

let mockGenerateAuthUrl, mockGetToken;
let mockChannelSend, mockClientOn, mockClientLogin, mockCacheGet;

const DISCORD_TOKEN = 'test-token';
const DISCORD_CHANNEL = 'test-channel-id';

// --- node-fetch (prevents test pollution) ---
jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn(() => Promise.resolve({
        ok: true, buffer: jest.fn().mockResolvedValue(Buffer.from('')),
        headers: { get: jest.fn(() => null) }, body: { pipe: jest.fn().mockReturnThis(), on: jest.fn() },
    })),
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
    PASSWORD_SALT: 'test_salt_',
    ENV_TYPE: 'dev',
    DISCORD_TOKEN,
    DISCORD_CHANNEL,
}));

const mockLog = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};
jest.unstable_mockModule('../../util/logger.js', () => ({
    default: () => mockLog,
}));

mockGenerateAuthUrl = jest.fn();
mockGetToken = jest.fn();
jest.unstable_mockModule('../../models/tdameritrade-tool.js', () => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
}));

// Discord mock — capture event handlers
const eventHandlers = {};
mockClientOn = jest.fn((event, handler) => { eventHandlers[event] = handler; });
mockClientLogin = jest.fn();
mockChannelSend = jest.fn();
mockCacheGet = jest.fn(() => ({ send: mockChannelSend }));

jest.unstable_mockModule('discord.js', () => ({
    default: {
        Client: jest.fn(() => ({
            on: mockClientOn,
            login: mockClientLogin,
            channels: { cache: { get: mockCacheGet } },
            user: { tag: 'TestBot#1234' },
        })),
    },
}));

const { init, default: discordSend } = await import('../../models/discord-tool.js');

describe('discord-tool.js', () => {
    let mockMsg;

    beforeEach(() => {
        jest.clearAllMocks();
        Object.keys(eventHandlers).forEach(k => delete eventHandlers[k]);
        mockMsg = {
            content: '',
            author: { bot: false },
            reply: jest.fn(),
        };
    });

    // ─── init() ──────────────────────────────────────────────
    describe('init()', () => {
        test('registers 4 event handlers and calls login', () => {
            init();
            expect(mockClientOn).toHaveBeenCalledWith('ready', expect.any(Function));
            expect(mockClientOn).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockClientOn).toHaveBeenCalledWith('shardError', expect.any(Function));
            expect(mockClientOn).toHaveBeenCalledWith('error', expect.any(Function));
            expect(mockClientLogin).toHaveBeenCalledWith(DISCORD_TOKEN);
        });

        test('ready event → sets channel + sends greeting', () => {
            init();
            eventHandlers['ready']();
            expect(mockCacheGet).toHaveBeenCalledWith(DISCORD_CHANNEL);
            expect(mockChannelSend).toHaveBeenCalledWith('Nice to serve you!!!');
        });

        test('shardError event → logs error', () => {
            init();
            eventHandlers['shardError'](new Error('ws fail'));
            expect(mockLog.error).toHaveBeenCalledWith({ err: expect.any(Error) }, 'Discord WebSocket error');
        });

        test('error event → logs error', () => {
            init();
            eventHandlers['error'](new Error('general'));
            expect(mockLog.error).toHaveBeenCalledWith({ err: expect.any(Error) }, 'Discord client error');
        });
    });

    // ─── message event handler ──────────────────────────────
    describe('message handler', () => {
        beforeEach(() => {
            init();
        });

        test('ignores bot messages', () => {
            mockMsg.author.bot = true;
            mockMsg.content = '<@bot> help';
            eventHandlers['message'](mockMsg);
            expect(mockMsg.reply).not.toHaveBeenCalled();
        });

        test('ignores non-matching messages', () => {
            mockMsg.content = 'hello world';
            eventHandlers['message'](mockMsg);
            expect(mockMsg.reply).not.toHaveBeenCalled();
        });

        test('help command', () => {
            mockMsg.content = '<@123> help';
            eventHandlers['message'](mockMsg);
            expect(mockMsg.reply).toHaveBeenCalledWith(expect.stringContaining('Command'));
        });

        test('unknown command → fallback to help', () => {
            mockMsg.content = '<@123> unknown';
            eventHandlers['message'](mockMsg);
            expect(mockMsg.reply).toHaveBeenCalledWith(expect.stringContaining('Command'));
        });

        test('schwab → replies with auth URL', () => {
            mockGenerateAuthUrl.mockReturnValue('https://auth.schwab.com/oauth');
            mockMsg.content = '<@123> schwab';
            eventHandlers['message'](mockMsg);
            expect(mockMsg.reply).toHaveBeenCalledWith('https://auth.schwab.com/oauth');
        });

        test('schwabcode with code → exchanges token', async () => {
            mockGetToken.mockResolvedValue({ access_token: 'tok' });
            mockMsg.content = '<@123> schwabcode ABC123';
            eventHandlers['message'](mockMsg);
            await new Promise(r => setTimeout(r, 50));
            expect(mockGetToken).toHaveBeenCalledWith('ABC123');
            expect(mockMsg.reply).toHaveBeenCalledWith('Update token Successed!!!');
        });

        test('schwabcode without code → replies need code', () => {
            mockMsg.content = '<@123> schwabcode';
            eventHandlers['message'](mockMsg);
            expect(mockMsg.reply).toHaveBeenCalledWith('Need input code!!!');
        });

        test('schwabcode with whitespace-only code → replies need code', () => {
            mockMsg.content = '<@123> schwabcode   ';
            eventHandlers['message'](mockMsg);
            expect(mockMsg.reply).toHaveBeenCalledWith('Need input code!!!');
        });

        test('schwabcode getToken error → replies with error', async () => {
            mockGetToken.mockRejectedValue(new Error('invalid code'));
            mockMsg.content = '<@123> schwabcode BAD';
            eventHandlers['message'](mockMsg);
            await new Promise(r => setTimeout(r, 50));
            expect(mockMsg.reply).toHaveBeenCalledWith('invalid code');
        });
    });

    // ─── discordSend() ──────────────────────────────────────
    describe('discordSend()', () => {
        test('sends message when channel is set', () => {
            init();
            eventHandlers['ready']();
            discordSend('hello');
            expect(mockChannelSend).toHaveBeenCalledWith('hello');
        });

        test('does nothing when channel is null', () => {
            // channel is null before init/ready
            discordSend('hello');
            // No error thrown, no send called (besides any from init)
        });
    });
});
