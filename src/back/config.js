import { DEV, RELEASE } from './constants.js'
import DevConfig from '../../config/node-dev-config.js'
import ReleaseConfig from '../../config/node-release-config.js'

export const EXTENT_IP = env => env === RELEASE ? ReleaseConfig.EXTENT_IP : DevConfig.EXTENT_IP
export const EXTENT_FILE_IP = env => env === RELEASE ? ReleaseConfig.EXTENT_FILE_IP : DevConfig.EXTENT_FILE_IP
export const APP_HTML = env => env === RELEASE ? ReleaseConfig.APP_HTML : DevConfig.APP_HTML
export const IP = env => env === RELEASE ? ReleaseConfig.IP : DevConfig.IP
export const FILE_IP = env => env === RELEASE ? ReleaseConfig.FILE_IP : DevConfig.FILE_IP
export const PORT = env => env === RELEASE ? ReleaseConfig.PORT : DevConfig.PORT
export const EXTENT_PORT = env => env === RELEASE ? ReleaseConfig.EXTENT_PORT : DevConfig.EXTENT_PORT
export const FILE_PORT = env => env === RELEASE ? ReleaseConfig.FILE_PORT : DevConfig.FILE_PORT
export const EXTENT_FILE_PORT = env => env === RELEASE ? ReleaseConfig.EXTENT_FILE_PORT : DevConfig.EXTENT_FILE_PORT
export const COM_PORT = env => env === RELEASE ? ReleaseConfig.COM_PORT : DevConfig.COM_PORT
export const WS_PORT = env => env === RELEASE ? ReleaseConfig.WS_PORT : DevConfig.WS_PORT
export const DB_NAME = env => env === RELEASE ? ReleaseConfig.DB_NAME : DevConfig.DB_NAME
export const DB_IP = env => env === RELEASE ? ReleaseConfig.DB_IP : DevConfig.DB_IP
export const DB_PORT = env => env === RELEASE ? ReleaseConfig.DB_PORT : DevConfig.DB_PORT
export const SESS_IP = env => env === RELEASE ? ReleaseConfig.SESS_IP : DevConfig.SESS_IP
export const SESS_PORT = env => env === RELEASE ? ReleaseConfig.SESS_PORT : DevConfig.SESS_PORT
export const GOOGLE_MEDIA_FOLDER = env => env === RELEASE ? ReleaseConfig.GOOGLE_MEDIA_FOLDER : DevConfig.GOOGLE_MEDIA_FOLDER
export const GOOGLE_BACKUP_FOLDER = env => env === RELEASE ? ReleaseConfig.GOOGLE_BACKUP_FOLDER : DevConfig.GOOGLE_BACKUP_FOLDER
export const GOOGLE_DB_BACKUP_FOLDER = env => env === RELEASE ? ReleaseConfig.GOOGLE_DB_BACKUP_FOLDER : DevConfig.GOOGLE_DB_BACKUP_FOLDER
export const NAS_TMP = env => env === RELEASE ? ReleaseConfig.NAS_TMP : DevConfig.NAS_TMP
export const NAS_PREFIX = env => env === RELEASE ? ReleaseConfig.NAS_PREFIX : DevConfig.NAS_PREFIX
export const HINT = env => env === RELEASE ? ReleaseConfig.HINT : DevConfig.HINT
export const AUTO_UPLOAD = env => env === RELEASE ? ReleaseConfig.AUTO_UPLOAD : DevConfig.AUTO_UPLOAD
export const AUTO_DOWNLOAD = env => env === RELEASE ? ReleaseConfig.AUTO_DOWNLOAD : DevConfig.AUTO_DOWNLOAD
export const UPDATE_STOCK = env => env === RELEASE ? ReleaseConfig.UPDATE_STOCK : DevConfig.UPDATE_STOCK
//export const UPDATE_EXTERNAL = env => env === RELEASE ? ReleaseConfig.UPDATE_EXTERNAL : DevConfig.UPDATE_EXTERNAL
export const CHECK_MEDIA = env => env === RELEASE ? ReleaseConfig.CHECK_MEDIA : DevConfig.CHECK_MEDIA
export const API_LIMIT = env => env === RELEASE ? ReleaseConfig.API_LIMIT : DevConfig.API_LIMIT
export const TORRENT_LIMIT = env => env === RELEASE ? ReleaseConfig.TORRENT_LIMIT : DevConfig.TORRENT_LIMIT
export const ZIP_LIMIT = env => env === RELEASE ? ReleaseConfig.ZIP_LIMIT : DevConfig.ZIP_LIMIT
export const MEGA_LIMIT = env => env === RELEASE ? ReleaseConfig.MEGA_LIMIT : DevConfig.MEGA_LIMIT
//export const STOCK_DATE = env => env === RELEASE ? ReleaseConfig.STOCK_DATE : DevConfig.STOCK_DATE
//export const STOCK_MODE = env => env === RELEASE ? ReleaseConfig.STOCK_MODE : DevConfig.STOCK_MODE
export const STOCK_FILTER = env => env === RELEASE ? ReleaseConfig.STOCK_FILTER : DevConfig.STOCK_FILTER
export const DB_BACKUP = env => env === RELEASE ? ReleaseConfig.DB_BACKUP : DevConfig.DB_BACKUP
export const BACKUP_PATH = env => env === RELEASE ? ReleaseConfig.BACKUP_PATH : DevConfig.BACKUP_PATH
export const CHECK_STOCK = env => env === RELEASE ? ReleaseConfig.CHECK_STOCK : DevConfig.CHECK_STOCK
export const BITFINEX_LOAN = env => env === RELEASE ? ReleaseConfig.BITFINEX_LOAN : DevConfig.BITFINEX_LOAN
export const BITFINEX_FILTER = env => env === RELEASE ? ReleaseConfig.BITFINEX_FILTER : DevConfig.BITFINEX_FILTER
export const BITFINEX_ORDER = env => env === RELEASE ? ReleaseConfig.BITFINEX_ORDER : DevConfig.BITFINEX_ORDER
export const USSE_TICKER = env => env === RELEASE ? ReleaseConfig.USSE_TICKER : DevConfig.USSE_TICKER
export const TWSE_TICKER = env => env === RELEASE ? ReleaseConfig.TWSE_TICKER : DevConfig.TWSE_TICKER