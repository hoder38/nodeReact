import { join as PathJoin, dirname } from 'path'
import { fileURLToPath } from 'url';
export const __dirname = dirname(fileURLToPath(import.meta.url));
export const STATIC_PATH = PathJoin(__dirname, '../../public')

//env
export const RELEASE = 'release'
export const DEV = 'dev'

//db
export const USERDB = 'user'
export const STORAGEDB = 'storage'
export const STOCKDB = 'stock'
export const PASSWORDDB = 'password'
export const FITNESSDB = 'fitness'
export const RANKDB = 'rank'
export const DOCDB = 'docUpdate'
export const VERIFYDB = 'verify'
export const LOTTERYDB = 'lottery'
export const TOTALDB = 'total'

//basic set
export const UNACTIVE_DAY = 5
export const UNACTIVE_HIT = 10
export const HANDLE_TIME = 7200
export const NOISE_TIME = 172800;
export const NOISE_SIZE = 104857600;
export const QUERY_LIMIT = 20
export const MAX_RETRY = 10
export const RELATIVE_LIMIT = 100;
export const RELATIVE_UNION = 2;
export const RELATIVE_INTER = 3;
export const BOOKMARK_LIMIT = 100;
export const DRIVE_LIMIT = 100;
export const BACKUP_LIMIT = 1000;
export const TORRENT_CONNECT = 100;
export const TORRENT_UPLOAD = 5;
export const CACHE_EXPIRE = 86400;
export const OATH_WAITING = 60;
export const TORRENT_DURATION = 172800;
export const ZIP_DURATION = 21600;
export const MEGA_DURATION = 86400;
export const DRIVE_INTERVAL = 3600;
export const DOC_INTERVAL = 3600;
export const MEDIA_INTERVAl = 7200;
export const EXTERNAL_INTERVAL = 604800;
export const STOCK_INTERVAL = 172800;
export const BACKUP_INTERVAL = 86400;
export const PRICE_INTERVAL = 600;
export const RATE_INTERVAL = 90;
export const ORDER_INTERVAL = 3600 * 6;
export const USSE_ORDER_INTERVAL = 86400;
export const TWSE_ORDER_INTERVAL = 86400;
export const STOCK_FILTER_LIMIT = 100;
export const ALGORITHM = 'aes-256-ctr';
export const KINDLE_LIMIT = 52428800;
//export const USSE_ENTER_MID = 5;
export const USSE_ENTER_MID = 100;
//export const TWSE_ENTER_MID = 5;
export const TWSE_ENTER_MID = 100;
export const USSE_MARKET_TIME = [16, 9];
export const TWSE_MARKET_TIME = [4, 21];

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORTS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DOC_TYPE = {
    am: [/*'bls', */'cen'/*, 'bea', 'ism', 'oec'*/, 'dol'/*, 'rea'*/, 'sca', 'fed', 'cbo'],
    jp: ['sea'],
    tw: ['sta', 'moe', 'cbc', 'mof'/*, 'ndc'*/],
}

//regex
export const RE_WEBURL = new RegExp(
    "^(url:)?" +
    // protocol identifier
    "(?:(?:https?|ftp)://)" +
    // user:pass authentication
    "(?:\\S+(?::\\S*)?@)?" +
    "(?:" +
    // IP address exclusion
    // private & local networks
    "(?!(?:10|127)(?:\\.\\d{1,3}){3})" +
    "(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})" +
    "(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})" +
    // IP address dotted notation octets
    // excludes loopback network 0.0.0.0
    // excludes reserved space >= 224.0.0.0
    // excludes network & broacast addresses
    // (first & last IP address of each class)
    "(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])" +
    "(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}" +
    "(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))" +
    "|" +
    // host name
    "(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)" +
    // domain name
    "(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*" +
    // TLD identifier
    "(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))" +
    ")" +
    // port number
    "(?::\\d{2,5})?" +
    // resource path
    "(?:/\\S*)?" +
    "$", "i"
)
export const EXT_FILENAME = /(?:\.([^.]+))?$/;

