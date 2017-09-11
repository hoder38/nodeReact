'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.RANK_LIMIT = exports.CHART_LIMIT = exports.FITNESS_POINT = exports.MIME_EXT = exports.SUB_EXT = exports.TORRENT_EXT = exports.DOC_EXT = exports.MUSIC_EXT = exports.VIDEO_EXT = exports.ZIP_EXT = exports.IMAGE_EXT = exports.MEDIA_TAG = exports.API_EXPIRE = exports.MAD_INDEX = exports.BILI_INDEX = exports.KUBO_TYPE = exports.KUBO_COUNTRY = exports.BILI_TYPE = exports.TRANS_LIST_CH = exports.TRANS_LIST = exports.COMIC_LIST = exports.ANIME_LIST = exports.ADULT_LIST = exports.MUSIC_LIST = exports.MUSIC_LIST_WEB = exports.GAME_LIST_CH = exports.GAME_LIST = exports.GENRE_LIST_CH = exports.GENRE_LIST = exports.MEDIA_LIST_CH = exports.MEDIA_LIST = exports.RANK_PARENT = exports.FITNESS_PARENT = exports.STOCK_PARENT = exports.PASSWORD_PARENT = exports.ADULTONLY_PARENT = exports.STORAGE_PARENT = exports.DEFAULT_TAGS = exports.EXT_FILENAME = exports.RE_WEBURL = exports.DOC_TYPE = exports.MONTH_SHORTS = exports.MONTH_NAMES = exports.ALGORITHM = exports.STOCK_FILTER_LIMIT = exports.STOCK_INTERVAL = exports.EXTERNAL_INTERVAL = exports.MEDIA_INTERVAl = exports.DOC_INTERVAL = exports.DRIVE_INTERVAL = exports.MEGA_DURATION = exports.ZIP_DURATION = exports.TORRENT_DURATION = exports.OATH_WAITING = exports.CACHE_EXPIRE = exports.TORRENT_UPLOAD = exports.TORRENT_CONNECT = exports.DRIVE_LIMIT = exports.BOOKMARK_LIMIT = exports.RELATIVE_INTER = exports.RELATIVE_UNION = exports.RELATIVE_LIMIT = exports.MAX_RETRY = exports.QUERY_LIMIT = exports.NOISE_SIZE = exports.NOISE_TIME = exports.HANDLE_TIME = exports.UNACTIVE_HIT = exports.UNACTIVE_DAY = exports.DOCDB = exports.RANKDB = exports.FITNESSDB = exports.PASSWORDDB = exports.STOCKDB = exports.STORAGEDB = exports.USERDB = exports.DEV = exports.RELEASE = exports.STATIC_PATH = undefined;

var _path = require('path');

var STATIC_PATH = exports.STATIC_PATH = (0, _path.join)(__dirname, '../../public');

//env
var RELEASE = exports.RELEASE = 'release';
var DEV = exports.DEV = 'dev';

//db
var USERDB = exports.USERDB = 'user';
var STORAGEDB = exports.STORAGEDB = 'storage';
var STOCKDB = exports.STOCKDB = 'stock';
var PASSWORDDB = exports.PASSWORDDB = 'password';
var FITNESSDB = exports.FITNESSDB = 'fitness';
var RANKDB = exports.RANKDB = 'rank';
var DOCDB = exports.DOCDB = 'docUpdate';

//basic set
var UNACTIVE_DAY = exports.UNACTIVE_DAY = 5;
var UNACTIVE_HIT = exports.UNACTIVE_HIT = 10;
var HANDLE_TIME = exports.HANDLE_TIME = 7200;
var NOISE_TIME = exports.NOISE_TIME = 172800;
var NOISE_SIZE = exports.NOISE_SIZE = 104857600;
var QUERY_LIMIT = exports.QUERY_LIMIT = 20;
var MAX_RETRY = exports.MAX_RETRY = 10;
var RELATIVE_LIMIT = exports.RELATIVE_LIMIT = 100;
var RELATIVE_UNION = exports.RELATIVE_UNION = 2;
var RELATIVE_INTER = exports.RELATIVE_INTER = 3;
var BOOKMARK_LIMIT = exports.BOOKMARK_LIMIT = 100;
var DRIVE_LIMIT = exports.DRIVE_LIMIT = 100;
var TORRENT_CONNECT = exports.TORRENT_CONNECT = 100;
var TORRENT_UPLOAD = exports.TORRENT_UPLOAD = 5;
var CACHE_EXPIRE = exports.CACHE_EXPIRE = 86400;
var OATH_WAITING = exports.OATH_WAITING = 60;
var TORRENT_DURATION = exports.TORRENT_DURATION = 172800;
var ZIP_DURATION = exports.ZIP_DURATION = 21600;
var MEGA_DURATION = exports.MEGA_DURATION = 86400;
var DRIVE_INTERVAL = exports.DRIVE_INTERVAL = 3600;
var DOC_INTERVAL = exports.DOC_INTERVAL = 3600;
var MEDIA_INTERVAl = exports.MEDIA_INTERVAl = 7200;
var EXTERNAL_INTERVAL = exports.EXTERNAL_INTERVAL = 604800;
var STOCK_INTERVAL = exports.STOCK_INTERVAL = 172800;
var STOCK_FILTER_LIMIT = exports.STOCK_FILTER_LIMIT = 100;
var ALGORITHM = exports.ALGORITHM = 'aes-256-ctr';

