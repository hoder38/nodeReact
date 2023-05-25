import { GENRE_LIST, GENRE_LIST_CH, DM5_ORI_LIST, DM5_CH_LIST, GAME_LIST, GAME_LIST_CH, MUSIC_LIST, MUSIC_LIST_WEB, CACHE_EXPIRE, STORAGEDB, MONTH_NAMES, MONTH_SHORTS, DOCDB, KUBO_TYPE } from '../constants.js'
import OpenCC from 'node-opencc'
import Htmlparser from 'htmlparser2'
import pathModule from 'path'
const { dirname: PathDirname, extname: PathExtname, join: PathJoin } = pathModule;
import youtubeDl from 'youtube-dl'
const { getInfo: YouGetInfo} = youtubeDl;
import Mkdirp from 'mkdirp'
import fsModule from 'fs'
const { existsSync: FsExistsSync } = fsModule;
import Redis from '../models/redis-tool.js'
import GoogleApi from '../models/api-tool-google.js'
import { normalize, isDefaultTag } from '../models/tag-tool.js'
import Mongo, { objectID } from '../models/mongo-tool.js'
import { handleError, HoError, toValidName, isValidString, getJson, completeZero, getFileLocation, findTag, addPre } from '../util/utility.js'
import { addPost } from '../util/mime.js'
import Api from './api-tool.js'
//import { JuicyCodes, kuboInfo, jwplayer } from '../util/kubo.js'
import sendWs from '../util/sendWs.js'

/*const dramaList = [
    'https://tw02.lovetvshow.info/',
    'https://cn.lovetvshow.info/2012/05/drama-list.html',
    'https://kr19.vslovetv.com/',
    'https://jp04.jplovetv.com/2012/08/drama-list.html',
    'https://www.lovetvshow.com/',
    'https://krsp01.vslovetv.com/',
];

const recur_loveList = (dramaIndex, next) => Api('url', dramaList[dramaIndex]).then(raw_data => {
    let list = [];
    let year = null;
    if (dramaIndex === 4) {
        year = '台灣';
    }
    const top = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0];
    if (dramaIndex === 0 || dramaIndex === 2 || dramaIndex === 5) {
        const krscript = findTag(findTag(findTag(findTag(findTag(findTag(findTag(top, 'div', 'column-right-outer')[0], 'div', 'column-right-inner')[0], 'aside')[0], 'div', 'sidebar-right-1')[0], 'div', 'Label1')[0], 'div', 'widget-content list-label-widget-content')[0], 'script')[0].children[0].data;
        const urlList = krscript.match(/https?\:\/\/[^\']+/g);
        krscript.match(/var OldLabel = \"[^\"]+/g).forEach((n, i) => {
            const krst = n.match(/(?:Pre)?(\d\d\d\d)(?:韓國|台灣)電視劇\-(.*)$/);
            if (krst) {
                if (krst[1].match(/�/)) {
                    return true;
                }
                list.push({
                    name: krst[2],
                    url: urlList[i],
                    year: krst[1],
                });
            }
        });
    } else {
        const main = findTag(findTag(findTag(top, 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0];
        let table = null;
        let table2 = null;
        if (dramaIndex === 4) {
            const tables = findTag(findTag(findTag(main, 'div', 'widget HTML')[0], 'div', 'widget-content')[0], 'table');
            table = tables[1];
            table2 = tables[2];
        } else {
            table = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(main, 'div', 'widget Blog')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer')[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0], 'table')[0];
            const tbody = findTag(table, 'tbody')[0];
            if (tbody) {
                table = tbody;
            }
        }
        const getList = table => table.children.forEach(t => findTag(t, 'td').forEach(d => {
            const h = findTag(d, 'h3')[0];
            if (h) {
                const a = findTag(h, 'a')[0];
                if (a) {
                    const name = findTag(a)[0];
                    if (name) {
                        if (name.match(/�/)) {
                            return true;
                        }
                        const dramaType = (dramaIndex === 4) ? null : findTag(h)[0];
                        if (year) {
                            const url = (dramaIndex === 0) ? addPre(a.attribs.href, 'https://tw01.lovetvshow.info') : (dramaIndex === 1) ? addPre(a.attribs.href, 'https://cn.lovetvshow.info') : (dramaIndex === 2) ? addPre(a.attribs.href, 'https://vslovetv.com') : (dramaIndex === 3) ? addPre(a.attribs.href, 'https://jp.jplovetv.com') : addPre(a.attribs.href, 'https://www.lovetvshow.com');
                            list.push(Object.assign({
                                name,
                                url: `${url}?max-results=300`,
                                year,
                            }, dramaType ? {type: dramaType.match(/^\(([^\)]+)/)[1]} : {}));
                        }
                        return true;
                    }
                }
                const getY = node => {
                    if (dramaIndex === 4) {
                        const y = findTag(node)[0].match(/^(大陸綜藝節目)?(韓國綜藝節目)?/);
                        if (y) {
                            if (y[1]) {
                                year = '大陸';
                            } else if (y[2]) {
                                year = '韓國';
                            }
                        }
                    } else {
                        const y = findTag(node)[0].match(/^(Pre-)?\d+/);
                        if (y) {
                            year = y[0];
                        }
                    }
                }
                const s = findTag(h, 'span')[0];
                if (s) {
                    getY(s);
                } else {
                    const f = findTag(h, 'font')[0];
                    if (f) {
                        getY(f);
                    } else {
                        const strong = findTag(h, 'strong')[0];
                        if (strong) {
                            const span = findTag(strong, 'span')[0];
                            if (span) {
                                getY(span);
                            } else {
                                const font = findTag(strong, 'font')[0];
                                if (font) {
                                    getY(font);
                                }
                            }
                        }
                    }
                }
            }
        }));
        getList(table);
        if (table2) {
            getList(table2);
        }
    }
    console.log(list.length);
    return next(0, dramaIndex, list);
});*/