export const DEFAULT_TAGS = [
    '18+',
    'handlemedia',
    'unactive',
    'handlerecycle',
    'first item',
    'all item',
    'important',
    'no local',
    'youtube video',
    'youtube playlist',
    'youtube music',
    'youtube music playlist',
    'playlist unactive',
    'yify movie',
    'dm5 comic',
    'bilibili animation',
    'bilibili movie',
    '18-',
    'kubo movie',
    'kubo tv series',
    'kubo tv show',
    'kubo animation',
    'all external',
]

//parent list
export const STORAGE_PARENT = [
    {
        name: 'command',
        tw: '指令',
    },
    {
        name: 'media type',
        tw: '媒體種類',
    },
    {
        name: 'country',
        tw: '國家',
    },
    {
        name: 'category',
        tw: '劇情分類',
    },
    {
        name: 'game_type',
        tw: '遊戲種類',
    },
    {
        name: 'music_style',
        tw: '曲風',
    },
]
export const ADULTONLY_PARENT = [
    {
        name: 'adult_command',
        tw: '18+指令',
    },
    {
        name: 'adultonly_category',
        tw: '18+分類',
    },
    {
        name: 'av_actress',
        tw: 'AV女優',
    },
    {
        name: 'adultonly_producer',
        tw: '成人創作者',
    },
]
export const PASSWORD_PARENT = [
    {
        name: 'command',
        tw: '指令',
    },
    {
        name: 'category',
        tw: '功能分類',
    }, {
        name: 'platform',
        tw: '平台',
    },
]
export const STOCK_PARENT = [
    {
        name: 'command',
        tw: '指令',
    }, {
        name: 'country',
        tw: '國家',
    }, {
        name: 'market type',
        tw: '市場種類',
    }, {
        name: 'category',
        tw: '產業分類',
    },
]
export const FITNESS_PARENT = [
    {
        name: 'command',
        tw: '指令',
    },
    {
        name: 'part',
        tw: '訓練部位',
    },
    {
        name: 'strength',
        tw: '強度'
    },
]
export const RANK_PARENT = [
    {
        name: 'command',
        tw: '指令',
    },
]

//tag list
export const MEDIA_LIST = [
    'image',
    'photo',
    'comic',
    'image book',
    'video',
    'movie',
    'animation',
    'tv show',
    'audio',
    'song',
    'music',
    'audio book',
    'doc',
    'book',
    'novel',
    'presentation',
    'sheet',
    'code',
    'web',
    'url',
    'forum',
    'wiki',
    'zip',
    'playlist',
]
export const MEDIA_LIST_CH = [
    '圖片',
    '相片',
    '漫畫',
    '圖片集',
    '影片',
    '電影',
    '動畫',
    '電視劇',
    '音頻',
    '歌曲',
    '音樂',
    '有聲書',
    '文件',
    '書籍',
    '小說',
    '簡報',
    '試算表',
    '程式碼',
    '網頁',
    '網址',
    '論壇',
    '維基',
    '壓縮檔',
    '播放列表',
]
export const GENRE_LIST = [
    'action',
    'adventure',
    'animation',
    'biography',
    'comedy',
    'crime',
    'documentary',
    'drama',
    'family',
    'fantasy',
    'film-noir',
    'history',
    'horror',
    'music',
    'musical',
    'mystery',
    'romance',
    'sci-fi',
    'sport',
    'thriller',
    'war',
    'western',
]
export const GENRE_LIST_CH = [
    '動作',
    '冒險',
    '動畫',
    '傳記',
    '喜劇',
    '犯罪',
    '記錄',
    '劇情',
    '家庭',
    '奇幻',
    '黑色電影',
    '歷史',
    '恐怖',
    '音樂',
    '音樂劇',
    '神祕',
    '浪漫',
    '科幻',
    '運動',
    '驚悚',
    '戰爭',
    '西部',
]
export const GAME_LIST = [
    'casual',
    'adventure',
    'action',
    'massively multiplayer',
    'simulation',
    'indie',
    'racing',
    'strategy',
    'rpg',
    'sport',
]
export const GAME_LIST_CH = [
    '休閒',
    '冒險',
    '動作',
    '大型多人連線',
    '模擬',
    '獨立',
    '競速',
    '策略',
    '角色扮演',
    '運動',
]
export const MUSIC_LIST_WEB = [
    'avant-garde',
    'blues',
    'children\'s',
    'classical',
    'comedy/spoken',
    'country',
    'easy listening',
    'electronic',
    'folk',
    'holiday',
    'international',
    'jazz',
    'latin',
    'new age',
    'pop/rock',
    'r&b',
    'rap',
    'reggae',
    'religious',
    'stage & screen',
    'vocal',
]
export const MUSIC_LIST = [
    'avant-garde',
    'blues',
    'children\'s',
    'classical',
    'comedy or spoken',
    'country',
    'easy listening',
    'electronic',
    'folk',
    'holiday',
    'international',
    'jazz',
    'latin',
    'new age',
    'pop or rock',
    'r&b',
    'rap',
    'reggae',
    'religious',
    'stage and screen',
    'vocal',
]
export const ADULT_LIST = [
    'ol',
    '中出',
    '同人誌',
    '多p',
    '多人合集',
    '女僕',
    '學生',
    '巨乳',
    '教師',
    '泳裝',
    '溫泉',
    '無碼',
    '熟女',
    '特殊制服',
    '痴女',
    '痴漢',
    '素人',
    '美腿',
    '藝能人',
    '護士',
    '野外',
    '風俗店',
    '魔物',
]
export const ANIME_LIST = [
    '動作',
    '奇幻',
    '犯罪',
    '運動',
    '恐怖',
    '歷史',
    '神祕',
    '冒險',
    '校園',
    '喜劇',
    '浪漫',
    '少男',
    '科幻',
    '香港',
    '其他',
]