var MONTH_NAMES = exports.MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var MONTH_SHORTS = exports.MONTH_SHORTS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

var DOC_TYPE = exports.DOC_TYPE = {
    am: ['bls', 'cen', 'bea', 'ism', 'cbo', 'sem', 'oec', 'dol', 'rea', 'sca', 'fed'],
    jp: ['sea'],
    tw: ['tri', 'ndc', 'sta', 'mof', 'moe', 'cbc']
};

//regex
var RE_WEBURL = exports.RE_WEBURL = new RegExp("^(url:)?" +
// protocol identifier
"(?:(?:https?|ftp)://)" +
// user:pass authentication
"(?:\\S+(?::\\S*)?@)?" + "(?:" +
// IP address exclusion
// private & local networks
"(?!(?:10|127)(?:\\.\\d{1,3}){3})" + "(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})" + "(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})" +
// IP address dotted notation octets
// excludes loopback network 0.0.0.0
// excludes reserved space >= 224.0.0.0
// excludes network & broacast addresses
// (first & last IP address of each class)
"(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])" + "(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}" + "(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))" + "|" +
// host name
'(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)' +
// domain name
'(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*' +
// TLD identifier
'(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))' + ")" +
// port number
"(?::\\d{2,5})?" +
// resource path
"(?:/\\S*)?" + "$", "i");
var EXT_FILENAME = exports.EXT_FILENAME = /(?:\.([^.]+))?$/;

var DEFAULT_TAGS = exports.DEFAULT_TAGS = ['18+', 'handlemedia', 'unactive', 'handlerecycle', 'first item', 'all item', 'important', 'no local', 'youtube video', 'youtube playlist', 'youtube music', 'youtube music playlist', 'playlist unactive', 'yify movie', 'cartoonmad comic', 'bilibili animation', 'bilibili movie', '18-', 'kubo movie', 'kubo tv series', 'kubo tv show', 'kubo animation'];

//parent list
var STORAGE_PARENT = exports.STORAGE_PARENT = [{
    name: 'command',
    tw: '指令'
}, {
    name: 'media type',
    tw: '媒體種類'
}, {
    name: 'country',
    tw: '國家'
}, {
    name: 'category',
    tw: '劇情分類'
}, {
    name: 'game_type',
    tw: '遊戲種類'
}, {
    name: 'music_style',
    tw: '曲風'
}];
var ADULTONLY_PARENT = exports.ADULTONLY_PARENT = [{
    name: 'adult_command',
    tw: '18+指令'
}, {
    name: 'adultonly_category',
    tw: '18+分類'
}, {
    name: 'av_actress',
    tw: 'AV女優'
}, {
    name: 'adultonly_producer',
    tw: '成人創作者'
}];
var PASSWORD_PARENT = exports.PASSWORD_PARENT = [{
    name: 'command',
    tw: '指令'
}, {
    name: 'category',
    tw: '功能分類'
}, {
    name: 'platform',
    tw: '平台'
}];
var STOCK_PARENT = exports.STOCK_PARENT = [{
    name: 'command',
    tw: '指令'
}, {
    name: 'country',
    tw: '國家'
}, {
    name: 'market type',
    tw: '市場種類'
}, {
    name: 'category',
    tw: '產業分類'
}];
var FITNESS_PARENT = exports.FITNESS_PARENT = [{
    name: 'command',
    tw: '指令'
}, {
    name: 'part',
    tw: '訓練部位'
}, {
    name: 'strength',
    tw: '強度'
}];
var RANK_PARENT = exports.RANK_PARENT = [{
    name: 'command',
    tw: '指令'
}];

