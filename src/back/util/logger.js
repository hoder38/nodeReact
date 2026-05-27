import pino from 'pino';
import { ENV_TYPE } from '../../../ver.js';

const level = process.env.LOG_LEVEL || 'debug';

const isRelease = ENV_TYPE === 'release';

// Production: JSON to stdout (Docker captures timestamps).
// Development: human-readable via pino-pretty.
const transport = isRelease
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } };

const root = pino({ level, ...(transport ? { transport } : {}) });

// createLogger('stock') → child logger with { module: 'stock' } bound to every entry.
const createLogger = (mod) => root.child({ module: mod });

export default createLogger;