export const DM5_LIST = [
    '動作',
    '浪漫',
    '喜劇',
    '驚悚',
    '犯罪',
    '神秘',
    '戰爭',
    '奇幻',
    '冒險',
    '科幻',
    '恐怖',
    '歷史',
    '運動',
    '校園',
    '百合',
    '彩虹',
    '後宮',
    '魔法',
    '同人',
    '紳士',
    '機甲',
    '連載',
    '完結',
    '少年',
    '少女',
    '青年',
    '台灣',
    '香港',
    '日本',
    '韓國',
    '大陸',
    '中國',
    '歐美',
]
export const DM5_ORI_LIST = [
    '熱血',
    '戀愛',
    '后宮',
    '懸疑',
    '推理',
    '搞笑',
    '神鬼',
]
export const DM5_CH_LIST = [
    '動作',
    '浪漫',
    '後宮',
    '驚悚',
    '犯罪',
    '喜劇',
    '神秘',
]
export const DM5_TAG_LIST = ['31', '26', '37', '17', '33', '20', '12','14', '2', '25', '29', '4', '34', '1', '3', '27', '8', '15', '30', '36', '40'];
export const DM5_AREA_LIST = ['35', '35', '36', '36', '37', '37', '52']
export const BILI_TYPE = [
    '大陸',
    '日本',
    '歐美',
    '香港',
    '台灣',
    '韓國',
    '法國',
    '泰國',
    '西班牙',
    '俄羅斯',
    '德國',
    '海外',
    '完結',
]
export const KUBO_COUNTRY = [
    '香港',
    '台灣',
    '大陸',
    '日本',
    '韓國',
    '歐美',
    '泰國',
    '新馬',
    '印度',
    '海外',
]

export const KUBO_TYPE = [
    [
        '動作片',
        '喜劇片',
        '愛情片',
        '科幻片',
        '恐怖片',
        '劇情片',
        '戰爭片',
        '動畫片',
        '微電影',
    ], [
        '台灣劇',
        '港劇',
        '大陸劇',
        '歐美劇',
        '韓劇',
        '日劇',
        '新/馬/泰/其他劇',
        '布袋戲',
    ], [
        '綜藝',
        '美食旅遊',
        '訪談節目',
        '男女交友',
        '選秀競賽',
        '典禮晚會',
        '新聞時事',
        '投資理財',
        '歌劇戲曲',
    ], [
        '動漫',
        '電影動畫片',
    ],
]

export const BILI_INDEX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16]
export const MAD_INDEX = ['01', '02', '03', '04', '10', '07', '08', '09', '16', '17', '13', '14', '18', '21', '22']

//api
export const API_EXPIRE = 86400;

