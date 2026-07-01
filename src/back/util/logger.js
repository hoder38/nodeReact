import pino from 'pino';
import { ENV_TYPE } from '../../../ver.js';

const level = process.env.LOG_LEVEL || 'debug';
const isRelease = ENV_TYPE === 'release';

// Production: structured JSON to stdout — Docker/Loki/Datadog ingest directly.
// Development: colorized human-readable output via pino-pretty.
const transport = isRelease
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } };

const root = pino({
    level,
    ...(transport ? { transport } : {}),
    // Attach service name for multi-container log aggregation
    base: { service: process.env.SERVICE_NAME || 'nodeReact' },
});

/**
 * Create a child logger scoped to a module.
 * Every log entry includes { module: 'name' } for filtering in Docker/Kibana/Loki.
 * Usage: const log = createLogger('stock-router');
 *        log.info({ stockId }, 'fetched stock data');
 */
const createLogger = (mod) => root.child({ module: mod });

export default createLogger;