//tag list
var MEDIA_LIST = exports.MEDIA_LIST = ['image', 'photo', 'comic', 'image book', 'video', 'movie', 'animation', 'tv show', 'audio', 'song', 'music', 'audio book', 'doc', 'book', 'novel', 'presentation', 'sheet', 'code', 'web', 'url', 'forum', 'wiki', 'zip', 'playlist'];
var MEDIA_LIST_CH = exports.MEDIA_LIST_CH = ['圖片', '相片', '漫畫', '圖片集', '影片', '電影', '動畫', '電視劇', '音頻', '歌曲', '音樂', '有聲書', '文件', '書籍', '小說', '簡報', '試算表', '程式碼', '網頁', '網址', '論壇', '維基', '壓縮檔', '播放列表'];
var GENRE_LIST = exports.GENRE_LIST = ['action', 'adventure', 'animation', 'biography', 'comedy', 'crime', 'documentary', 'drama', 'family', 'fantasy', 'film-noir', 'history', 'horror', 'music', 'musical', 'mystery', 'romance', 'sci-fi', 'sport', 'thriller', 'war', 'western'];
var GENRE_LIST_CH = exports.GENRE_LIST_CH = ['動作', '冒險', '動畫', '傳記', '喜劇', '犯罪', '記錄', '劇情', '家庭', '奇幻', '黑色電影', '歷史', '恐怖', '音樂', '音樂劇', '神祕', '浪漫', '科幻', '運動', '驚悚', '戰爭', '西部'];
var GAME_LIST = exports.GAME_LIST = ['casual', 'adventure', 'action', 'massively multiplayer', 'simulation', 'indie', 'racing', 'strategy', 'rpg', 'sport'];
var GAME_LIST_CH = exports.GAME_LIST_CH = ['休閒', '冒險', '動作', '大型多人連線', '模擬', '獨立', '競速', '策略', '角色扮演', '運動'];
var MUSIC_LIST_WEB = exports.MUSIC_LIST_WEB = ['avant-garde', 'blues', 'children\'s', 'classical', 'comedy/spoken', 'country', 'easy listening', 'electronic', 'folk', 'holiday', 'international', 'jazz', 'latin', 'new age', 'pop/rock', 'r&b', 'rap', 'reggae', 'religious', 'stage & screen', 'vocal'];
var MUSIC_LIST = exports.MUSIC_LIST = ['avant-garde', 'blues', 'children\'s', 'classical', 'comedy or spoken', 'country', 'easy listening', 'electronic', 'folk', 'holiday', 'international', 'jazz', 'latin', 'new age', 'pop or rock', 'r&b', 'rap', 'reggae', 'religious', 'stage and screen', 'vocal'];
var ADULT_LIST = exports.ADULT_LIST = ['ol', '中出', '同人誌', '多p', '多人合集', '女僕', '學生', '巨乳', '教師', '泳裝', '溫泉', '無碼', '熟女', '特殊制服', '痴女', '痴漢', '素人', '美腿', '藝能人', '護士', '野外', '風俗店', '魔物'];
var ANIME_LIST = exports.ANIME_LIST = ['動作', '奇幻', '犯罪', '運動', '恐怖', '歷史', '神祕', '冒險', '校園', '喜劇', '浪漫', '少男', '科幻', '香港', '其他'];
var COMIC_LIST = exports.COMIC_LIST = ['萌系', '喜劇', '動作', '科幻', '劇情', '犯罪', '運動', '奇幻', '神祕', '校園', '驚悚', '廚藝', '偽娘', '圖片', '冒險', '小說', '香港', '耽美', '經典', '歐美', '日文', '家庭'];
var TRANS_LIST = exports.TRANS_LIST = ['格鬥', '魔法', '偵探', '競技', '戰國', '魔幻', '搞笑', '少女', '港產', '格斗', '神鬼', '驚栗', '港漫', '親情', '臺灣', '美國', '英國', '中國'];
var TRANS_LIST_CH = exports.TRANS_LIST_CH = ['動作', '奇幻', '犯罪', '運動', '歷史', '神祕', '喜劇', '浪漫', '香港', '動作', '神祕', '驚悚', '香港', '家庭', '台灣', '歐美', '歐美', '大陸'];
var BILI_TYPE = exports.BILI_TYPE = ['大陸', '日本', '歐美', '香港', '台灣', '韓國', '法國', '泰國', '西班牙', '俄羅斯', '德國', '海外', '完結'];
var KUBO_COUNTRY = exports.KUBO_COUNTRY = ['香港', '台灣', '大陸', '日本', '韓國', '歐美', '泰國', '新馬', '印度', '海外'];