//media tag
export const MEDIA_TAG = {
    image: {
        def: [
            '圖片',
            'image',
        ],
        opt: [
            '相片',
            'photo',
            '漫畫',
            'comic',
        ],
    },
    zipbook: {
        def: [
            '圖片集',
            'image book',
            '圖片',
            'image',
        ],
        opt: [
            '相片',
            'photo',
            '漫畫',
            'comic',
        ],
    },
    video: {
        def:[
            '影片',
            'video',
        ],
        opt: [
            '電影',
            'movie',
            '動畫',
            'animation',
            '電視劇',
            'tv show',
        ],
    },
    music: {
        def: [
            '音頻',
            'audio',
        ],
        opt: [
            '歌曲',
            'song',
            '音樂',
            'music',
            '有聲書',
            'audio book',
        ],
    },
    doc: {
        def: [
            '文件',
            'doc',
        ],
        opt: [
            '書籍',
            'book',
            '小說',
            'novel',
        ],
    },
    pdf: {
        def: [
            '文件',
            'doc',
        ],
        opt: [
            '書籍',
            'book',
            '小說',
            'novel',
        ],
    },
    present: {
        def: [
            '簡報',
            'presentation',
        ],
        opt: [],
    },
    sheet: {
        def: [
            '試算表',
            'sheet',
        ],
        opt: [],
    },
    rawdoc: {
        def: [
            '文件',
            'doc',
        ],
        opt: [
            '書籍',
            'book',
            '小說',
            'novel',
            '程式碼',
            'code',
            '網頁',
            'web',
        ],
    },
    url: {
        def: [
            '網址',
            'url',
        ],
        opt: [
            '論壇',
            'forum',
            '維基',
            'wiki',
        ],
    },
    zip: {
        def: [
            '壓縮檔',
            'zip',
            '播放列表',
            'playlist',
        ],
        opt: [],
    },
}

//media
export const IMAGE_EXT = ['jpg', 'gif', 'bmp', 'jpeg', 'png']
export const ZIP_EXT = ['zip', 'rar', '7z', 'cbr', 'cbz', '001']
export const VIDEO_EXT = ['webm', 'mp4', 'mts', 'm2ts', '3gp', 'mov', 'avi', 'mpg', 'wmv', 'flv', 'f4v', 'ogv', 'asf', 'mkv', 'm4v']
export const MUSIC_EXT = ['mp3', 'wav', 'ogg', 'm4a']
export const DOC_EXT = {
    doc: ['rtf', 'txt', 'doc', 'docx', 'odt', 'htm', 'html', 'conf'],
    present: ['ppt', 'pps', 'pptx', 'odp'],
    sheet: ['xls', 'xlsx', 'xlsm', 'csv', 'ods'],
    pdf: ['pdf'],
    rawdoc: ['c', 'cc', 'cpp', 'cs', 'm', 'h', 'sh', 'csh', 'bash', 'tcsh', 'java', 'js', 'mxml', 'pl', 'pm', 'py', 'sql', 'php', 'rb', 'xhtml', 'xml', 'xsl', 'json', 'css', 'ini', 'patch', 'vim', 'eml'],
}
export const TORRENT_EXT = ['torrent']
export const SUB_EXT = ['srt', 'ass', 'ssa', 'vtt']
export const KINDLE_EXT = ['azw', 'doc', 'docx', 'pdf', 'htm', 'html', 'txt', 'rtf', 'jpg', 'jpeg', 'gif', 'png', 'bmp', 'prc', 'mobi'];

export const MIME_EXT = {
    jpg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webm: 'video/webm',
    mp4: 'video/mp4',
    mts: 'model/vnd.mts',
    m2ts: 'video/MP2T',
    '3gp': 'video/3gpp',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mpg: 'video/mpeg',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    ogv: 'video/ogg',
    asf: 'video/x-ms-asf',
    mkv: 'video/x-matroska',
    m4v: 'video/x-m4v',
    rm: 'application/vnd.rn-realmedia',
    rmvb: 'application/vnd.rn-realmedia-vbr',
    rtf: 'application/rtf',
    txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
    odt: 'application/vnd.oasis.opendocument.text',
    htm: 'text/html',
    html: 'text/html',
    conf: 'text/plain',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsm: 'application/vnd.ms-excel.sheet.macroenabled.12',
    csv: 'text/csv',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    ppt: 'application/vnd.ms-powerpoint',
    pps: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odp: 'application/vnd.oasis.opendocument.presentation',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    zip: 'application/zip',
    '7z': 'application/x-7z-compressed',
    rar: 'application/x-rar-compressed',
}

