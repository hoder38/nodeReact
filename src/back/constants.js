import { join as PathJoin } from 'path'
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
export const STOCK_FILTER_LIMIT = 100;
export const ALGORITHM = 'aes-256-ctr';
export const KINDLE_LIMIT = 52428800

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORTS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DOC_TYPE = {
    am: ['bls', 'cen', 'bea', 'ism', 'cbo', 'sem', 'oec', 'dol', 'rea', 'sca', 'fed'],
    jp: ['sea'],
    tw: ['ndc', 'sta', 'mof', 'moe', 'cbc'],
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

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/youtube https://mail.google.com/ https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send';

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
    sortType: 'desc',
    per: [1, '<', 15],
    yieldNumber: [1, '<', 50],
    pp: [1, '>', 100],
    ss: [1, '>', -500],
    mm: [1, '>', 3],
    pre: [1, '>', 10],
    interval: [1, '>', 700],
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