export default {
    //type要補到deltag裡
    /*getList: function(type, is_clear=false) {
        const clearExtenal = () => is_clear ? Mongo('deleteMany', STORAGEDB, {owner: type}).then(item => {
            console.log('perm external file');
            console.log(item);
        }) : Promise.resolve();
        switch (type) {
            case 'lovetv':
            const recur_loveSave = (index, dramaIndex, list) => {
                const external_item = list[index];
                let name = toValidName(external_item.name);
                if (isDefaultTag(normalize(name))) {
                    name = addPost(name, '1');
                }
                return Mongo('count', STORAGEDB, {
                    owner: type,
                    name,
                }).then(count => {
                    if (count > 0) {
                        return nextLove(index + 1, dramaIndex, list);
                    }
                    let setTag = new Set(['tv show', '電視劇', '影片', 'video']);
                    if (dramaIndex === 0){
                        setTag.add('台灣').add('臺灣');
                    } else if (dramaIndex === 1) {
                        setTag.add('大陸').add('中國');
                    } else if (dramaIndex === 2) {
                        setTag.add('韓國');
                    } else if (dramaIndex === 3) {
                        setTag.add('日本');
                    } else if (dramaIndex === 4) {
                        setTag.add('綜藝節目');
                    }
                    setTag.add(normalize(name)).add(normalize(type));
                    if (external_item.type) {
                        setTag.add(normalize(external_item.type));
                    }
                    setTag.add(normalize(external_item.year));
                    if (normalize(external_item.year) === '台灣') {
                        setTag.add('臺灣');
                    } else if (normalize(external_item.year) === '大陸') {
                        setTag.add('中國');
                    }
                    let setArr = [];
                    let adultonly = 0;
                    setTag.forEach(s => {
                        const is_d = isDefaultTag(s);
                        if (!is_d) {
                            setArr.push(s);
                        } else if (is_d.index === 0) {
                            adultonly = 1;
                        }
                    });
                    const url = isValidString(external_item.url, 'url');
                    if (!url) {
                        return handleError(new HoError('url is not vaild'));
                    }
                    return Mongo('insert', STORAGEDB, {
                        _id: objectID(),
                        name,
                        owner: type,
                        utime: Math.round(new Date().getTime() / 1000),
                        url,
                        size: 0,
                        count: 0,
                        first: 1,
                        recycle: 0,
                        adultonly,
                        untag: 0,
                        status: 3,
                        tags: setArr,
                        thumb: 'love-thumb-md.png',
                        [type]: setArr,
                    }).then(item => {
                        console.log('lovetv save');
                        console.log(item[0].name);
                        sendWs(`love: ${item[0].name}`, 0, 0, true);
                        return nextLove(index + 1, dramaIndex, list);
                    });
                });
            }
            function nextLove(index, dramaIndex, list) {
                if (index < list.length) {
                    return recur_loveSave(index, dramaIndex, list);
                } else {
                    dramaIndex++;
                    if (dramaIndex < dramaList.length) {
                        return recur_loveList(dramaIndex, nextLove);
                    }
                }
                return Promise.resolve();
            }
            return clearExtenal().then(() => recur_loveList(0, nextLove));
            case 'eztv':
            const recur_eztvSave = (index, list) => {
                const external_item = list[index];
                let name = toValidName(external_item.name);
                if (isDefaultTag(normalize(name))) {
                    name = addPost(name, '1');
                }
                return Mongo('count', STORAGEDB, {
                    owner: type,
                    name,
                }).then(count => {
                    if (count > 0) {
                        return nextEztv(index + 1, list);
                    }
                    const url = isValidString(external_item.url, 'url');
                    if (!url) {
                        return handleError(new HoError('url is not vaild'));
                    }
                    return Api('url', external_item.url, {referer: 'https://eztv.ag/'}).then(raw_data => {
                        const tables = findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'div')[6], 'table');
                        const info = tables[1] ? findTag(findTag(tables[1], 'tr')[1], 'td')[0] : findTag(findTag(findTag(findTag(findTag(findTag(tables[0], 'tr')[1], 'td')[0], 'center')[0], 'table', 'section_thread_post show_info_description')[0], 'tr')[1], 'td')[0];
                        let setTag = new Set(['tv show', '電視劇', '歐美', '西洋', '影片', 'video']);
                        findTag(info).forEach(n => {
                            let infoMatch = false;
                            if (infoMatch = n.match(/\d+$/)) {
                                setTag.add(infoMatch[0]);
                            } else if (infoMatch = n.match(/^Genre:(.*)$/i)) {
                                const genre = infoMatch[1].match(/([a-zA-Z\-]+)/g);
                                if (genre) {
                                    genre.map(g => setTag.add(normalize(g)));
                                }
                            } else if (infoMatch = n.match(/^Network:(.*)$/i)) {
                                const network = infoMatch[1].match(/[a-zA-Z\-]+/);
                                if (network) {
                                    setTag.add(normalize(network[0]));
                                }
                            }
                        });
                        const show_name = external_item.url.match(/\/shows\/\d+\/([^\/]+)/);
                        if (show_name) {
                            setTag.add(normalize(show_name[1].replace(/\-/g, ' ')));
                        }
                        findTag(info, 'a').forEach(a => {
                            const imdb = a.attribs.href.match(/(https|http):\/\/www\.imdb\.com\/title\/(tt\d+)\//);
                            if (imdb) {
                                setTag.add(normalize(imdb[2]));
                            }
                        });
                        let setArr = [];
                        let adultonly = 0;
                        setTag.forEach(s => {
                            const is_d = isDefaultTag(s);
                            if (!is_d) {
                                setArr.push(s);
                            } else if (is_d.index === 0) {
                                adultonly = 1;
                            }
                        });
                        return Mongo('insert', STORAGEDB, {
                            _id: objectID(),
                            name,
                            owner: type,
                            utime: Math.round(new Date().getTime() / 1000),
                            url,
                            size: 0,
                            count: 0,
                            first: 1,
                            recycle: 0,
                            adultonly,
                            untag: 0,
                            status: 3,
                            tags: setArr,
                            thumb: 'eztv-logo-small.png',
                            [type]: setArr,
                        }).then(item => {
                            console.log('eztvtv save');
                            console.log(item[0].name);
                            sendWs(`eztvtv: ${item[0].name}`, 0, 0, true);
                            return nextEztv(index + 1, list);
                        });
                    });
                });
            }
            const eztvList = () => Api('url', 'https://eztv.ag/showlist/', {referer: 'https://eztv.ag/'}).then(raw_data => {
                let list = [];
                findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'table', 'forum_header_border')[1], 'tr').forEach(t => {
                    const d = findTag(t, 'td', 'forum_thread_post')[0];
                    if (d) {
                        const a = findTag(d, 'a')[0];
                        const name = findTag(a)[0];
                        if (name !== 'Dark Mon£y') {
                            list.push({
                                name,
                                url: addPre(a.attribs.href, 'https://eztv.ag'),
                            });
                        }
                    }
                });
                console.log(list.length);
                return nextEztv(0, list);
            });
            function nextEztv(index, list) {
                if (index < list.length) {
                    return recur_eztvSave(index, list);
                }
                return Promise.resolve();
            }
            return clearExtenal().then(() => eztvList());
            default:
            return handleError(new HoError('unknown external type'));
        }
    },*/
    getSingleList: function(type, url, post=null) {
        if (!url) {
            return Promise.resolve([]);
        }
        switch (type) {
            case 'yify':
            return Api('url', url, {
                referer: 'https://yts.ag/',
                is_json: true,
            }).then(raw_data => {
                if (raw_data['status'] !== 'ok' || !raw_data['data']) {
                    return handleError(new HoError('yify api fail'));
                }
                return raw_data['data']['movies'] ? raw_data['data']['movies'].map(m => {
                    let tags = new Set(['movie', '電影']);
                    tags.add(m['year'].toString());
                    if (m['genres']) {
                        m['genres'].forEach(g => {
                            const genre_item = normalize(g);
                            if (GENRE_LIST.includes(genre_item)) {
                                tags.add(genre_item).add(GENRE_LIST_CH[GENRE_LIST.indexOf(genre_item)]);
                            }
                        });
                    }
                    return {
                        name: m['title'],
                        id: m['id'],
                        thumb: m['small_cover_image'],
                        date: m['year'] + '-01-01',
                        rating: m['rating'],
                        tags: [...tags]
                    };
                }) : [];
            });
            case 'bilibili':
            if (url.match(/(https|http):\/\/www\.bilibili\.com\/list\//)) {
                return Api('url', url, {referer: 'http://www.bilibili.com/'}).then(raw_data => findTag(Htmlparser.parseDOM(raw_data)[1], 'li').map(v => {
                    const a = findTag(findTag(v.children[1], 'div', 'l-l')[0], 'a')[0];
                    const img = findTag(a, 'img')[0];
                    return {
                        id: a.attribs.href.match(/av\d+/)[0],
                        //name: OpenCC.simplifiedToTraditional(img.attribs.alt),
                        name: img.attribs.alt,
                        thumb: img.attribs['data-img'],
                        date: new Date('1970-01-01').getTime()/1000,
                        tags: ['movie', '電影'],
                        //count: OpenCC.simplifiedToTraditional(findTag(findTag(findTag(findTag(v.children[1], 'div', 'l-r')[0], 'div', 'v-info')[0], 'span', 'v-info-i gk')[0], 'span')[0].attribs.number),
                        count: findTag(findTag(findTag(findTag(v.children[1], 'div', 'l-r')[0], 'div', 'v-info')[0], 'span', 'v-info-i gk')[0], 'span')[0].attribs.number,
                    }
                }));
            } else if (url.match(/(https|http):\/\/www\.bilibili\.com\//)) {
                return Api('url', url, {
                    referer: 'http://www.bilibili.com/',
                    is_json: true,
                }).then(raw_data => {
                    if (!raw_data || raw_data['message'] !== 'success' || !raw_data['result'] || !raw_data['result']['list']) {
                        console.log(raw_data);
                        return handleError(new HoError('bilibili api fail'));
                    }
                    return raw_data['result']['list'].map(l => ({
                        id: l['season_id'],
                        //name: OpenCC.simplifiedToTraditional(l['title']),
                        name: l['title'],
                        thumb: l['cover'],
                        date: l['pub_time'],
                        count: 0,
                        tags: ['animation', '動畫'],
                    }));
                });
            } else {
                return Api('url', url, {
                    referer: 'http://www.bilibili.com/',
                    is_json: true,
                }).then(json_data => {
                    if (!json_data || (json_data.code !== 0 && json_data.code !== 1)) {
                        console.log(json_data);
                        return handleError(new HoError('bilibili api fail'));
                    }
                    let list = [];
                    if (json_data['html']) {
                        const dom = Htmlparser.parseDOM(json_data['html']);
                        list = findTag(dom, 'li', 'video matrix ').map(v => {
                            const a = findTag(v, 'a')[0];
                            return {
                                id: a.attribs.href.match(/av\d+/)[0],
                                //name: OpenCC.simplifiedToTraditional(a.attribs.title),
                                name: a.attribs.title,
                                thumb: `http:${findTag(findTag(a, 'div', 'img')[0], 'img')[0].attribs['data-src']}`,
                                date: new Date('1970-01-01').getTime() / 1000,
                                tags: ['movie', '電影'],
                                //count: OpenCC.simplifiedToTraditional(findTag(findTag(findTag(findTag(v, 'div', 'info')[0], 'div', 'tags')[0], 'span', 'so-icon watch-num')[0])[0]),
                                count: findTag(findTag(findTag(findTag(v, 'div', 'info')[0], 'div', 'tags')[0], 'span', 'so-icon watch-num')[0])[0],
                            };
                        });
                        if (list.length < 1) {
                            list = findTag(dom, 'li', 'synthetical').map(v => {
                                const a = findTag(v, 'div', 'left-img')[0].children[1];
                                return {
                                    id: a.attribs.href.match(/\/anime\/(\d+)/)[1],
                                    //name: OpenCC.simplifiedToTraditional(a.attribs.title),
                                    name: a.attribs.title,
                                    thumb: `http:${findTag(a, 'img')[0].attribs['data-src']}`,
                                    date: new Date('1970-01-01').getTime() / 1000,
                                    tags: ['animation', '動畫'],
                                    count: 0,
                                };
                            });
                        }
                    }
                    return list;
                });
            }
            case 'kubo':
            return Api('url', url, {referer: 'http://www.99kubo.tv/',}).then(raw_data => {
                const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                const main = findTag(body, 'div', 'main')[0];
                if (main) {
                    const type_id = url.match(/vod-search-id-(\d+)/);
                    if (!type_id) {
                        return handleError(new HoError('unknown kubo type'));
                    }
                    return findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'list')[0], 'div', 'listlf')[0], 'ul')[0], 'li').map(l => {
                        const a = findTag(l, 'a')[0];
                        const img = findTag(a, 'img')[0];
                        let tags = new Set();
                        if (type_id[1] === '1') {
                            tags = new Set(['電影', 'movie']);
                        } else if (type_id[1] === '3') {
                            tags = new Set(['動畫', 'animation']);
                        } else {
                            tags = new Set(['電視劇', 'tv show']);
                            if (type_id[1] === '41') {
                                tags.add('綜藝節目');
                            }
                        }
                        let count = 0;
                        let date = '1970-01-01';
                        findTag(l, 'p').forEach(p => {
                            const t = findTag(p)[0];
                            if (t) {
                                if (t === '主演：') {
                                    findTag(p, 'a').forEach(b => tags.add(findTag(b)[0]));
                                } else {
                                    let match = t.match(/^地區\/年份：([^\/]+)\/(\d+)$/);
                                    if (match) {
                                        tags.add(match[1]).add(match[2]);
                                    } else {
                                        match = t.match(/^月熱度：(\d+)/);
                                        if (match) {
                                            count = Number(match[1]);
                                        } else {
                                            match = t.match(/^更新：(\d\d\d\d\-\d\d\-\d\d)/);
                                            if (match) {
                                                date = match[1];
                                            }
                                        }
                                    }
                                }
                            }
                        });
                        return {
                            //name: OpenCC.simplifiedToTraditional(img.attribs.alt),
                            name: img.attribs.alt,
                            id: a.attribs.href.match(/\d+/)[0],
                            thumb: img.attribs['data-original'],
                            tags,
                            count,
                            date,
                        };
                    });
                } else {
                    return findTag(findTag(findTag(findTag(findTag(findTag(findTag(body, 'div')[0], 'div', 'wrapper_wrapper')[0], 'div', 'container')[0], 'div', 'content_left')[0], 'div', 'ires')[0], 'ol')[0], 'li', 'g').map(g => {
                        const tr = findTag(findTag(g, 'table')[0], 'tr')[0];
                        const a = findTag(findTag(findTag(tr, 'td')[0], 'div')[0], 'a')[0];
                        const td = findTag(tr, 'td')[1];
                        const a1 = findTag(findTag(td, 'h3')[0], 'a')[0];
                        let name = '';
                        a1.children.forEach(c => {
                            if (c.data) {
                                name = `${name}${c.data}`;
                            } else {
                                const t = findTag(c)[0];
                                name = t ? `${name}${t}` : `${name}${findTag(findTag(c, 'font')[0])[0]}`;
                            }
                        });
                        name = name.match(/^(.*)-([^\-]+)?$/);
                        let count = 0;
                        let date = '1970-01-01';
                        let tags = new Set();
                        if (name[2]) {
                            tags.add(normalize(name[2]));
                            for (let i in KUBO_TYPE) {
                                const index = KUBO_TYPE[i].indexOf(name[2]);
                                if (index !== -1) {
                                    if (i === '0') {
                                        tags.add('movie').add('電影');
                                        switch (index) {
                                            case 0:
                                            tags.add('action').add('動作');
                                            break;
                                            case 1:
                                            tags.add('comedy').add('喜劇');
                                            break;
                                            case 2:
                                            tags.add('romance').add('浪漫');
                                            break;
                                            case 3:
                                            tags.add('sci-fi').add('科幻');
                                            break;
                                            case 4:
                                            tags.add('horror').add('恐怖');
                                            break;
                                            case 5:
                                            tags.add('drama').add('劇情');
                                            break;
                                            case 6:
                                            tags.add('war').add('戰爭');
                                            break;
                                            case 7:
                                            tags.add('animation').add('動畫');
                                            break;
                                        }
                                    } else if (i === '1') {
                                        tags.add('tv show').add('電視劇');
                                    } else if (i === '2') {
                                        tags.add('tv show').add('電視劇').add('綜藝節目');
                                    } else if (i === '3') {
                                        tags.add('animation').add('動畫');
                                    }
                                    break;
                                }
                            }
                        }
                        const div = findTag(td, 'div')[0];
                        const span = findTag(findTag(div, 'div', 'kv')[0], 'span')[0];
                        for (let t of findTag(span)) {
                            const match = t.match(/月熱度:(\d+)/);
                            if (match) {
                                count = Number(match[1]);
                                break;
                            }
                        }
                        findTag(span, 'a').forEach(s => {
                            if (findTag(s)[0]) {
                                tags.add(normalize(findTag(s)[0]));
                            }
                        });
                        findTag(div, 'div', 'osl').forEach(o => {
                            const ot = findTag(o)[0];
                            if (ot) {
                                const matcho = ot.match(/别名:(.*)/);
                                if (matcho) {
                                    tags.add(normalize(matcho[1]));
                                }
                            }
                            findTag(o, 'a').forEach(s => {
                                const st = findTag(s)[0];
                                if (st) {
                                    tags.add(normalize(findTag(s)[0]));
                                }
                            });
                        });
                        const cite = findTag(span, 'cite')[0];
                        if (cite) {
                            const matchDate = findTag(cite)[0].match(/(\d\d\d\d)年(\d\d)月(\d\d)日/);
                            if (matchDate) {
                                date = `${matchDate[1]}-${matchDate[2]}-${matchDate[3]}`;
                            }
                        }
                        return {
                            id: a.attribs.href.match(/\d+/)[0],
                            //name: OpenCC.simplifiedToTraditional(name[1]),
                            name: name[1],
                            thumb: findTag(a, 'img')[0].attribs.src,
                            date,
                            tags,
                            count,
                        }
                    });
                }
            });
            /*return Api('url', url, {referer: 'http://www.99kubo.tv/',}).then(raw_data => {
                const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                if (body.attribs.class === 'vod-type') {
                    const type_id = url.match(/list-select-id-(\d+)/);
                    if (!type_id) {
                        return handleError(new HoError('unknown kubo type'));
                    }
                    return findTag(findTag(findTag(body, 'div', 'container ff-bg')[1], 'ul')[0], 'li').map(l => {
                        const a = findTag(findTag(l, 'h2')[0], 'a')[0];
                        const img = findTag(findTag(findTag(l, 'p')[0], 'a')[0], 'img')[0];
                        let tags = new Set();
                        if (type_id[1] === '1') {
                            tags = new Set(['電影', 'movie']);
                        } else if (type_id[1] === '3') {
                            tags = new Set(['動畫', 'animation']);
                        } else {
                            tags = new Set(['電視劇', 'tv show']);
                            if (type_id[1] === '41') {
                                tags.add('綜藝節目');
                            }
                        }
                        let count = 0;
                        let date = '1970-01-01';
                        findTag(findTag(l, 'h4')[0], 'a').forEach(a => {
                            const tag = findTag(a)[0];
                            if (tag !== '內詳') {
                                tags.add(tag)
                            }
                        });
                        return {
                            name: findTag(a)[0],
                            id: a.attribs.href.match(/\d+/)[0],
                            thumb: img.attribs['data-original'],
                            tags,
                            count,
                            date,
                        };
                    });
                } else {
                    return findTag(findTag(findTag(findTag(findTag(body, 'div', 'container ff-bg')[0], 'div', 'row ff-row')[0], 'div', 'col-md-10')[0], 'ul')[0], 'li').map(l => {
                        const img = findTag(findTag(findTag(findTag(findTag(l, 'dl')[0], 'dt')[0], 'p', 'image')[0], 'a')[0], 'img')[0];
                        const dd = findTag(findTag(l, 'dl')[0], 'dd')[0];
                        const a = findTag(findTag(dd, 'h3')[0], 'a')[0];
                        let count = 0;
                        let date = '1970-01-01';
                        let tags = new Set();
                        findTag(dd, 'p').forEach(p => {
                            findTag(p).forEach((g, i) => {
                                if (g.includes('地區/年份')) {
                                    findTag(findTag(p, 'span')[i])[0].split('/').forEach(t => tags.add(t));
                                } else if (g.includes('演員') || g.includes('導演')) {
                                    findTag(findTag(p, 'span')[i], 'a').forEach(t => {
                                        if (findTag(t)[0]) {
                                            tags.add(findTag(t)[0])
                                        }
                                    });
                                } else if (g.includes('更新時間')) {
                                    const match = findTag(findTag(p, 'span')[i])[0].match(/^\d\d\d\d\/\d\d\/\d\d/);
                                    if (match) {
                                        date = match[0];
                                    }
                                }
                            });
                        });
                        return {
                            id: a.attribs.href.match(/\d+/)[0],
                            name: findTag(a)[0],
                            thumb: img.attribs['data-original'],
                            date,
                            tags,
                            count,
                        }
                    });
                }
            });*/
            case 'dm5':
            return Api('url', url, {
                referer: 'http://www.dm5.com/',
                post,
                is_dm5: true,
            }).then(raw_data => {
                let list = [];
                const data = Htmlparser.parseDOM(raw_data);
                if (findTag(data, 'html').length > 0) {
                    findTag(findTag(findTag(findTag(findTag(findTag(data, 'html')[0], 'body')[0], 'section', 'box container pb40 overflow-Show')[0], 'div', 'box-body')[0], 'ul', 'mh-list col7')[0], 'li').forEach(l => {
                        const a = findTag(findTag(findTag(findTag(l, 'div', 'mh-item')[0], 'div', 'mh-tip-wrap')[0], 'div', 'mh-item-tip')[0], 'a')[0];
                        list.push({
                            id: a.attribs.href.match(/\/([^\/]+)/)[1],
                            //name: OpenCC.simplifiedToTraditional(a.attribs.title),
                            name: a.attribs.title,
                            thumb: findTag(findTag(l, 'div', 'mh-item')[0], 'p', 'mh-cover')[0].attribs.style.match(/url\(([^\)]+)/)[1],
                            tags: ['漫畫', 'comic'],
                        });
                    });
                } else {
                    data.forEach(l => {
                        let name = '';
                        findTag(findTag(l, 'p')[0], 'span')[0].children.forEach(s => {
                            if (s.name === 'span') {
                                name = `${name}${findTag(s)[0]}`;
                            } else if (s.type === 'text') {
                                name = `${name}${s.data}`;
                            }
                        })
                        list.push({
                            id: l.attribs.href.match(/\/([^\/]+)/)[1],
                            //name: OpenCC.simplifiedToTraditional(findTag(findTag(findTag(l, 'p')[0], 'span')[0])[0]),
                            name,
                            thumb: 'dm5.png',
                            tags: ['漫畫', 'comic'],
                        });
                    });
                }
                return list;
            });
            case 'bls':
            return Api('url', 'https://www.bls.gov/bls/newsrels.htm#latest-releases', { agent: {}}).then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${completeZero(date.getMonth() + 1, 2)}/${completeZero(date.getDate(), 2)}/${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'section')[0], 'div', 'wrapper-outer')[0], 'div', 'wrapper')[0], 'div', 'container')[0], 'div', 'main-content-full-width')[0], 'div', 'bodytext')[0], 'div', 'bls')[0], 'ul')[0], 'li').forEach(l => {
                    if (findTag(l)[0] === docDate) {
                        const a = findTag(l, 'a')[0];
                        list.push({
                            url: addPre(a.attribs.href, 'https://www.bls.gov'),
                            name: toValidName(findTag(a)[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'cen':
            return Api('url', 'https://www.census.gov/economic-indicators/').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'section', 'container')[0], 'section')[0], 'article').forEach(r => {
                    const mv = findTag(findTag(findTag(r, 'div', 'header')[0], 'h3')[0])[0].match(/([a-zA-Z]+ \d\d?)[a-zA-Z]+, (\d\d\d\d)/);
                    if (mv && mv[1] === docDate && mv[2] === `${date.getFullYear()}`) {
                        list.push({
                            url: addPre(findTag(findTag(findTag(findTag(findTag(r, 'div', 'button')[0], 'div', 'dropdown')[0], 'div')[0], 'div', 'pdf')[0], 'a')[0].attribs.href, 'http://www.census.gov'),
                            name: toValidName(findTag(findTag(findTag(findTag(r, 'div', 'header')[0], 'h2')[0], 'a')[0])[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'bea':
            return Api('url', 'https://www.bea.gov/news/current-releases').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                const trs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'div')[0], 'div', 'row')[0], 'section')[0], 'div', 'region region-content')[0], 'div')[0], 'div')[0], 'div', 'view-content')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr');
                for (let tr of trs) {
                    const vs = findTag(findTag(tr, 'td')[1]);
                    for (let v of vs) {
                        const mv = v.match(/^[a-zA-Z]+ \d\d?, \d\d\d\d/);
                        if (mv && mv[0] === docDate) {
                            const a = findTag(findTag(tr, 'td')[0], 'a')[0];
                            list.push({
                                url: addPre(a.attribs.href, 'http://www.bea.gov'),
                                name: toValidName(findTag(a)[0]),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                            break;
                        }
                    }
                }
                return list;
            });
            case 'ism':
            return Api('url', 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/', {cookie: 'HttpOnly;Path=/;Domain=www.ismworld.org;sso-check=true'}).then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                if (date.getDate() === 27) {
                    findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'rootOfObserver')[0], 'main')[0], 'div', 'component')[1], 'div', 'container')[0], 'div', 'cardCollection')[0], 'div', 'row justify-content-center')[0], 'div', 'col-md-4 card__col').forEach((c, i) => {
                        findTag(findTag(findTag(findTag(findTag(findTag(c, 'div', 'card')[0], 'div', 'card__content')[0], 'div', 'card__text')[0], 'center')[0], 'p')[0], 'a').forEach(a => {
                            list.push({
                                url: addPre(a.attribs.href, 'https://www.ismworld.org'),
                                name: (i === 0) ? toValidName('Manufacturing ISM') : toValidName('Non-Manufacturing ISM'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        })
                    });
                }
                return list;
            });
            case 'cbo':
            return Api('url', 'https://www.conference-board.org/data/consumerconfidence.cfm').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                let docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                if (body) {
                    const con = findTag(body, 'div', 'container-fluid fixedheader')[0];
                    if (con) {
                        const pdate = findTag(findTag(findTag(findTag(con, 'div', 'mainContainer')[0], 'div', 'chConferences')[0], 'div')[2], 'div')[0];
                        if (findTag(pdate, 'p', 'date')[0] && findTag(findTag(pdate, 'p', 'date')[0])[0].includes(docDate)) {
                            list.push({
                                url: 'https://www.conference-board.org/data/consumerconfidence.cfm',
                                name: toValidName('Consumer Confidence Survey'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        } else if (findTag(findTag(pdate, 'div', 'chConferences')[0], 'p', 'date')[0] && findTag(findTag(findTag(pdate, 'div', 'chConferences')[0], 'p', 'date')[0])[0].includes(docDate)) {
                            list.push({
                                url: 'https://www.conference-board.org/data/consumerconfidence.cfm',
                                name: toValidName('Consumer Confidence Survey'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                    }
                }
                return Api('url', 'https://www.conference-board.org/data/bcicountry.cfm?cid=1').then(raw_data => {
                    docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                    console.log(docDate);
                    const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                    if (body) {
                        const con = findTag(body, 'div', 'container-fluid fixedheader')[0];
                        if (con) {
                            const pdate = findTag(findTag(findTag(findTag(con, 'div', 'mainContainer')[0], 'div', 'chConferences')[0], 'div')[2], 'div')[0];
                            if (findTag(pdate, 'p', 'date')[0] && findTag(findTag(pdate, 'p', 'date')[0])[0].includes(docDate)) {
                                list.push({
                                    url: 'https://www.conference-board.org/data/bcicountry.cfm?cid=1',
                                    name: toValidName('US Business Cycle Indicators'),
                                    date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                                });
                            } else if (findTag(findTag(pdate, 'div', 'chConferences')[0], 'p', 'date')[0] &&findTag(findTag(findTag(pdate, 'div', 'chConferences')[0], 'p', 'date')[0])[0].includes(docDate)) {
                                list.push({
                                    url: 'https://www.conference-board.org/data/bcicountry.cfm?cid=1',
                                    name: toValidName('US Business Cycle Indicators'),
                                    date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                                });
                            }
                        }
                    }
                    return list;
                });
            });
            case 'sem':
            return Api('url', 'https://www.semi.org/en/news-resources/press/semi/rss.xml').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${completeZero(date.getDate(), 2)} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'rss')[0], 'channel')[0], 'item').forEach(e => {
                    if (findTag(findTag(e, 'pubdate')[0])[0].match(/^[a-zA-Z]+, (\d\d [a-zA-Z]+ \d\d\d\d)/)[1] === docDate) {
                        list.push({
                            url: addPre(findTag(e)[0], 'http://www.semi.org'),
                            name: toValidName(findTag(findTag(e, 'title')[0])[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'oec':
            return Api('url', 'https://www.oecd.org/newsroom/', {referer: 'https://www.oecd.org/newsroom/'}).then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'section container')[0], 'div', 'row')[0], 'div', 'col-sm-9 leftnav-content-wrapper')[0], 'div', 'newsroom-lists')[0], 'div', 'news-col block')[1], 'ul', 'block-list')[0], 'li', 'news-event-item linked ').forEach(l => {
                    if (findTag(findTag(l, 'p')[0])[0] === docDate) {
                        list.push({
                            url: addPre(findTag(l, 'a')[0].attribs.href, 'http://www.oecd.org'),
                            name: toValidName(findTag(findTag(l, 'span')[0])[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'dol':
            return Api('url', 'https://www.dol.gov/newsroom/releases').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                let divs = null;
                const typeDiv = findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'dialog-off-canvas-main-canvas')[0], 'div')[0], 'main')[0], 'div', 'layout-content')[0];
                if (typeDiv) {
                    divs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(typeDiv, 'div', 'block-opa-theme-content')[0], 'article')[0], 'div')[0], 'div')[0], 'div', 'layout__region layout__region--second')[0], 'div', 'homepage-block homepage-news-block')[0], 'div', 'views-element-container')[0], 'div')[0], 'div');
                } else {
                    divs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'dialog-off-canvas-main-canvas')[0], 'div')[0], 'main')[0], 'div', 'layout-content inner-content-page')[0], 'div', 'block-opa-theme-content')[0], 'div', 'views-element-container')[0], 'div')[0], 'div');
                };
                for (let i in divs) {
                    if (typeDiv) {
                        const a = findTag(findTag(divs[i], 'div')[0], 'a')[0];
                        const div = findTag(findTag(a, 'div')[0], 'div')[0];
                        if (findTag(findTag(findTag(div, 'h3')[0], 'span')[0])[0] === 'Unemployment Insurance Weekly Claims Report' && findTag(findTag(div, 'p')[0])[0].match(/[a-zA-Z]+ \d+, \d\d\d\d$/)[0] === docDate) {
                            list.push({
                                url: addPre(a.attribs.href.trim(), 'https://www.dol.gov'),
                                name: toValidName('Unemployment Insurance Weekly Claims Report'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                    } else {
                        const div = findTag(findTag(findTag(divs[i], 'div', 'image-left-teaser')[0], 'div', 'row dol-feed-block')[0], 'div', 'left-teaser-text')[0];
                        const a = findTag(div, 'a')[0];
                        if (a && findTag(findTag(findTag(a, 'h3')[0], 'span')[0])[0] === 'Unemployment Insurance Weekly Claims Report' && findTag(findTag(div, 'p')[0])[0].match(/[a-zA-Z]+ \d+, \d\d\d\d$/)[0] === docDate) {
                            list.push({
                                url: addPre(a.attribs.href.trim(), 'https://www.dol.gov'),
                                name: toValidName('Unemployment Insurance Weekly Claims Report'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                    }
                }
                return list;
            });
            case 'rea':
            return Api('url', 'https://www.nar.realtor/newsroom').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
                console.log(docDate);
                let list = [];
                let layout = findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'page-wrapper')[0], 'main')[0], 'div', 'content-push push')[0], 'div', 'layout-constrain')[0];
                if (findTag(layout, 'div', 'content-layout-wrapper-wide')[0]) {
                    layout = findTag(findTag(layout, 'div', 'content-layout-wrapper-wide')[0], 'div', 'content-layout-wrapper')[0];
                }
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(layout, 'div', 'region-content')[0], 'div', 'layout-content-aside has-aside')[0], 'div', 'secondary-content')[0], 'div', 'pane-node-field-below-paragraph pane pane--nodefield-below-paragraph')[0], 'div', 'pane__content')[0], 'div', 'field field--below-paragraph')[0], 'div', 'field-items')[0], 'div', 'field-item even')[0], 'div')[0], 'div', 'layout--flex-grid layout--fg-9-3')[0], 'div', 'flex-column')[0], 'div')[0], 'div', 'field field--search-query')[0], 'div', 'field-items')[0], 'div', 'field-item even')[0], 'div', 'field_search_query_content_list')[0], 'div').forEach(d => {
                    const content =  findTag(findTag(d, 'article')[0], 'div', 'card-view__content')[0];
                    if (findTag(findTag(findTag(findTag(content, 'div', 'card-view__footer')[0], 'div', 'node__date')[0], 'span')[0])[0] === docDate) {
                        const a = findTag(findTag(findTag(content, 'div', 'card-view__header')[0], 'h3', 'card-view__title')[0], 'a')[0];
                        list.push({
                            url: addPre(a.attribs.href, 'https://www.nar.realtor'),
                            name: toValidName(findTag(a)[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'sca':
            return Api('url', 'http://www.sca.isr.umich.edu/').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                if (date.getDate() === 15 || date.getDate() === 28) {
                    list.push({
                        url: 'http://www.sca.isr.umich.edu/',
                        name: toValidName('Michigan Consumer Sentiment Index'),
                        date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                    });
                }
                return list;
            });
            case 'fed':
            return Api('url', 'http://www.federalreserve.gov/feeds/speeches_and_testimony.xml').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                let docDate = `${date.getFullYear()}${completeZero(date.getMonth() + 1, 2)}${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'rss')[0], 'channel')[0], 'item').forEach(t => {
                    const link = findTag(t)[0];
                    if (link.match(/\d\d\d\d\d\d\d\d/)[0] === docDate) {
                        list.push({
                            url: addPre(link, 'http://www.federalreserve.gov'),
                            name: toValidName(findTag(findTag(t, 'title')[0])[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return Api('url', 'https://www.federalreserve.gov/releases/g17/Current/default.htm').then(raw_data => {
                    docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                    console.log(docDate);
                    const content = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0];
                    if (findTag(findTag(content, 'div', 'dates')[0])[0].match(/[a-zA-Z]+ \d\d?, \d\d\d\d$/)[0] === docDate) {
                        const as = findTag(findTag(findTag(content, 'h3')[0], 'span')[0], 'a');
                        for (let i of as) {
                            if (findTag(i)[0].match(/pdf/i)) {
                                list.push({
                                    url: addPre(i.attribs.href, 'https://www.federalreserve.gov/releases/g17/Current'),
                                    name: toValidName('INDUSTRIAL PRODUCTION AND CAPACITY UTILIZATION'),
                                    date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                                });
                            }
                        }
                    }
                    return Api('url', 'https://www.federalreserve.gov/releases/g19/Current/default.htm').then(raw_data => {
                        let body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                        body = body ? body : findTag(Htmlparser.parseDOM(raw_data), 'body')[0];
                        if (findTag(findTag(findTag(body, 'div', 'content')[0], 'div', 'dates')[0])[1].match(/[a-zA-Z]+ \d\d?, \d\d\d\d$/)[0] === docDate) {
                            list.push({
                                url: 'https://www.federalreserve.gov/releases/g19/Current/default.htm',
                                name: toValidName('Consumer Credit'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                        return list;
                    });
                });
            });
            case 'sea':
            return Api('url', 'https://www.seaj.or.jp/english/statistics/index.html').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'pagecontent')[0], 'div', 'row column-content')[0], 'main', 'col-md-9 order-md-last')[0], 'section')[1], 'section')[0], 'div', 'table-responsive')[0], 'table')[0], 'tbody')[0], 'tr').forEach(t => {
                    if (findTag(findTag(t, 'td')[2])[0] === docDate) {
                        let urlS = findTag(findTag(t, 'td')[1], 'a')[0].attribs.href;
                        urlS = urlS.match(/^(http|https):\/\//) ? urlS : `http://${PathJoin('www.seaj.or.jp/english/statistics', urlS)}`;
                        list.push({
                            url: urlS,
                            name: toValidName(`${findTag(findTag(t, 'td')[0])[0]} ${findTag(findTag(t, 'td')[0])[1]}`),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'tri':
            return Api('url', 'http://www.tri.org.tw').then(raw_data => {
                const date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                const docDate = `${date.getFullYear() - 1911}.${date.getMonth() + 1}.${date.getDate()}`;
                console.log(docDate);
                let list = [];
                const a = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'content')[0], 'div', 'content01')[0], 'div', 'content02L')[0], 'div', 'content01LText')[0], 'div')[1], 'div', 'consumerText')[0], 'a')[0];
                if (findTag(a)[0].match(/\d\d\d\.\d\d?\.\d\d?/)[0] === docDate) {
                    list.push({
                        url: addPre(a.attribs.href, 'http://www.tri.org.tw'),
                        name: toValidName('消費者信心指數調查報告'),
                        date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                    });
                }
                return list;
            });
            case 'ndc':
            return Api('url', 'https://index.ndc.gov.tw/n/json/data/news', {
                post: {},
                referer: 'https://index.ndc.gov.tw/n/zh_tw/data/news',
            }).then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                const json_data = getJson(raw_data);
                if (json_data === false) {
                    return handleError(new HoError('json parse error!!!'));
                }
                for (let i of json_data) {
                    if (i.date === docDate) {
                        const list_match = i.content.match(/href="([^"]+pdf)".*?title="(.*?\d\d\d\d?年\d\d?月[^"]+)/g);
                        if (list_match) {
                            for (let j of list_match) {
                                const item_match = j.match(/href="([^"]+pdf)".*?title="(.*?\d\d\d\d?年\d\d?月[^"]+)/);
                                if (item_match) {
                                    list.push({
                                        url: addPre(item_match[1], 'http://index.ndc.gov.tw').replace(/&amp;/g, '&'),
                                        name: toValidName(item_match[2]),
                                        date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                                    });
                                }
                            }
                        }
                    }
                }
                return list;
            });
            case 'sta':
            return Api('url', 'https://www.stat.gov.tw/News.aspx?n=3703&sms=10980').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear() - 1911}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'div', 'group sys-root')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-wrapper')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'base-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-page-area')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-section')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group page-content ')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'area-table rwd-straight')[0], 'div')[0], 'div')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr').forEach(t => {
                    if (findTag(findTag(findTag(t, 'td')[1], 'span')[0])[0] === docDate) {
                        const a = findTag(findTag(findTag(t, 'td')[0], 'span')[0], 'a')[0];
                        const staname = findTag(a)[0];
                        if (staname.match(/消費者物價指數/)) {
                            list.push({
                                url: addPre(a.attribs.href, 'https://www.stat.gov.tw'),
                                name: toValidName('物價指數'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                        if (staname.match(/經濟成長率/)) {
                            list.push({
                                url: addPre(a.attribs.href, 'https://www.stat.gov.tw'),
                                name: toValidName('經濟成長率'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                        if (staname.match(/工業及服務業受僱員工人/)) {
                            list.push({
                                url: addPre(a.attribs.href, 'https://www.stat.gov.tw'),
                                name: toValidName('受僱員工薪資與生產力'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                        if (staname.match(/失業人數/)) {
                            list.push({
                                url: addPre(a.attribs.href, 'https://www.stat.gov.tw'),
                                name: toValidName('失業率'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                    }
                });
                return list;
            });
            case 'mof':
            return Api('url', 'https://www.mof.gov.tw/multiplehtml/384fb3077bb349ea973e7fc6f13b6974').then(raw_data => {
                const date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                const application = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'function-cabinet')[0], 'div', 'container')[0], 'div', 'row')[0], 'div', 'left-content')[0], 'div', 'left-content-text')[0], 'div', ' paging-content')[0], 'div', 'application')[0];
                if (application) {
                    for (let l of findTag(findTag(findTag(application, 'table')[0], 'tbody')[0], 'tr')) {
                        if (findTag(findTag(findTag(l, 'td')[2], 'span')[0])[0] === docDate) {
                            const a = findTag(findTag(findTag(l, 'td')[1], 'span')[0], 'a')[0];
                            const name = findTag(a)[0];
                            if (name.match(/海關進出口貿易/)) {
                                list.push({
                                    url: addPre(a.attribs.href, 'https://www.mof.gov.tw'),
                                    name: toValidName(name),
                                    date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                                });
                                break;
                            }
                        }
                    }
                }
                return list;
            });
            case 'moe':
            return Api('url', 'https://www.stat.gov.tw/News.aspx?n=3635&sms=10980&_CSN=132').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear() - 1911}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'div', 'group sys-root')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-wrapper')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'base-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-page-area')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-section')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group page-content ')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'area-table rwd-straight')[0], 'div')[0], 'div')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr').forEach(t => {
                    if (findTag(findTag(findTag(t, 'td')[1], 'span')[0])[0] === docDate) {
                        const a = findTag(findTag(findTag(t, 'td')[0], 'span')[0], 'a')[0];
                        const staname = findTag(a)[0];
                        list.push({
                            url: addPre(a.attribs.href, 'https://www.stat.gov.tw'),
                            name: toValidName('工業生產'),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return Api('url', 'https://www.stat.gov.tw/News.aspx?n=3635&sms=10980&_CSN=124').then(raw_data => {
                    findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'div', 'group sys-root')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-wrapper')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'base-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-page-area')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-section')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group page-content ')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'area-table rwd-straight')[0], 'div')[0], 'div')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr').forEach(t => {
                        if (findTag(findTag(findTag(t, 'td')[1], 'span')[0])[0] === docDate) {
                            const a = findTag(findTag(findTag(t, 'td')[0], 'span')[0], 'a')[0];
                            const staname = findTag(a)[0];
                            list.push({
                                url: addPre(a.attribs.href, 'https://www.stat.gov.tw'),
                                name: toValidName('外銷訂單統計'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                    });
                    return list;
                });
            });
            case 'cbc':
            return Api('url', 'https://www.cbc.gov.tw/tw/sp-news-list-1.html').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    return handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper')[0],'div', 'center')[0], 'div', 'container')[0], 'section', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li').forEach(l => {
                    if (findTag(findTag(l, 'time')[0])[0] === docDate) {
                        const a = findTag(l, 'a')[0];
                        list.push({
                            url: addPre(a.attribs.href, 'https://www.cbc.gov.tw/tw'),
                            name: toValidName(a.attribs.title),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            default:
            return handleError(new HoError('unknown external type'));
        }
    },
    save2Drive: function(type, obj, parent) {
        const mkFolder = folderPath => !FsExistsSync(folderPath) ? Mkdirp(folderPath) : Promise.resolve();
        const filePath = getFileLocation(type, objectID());
        console.log(filePath);
        let driveName = '';
        switch (type) {
            case 'bls':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                const divs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper-basic')[0], 'div', 'main-content')[0], 'div', 'bodytext')[0], 'div', 'highlight-box-green')[0], 'div')
                for (let d of divs) {
                    const a = findTag(findTag(d, 'span')[0], 'a')[0];
                    if (findTag(a)[0].match(/PDF version/)) {
                        const url = addPre(a.attribs.href, 'https://www.bls.gov');
                        driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                        console.log(driveName);
                        return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath,
                            parent,
                            rest: () => updateDocDate(type, obj.date),
                            errhandle: err => handleError(err),
                        })));
                    }
                }
            });
            case 'cen':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}${PathExtname(obj.url)}`;
            console.log(driveName);
            return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath}).then(() => GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                filePath,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            })));
            case 'bea':
            console.log(obj);
            const ext1 = PathExtname(obj.url);
            if (ext1 === '.pdf') {
                driveName = `${obj.name} ${obj.date}${ext1}`;
                console.log(driveName);
                return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath}).then(() => GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    filePath,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => handleError(err),
                })));
            }
            return Api('url', obj.url).then(raw_data => {
                const hs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'div')[0], 'div', 'row')[0], 'div', 'test')[0], 'div', 'region region-content')[0], 'article')[0], 'div', 'row')[0], 'div', 'container')[0], 'div', 'tab-content')[0], 'div', 'menu1')[0], 'div', 'row')[0], 'div')[0], 'h3');
                for (let h of hs) {
                    const a = findTag(h, 'a')[0];
                    const tex = findTag(a)[0] ? findTag(a)[0] : findTag(findTag(a, 'div')[0])[0];
                    if (tex.match(/^Full Release/)) {
                        const url = addPre(a.attribs.href, 'http://www.bea.gov');
                        driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                        console.log(driveName);
                        return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath,
                            parent,
                            rest: () => updateDocDate(type, obj.date),
                            errhandle: err => handleError(err),
                        })));
                    }
                }
            });
            case 'ism':
            console.log(obj);
            if (obj.url.match(/\.pdf$/)) {
                driveName = `${obj.name} ${obj.date}.pdf`;
                console.log(driveName);
                return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath}).then(() => GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    filePath,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => handleError(err),
                })));
            } else {
                driveName = `${obj.name} ${obj.date}.txt`;
                console.log(driveName);
                return GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    body: obj.url,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => handleError(err),
                });
            }
            case 'cbo':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}.txt`;
            console.log(driveName);
            return GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                body: obj.url,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            });
            case 'sem':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}.txt`;
            console.log(driveName);
            return GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                body: obj.url,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            });
            case 'oec':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                for (let p of findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'section container')[0], 'div', 'row')[0], 'div', 'col-sm-9 leftnav-content-wrapper')[0], 'div', 'doc-type-container')[0], 'div', 'block')[0], 'div', 'webEditContent')[0], 'p')) {
                    const s = findTag(p, 'strong')[0];
                    if (s) {
                        let a = findTag(s, 'a')[0];
                        if (!a) {
                            const ss = findTag(s, 'strong')[0];
                            if (ss) {
                                a = findTag(ss, 'a')[0];
                            }
                        }
                        if (a) {
                            if (findTag(a)[0].match(/pdf/i)) {
                                const url = addPre(a.attribs.href, 'http://www.oecd.org');
                                driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                                console.log(driveName);
                                return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                                    type: 'auto',
                                    name: driveName,
                                    filePath,
                                    parent,
                                    rest: () => updateDocDate(type, obj.date),
                                    errhandle: err => handleError(err),
                                })));
                            }
                        }
                    }
                }
            });
            case 'dol':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}.pdf`;
            console.log(driveName);
            return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath}).then(() => GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                filePath,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            })));
            case 'rea':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}.txt`;
            console.log(driveName);
            return GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                body: obj.url,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            });
            case 'sca':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}.txt`;
            console.log(driveName);
            return GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                body: obj.url,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            });
            case 'fed':
            console.log(obj);
            const ext = PathExtname(obj.url);
            if (ext === '.pdf') {
                driveName = `${obj.name} ${obj.date}${ext}`;
                console.log(driveName);
                return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath}).then(() => GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    filePath,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => handleError(err),
                })));
            }
            return Api('url', obj.url).then(raw_data => {
                const match = obj.url.match(/^https\:\/\/www\.federalreserve\.gov\/releases\/(g\d+)\/current\//i);
                if (match) {
                    const url = `${match[0]}${match[1]}.pdf`;
                    driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                    console.log(driveName);
                    return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                        type: 'auto',
                        name: driveName,
                        filePath,
                        parent,
                        rest: () => updateDocDate(type, obj.date),
                        errhandle: err => handleError(err),
                    })));
                } else {
                    const share = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'row')[0], 'div', 'page-header')[0], 'div', 'header-group')[0], 'div', 'shareDL')[0];
                    if (share) {
                        const a = findTag(share, 'a')[0];
                        if (findTag(findTag(a, 'span')[1])[0].match(/pdf/i)) {
                            const url = addPre(a.attribs.href, 'https://www.federalreserve.gov');
                            driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                            console.log(driveName);
                            return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                                type: 'auto',
                                name: driveName,
                                filePath,
                                parent,
                                rest: () => updateDocDate(type, obj.date),
                                errhandle: err => handleError(err),
                            })));
                        }
                    }
                }
                driveName = `${obj.name} ${obj.date}.txt`;
                console.log(driveName);
                return GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    body: obj.url,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => handleError(err),
                });
            });
            case 'sea':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}.pdf`;
            console.log(driveName);
            return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath}).then(() => GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                filePath,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            })));
            case 'tri':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => Api('url', addPre(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'content')[0], 'div', 'content01')[0], 'div', 'content02L')[0], 'div', 'content01LText')[0], 'div')[0], 'table', 'text6')[0], 'tr')[1], 'td')[1], 'a')[0].attribs.href, 'http://www.tri.org.tw/page')).then(raw_data => {
                const url = addPre(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'content')[0], 'div', 'content01')[0], 'div', 'content02L')[0], 'div', 'content02LText')[0], 'div')[0], 'table', 'text6')[0], 'tr')[4], 'td')[0], 'a')[0].attribs.href, 'http://www.tri.org.tw');
                driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                console.log(driveName);
                return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    filePath,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => handleError(err),
                })));
            }));
            case 'ndc':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}${PathExtname(obj.url)}`;
            console.log(driveName);
            return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath}).then(() => GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                filePath,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            })));
            case 'sta':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'div', 'group sys-root')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-wrapper')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'base-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-page-area')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-section')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group page-content ')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'area-essay page-caption-p')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'p')[0], 'p')[0], 'span')[0], 'p').forEach(p => {
                    for (let a of findTag(p, 'a')) {
                        if (a.attribs.href.match(/\.pdf$/i)) {
                            const url = addPre(a.attribs.href, 'https://www.stat.gov.tw');
                            if (url.match(/87231699T64V6LTY/)) {
                                continue;
                            }
                            driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                            console.log(driveName);
                            return mkFolder(PathDirname(filePath)).then(() => Api('url', encodeURI(url), {filePath}).then(() => GoogleApi('upload', {
                                type: 'auto',
                                name: driveName,
                                filePath,
                                parent,
                                rest: () => updateDocDate(type, obj.date),
                                errhandle: err => handleError(err),
                            })));
                        }
                    }
                    for (let b of findTag(p, 'b')) {
                        for (let a of findTag(b, 'a')) {
                            console.log(a.attribs.href);
                            if (a.attribs.href.match(/\.pdf$/i)) {
                                const url = addPre(a.attribs.href, 'https://www.stat.gov.tw');
                                if (url.match(/87231699T64V6LTY/)) {
                                    continue;
                                }
                                driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                                console.log(driveName);
                                return mkFolder(PathDirname(filePath)).then(() => Api('url', encodeURI(url), {filePath}).then(() => GoogleApi('upload', {
                                    type: 'auto',
                                    name: driveName,
                                    filePath,
                                    parent,
                                    rest: () => updateDocDate(type, obj.date),
                                    errhandle: err => handleError(err),
                                })));
                            }
                        }
                    }
                });
            });
            case 'mof':
            console.log(obj);
            return Api('url', obj.url, {referer: 'https://www.mof.gov.tw/'}).then(raw_data => {
                const ps = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'function-cabinet')[0], 'div', 'container')[0], 'div', 'row')[0], 'div', 'left-content')[0], 'div', 'left-content-text')[0], 'div')[1], 'article')[0], 'p');
                for (let p of ps) {
                    const pc = findTag(p)[0];
                    if (pc && pc.match(/本文及附表/)) {
                        const url = addPre(findTag(findTag(findTag(findTag(p, 'span')[0], 'strong')[0], 'span')[0], 'a')[0].attribs.href, 'https://www.mof.gov.tw');
                        driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                        console.log(driveName);
                        return mkFolder(PathDirname(filePath)).then(() => Api('url', encodeURI(url), {filePath}).then(() => GoogleApi('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath,
                            parent,
                            rest: () => updateDocDate(type, obj.date),
                            errhandle: err => handleError(err),
                        })));
                    } else {
                        const sp = findTag(p, 'span')[0];
                        if (sp) {
                            const pcsp = findTag(sp)[0];
                            if (pcsp && pcsp.match(/本文及附表/)) {
                                const a = findTag(findTag(sp, 'strong')[0], 'a')[0];
                                const url = a ? addPre(a.attribs.href, 'https://www.mof.gov.tw') : addPre(findTag(findTag(findTag(findTag(sp, 'span')[0], 'strong')[0], 'span')[0], 'a')[0].attribs.href, 'https://www.mof.gov.tw');
                                driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                                console.log(driveName);
                                return mkFolder(PathDirname(filePath)).then(() => Api('url', encodeURI(url), {filePath}).then(() => GoogleApi('upload', {
                                    type: 'auto',
                                    name: driveName,
                                    filePath,
                                    parent,
                                    rest: () => updateDocDate(type, obj.date),
                                    errhandle: err => handleError(err),
                                })));
                            }
                        }
                    }
                };
            });
            case 'moe':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                const files = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'form1')[0], 'main')[0], 'div', 'Float_layer')[0], 'div', 'divContent')[0], 'div', 'divContainer')[0], 'div', 'divDetail')[0], 'div', 'divRightContent')[0], 'div', 'div_Content')[0], 'div', 'news-detail-backcolor')[0], 'div', 'container')[0], 'div', 'divPageDetail_Content')[0], 'div')[0], 'div', 'div-flex-info')[0], 'div', 'div-right-info')[0], 'div')[0], 'div')[0], 'div');
                for (let f of files) {
                    const a = findTag(findTag(findTag(findTag(f, 'div')[1], 'div')[0], 'div')[0], 'a')[0];
                    if (a.attribs.title.match(/新聞稿及全部附表.*pdf/)) {
                        let url = a.attribs.href;
                        url = url.match(/^(http|https):\/\//) ? url : `http://${PathJoin('www.moea.gov.tw/MNS/populace/news', url)}`;
                        driveName = `${obj.name} ${obj.date}.pdf`;
                        console.log(driveName);
                        return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath,
                            parent,
                            rest: () => updateDocDate(type, obj.date),
                            errhandle: err => handleError(err),
                        })));
                    }
                }
            });
            case 'cbc':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                const download = findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper')[0], 'div', 'center')[0], 'div', 'container')[0], 'div', 'file_download')[0];
                let downloadList = [];
                if (download) {
                    findTag(findTag(download, 'ul')[0], 'li').forEach(l => findTag(l, 'a').forEach(a => {
                        if (a.attribs.title.match(/\.(pdf|xlsx)$/i)) {
                            downloadList.push({
                                url: addPre(a.attribs.href, 'https://www.cbc.gov.tw/tw'),
                                name: a.attribs.title,
                            });
                        }
                    }));
                }
                const recur_down = dIndex => {
                    if (dIndex < downloadList.length) {
                        driveName = `${obj.name} ${obj.date}.${dIndex}${PathExtname(downloadList[dIndex].name)}`;
                        console.log(driveName);
                        const subPath = getFileLocation(type, objectID());
                        return mkFolder(PathDirname(subPath)).then(() => Api('url', downloadList[dIndex].url, {filePath: subPath}).then(() => GoogleApi('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath: subPath,
                            parent,
                            rest: () => recur_down(dIndex + 1),
                            errhandle: err => handleError(err),
                        })));
                    } else {
                        return updateDocDate(type, obj.date);
                    }
                }
                driveName = `${obj.name} ${obj.date}.txt`;
                console.log(driveName);
                return GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    body: obj.url,
                    parent,
                    rest: () => recur_down(0),
                    errhandle: err => handleError(err),
                });
            });
            default:
            return handleError(new HoError('unknown external type'));
        }
    },
    parseTagUrl: function(type, url) {
        let taglist = new Set();
        switch (type) {
            case 'imdb':
            return Api('url', url).then(raw_data => {
                taglist.add('歐美');
                const html = findTag(Htmlparser.parseDOM(raw_data), 'html')[0];
                let title = findTag(findTag(findTag(html, 'head')[0], 'title')[0])[0];
                console.log(title);
                title = title.match(/^(.*?) \([^\d]*(\d\d\d\d)[^\)]*\) - IMDb$/);
                taglist.add(title[1]).add(title[2]);
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(html, 'body')[0], 'div', '__next')[0], 'main')[0], 'div')[0], 'section')[0], 'div')[0], 'section')[0], 'div')[0], 'div')[0], 'section').forEach(sec => {
                    if (sec.attribs['data-testid'] === 'title-cast') {
                        findTag(findTag(findTag(sec, 'div')[1], 'div')[1], 'div').forEach(cast => taglist.add(findTag(findTag(findTag(cast, 'div')[1], 'a')[0])[0]));
                        findTag(findTag(sec, 'ul')[0], 'li').forEach(cast => {
                            if (findTag(cast, 'div')[0]) {
                                findTag(findTag(findTag(cast, 'div')[0], 'ul')[0], 'li').forEach(c => taglist.add(findTag(findTag(c, 'a')[0])[0]));
                            }
                        });
                    } else if (sec.attribs['data-testid'] === 'Storyline') {
                        findTag(findTag(findTag(findTag(findTag(findTag(sec, 'div')[1], 'ul')[1], 'li')[1], 'div')[0], 'ul')[0], 'li').forEach(genre => taglist.add(findTag(findTag(genre, 'a')[0])[0]));
                    } else if (sec.attribs['data-testid'] === 'Details') {
                        findTag(findTag(findTag(sec, 'div')[1], 'ul')[0], 'li').forEach(de => {
                            const detype = findTag(de, 'a')[0] ? findTag(findTag(de, 'a')[0])[0] : findTag(findTag(de, 'span')[0])[0];
                            if (detype === 'Countries of origin') {
                                findTag(findTag(findTag(de, 'div')[0], 'ul')[0], 'li').forEach(country => taglist.add(findTag(findTag(country, 'a')[0])[0]));
                            } else if (detype === 'Languages') {
                                findTag(findTag(findTag(de, 'div')[0], 'ul')[0], 'li').forEach(lang => taglist.add(findTag(findTag(lang, 'a')[0])[0]));
                            }
                        });
                    }
                });
                return [...taglist].map(t => toValidName(t.toLowerCase()));
            });
            case 'steam':
            return Api('url', url, {cookie: 'birthtime=536425201; lastagecheckage=1-January-1987'}).then(raw_data => {
                taglist.add('歐美').add('遊戲').add('game');
                const info = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'responsive_page_frame with_header')[0], 'div', 'responsive_page_content')[0], 'div', 'responsive_page_template_content')[0], 'div', 'game_page_background game')[0], 'div', 'page_content_ctn')[0], 'div', 'page_content')[0], 'div', 'rightcol game_meta_data')[0], 'div', 'block responsive_apppage_details_left game_details underlined_links')[0], 'div')[0], 'div')[0], 'div')[0];
                findTag(info).forEach(i => {
                    const name = i.trim();
                    if (name !== ',') {
                        const date = name.match(/^\d?\d [a-zA-Z][a-zA-Z][a-zA-Z], (\d\d\d\d)$/);
                        taglist.add(date ? date[1] : name);
                    }
                });
                findTag(info, 'a').forEach(i => {
                    let a = findTag(i)[0].toLowerCase();
                    if (a === 'sports') {
                        a = 'sport';
                    }
                    taglist.add(a);
                    const index = GAME_LIST.indexOf(a);
                    if (index !== -1) {
                        taglist.add(GAME_LIST_CH[index]);
                    }
                });
                return [...taglist].map(t => toValidName(t.toLowerCase()));
            });
            case 'allmusic':
            return Api('url', url).then(raw_data => {
                taglist.add('歐美').add('音樂').add('music');
                const overflow = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[1];
                if (overflow.attribs.class === 'overflow-container album') {
                    const container = findTag(findTag(overflow, 'div', 'cmn_wrap')[0], 'div', 'content-container')[0];
                    const content = findTag(findTag(findTag(container, 'div', 'content')[0], 'header')[0], 'hgroup')[0];
                    const basic = findTag(findTag(container, 'div', 'sidebar')[0], 'section', 'basic-info')[0];
                    taglist.add(findTag(findTag(findTag(findTag(content, 'h2', 'album-artist')[0], 'span')[0], 'a')[0])[0]).add(findTag(findTag(content, 'h1', 'album-title')[0])[0].trim()).add(findTag(findTag(findTag(basic, 'div', 'release-date')[0], 'span')[0])[0].match(/\d+$/)[0]);
                    findTag(findTag(findTag(basic, 'div', 'genre')[0], 'div')[0], 'a').forEach(a => {
                        const genre = findTag(a)[0].toLowerCase();
                        const index = MUSIC_LIST_WEB.indexOf(genre);
                        taglist.add(index !== -1 ? MUSIC_LIST[index] : genre);
                    });
                } else if (overflow.attribs.class === 'overflow-container song') {
                    const overview = findTag(findTag(findTag(overflow, 'div', 'cmn_wrap')[0], 'div', 'content-container')[0], 'div', 'content overview')[0];
                    const content = findTag(findTag(overview, 'header')[0], 'hgroup')[0];
                    taglist.add(findTag(findTag(findTag(findTag(content, 'h2', 'song-artist')[0], 'span')[0], 'a')[0])[0]).add(findTag(findTag(content, 'h1', 'song-title')[0])[0].trim()).add(findTag(findTag(findTag(findTag(findTag(findTag(overview, 'section', 'appearances')[0], 'table')[0], 'tbody')[0], 'tr')[0], 'td', 'year')[0])[0].trim());
                } else if (overflow.attribs.class === 'overflow-container artist') {
                    const container = findTag(findTag(overflow, 'div', 'cmn_wrap')[0], 'div', 'content-container')[0];
                    taglist.add(findTag(findTag(findTag(findTag(findTag(findTag(container, 'div', 'content')[0], 'header')[0], 'div', 'artist-bio-container')[0], 'hgroup')[0], 'h1', 'artist-name')[0])[0].trim());
                    findTag(findTag(findTag(findTag(findTag(container, 'div', 'sidebar')[0], 'section', 'basic-info')[0], 'div', 'genre')[0], 'div')[0], 'a').forEach(a => {
                        const genre = findTag(a)[0].toLowerCase();
                        const index = MUSIC_LIST_WEB.indexOf(genre);
                        taglist.add(index !== -1 ? MUSIC_LIST[index] : genre);
                    });
                }
                return [...taglist].map(t => toValidName(t.toLowerCase()));
            });
            case 'marvel':
            case 'dc':
            return Api('url', url).then(raw_data => {
                taglist.add('歐美').add('漫畫').add('comic').add(type);
                for (let div of findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'WikiaSiteWrapper')[0], 'section', 'WikiaPage')[0], 'div', 'WikiaPageContentWrapper')[0], 'article', 'WikiaMainContent')[0], 'div', 'WikiaMainContentContainer')[0], 'div', 'WikiaArticle')[0], 'div', 'mw-content-text')[0], 'div')) {
                    if (div.attribs.class !== 'center') {
                        findTag(div, 'div').forEach((d, i) => {
                            if (i === 0) {
                                let name = findTag(d);
                                if (name.length > 0) {
                                    taglist.add(name[0]);
                                } else {
                                    for (let c of d.children) {
                                        name = findTag(c);
                                        if (c.type === 'tag' && name.length > 0) {
                                            taglist.add(name[0]);
                                            break;
                                        }
                                    }
                                }
                            } else {
                                const dd = findTag(d, 'div');
                                if (dd.length > 0) {
                                    if (findTag(dd[0]).length > 0) {
                                        if (findTag(dd[0])[0].match(/First appearance/i)) {
                                            const date = findTag(dd[2], 'div')
                                            if (date.length > 0) {
                                                taglist.add(findTag(findTag(date[0], 'a')[0])[0].match(/\d+$/)[0]);
                                            }
                                        } else if (findTag(dd[0])[0].match(/(creator|Editor\-in\-Chief|Cover Artist|writer|penciler|inker|letterer|editor)/i)) {
                                            findTag(dd[1], 'a').forEach(a => taglist.add(findTag(a)[0]));
                                        }
                                    } else if (findTag(dd[0], 'span').length > 0 && findTag(findTag(dd[0], 'span')[1])[0].match(/(creator|Editor\-in\-Chief|Cover Artist|writer|penciler|inker|letterer|editor)/i)) {
                                        findTag(dd[1], 'a').forEach(a => taglist.add(findTag(a)[0]));
                                    }
                                }
                            }
                        });
                        break;
                    }
                }
                return [...taglist].map(t => toValidName(t.toLowerCase()));
            });
            case 'tvdb':
            return Api('url', url).then(raw_data => {
                taglist.add('歐美').add('電視劇').add('tv show');
                const fanart = findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[0], 'tr')[2], 'td', 'maincontent')[0], 'div', 'fanart')[0];
                taglist.add(findTag(findTag(findTag(findTag(findTag(findTag(fanart, 'table')[0], 'tr')[0], 'td')[2], 'div', 'content')[0], 'h1')[0])[0]);
                findTag(fanart, 'div', 'content').forEach((c, i) => {
                    if (i === 0) {
                        findTag(findTag(findTag(findTag(findTag(c, 'table')[0], 'tr')[0], 'td')[0], 'table')[0], 'tr').forEach(t => {
                            const label = findTag(findTag(t, 'td')[0])[0];
                            if (label === 'First Aired:') {
                                taglist.add(findTag(findTag(t, 'td')[1])[0].match(/\d+$/)[0]);
                            } else if (label === 'Network:') {
                                taglist.add(findTag(findTag(t, 'td')[1])[0]);
                            } else if (label === 'Genre:') {
                                findTag(findTag(t, 'td')[1]).forEach(d => {
                                    let g = d.toLowerCase();
                                    if (g === 'science-fiction') {
                                        g = 'sci-fi';
                                    }
                                    const index = GENRE_LIST.indexOf(g);
                                    taglist.add(g);
                                    if (index !== -1) {
                                        taglist.add(GENRE_LIST_CH[index]);
                                    }
                                });
                            }
                        });
                    } else {
                        if (findTag(findTag(c, 'h1')[0])[0] === 'Actors') {
                            findTag(findTag(findTag(c, 'table')[0], 'tr')[0], 'td').forEach(t => taglist.add(findTag(findTag(findTag(findTag(findTag(findTag(t, 'table')[0], 'tr')[0], 'td')[0], 'h2')[0], 'a')[0])[0]));
                        }
                    }
                });
                return [...taglist].map(t => toValidName(t.toLowerCase()));
            });
            default:
            return handleError(new HoError('unknown external type'));
        }
    },
    youtubePlaylist: function(id, index, pageToken=null, back=false) {
        return GoogleApi('y playItem', Object.assign({id: id}, pageToken ? {pageToken} : {})).then(([vId_arr, total, nPageToken, pPageToken]) => {
            if (total <= 0) {
                return handleError(new HoError('playlist is empty'));
            }
            let ret_obj = back ? vId_arr[vId_arr.length-1] : vId_arr[0];
            let is_new = true;
            if (index === 1) {
                is_new = false;
            } else {
                for (let i of vId_arr) {
                    if (i.id === index) {
                        ret_obj = i;
                        is_new = false;
                        break;
                    }
                }
            }
            return [ret_obj, false, total, vId_arr, nPageToken, pPageToken, pageToken, is_new];
        });
    },
    getSingleId: function(type, url, index, pageToken=null, back=false) {
        let sub_index = 0;
        if ((typeof index) === 'number' || index.match(/^[\d\.]+$/)) {
            if (index < 1) {
                return handleError(new HoError('index must > 0'));
            }
            sub_index = Math.round((+index)*1000)%1000;
            if (sub_index === 0) {
                sub_index++;
            }
            index = Math.floor(+index);
        } else if (type !== 'youtube'){
            return handleError(new HoError('index invalid'));
        }
        console.log(url);
        const saveList = (getlist, raw_list, is_end, etime) => {
            const exGet = () => (etime === -1) ? Promise.resolve([raw_list, is_end]) : (!etime || etime < (new Date().getTime()/1000)) ? getlist() : Promise.resolve([[], false]);
            exGet().then(([raw_list, is_end]) => {
                if (raw_list.length > 0) {
                    return Redis('hmset', `url: ${encodeURIComponent(url)}`, {
                        raw_list: JSON.stringify(raw_list),
                        is_end,
                        etime: Math.round(new Date().getTime()/1000 + CACHE_EXPIRE),
                    });
                }
            }).catch(err => handleError(err, 'Redis'));
        }
        switch (type) {
            case 'youtube':
            const youtube_id = url.match(/list=([^&]+)/);
            return youtube_id ? this.youtubePlaylist(youtube_id[1], index, pageToken, back) : Promise.resolve([{
                id: `you_${url.match(/v=([^&]+)/)[1]}`,
                index: 1,
                showId: 1,
            }, false, 1]);
            case 'lovetv':
            let prefix = url.match(/^((http|https):\/\/[^\/]+)\//);
            if (!prefix) {
                return handleError(new HoError('invaild url'));
            }
            prefix = prefix[1];
            const lovetvGetlist = () => Api('url', url).then(raw_data => {
                let list = [];
                const content = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0];
                if (content) {
                    const outer = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(content, 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'Blog1')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer');
                    const table = findTag(findTag(findTag(findTag(findTag(outer[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0], 'table')[0];
                    if (table) {
                        findTag(table, 'tr').forEach(t => {
                            const h = findTag(findTag(t, 'td')[0], 'h3')[0];
                            if (h) {
                                const a = findTag(h, 'a')[0];
                                if (a) {
                                    const name = findTag(a)[0];
                                    if (!name.match(/Synopsis$/i)) {
                                        list.splice(0, 0, {
                                            name,
                                            url: a.attribs.href,
                                        });
                                    }
                                }
                            }
                        });
                    } else {
                        for (let o of outer) {
                            const a = findTag(findTag(findTag(findTag(findTag(o, 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'h3')[0], 'a')[0];
                            const name = findTag(a)[0];
                            if (name.match(/劇集列表/)) {
                                url = a.attribs.href;
                                console.log(url);
                                return lovetvGetlist();
                            }
                            if (!name.match(/Synopsis$/i)) {
                                list.splice(0, 0, {
                                    name,
                                    url: a.attribs.href,
                                });
                            }
                        }
                    }
                } else {
                    findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper')[0], 'div', 'main')[0], 'div', 'container')[0], 'div', 'content')[0], 'div')[2], 'div', 'entry-content')[0], 'table')[0], 'tbody')[0], 'tr').forEach(t => {
                        const h = findTag(findTag(t, 'td')[0], 'h3')[0];
                        if (h) {
                            const a = findTag(h, 'a')[0];
                            const name = findTag(a)[0];
                            if (!name.match(/Synopsis$/i)) {
                                list.splice(0, 0, {
                                    name,
                                    url: a.attribs.href,
                                });
                            }
                        }
                    });
                }
                let is_end = false;
                for (let i of list) {
                    if (i.name.match(/大結局/)) {
                        is_end = true;
                        break;
                    }
                }
                return (list.length < 1) ? Mongo('find', STORAGEDB, {
                    owner: type,
                    url: encodeURIComponent(url),
                }).then(items => {
                    if (items.length < 1) {
                        return handleError(new HoError('cannot find lovetv url'));
                    }
                    const nextLove = (index, dramaIndex, list) => {
                        for (let i of list) {
                            if (i.name === items[0].name) {
                                const validUrl = isValidString(i.url, 'url');
                                if (!validUrl) {
                                    return handleError(new HoError('url is not vaild'));
                                }
                                return Mongo('update', STORAGEDB, {_id: items[0]._id}, {$set: {url: validUrl}}).then(item => {
                                    url = i.url;
                                    return lovetvGetlist();
                                });
                            }
                        }
                        dramaIndex++;
                        if (dramaIndex < dramaList.length) {
                            return recur_loveList(dramaIndex, nextLove);
                        }
                        return handleError(new HoError('cannot find lovetv'));
                    }
                    return recur_loveList(0, nextLove);
                }) : [list, is_end];
            });
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    const choose = raw_list[index - 1];
                    if (!choose) {
                        return handleError(new HoError('cannot find external index'));
                    }
                    saveList(lovetvGetlist, raw_list, is_end, etime);
                    return [Object.assign({
                        id: `ope_${Buffer.from(!choose.url.match(/^(http|https):\/\//) ? `${prefix}${choose.url}` : choose.url).toString('base64')}`,
                        title: choose.name,
                        index: index,
                        showId: index,
                    }), is_end, raw_list.length];
                    /*return Api('url', !choose.url.match(/^(http|https):\/\//) ? `${prefix}${choose.url}` : choose.url).then(raw_data => {
                        let obj = [];
                        const vs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'widget Blog')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer')[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0];
                        const getV = (v, vType='') => {
                            if (v) {
                                const vIds = findTag(findTag(v, 'div', `video_ids${vType}`)[0])[0].match(/[^,]+/g);
                                if (vIds.length > 0) {
                                    const t = Number(findTag(findTag(v, 'div', `video_type${vType}`)[0])[0]);
                                    if (t === 17) {
                                        for (let i = 1; i <= vIds[1]; i++) {
                                            obj.push(`bil_av${vIds[0]}_${i}`);
                                        }
                                    } else if (t === 1) {
                                        for (let i of vIds) {
                                            obj.push(`you_${i}`);
                                        }
                                    } else if (t === 10) {
                                        for (let i of vIds) {
                                            obj.push(`yuk_${i}`);
                                        }
                                    } else if (t === 3) {
                                        //open
                                        for (let i of vIds) {
                                            obj.push(`ope_${i}`);
                                        }
                                    } else if (t === 12) {
                                        //up2stream
                                        for (let i of vIds) {
                                            obj.push(`up2_${i}`);
                                        }
                                    } else if (t === 19) {
                                        //愛奇藝
                                        for (let i of vIds) {
                                            obj.push(`iqi_${i}`);
                                        }
                                    } else if (t === 6) {
                                        //line tv
                                        for (let i of vIds) {
                                            obj.push(`lin_${i}`);
                                        }
                                    } else {
                                        for (let i of vIds) {
                                            obj.push(`dym_${i}`);
                                        }
                                    }
                                }
                            }
                        }
                        const div1 = findTag(findTag(vs, 'p')[0], 'div', 'video_div')[0];
                        getV(div1 ? div1 : findTag(vs, 'div', 'video_div')[0]);
                        getV(findTag(vs, 'div', 'video_div_s2')[0], '_s2');
                        getV(findTag(vs, 'div', 'video_div_s3')[0], '_s3');
                        if (!obj) {
                            return handleError(new HoError('no source'));
                        }
                        if (sub_index > obj.length) {
                            sub_index = 1;
                        }
                        console.log(obj);
                        saveList(lovetvGetlist, raw_list, is_end, etime);
                        return [Object.assign({
                            id: obj[sub_index-1],
                            index: index,
                            showId: index,
                        }, (obj.length > 1) ? {
                            sub: obj.length,
                            index: (index * 1000 + sub_index) / 1000,
                            showId: (index * 1000 + sub_index) / 1000,
                        } : {}), is_end, raw_list.length];
                    });*/
                }
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : lovetvGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });
            case 'eztv':
            const eztvGetlist = () => {
                const getEzList = tr => {
                    let list = [];
                    tr.reverse().forEach(tr => {
                        const td = findTag(tr, 'td', 'forum_thread_post');
                        const a = findTag(td[2], 'a', 'magnet')[0];
                        if (a) {
                            const episodeMatch = a.attribs.title.match(/ S?(\d+)[XE](\d+) /i);
                            if (episodeMatch) {
                                let season = episodeMatch[1].length === 1 ? `00${episodeMatch[1]}` : episodeMatch[1].length === 2 ? `0${episodeMatch[1]}` : episodeMatch[1];
                                season = episodeMatch[2].length === 1 ? `${season}00${episodeMatch[2]}` : episodeMatch[2].length === 2 ? `${season}0${episodeMatch[2]}` : `${season}${episodeMatch[2]}`;
                                const sizeMatch = findTag(td[3])[0].match(/^(\d+\.?\d+?) ([MG])/);
                                const size = (sizeMatch[2] === 'G') ? (Number(sizeMatch[1]) * 1000) : Number(sizeMatch[1]);
                                const data = {
                                    magnet: a.attribs.href,
                                    name: findTag(findTag(td[1], 'a')[0])[0],
                                    season: season,
                                    size: size,
                                }
                                let si = -1;
                                for (let i in list) {
                                    if (list[i][0]['season'] === season) {
                                        si = i;
                                        break;
                                    }
                                }
                                if (si === -1) {
                                    list.push([data]);
                                } else {
                                    let isInsert = false;
                                    for (let i in list[si]) {
                                        if (list[si][i].size > size) {
                                            list[si].splice(i, 0, data);
                                            isInsert = true;
                                            break;
                                        }
                                    }
                                    if (!isInsert) {
                                        list[si].push(data);
                                    }
                                }
                            }
                        }
                    });
                    console.log(list);
                    return list;
                }
                if (url.match(/^https:\/\/eztv\.re\/search\//)) {
                    console.log('start more');
                    return Api('url', url, {referer: 'https://eztv.re/'}).then(raw_data => [getEzList(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'table', 'forum_header_border')[2], 'tr', 'forum_header_border')), false]);
                } else {
                    return Api('url', url, {referer: 'https://eztv.re/'}).then(raw_data => {
                        const center = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'div')[6], 'table', 'forum_header_border_normal')[0], 'tr')[1], 'td')[0], 'center')[0];
                        let tr = findTag(findTag(center, 'table', 'forum_header_noborder')[0], 'tr', 'forum_header_border');
                        const trLength = tr.length;
                        console.log(trLength);
                        let is_end = false;
                        for (let i of findTag(findTag(findTag(findTag(center, 'table')[0], 'tr')[4], 'td')[0], 'b')) {
                            if (findTag(i)[0] === 'Ended') {
                                is_end = true;
                                break;
                            }
                        }
                        if (trLength < 100) {
                            return [getEzList(tr), is_end];
                        } else {
                            console.log('too much');
                            const name = findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'head')[0], 'title')[0])[0].match(/^(.*) Torrent Download/)[1];
                            if (!name) {
                                return handleError(new HoError('unknown name!!!'));
                            }
                            return Api('url', `https://eztv.re/search/${name}`, {referer: 'https://eztv.re/'}).then(raw_data => {
                                const tr1 = findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'table', 'forum_header_border')[2], 'tr', 'forum_header_border');
                                const trLength1 = tr1.length;
                                console.log(trLength1);
                                if (trLength1 > trLength) {
                                    tr = tr1;
                                }
                                return [getEzList(tr), is_end];
                            });
                        }
                    });
                }
            }
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    const choose = raw_list[index - 1].slice();
                    if (!choose) {
                        return handleError(new HoError('cannot find external index'));
                    }
                    const chooseMag = choose.splice(choose.length - 1, 1)[0];
                    let ret_obj = {
                        index: index,
                        showId: index,
                        is_magnet: true,
                        complete: false,
                    };
                    const final_check = () => {
                        if (!isValidString(chooseMag.magnet, 'url')) {
                            return handleError(new HoError('magnet is not vaild'));
                        }
                        return Mongo('find', STORAGEDB, {magnet: {
                            $regex: chooseMag.magnet.match(/^magnet:[^&]+/)[0].match(/[^:]+$/)[0],
                            $options: 'i',
                        }}, {limit: 1}).then(items => [Object.assign(ret_obj, {title: chooseMag.name}, (items.length > 0) ? {id: items[0]._id} : {magnet: chooseMag.magnet}), is_end, raw_list.length]);
                    }
                    const recur_check = mIndex => Mongo('find', STORAGEDB, {magnet: {
                        $regex: choose[mIndex].magnet.match(/^magnet:[^&]+/)[0].match(/[^:]+$/)[0],
                        $options: 'i',
                    }}, {limit: 1}).then(items => {
                        if (items.length > 0) {
                            return [Object.assign(ret_obj, {
                                id: items[0]._id,
                                title: choose[mIndex].name,
                            }), is_end, raw_list.length];
                        } else {
                            mIndex++;
                            return (mIndex < choose.length) ? recur_check(mIndex) : final_check();
                        }
                    });
                    saveList(eztvGetlist, raw_list, is_end, etime);
                    return (choose.length > 0) ? recur_check(0) : final_check();
                }
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : eztvGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });
            case 'yify':
            const yifyGetlist = () => Api('url', url, {referer: 'https://yts.ag/'}).then(raw_data => {
                const json_data = getJson(raw_data);
                if (json_data === false) {
                    return handleError(new HoError('json parse error!!!'));
                }
                if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                    return handleError(new HoError('yify api fail'));
                }
                let magnet = null;
                for (let i of json_data['data']['movie']['torrents']) {
                    if (i['quality'] === '1080p' || (!magnet && i['quality'] === '720p')) {
                        magnet = `magnet:?xt=urn:btih:${i['hash']}&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969`;
                    }
                }
                return [[{
                    magnet,
                    title: json_data['data']['movie']['title'],
                }], false];
            });
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    if (!isValidString(raw_list[0].magnet, 'url')) {
                        return handleError(new HoError('magnet is not vaild'));
                    }
                    saveList(yifyGetlist, raw_list, is_end, etime);
                    return Mongo('find', STORAGEDB, {magnet: {
                        $regex: raw_list[0].magnet.match(/^magnet:[^&]+/)[0].match(/[^:]+$/)[0],
                        $options: 'i',
                    }}, {limit: 1}).then(items => [Object.assign({
                        index: 1,
                        showId: 1,
                        title: raw_list[0].title,
                        is_magnet: true,
                        complete: false,
                    }, (items.length > 0) ? {id: items[0]._id} : {magnet: raw_list[0].magnet}), is_end, raw_list.length]);
                };
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : yifyGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });
            case 'bilibili':
            const bilibiliGetlist = () => {
                const bili_id = url.match(/(av)?\d+/);
                if (!bili_id) {
                    return handleError(new HoError('bilibili id invalid'));
                }
                const getBangumi = sId => Api('url', `http://bangumi.bilibili.com/jsonp/seasoninfo/${sId}.ver?callback=seasonListCallback&jsonp=jsonp&_=${new Date().getTime()}`, {referer: url}).then(raw_data => {
                    const json_data = getJson(raw_data.match(/^[^\(]+\((.*)\);$/)[1]);
                    if (json_data === false) {
                        return handleError(new HoError('json parse error!!!'));
                    }
                    if (!json_data.result || !json_data.result.episodes) {
                        return handleError(new HoError('cannot get episodes'));
                    }
                    return [
                        json_data.result.episodes.map(e => ({
                            id: `bil_av${e.av_id}_${e.page}`,
                            name: e.index_title,
                        })).reverse(),
                        json_data.result.seasons,
                    ];
                });
                return bili_id[1] ? Api('url', url, {referer: 'http://www.bilibili.com/'}).then(raw_data => {
                    const select = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'b-page-body')[0], 'div', 'player-wrapper')[0], 'div', 'main-inner')[0], 'div', 'v-plist')[0], 'div', 'plist')[0], 'select');
                    return (select.length > 0) ? [findTag(select[0], 'option').map(o => ({
                        id: `bil_${bili_id[0]}_${o.attribs.value.match(/index_(\d+)\.html/)[1]}`,
                        name: findTag(o)[0],
                    })), false] : [[{
                        id: `bil_${bili_id[0]}`,
                        name: 'bil',
                    }], false];
                }) : getBangumi(bili_id[0]).then(([list, seasons]) => {
                    const recur_season = index => getBangumi(seasons[index].season_id).then(([slist, sseasons]) => {
                        list = list.concat(slist);
                        index++;
                        return (index < seasons.length) ? recur_season(index) : [list, false];
                    });
                    return (seasons.length > 0) ? recur_season(0) : [list, false];
                });
            };
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    const choose = raw_list[index - 1];
                    if (!choose) {
                        return handleError(new HoError('cannot find external index'));
                    }
                    saveList(bilibiliGetlist, raw_list, is_end, etime);
                    return [{
                        index,
                        showId: index,
                        id: choose.id,
                        title: choose.name,
                    }, is_end, raw_list.length];
                };
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : bilibiliGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });
            case 'kubo':
            console.log('here');
            const kuboGetlist = () => Api('url', url).then(raw_data => {
                let list = [];
                let is_end = false;
                const main = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0];
                for (let p of findTag(findTag(findTag(findTag(main, 'div', 'datal')[0], 'div', 'vmain')[0], 'div', 'vshow')[0], 'p')) {
                    for (let pt of findTag(p)) {
                        if (pt.match(/完結/)) {
                            is_end = true;
                            break;
                        }
                    }
                    if (is_end) {
                        break;
                    }
                }
                let flvUrl = null;
                let listY = [];
                findTag(findTag(main, 'div', 'topRow')[0], 'div', 'hideCont').forEach(h => {
                    let ul = findTag(findTag(findTag(findTag(h, 'ul')[0], 'div', 'vmain')[0], 'div', 'vpl')[0], 'ul')[0];
                    const div = findTag(ul, 'div')[0];
                    if (div) {
                        ul = div;
                    }
                    for (let l of findTag(ul, 'li')) {
                        const a = findTag(l, 'a')[0];
                        list.push({
                            //name: OpenCC.simplifiedToTraditional(findTag(a)[0]),
                            name: findTag(a)[0],
                            id: `kur_${Buffer.from(a.attribs.href).toString('base64')}`,
                        });
                        /*const a = findTag(l, 'a')[0];
                        let urlMatch = addPre(a.attribs.href, 'http://www.99kubo.tv').match(/youtube\.php\?(.*)$/);
                        if (urlMatch) {
                            listY.push({
                                name: findTag(a)[0],
                                id: `kdy_${urlMatch[1]}`,
                            });
                        } else {
                            if (a.attribs.href.match(/vod\-play\-id\-/)) {
                                flvUrl = addPre(a.attribs.href, 'http://www.99kubo.tv');
                                break;
                            }
                        }*/
                    }
                });
                return [list, is_end];
                /*return flvUrl ? Api('url', flvUrl).then(raw_data => {
                    let ff_urls = '';
                    const jM = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'playmar')[0], 'div', 'play')[0], 'div')[0], 'script')[0])[0].match(/^\s*var\s*ff_urls\s*=\s*['"](.*)['"];?\s*$/);
                    if (jM) {
                        ff_urls = getJson(jM[1].replace(/\\\"/g, '"'));
                    }
                    let list1 = [];
                    let list2 = [];
                    let lists = [];
                    let listO = [];
                    ff_urls.Data.forEach(f => {
                        if (f.playname === 'bj58') {
                            list = f.playurls.map(p => ({
                                name: p[0],
                                id: `kur_${Buffer.from(p[2]).toString('base64')}`,
                            }));
                        } else if (f.playname === 'bj') {
                            list1 = f.playurls.map(p => ({
                                name: p[0],
                                id: `kyu_${p[1].match(/^(.*)_wd1$/)[1]}`,
                            }));
                        } else if (f.playname === 'bj2') {
                            list2 = f.playurls.map(p => ({
                                name: p[0],
                                id: `kur_${Buffer.from(p[2]).toString('base64')}`,
                            }));
                        } else if (f.playname.match(/^bj/)) {
                            lists = f.playurls.map(p => ({
                                name: p[0],
                                id: `kur_${Buffer.from(p[2]).toString('base64')}`,
                            }));
                        } else {
                            listO = f.playurls.map(p => ({
                                name: p[0],
                                id: `kur_${Buffer(p[2]).toString('base64')}`,
                            }));
                        }
                    });
                    list = list.concat(listY);
                    list = list.concat(list1);
                    list = list.concat(list2);
                    list = list.concat(lists);
                    list = list.concat(listO);
                    return [list, is_end];
                }) : [listY, is_end];*/
            });
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    const choose = raw_list[index - 1];
                    if (!choose) {
                        return handleError(new HoError('cannot find external index'));
                    }
                    saveList(kuboGetlist, raw_list, is_end, etime);
                    return [Object.assign({
                        index,
                        showId: index,
                        id: choose.id,
                        title: choose.name,
                    }, choose.id.match(/^(kdy|kyu)_/) ? {
                        index: (index * 1000 + sub_index) / 1000,
                        showId: (index * 1000 + sub_index) / 1000,
                        id: `${choose.id}_${sub_index}`,
                    } : {}), is_end, raw_list.length];
                };
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : kuboGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });
            /*const kuboGetlist = () => Api('url', url).then(raw_data => {
                let list = [];
                const container = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container ff-bg')[1];
                const is_end = findTag(findTag(findTag(findTag(findTag(findTag(findTag(container, 'div', 'row')[0], 'div', 'col-md-8 col-xs-12')[0], 'div', 'media')[0], 'div', 'media-body')[0], 'h4')[0], 'small', 'text-red')[0])[0].includes('全') ? true : false;
                findTag(findTag(container, 'div', 'tab-content ff-playurl-tab')[0], 'ul').forEach(u => findTag(u, 'li').forEach(l => {
                    const a = findTag(l, 'a')[0];
                    list.push({
                        name: findTag(a)[0],
                        id: `kur_${Buffer.from(a.attribs.href).toString('base64')}}`,
                    });
                }));
                return [list, is_end];
            });
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    const choose = raw_list[index - 1];
                    if (!choose) {
                        return handleError(new HoError('cannot find external index'));
                    }
                    saveList(kuboGetlist, raw_list, is_end, etime);
                    return [Object.assign({
                        index,
                        showId: index,
                        id: choose.id,
                        title: choose.name,
                    }, choose.id.match(/^(kdy|kyu)_/) ? {
                        index: (index * 1000 + sub_index) / 1000,
                        showId: (index * 1000 + sub_index) / 1000,
                        id: `${choose.id}_${sub_index}`,
                    } : {}), is_end, raw_list.length];
                };
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : kuboGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });*/
            case 'dm5':
            const madGetlist = () => Api('url', url, {
                referer: 'http://www.dm5.com/',
                cookie: 'SERVERID=node1; isAdult=1; frombot=1',
                is_dm5: true,
            }).then(raw_data => {
                const list = [];
                const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                const divs = findTag(body,'div');
                let is_end = false;
                for (let d of divs) {
                    if (findTag(d, 'section', 'banner_detail').length > 0) {
                        if (findTag(findTag(findTag(findTag(findTag(findTag(findTag(d, 'section', 'banner_detail')[0], 'div', 'banner_detail_form')[0], 'div', 'info')[0], 'p', 'tip')[0], 'span', 'block')[0], 'span')[0])[0] === '已完结') {
                            is_end = true;
                        }
                        break;
                    }
                }
                findTag(findTag(findTag(findTag(findTag(findTag(body, 'div', 'view-comment')[0], 'div', 'container')[0], 'div', 'left-bar')[0], 'div', 'tempc')[0], 'div', 'chapterlistload')[0], 'ul').forEach(u => {
                    let li = findTag(u, 'li');
                    const more = findTag(u, 'ul');
                    if (more.length > 0) {
                        li = li.concat(findTag(more[0], 'li'));
                    }
                    li.reverse().forEach(l => {
                        const a = findTag(l, 'a')[0];
                        let title = findTag(a)[0];
                        if (!title) {
                            title = findTag(findTag(findTag(a, 'div', 'info')[0], 'p', 'title ')[0])[0];
                        }
                        list.push({
                            //title: OpenCC.simplifiedToTraditional(title),
                            title: title,
                            url: addPre(a.attribs.href, 'http://www.dm5.com'),
                        });
                    });
                });
                return [list, is_end];
            });
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    let choose = raw_list[index - 1];
                    if (!choose) {
                        index = 1;
                        choose = raw_list[index - 1];
                        if (!choose) {
                            return handleError(new HoError('cannot find external index'));
                        }
                    }
                    saveList(madGetlist, raw_list, is_end, etime);
                    return [{
                        index: (index * 1000 + sub_index) / 1000,
                        showId: (index * 1000 + sub_index) / 1000,
                        title: choose.title,
                        pre_url: choose.url,
                    }, is_end, raw_list.length];
                }
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : madGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });
            default:
            return handleError(new HoError('unknown external type'));
        }
    },
    saveSingle: function(type, id) {
        let url = null;
        switch (type) {
            case 'yify':
            const getMid = () => isNaN(id) ? Api('url', `https://yts.ag/movie/${id}`, {referer: 'https://yts.ag/'}).then(raw_data => findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main-content')[0], 'div', 'movie-content')[0], 'div', 'row')[0], 'div', 'movie-info')[0].attribs['data-movie-id']) : Promise.resolve(id);
            return getMid().then(mid => {
                url = `https://yts.ag/api/v2/movie_details.json?with_cast=true&movie_id=${mid}`;
                return Api('url', url, {referer: 'https://yts.ag/'}).then(raw_data => {
                    const json_data = getJson(raw_data);
                    if (json_data === false) {
                        return handleError(new HoError('json parse error!!!'));
                    }
                    if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                        return handleError(new HoError('yify api fail'));
                    }
                    let setTag = new Set(['yify', 'video', '影片', 'movie', '電影']);
                    setTag.add(json_data['data']['movie']['imdb_code']).add(json_data['data']['movie']['year'].toString());
                    if (json_data['data']['movie']['genres']) {
                        json_data['data']['movie']['genres'].forEach(i => setTag.add(i));
                    }
                    if (json_data['data']['movie']['cast']) {
                        json_data['data']['movie']['cast'].forEach(i => setTag.add(i.name));
                    }
                    let newTag = new Set();
                    setTag.forEach(i => newTag.add(GENRE_LIST.includes(i) ? GENRE_LIST_CH[GENRE_LIST.indexOf(i)] : i));
                    return [
                        json_data['data']['movie']['title'],
                        newTag,
                        new Set(),
                        'yify',
                        json_data['data']['movie']['small_cover_image'],
                        url,
                    ];
                });
            });
            case 'kubo':
            /*url = `http://www.99kubo.tv/vod-read-id-${id}.html`
            return Api('url', url, {referer: 'http://www.99kubo.tv/'}).then(raw_data => {
                const media = findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container ff-bg')[1], 'div', 'row')[0], 'div', 'col-md-8 col-xs-12')[0], 'div', 'media')[0]
                const img = findTag(findTag(findTag(media, 'div', 'media-left')[0], 'a')[0], 'img')[0];
                const mediaBody = findTag(media, 'div', 'media-body')[0];
                const name = findTag(findTag(findTag(mediaBody, 'h4')[0], 'a')[0])[0];
                let tags = new Set(['kubo', '酷播', '影片', 'video']);
                findTag(findTag(mediaBody, 'dl')[0], 'dd').forEach(d => findTag(d, 'a').forEach(a => {
                    const tag = findTag(a)[0];
                    if (tag && !tag.includes('完整演員表') && !tag.includes('未知')) {
                        tags.add(tag);
                        console.log(tag);
                        for (let i in KUBO_TYPE) {
                            const index = KUBO_TYPE[i].indexOf(tag);
                            if (index !== -1) {
                                if (i === '0') {
                                    tags.add('movie').add('電影');
                                    switch (index) {
                                        case 0:
                                        tags.add('action').add('動作');
                                        break;
                                        case 1:
                                        tags.add('comedy').add('喜劇');
                                        break;
                                        case 2:
                                        tags.add('romance').add('浪漫');
                                        break;
                                        case 3:
                                        tags.add('sci-fi').add('科幻');
                                        break;
                                        case 4:
                                        tags.add('horror').add('恐怖');
                                        break;
                                        case 5:
                                        tags.add('drama').add('劇情');
                                        break;
                                        case 6:
                                        tags.add('war').add('戰爭');
                                        break;
                                        case 7:
                                        tags.add('animation').add('動畫');
                                        break;
                                    }
                                } else if (i === '1') {
                                    tags.add('tv show').add('電視劇');
                                } else if (i === '2') {
                                    tags.add('tv show').add('電視劇').add('綜藝節目');
                                } else if (i === '3') {
                                    tags.add('animation').add('動畫');
                                }
                                break;
                            }
                        }
                    }
                }));
                let newTag = new Set();
                tags.forEach(t => {
                    const index = DM5_ORI_LIST.indexOf(t);
                    newTag.add((index !== -1) ? DM5_CH_LIST[index] : t);
                });
                return [
                    name,
                    newTag,
                    new Set(),
                    'kubo',
                    img.attribs['data-original'],
                    url,
                ];
            });*/
            url = `http://www.99kubo.tv/vod-read-id-${id}.html`
            return Api('url', url, {referer: 'http://www.99kubo.tv/'}).then(raw_data => {
                const vmain = findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'datal')[0], 'div', 'vmain')[0];
                const img = findTag(findTag(vmain, 'div', 'vpic')[0], 'img')[0];
                const name = img.attribs.alt;
                const thumb = img.attribs.src;
                let tags = new Set(['kubo', '酷播', '影片', 'video']);
                findTag(findTag(vmain, 'div', 'vshow')[0], 'p').forEach(p => {
                    const t = findTag(p)[0];
                    if (t) {
                        const match = findTag(p)[0].match(/^別名:(.*)$/);
                        if (match) {
                            match[1].split('/').forEach(m => {
                                if (m){
                                    tags.add(m);
                                }
                            });
                        } else {
                            if (t === '類型：') {
                                findTag(p, 'a').forEach(a => {
                                    if (a) {
                                        tags.add(findTag(a)[0]);
                                    }
                                });
                            } else if (t === '分類：') {
                                findTag(p, 'font').forEach(a => {
                                    if (a) {
                                        tags.add(findTag(a)[0]);
                                    }
                                });
                                const type = findTag(findTag(p, 'a')[0])[0];
                                if (type) {
                                    tags.add(type);
                                    for (let i in KUBO_TYPE) {
                                        const index = KUBO_TYPE[i].indexOf(type);
                                        if (index !== -1) {
                                            if (i === '0') {
                                                tags.add('movie').add('電影');
                                                switch (index) {
                                                    case 0:
                                                    tags.add('action').add('動作');
                                                    break;
                                                    case 1:
                                                    tags.add('comedy').add('喜劇');
                                                    break;
                                                    case 2:
                                                    tags.add('romance').add('浪漫');
                                                    break;
                                                    case 3:
                                                    tags.add('sci-fi').add('科幻');
                                                    break;
                                                    case 4:
                                                    tags.add('horror').add('恐怖');
                                                    break;
                                                    case 5:
                                                    tags.add('drama').add('劇情');
                                                    break;
                                                    case 6:
                                                    tags.add('war').add('戰爭');
                                                    break;
                                                    case 7:
                                                    tags.add('animation').add('動畫');
                                                    break;
                                                }
                                            } else if (i === '1') {
                                                tags.add('tv show').add('電視劇');
                                            } else if (i === '2') {
                                                tags.add('tv show').add('電視劇').add('綜藝節目');
                                            } else if (i === '3') {
                                                tags.add('animation').add('動畫');
                                            }
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                let newTag = new Set();
                tags.forEach(t => {
                    t = OpenCC.simplifiedToTraditional(t);
                    const index = DM5_ORI_LIST.indexOf(t);
                    newTag.add((index !== -1) ? DM5_CH_LIST[index] : t);
                });
                return [
                    OpenCC.simplifiedToTraditional(img.attribs.alt),
                    newTag,
                    new Set(),
                    'kubo',
                    img.attribs.src,
                    url,
                ];
            });
            case 'dm5':
            url = `http://www.dm5.com/${id}/`;
            return Api('url', url, {is_dm5: true,}).then(raw_data => {
                const divs = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div');
                let info = null;
                for (let i = 0; i < divs.length; i++) {
                    if (divs[i].attribs.class === '') {
                        info = findTag(findTag(divs[i], 'section', 'banner_detail')[0], 'div', 'banner_detail_form')[0];
                        break;
                    }
                }
                if (!info) {
                    return handleError(new HoError('dm5 misses info'));
                }
                let setTag = new Set(['dm5', '漫畫', 'comic', '圖片集', 'image book', '圖片', 'image']);
                findTag(findTag(findTag(info, 'div', 'info')[0], 'p', 'subtitle')[0], 'a').forEach(a => setTag.add(OpenCC.simplifiedToTraditional(findTag(a)[0])));
                const block = findTag(findTag(findTag(info, 'div', 'info')[0], 'p', 'tip')[0], 'span', 'block')[1];
                if (block) {
                    findTag(block, 'a').forEach(a => setTag.add(OpenCC.simplifiedToTraditional(findTag(findTag(a, 'span')[0])[0])));
                }
                let newTag = new Set();
                setTag.forEach(i => newTag.add(DM5_ORI_LIST.includes(i) ? DM5_CH_LIST[DM5_ORI_LIST.indexOf(i)] : i));
                return [
                    OpenCC.simplifiedToTraditional(findTag(findTag(findTag(info, 'div', 'info')[0], 'p', 'title')[0])[0]),
                    newTag,
                    new Set(),
                    'dm5',
                    findTag(findTag(info, 'div', 'cover')[0], 'img')[0].attribs.src,
                    url,
                ];
            });
            /*case 'bilibili':
            url = id.match(/^av/) ? `http://www.bilibili.com/video/${id}/` : `http://bangumi.bilibili.com/anime/${id}/`;
            return Api('url', url, {
                referer: 'http://www.bilibili.com/',
                not_utf8: true,
            }).then(raw_data => {
                let name = '';
                let thumb = '';
                const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                const wrapper = findTag(body, 'div', 'main-container-wrapper');
                let setTag = new Set(['bilibili', '影片', 'video']);
                if (wrapper.length > 0) {
                    setTag.add('動畫').add('animation');
                    const info = findTag(findTag(findTag(findTag(findTag(wrapper[0], 'div', 'main-container')[0], 'div', 'page-info-wrp')[0], 'div', 'bangumi-info-wrapper')[0], 'div', 'main-inner')[0], 'div', 'info-content')[0];
                    const img = findTag(findTag(info, 'div', 'bangumi-preview')[0], 'img')[0];
                    name = img.attribs.alt;
                    thumb = img.attribs.src;
                    const infoR = findTag(info, 'div', 'bangumi-info-r')[0];
                    setTag.add(findTag(findTag(findTag(findTag(infoR, 'div', 'info-row info-update')[0], 'em')[0], 'span')[0])[0].match(/^\d+/)[0]);
                    findTag(findTag(findTag(infoR, 'div', 'info-row info-cv')[0], 'em')[0], 'span').forEach(s => setTag.add(OpenCC.simplifiedToTraditional(findTag(s)[0])));
                    findTag(findTag(infoR, 'div', 'b-head')[0], 'a').forEach(a => setTag.add(OpenCC.simplifiedToTraditional(findTag(findTag(a, 'span')[0])[0])));
                } else {
                    const main = findTag(findTag(body, 'div', 'b-page-body')[0], 'div', 'main-inner');
                    const info = findTag(findTag(main[0], 'div', 'viewbox')[0], 'div', 'info')[0];
                    findTag(findTag(info, 'div', 'tminfo')[0], 'span').forEach(s => {
                        if (findTag(findTag(s, 'a')[0])[0].match(/动画$/)) {
                            setTag.add('動畫').add('animation');
                        } else if (findTag(findTag(s, 'a')[0])[0].match(/电影$/)) {
                            setTag.add('電影').add('movie');
                        }
                    });
                    findTag(findTag(findTag(findTag(findTag(main[1], 'div', 'v_large')[0], 'div', 'v_info')[0], 'div', 's_tag')[0], 'ul')[0], 'li').forEach(l => setTag.add(OpenCC.simplifiedToTraditional(findTag(findTag(l, 'a')[0])[0])));
                    name = findTag(findTag(findTag(info, 'div', 'v-title')[0], 'h1')[0])[0];
                    thumb = findTag(body, 'img')[0].attribs.src;
                }
                let newTag = new Set();
                setTag.forEach(i => newTag.add(DM5_ORI_LIST.includes(i) ? DM5_CH_LIST[DM5_ORI_LIST.indexOf(i)] : i));
                return [
                    name,
                    newTag,
                    new Set(),
                    'bilibili',
                    thumb,
                    url,
                ];
            });*/
            case 'eztv':
            url = `https://eztv.re/shows/${id}/`;
            return Api('url', url, {referer: 'https://eztv.re/'}).then(raw_data => {
                const tables = findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'div')[6], 'table');
                const name = findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'head')[0], 'title')[0])[0].match(/^(.*) Torrent Download/)[1];
                const info = tables[1] ? findTag(findTag(tables[1], 'tr')[1], 'td')[0] : findTag(findTag(findTag(findTag(findTag(findTag(tables[0], 'tr')[1], 'td')[0], 'center')[0], 'table', 'section_thread_post show_info_description')[0], 'tr')[1], 'td')[0];
                let setTag = new Set(['tv show', '電視劇', '歐美', '西洋', '影片', 'video']);
                findTag(info).forEach(n => {
                    let infoMatch = false;
                    if (infoMatch = n.match(/\d+$/)) {
                        setTag.add(infoMatch[0]);
                    } else if (infoMatch = n.match(/^Genre:(.*)$/i)) {
                        const genre = infoMatch[1].match(/([a-zA-Z\-]+)/g);
                        if (genre) {
                            genre.map(g => setTag.add(normalize(g)));
                        }
                    } else if (infoMatch = n.match(/^Network:(.*)$/i)) {
                        const network = infoMatch[1].match(/[a-zA-Z\-]+/);
                        if (network) {
                            setTag.add(normalize(network[0]));
                        }
                    }
                });
                findTag(info, 'a').forEach(a => {
                    const imdb = a.attribs.href.match(/(https|http):\/\/www\.imdb\.com\/title\/(tt\d+)\//);
                    if (imdb) {
                        setTag.add(normalize(imdb[2]));
                    }
                });
                let newTag = new Set();
                setTag.forEach(s => {
                    const is_d = isDefaultTag(s);
                    if (!is_d) {
                        newTag.add(s);
                    }
                });
                return [
                    name,
                    newTag,
                    new Set(),
                    'eztv',
                    'eztv-logo-small.png',
                    url,
                ];
            });
            default:
            return handleError(new HoError('unknown external type'));
        }
    },
}

/*export const subHdUrl = str => Api('url', `https://subhd.com/search/${encodeURIComponent(str)}`).then(raw_data => {
    const list = findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container pt-4')[0], 'div', 'row justify-content-center')[0], 'div', 'col-sm-11')[0];
    if (findTag(list)[0] && findTag(list)[0].match(/暂时没有/)) {
        return null;
    }
    const big_item = findTag(findTag(findTag(list, 'div', 'row pt-2')[0], 'div', 'col-md-9')[0], 'div', 'mb-4 bg-white rounded shadow-sm')[0];
    if (!big_item) {
        console.log(raw_data);
        return handleError(new HoError('sub data error!!!'));
    }
    const sub_id = findTag(findTag(findTag(findTag(findTag(findTag(findTag(big_item, 'div', 'row no-gutters')[0], 'div', 'col-sm-10 p-3 position-relative')[0], 'table')[0], 'tr')[0], 'td')[0], 'div')[0], 'a')[0].attribs.href;
    return Api('url', 'http://subhd.com/ajax/down_ajax', {
        post: {sub_id: sub_id.match(/\d+$/)[0]},
        is_json: true,
        referer: `https://subhd.com${sub_id}`,
    }).then(data => {
        console.log(data);
        return data.success ? data.url : handleError(new HoError('too many times!!!'));
    });
});*/

export const bilibiliVideoUrl = url => {
    console.log(url);
    const id = url.match(/(av)?(\d+)\/(index_(\d+)\.html)?$/);
    if (!id) {
        return handleError(new HoError('bilibili id invalid'));
    }
    const page = id[3] ? Number(id[4]) : 1;
    return Api('url', `http://api.bilibili.com/view?type=json&appkey=8e9fc618fbd41e28&id=${id[2]}&page=1&batch=true`, {referer: 'http://api.bilibili.com/'}).then(raw_data => {
        const json_data = getJson(raw_data);
        if (json_data === false) {
            return handleError(new HoError('json parse error!!!'));
        }
        if (!json_data.list) {
            return handleError(new HoError('cannot get list'));
        }
        return {
            title: json_data.list[page - 1].part,
            video: [],
            embed: [`//static.hdslb.com/miniloader.swf?aid=${id[2]}&page=${page}`],
        };
    });
}

export const kuboVideoUrl = (id, url, subIndex=1) => {
    console.log(url);
    if (id === 'kdy') {
        return Api('url', url, {referer: 'http://www.58b.tv/'}).then(raw_data => {
            const iframes = findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container')[0], 'div', 'youtube-player')[0], 'iframe');
            if (subIndex > iframes.length) {
                subIndex = iframes.length;
            }
            const getUrl = youUrl => youUrl.match(/www\.youtube\.com/) ? youtubeVideoUrl('you', `http://www.youtube.com/watch?v=${youUrl.match(/embed\/(.*)$/)[1]}`) : youtubeVideoUrl('dym', `http://www.dailymotion.com/embed/video/${youUrl.match(/url\=(.*)$/)[1]}`);
            if (!iframes[subIndex - 1]) {
                console.log(iframes);
                return handleError(new HoError('cannot find mp4'));
            }
            return getUrl(iframes[subIndex - 1].attribs.src).then(ret_obj => Object.assign(ret_obj, (iframes.length > 1) ? {sub : iframes.length} : {}));
        });
    } else if (id === 'kud') {
        return Promise.resolve({
            video: [],
            url: [url],
        });
        /*return Api('url', url, {referer: 'http://www.58b.tv/'}).then(raw_data => {
            let ret_obj = {video: []};
            const script = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'script')[0];
            if (!script) {
                return handleError(new HoError('cannot find mp4'));
            }
            const videoData = findTag(script)[0];
            if (videoData) {
                JuicyCodes.Run(videoData.match(/\((.*)\)/)[1].replace(/["\+]/g, ''));
                kuboInfo.sources.forEach(s => {
                    if (s.type === 'video/mp4') {
                        ret_obj.video.splice(0, 0, s.file);
                    }
                });
                if (ret_obj.video.length < 1) {
                    console.log(ret_obj.video);
                    return handleError(new HoError('cannot find mp4'));
                }
                return ret_obj;
            } else {
                return handleError(new HoError('cannot find videoData'));
                return Api('url', `http://www.99tw.net/redirect?id=${url.match(/\&kubovid\=(\d+)/)[1]}&pid=${subIndex}`, {referer: 'http://www.58b.tv/'}).then(raw_data => {
                    for (let i of findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'script')) {
                        const videoData = findTag(i)[0];
                        if (videoData) {
                            const videoMatch = videoData.match(/videoDetail = ([^\]]+\])/);
                            if (videoMatch) {
                                let bps = 0;
                                getJson(videoMatch[1].replace(/'/g, '"').replace(/bps/g, '"bps"').replace(/src/g, '"src"').replace(/type/g, '"type"')).forEach(i => {
                                    if (i.bps) {
                                        if (parseInt(i.bps) > bps) {
                                            bps = parseInt(i.bps);
                                            ret_obj.video.splice(0, 0, i.src);
                                        } else {
                                            ret_obj.video.push(i.src);
                                        }
                                    }
                                });
                                if (ret_obj.video.length < 1) {
                                    console.log(ret_obj.video);
                                    return handleError(new HoError('cannot find mp4'));
                                }
                                return ret_obj;
                            }
                        }
                    }
                });
            }
        });*/
    } else if (id === 'kyu') {
        return Api('url', `http://www.58b.tv/jx/show.php?playlist=1&fmt=1&rand=${new Date().getTime()}`, {
            referer: 'http://www.58b.tv/',
            post: {url: Buffer.from(url).toString('base64')},
        }).then(raw_data => {
            const json_data = getJson(raw_data);
            if (json_data === false) {
                return handleError(new HoError('json parse error!!!'));
            }
            if (json_data['code'] === '404') {
                console.log(json_data);
                return handleError(new HoError('try later'));
            }
            if (!json_data['mp4']) {
                console.log(json_data);
                return handleError(new HoError('cannot find mp4'));
            }
            if (subIndex > json_data['mp4'].length) {
                subIndex = json_data['mp4'].length;
            }
            if (!json_data['mp4'][subIndex - 1]) {
                console.log(json_data);
                return handleError(new HoError('cannot find mp4'));
            }
            return Object.assign({video: [json_data['mp4'][subIndex - 1].url]}, (json_data['mp4'].length > 1) ? {sub : json_data['mp4'].length} : {});
        });
    } else {
        return Promise.resolve({
            video: [],
            url: [url],
        });
    }
}

export const youtubeVideoUrl = (id, url) => {
    console.log(url);
    let ret_obj = {video: []};
    if (id === 'lin') {
        ret_obj['iframe'] = [`//tv.line.me/embed/${url.match(/[^\/]+$/)[0]}?isAutoPlay=true`];
    } else if (id === 'iqi') {
        const iqiId = url.match(/([^\/]+)\.html$/)[1].split('-');
        ret_obj['embed'] = [`//player.video.qiyi.com/${iqiId[0]}/0/0/v_${iqiId[1]}.swf-albumId=${iqiId[2]}-tvId=${iqiId[3]}-isPurchase=0-cnId=2`];
    //} else if (id === 'ope') {
    //    ret_obj['iframe'] = [url];
    } else {
        return new Promise((resolve, reject) => YouGetInfo(url, [], {maxBuffer: 10 * 1024 * 1024}, (err, info) => err ? reject(err) : resolve(info))).then(info => {
            ret_obj.title = info.title;
            const ret_info = info.formats ? info.formats : info;
            if (id === 'you') {
                let audio_size = 0;
                ret_info.forEach(i => {
                    if (i.format_note === 'DASH audio') {
                        if (!audio_size) {
                            audio_size = i.filesize;
                            ret_obj['audio'] = i.url;
                        } else if (audio_size > i.filesize) {
                            audio_size = i.filesize;
                            ret_obj['audio'] = i.url;
                        }
                    } else if (i.format_note !== 'DASH video' && (i.ext === 'mp4' || i.ext === 'webm')) {
                        ret_obj['video'].splice(0, 0, i.url);
                    }
                });
            } else if (id === 'dym') {
                ret_info.forEach(i => {
                    if (i.format_id.match(/^(http-)?\d+$/) && (i.ext === 'mp4' || i.ext === 'webm')) {
                        ret_obj['video'].splice(0, 0, i.url.replace(/^https:/i, 'http:'));
                    }
                });
            } else if (id === 'lin') {
                ret_obj['iframe'] = [`//tv.line.me/embed/${url.match(/[^\/]+$/)[0]}?isAutoPlay=true`];
            } else if (id === 'iqi') {
                const iqiId = url.match(/([^\/]+)\.html$/)[1].split('-');
                ret_obj['embed'] = [`//player.video.qiyi.com/${iqiId[0]}/0/0/${iqiId[1]}.swf-albumId=${iqiId[2]}-tvId=${iqiId[3]}-isPurchase=0-cnId=2`];
            } else {
                if (Array.isArray(ret_info)) {
                    ret_info.forEach(i => {
                        if ((i.ext === 'mp4' || i.ext === 'webm')) {
                            ret_obj['video'].splice(0, 0, i.url);
                        }
                    });
                } else {
                    if ((ret_info.ext === 'mp4' || ret_info.ext === 'webm')) {
                        ret_obj['video'].splice(0, 0, ret_info.url);
                    }
                }
            }
            if (id === 'yuk') {
                ret_obj['iframe'] = [];
                ret_obj['video'].map(i => {
                    if (i.match(/type=flv/)) {
                        ret_obj['iframe'].push(`//player.youku.com/embed/${url.match(/id_([\da-zA-Z=]+)\.html$/)[1]}`);
                    }
                });
            }
            return ret_obj;
        });
    }
    return Promise.resolve(ret_obj);
};

const updateDocDate = (type, date) => Mongo('update', DOCDB, {type}, {$set: {type, date}}, {upsert: true});