export const FITNESS_POINT = '598174b08bd4ed7a80e4dc80';

export const CHART_LIMIT = 4;

export const RANK_LIMIT = 10;

//export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send';
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const RANDOM_EMAIL = [
    {
        name: 'hoder',
        mail: 'hoder3388@gmail.com',
    },
    {
        name: 'sky',
        mail: 'skycyndi@hotmail.com',
    },
    {
        name: 'existfor',
        mail: 'existfor@gmail.com',
    },
    {
        name: '宜真',
        mail: 'angela800310@hotmail.com',
    },
    {
        name: 'Susu',
        mail: 'pink_susu1017@hotmail.com',
    },
    {
        name: '韋葶',
        mail: 'k0316gfly@gmail.com',
    },
    {
        name: 'Cindy',
        mail: 'cindywon520@gmail.com',
    },
    {
        name: '季芸',
        mail: 'f0955398009@gmail.com',
    },
];

export const STOCK_FILTER = {
    name: '檢驗',//changing to filter after fixed to reading DB
    sortName: 'name',
    sortType: 'asc',
    close: [1, '<', 5],
    twse: {
        per: [1, '<', 35],
        pdr: [1, '<', 50],
        pbr: [1, '<', 10],
        times: [1, '>', 10],
        stop: [1, '<', 4],
        //gap: [1, '>', -10],
        //profit: [1, '>', 10],
        gap: [1, '>', -20],
        profit: [1, '>', 0],
        //pp: [1, '>', 100],
        //ss: [1, '>', -500],
        //mm: [1, '>', 3],
        //pre: [1, '>', 10],
        interval: [1, '>', 700],
        vol: [1, '>', 150],
    },
    usse: {
        per: [1, '<', 70],
        //pdr: [1, '<', 50],
        pbr: [1, '<', 20],
        times: [1, '>', 10],
        stop: [1, '<', 4],
        //gap: [1, '>', -10],
        //profit: [1, '>', 20],
        gap: [1, '>', -20],
        profit: [1, '>', 5],
        //pp: [1, '>', 100],
        //ss: [1, '>', -500],
        //mm: [1, '>', 3],
        //pre: [1, '>', 10],
        interval: [1, '>', 700],
        vol: [1, '>', 200000],
    }
}

export const BACKUP_COLLECTION = [
    USERDB,
    STORAGEDB,
    STOCKDB,
    PASSWORDDB,
    DOCDB,
    `${STORAGEDB}User`,
    `${STOCKDB}User`,
    `${PASSWORDDB}User`,
]