var KUBO_TYPE = exports.KUBO_TYPE = [['動作片', '喜劇片', '愛情片', '科幻片', '恐怖片', '劇情片', '戰爭片', '動畫片', '微電影'], ['台灣劇', '港劇', '大陸劇', '歐美劇', '韓劇', '日劇', '新/馬/泰/其他劇', '布袋戲'], ['綜藝', '美食旅遊', '訪談節目', '男女交友', '選秀競賽', '典禮晚會', '新聞時事', '投資理財', '歌劇戲曲'], ['動漫', '電影動畫片']];

var BILI_INDEX = exports.BILI_INDEX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16];
var MAD_INDEX = exports.MAD_INDEX = ['01', '02', '03', '04', '10', '07', '08', '09', '16', '17', '13', '14', '18', '21', '22'];

//api
var API_EXPIRE = exports.API_EXPIRE = 86400;

//media tag
var MEDIA_TAG = exports.MEDIA_TAG = {
    image: {
        def: ['圖片', 'image'],
        opt: ['相片', 'photo', '漫畫', 'comic']
    },
    zipbook: {
        def: ['圖片集', 'image book', '圖片', 'image'],
        opt: ['相片', 'photo', '漫畫', 'comic']
    },
    video: {
        def: ['影片', 'video'],
        opt: ['電影', 'movie', '動畫', 'animation', '電視劇', 'tv show']
    },
    music: {
        def: ['音頻', 'audio'],
        opt: ['歌曲', 'song', '音樂', 'music', '有聲書', 'audio book']
    },
    doc: {
        def: ['文件', 'doc'],
        opt: ['書籍', 'book', '小說', 'novel']
    },
    pdf: {
        def: ['文件', 'doc'],
        opt: ['書籍', 'book', '小說', 'novel']
    },
    present: {
        def: ['簡報', 'presentation'],
        opt: []
    },
    sheet: {
        def: ['試算表', 'sheet'],
        opt: []
    },
    rawdoc: {
        def: ['文件', 'doc'],
        opt: ['書籍', 'book', '小說', 'novel', '程式碼', 'code', '網頁', 'web']
    },
    url: {
        def: ['網址', 'url'],
        opt: ['論壇', 'forum', '維基', 'wiki']
    },
    zip: {
        def: ['壓縮檔', 'zip', '播放列表', 'playlist'],
        opt: []
    }
};

//media
var IMAGE_EXT = exports.IMAGE_EXT = ['jpg', 'gif', 'bmp', 'jpeg', 'png'];
var ZIP_EXT = exports.ZIP_EXT = ['zip', 'rar', '7z', 'cbr', 'cbz', '001'];
var VIDEO_EXT = exports.VIDEO_EXT = ['webm', 'mp4', 'mts', 'm2ts', '3gp', 'mov', 'avi', 'mpg', 'wmv', 'flv', 'f4v', 'ogv', 'asf', 'mkv', 'm4v'];
var MUSIC_EXT = exports.MUSIC_EXT = ['mp3', 'wav', 'ogg', 'm4a'];
var DOC_EXT = exports.DOC_EXT = {
    doc: ['rtf', 'txt', 'doc', 'docx', 'odt', 'htm', 'html', 'conf'],
    present: ['ppt', 'pps', 'pptx', 'odp'],
    sheet: ['xls', 'xlsx', 'xlsm', 'csv', 'ods'],
    pdf: ['pdf'],
    rawdoc: ['c', 'cc', 'cpp', 'cs', 'm', 'h', 'sh', 'csh', 'bash', 'tcsh', 'java', 'js', 'mxml', 'pl', 'pm', 'py', 'sql', 'php', 'rb', 'xhtml', 'xml', 'xsl', 'json', 'css', 'ini', 'patch', 'vim', 'eml']
};
var TORRENT_EXT = exports.TORRENT_EXT = ['torrent'];
var SUB_EXT = exports.SUB_EXT = ['srt', 'ass', 'ssa', 'vtt'];

var MIME_EXT = exports.MIME_EXT = {
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
    m4a: 'audio/mp4'
};

var FITNESS_POINT = exports.FITNESS_POINT = '598174b08bd4ed7a80e4dc80';

var CHART_LIMIT = exports.CHART_LIMIT = 4;

var RANK_LIMIT = exports.RANK_LIMIT = 10;