export const BITFINEX = 'bitfinex'
export const FUSD_SYM = 'fUSD'
export const FUSDT_SYM = 'fUST'
export const FBTC_SYM = 'fBTC'
export const FETH_SYM = 'fETH'
export const FOMG_SYM = 'fOMG'
export const TBTC_SYM = 'tBTCUSD'
export const TETH_SYM = 'tETHUSD';
export const TUSDT_SYM = 'tUSTUSD';
export const TOMG_SYM = 'tOMGUSD';
export const FLTC_SYM = 'fLTC'
export const FUNI_SYM = 'fUNI'
export const FDOT_SYM = 'fDOT'
export const TLTC_SYM = 'tLTCUSD'
export const TUNI_SYM = 'tUNIUSD';
export const TDOT_SYM = 'tDOTUSD';
export const TSOL_SYM = 'tSOLUSD';
export const TADA_SYM = 'tADAUSD';
export const FSOL_SYM = 'fSOL';
export const FADA_SYM = 'fADA';
export const TXRP_SYM = 'tXRPUSD';
export const TAVAX_SYM = 'tAVAX:USD';
export const TTRX_SYM = 'tTRXUSD';
export const FXRP_SYM = 'fXRP';
export const FAVAX_SYM = 'fAVAX';
export const FTRX_SYM = 'fTRX';
export const BITFINEX_EXP = 100000000;
export const BITFINEX_MIN = 100;
export const DISTRIBUTION = [3, 10, 20, 33, 50, 67, 80, 90, 97];
export const NORMAL_DISTRIBUTION = [1, 3, 17, 50, 83, 97, 99];
export const GAIN_LOSS = 5;
export const RISK_MAX = 10;
export const OFFER_MAX = 10;
//export const COIN_MAX = -30;
export const EXTREM_RATE_NUMBER = 15;
//export const COIN_MAX_MAX = -60;
export const EXTREM_DURATION = 86400;
export const UPDATE_BOOK = 86400;
export const UPDATE_FILL_ORDER = 43200;
export const UPDATE_ORDER = 60;
export const MINIMAL_OFFER = 150;
export const BITFINEX_FEE = 0.004;
export const BITFINEX_INTERVAL = 3600 * 3;
export const RANGE_BITFINEX_INTERVAL = 259200;
export const USSE_FEE = 0.004;
export const TRADE_FEE = 0.006;
export const TRADE_INTERVAL = 86400 * 5;
export const TRADE_TIME = 86400 * 5;
export const RANGE_INTERVAL = 7776000;
export const API_WAIT = 5;
//export const MINIMAL_DS_RATE = 0.05;
export const SUPPORT_COIN = [FUSD_SYM, FUSDT_SYM, FBTC_SYM, FETH_SYM, FLTC_SYM/*, FOMG_SYM*/, FDOT_SYM, FSOL_SYM, FADA_SYM, FXRP_SYM, FTRX_SYM, FAVAX_SYM, FUNI_SYM];
export const SUPPORT_PRICE = [TUSDT_SYM, TBTC_SYM, TETH_SYM, TLTC_SYM, TOMG_SYM, TDOT_SYM, TSOL_SYM, TADA_SYM, TXRP_SYM, TTRX_SYM, TAVAX_SYM, TUNI_SYM];
export const SUPPORT_PAIR = {
    fUSD: [TBTC_SYM, TETH_SYM, TLTC_SYM/*, TOMG_SYM*/, TDOT_SYM, TSOL_SYM, TADA_SYM, TXRP_SYM, TTRX_SYM, TAVAX_SYM, TUNI_SYM],
}
export const SUPPORT_LEVERAGE = {
    tETHUSD: 5,
    tBTCUSD: 10,
    tLTCUSD: 5,
    //tOMGUSD: 3.3,
    tDOTUSD: 3.3,
    tSOLUSD: 3.3,
    tADAUSD: 3.3,
    tXRPUSD: 5,
    "tAVAX:USD": 3.3,
    tTRXUSD: 3.3,
    tUNIUSD: 3.3,
}
export const MAX_RATE = 7000000;
export const BITNIFEX_PARENT = [
    {
        name: 'all',
        show: '全部',
    },
    {
        name: 'usd',
        show: 'USD',
    },
    {
        name: 'ust',
        show: 'UST',
    },
    {
        name: 'btc',
        show: 'BTC',
    },
    {
        name: 'eth',
        show: 'ETH',
    },
    {
        name: 'ltc',
        show: 'LTC',
    },
    {
        name: 'omg',
        show: 'OMG',
    },
    {
        name: 'dot',
        show: 'DOT',
    },
    {
        name: 'sol',
        show: 'SOL',
    },
    {
        name: 'ada',
        show: 'ADA',
    },
    {
        name: 'xrp',
        show: 'XRP',
    },
    {
        name: 'trx',
        show: 'TRX',
    },
    {
        name: 'avax',
        show: 'AVAX',
    },
    {
        name: 'uni',
        show: 'UNI',
    },
    {
        name: 'wallet',
        show: '錢包',
    },
    {
        name: 'rate',
        show: '利率',
    },
    {
        name: 'offer',
        show: '掛單',
    },
    {
        name: 'credit',
        show: '放款',
    },
    {
        name: 'payment',
        show: '利息收入',
    },
];

export const STOCK_INDEX = {
    twse: [
        {
            name: '元大台灣卓越50證券投資信託基金',
            tag: ['元大台灣卓越50證券投資信託基金', '0050', 'tw50'],
        },
        /*{
            name: '元大台灣高股息證券投資信託基金',
            tag: ['元大台灣高股息證券投資信託基金', '0056', 'twhigh'],
        },*/
        {
            name: '元大台灣中型100證券投資信託基金',
            tag: ['元大台灣中型100證券投資信託基金', '0051', 'tw100'],
        },
    ],
}

export const TWSE_NUM = 40;
export const USSE_NUM = 60;

//export const TD_AUTH_URL = 'https://auth.tdameritrade.com/auth?';
export const TD_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize?'
//export const TD_TOKEN_URL = 'https://api.tdameritrade.com/v1/oauth2/token';
export const TD_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';

export const BEST_TRACKER_LIST = [
    'http://1337.abcvg.info:80/announce',
    'http://bt.okmp3.ru:2710/announce',
    'http://ipv6.rer.lol:6969/announce',
    'http://jvavav.com:80/announce',
    'http://nyaa.tracker.wf:7777/announce',
    'http://t.nyaatracker.com:80/announce',
    'http://taciturn-shadow.spb.ru:6969/announce',
    'http://tk.greedland.net:80/announce',
    'http://torrentsmd.com:8080/announce',
    'http://tracker.bt4g.com:2095/announce',
    'http://tracker.electro-torrent.pl:80/announce',
    'http://tracker.files.fm:6969/announce',
    'http://tracker.tfile.co:80/announce',
    'http://www.all4nothin.net:80/announce.php',
    'http://www.wareztorrent.com:80/announce',
    'https://1337.abcvg.info:443/announce',
    'https://pybittrack.retiolus.net:443/announce',
    'https://torrent.tracker.durukanbal.com:443/announce',
    'https://tr.burnabyhighstar.com:443/announce',
    'https://tracker.gcrenwp.top:443/announce',
    'https://tracker.kuroy.me:443/announce',
    'https://tracker.lilithraws.org:443/announce',
    'https://tracker.tamersunion.org:443/announce',
    'https://tracker.yemekyedim.com:443/announce',
    'https://tracker1.520.jp:443/announce',
    'https://trackers.mlsub.net:443/announce',
    'udp://bandito.byterunner.io:6969/announce',
    'udp://bt1.archive.org:6969/announce',
    'udp://d40969.acod.regrucolo.ru:6969/announce',
    'udp://ec2-18-191-163-220.us-east-2.compute.amazonaws.com:6969/announce',
    'udp://evan.im:6969/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://martin-gebhardt.eu:25/announce',
    'udp://moonburrow.club:6969/announce',
    'udp://new-line.net:6969/announce',
    'udp://odd-hd.fr:6969/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://open.dstud.io:6969/announce',
    'udp://open.stealth.si:80/announce',
    'udp://open.tracker.ink:6969/announce',
    'udp://opentor.org:2710/announce',
    'udp://opentracker.io:6969/announce',
    'udp://p4p.arenabg.com:1337/announce',
    'udp://retracker.hotplug.ru:2710/announce',
    'udp://retracker01-msk-virt.corbina.net:80/announce',
    'udp://run.publictracker.xyz:6969/announce',
    'udp://seedpeer.net:6969/announce',
    'udp://serpb.vpsburti.com:6969/announce',
    'udp://thetracker.org:80/announce',
    'udp://tr4ck3r.duckdns.org:6969/announce',
    'udp://trackarr.org:6969/announce',
    'udp://tracker.0x7c0.com:6969/announce',
    'udp://tracker.birkenwald.de:6969/announce',
    'udp://tracker.ccp.ovh:6969/announce',
    'udp://tracker.cloaka.xyz:1337/announce',
    'udp://tracker.cyberia.is:6969/announce',
    'udp://tracker.darkness.services:6969/announce',
    'udp://tracker.dler.com:6969/announce',
    'udp://tracker.dler.org:6969/announce',
    'udp://tracker.doko.moe:6969/announce',
    'udp://tracker.fnix.net:6969/announce',
    'udp://tracker.gmi.gd:6969/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://tracker.skyts.net:6969/announce',
    'udp://tracker.srv00.com:6969/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.tryhackx.org:6969/announce',
    'udp://tracker.waaa.moe:6969/announce',
    'udp://tracker1.bt.moack.co.kr:80/announce',
    'udp://tracker2.dler.org:80/announce',
    'udp://tracker2.itzmx.com:6961/announce',
    'udp://tracker3.itzmx.com:6961/announce',
    'udp://ttk2.nbaonlineservice.com:6969/announce',
    'udp://wepzone.net:6969/announce',
    'udp://z.mercax.com:53/announce',
    'wss://tracker.openwebtorrent.com:443/announce',
];
