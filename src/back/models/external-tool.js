import { GENRE_LIST, GENRE_LIST_CH, DM5_ORI_LIST, DM5_CH_LIST, GAME_LIST, GAME_LIST_CH, MUSIC_LIST, MUSIC_LIST_WEB, CACHE_EXPIRE, STORAGEDB } from '../constants.js'
import OpenCC from 'node-opencc'
import Htmlparser from 'htmlparser2'
import * as cheerio from 'cheerio/slim'
import pathModule from 'path'
const { dirname: PathDirname, extname: PathExtname, join: PathJoin } = pathModule;
import Mkdirp from 'mkdirp'
import ReadTorrent from 'read-torrent'
import Redis from '../models/redis-tool.js'
import GoogleApi from '../models/api-tool-google.js'
import { normalize } from '../models/tag-tool.js'
import Mongo, { objectID } from '../models/mongo-tool.js'
import { handleError, HoError, toValidName, isValidString, getJson, completeZero, getFileLocation, addPre, torrent2Magnet } from '../util/utility.js'
import createLogger from '../util/logger.js'
import Api from './api-tool.js'
import { circuitBreaker } from './circuit-breaker.js'

const log = createLogger('external-tool')

export default {
    //type要補到deltag裡
    getSingleList: function(type, url, post=null) {
        if (!url) {
            return Promise.resolve([]);
        }
        switch (type) {
            case 'yify':
            return circuitBreaker('yify', () => Api('url', url, {
                referer: 'https://yts.ag/',
                is_json: true,
            })).then(raw_data => {
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
            case 'dm5':
            return circuitBreaker('dm5', () => Api('url', url, {
                referer: 'http://www.dm5.com/',
                post,
                is_dm5: true,
            })).then(raw_data => {
                let list = [];
                const dom = Htmlparser.parseDOM(raw_data);
                const $ = cheerio.load(dom);
                if (dom.some(n => n.type === 'tag' && n.name === 'html')) {
                    $('div[class="box-body"]').first()
                        .children('ul[id="mh-list col7"]').first()
                        .children('li').each((_, l) => {
                        const $l = $(l);
                        const a = $l.children('div[id="mh-item"]').first()
                            .children('div[id="mh-tip-wrap"]').first()
                            .children('div[id="mh-item-tip"]').first()
                            .children('a').first().get(0);
                        list.push({
                            id: a.attribs.href.match(/\/([^\/]+)/)[1],
                            name: a.attribs.title,
                            thumb: $l.children('div[id="mh-item"]').first()
                                .children('p[id="mh-cover"]').first().attr('style').match(/url\(([^\)]+)/)[1],
                            tags: ['漫畫', 'comic'],
                        });
                    });
                } else {
                    $.root().children().each((_, l) => {
                        let name = '';
                        $(l).children('p').first().children('span').first().contents().each((_, s) => {
                            if (s.type === 'tag' && s.name === 'span') {
                                name = `${name}${$(s).text()}`;
                            } else if (s.type === 'text') {
                                name = `${name}${s.data}`;
                            }
                        });
                        list.push({
                            id: l.attribs.href.match(/\/([^\/]+)/)[1],
                            name,
                            thumb: 'dm5.png',
                            tags: ['漫畫', 'comic'],
                        });
                    });
                }
                return list;
            });
            default:
            return handleError(new HoError('unknown external type'));
        }
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
        } else {
            return handleError(new HoError('index invalid'));
        }
        log.debug({ url }, 'getting external single id')
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
            case 'yify':
            const yifyGetlist = () => circuitBreaker('yify', () => Api('url', url, {referer: 'https://yts.ag/'})).then(raw_data => {
                const json_data = getJson(raw_data);
                if (json_data === false) {
                    return handleError(new HoError('json parse error!!!'));
                }
                if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                    return handleError(new HoError('yify api fail'));
                }
                let magnet = null;
		let bluray = null;
                for (let i of json_data['data']['movie']['torrents']) {
                    if (i['quality'] === '1080p' || (!magnet && i['quality'] === '720p')) {
                        //magnet = `magnet:?xt=urn:btih:${i['hash']}&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969`;
                        if (i['type'] === 'bluray') {
				bluray = true;
			}
			if (!bluray || i['type'] === 'bluray') {
				magnet = i['url'];
			}
                    }
                }
                if (magnet) {
                    return new Promise((resolve, reject) => ReadTorrent(magnet, (err, torrent) => err ? reject(err) : resolve(torrent))).then(torrent => {
                        magnet = torrent2Magnet(torrent);
                        if (!magnet) {
                            return handleError(new HoError('magnet create fail'));
                        }
                        return [[{
                            magnet,
                            title: json_data['data']['movie']['title'],
                        }], false];
                    });
                } else {
                    return [[{
                        magnet,
                        title: json_data['data']['movie']['title'],
                    }], false];
                }
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
            case 'dm5':
            const madGetlist = () => circuitBreaker('dm5', () => Api('url', url, {
                referer: url,
                cookie: 'SERVERID=node3; isAdult=1',
                is_dm5: true,
            })).then(raw_data => {
                const list = [];
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                let is_end = false;
                for (const d of $('body').children('div').toArray()) {
                    if ($(d).children('section[class="banner_detail"]').length > 0) {
                        if ($(d).children('section[class="banner_detail"]').first()
                            .children('div[class="banner_detail_form"]').first()
                            .children('div[class="info"]').first()
                            .children('p[class="tip"]').first()
                            .children('span[class="block"]').first()
                            .children('span').first()
                            .text().trim() === '已完结') {
                            is_end = true;
                        }
                        break;
                    }
                }
                $('div[id="chapterlistload"]')
                    .children('ul').each((_, u) => {
                        let liArr = $(u).children('li').toArray();
                        const more = $(u).children('ul').toArray();
                        if (more.length > 0) {
                            liArr = liArr.concat($(more[0]).children('li').toArray());
                        }
                        liArr.reverse().forEach(l => {
                            const $a = $(l).children('a').first();
                            let title = $a.text().trim();
                            if (!title) {
                                title = $a.children('div[class="info"]').first().children('p[class="title"]').first().text().trim();
                            }
                            list.push({
                                //title: OpenCC.simplifiedToTraditional(title),
                                title: title,
                                url: addPre($a.attr('href'), 'http://www.dm5.com'),
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
            const getMid = () => isNaN(id) ? circuitBreaker('yify', () => Api('url', `https://yts.ag/movie/${id}`, {referer: 'https://yts.ag/'})).then(raw_data => {
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                return $('body').children('div[id="main-content"]').first()
                    .children('div[id="movie-content"]').first()
                    .children('div[id="row"]').first()
                    .children('div[id="movie-info"]').first()
                    .attr('data-movie-id');
            }) : Promise.resolve(id);
            return getMid().then(mid => {
                url = `https://yts.ag/api/v2/movie_details.json?with_cast=true&movie_id=${mid}`;
                return circuitBreaker('yify', () => Api('url', url, {referer: 'https://yts.ag/'})).then(raw_data => {
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
            case 'dm5':
            url = `http://www.dm5.com/${id}/`;
            return circuitBreaker('dm5', () => Api('url', url, {is_dm5: true,})).then(raw_data => {
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                const divArr = $('body').children('div').toArray();
                let $info = null;
                for (let i = 0; i < divArr.length; i++) {
                    if ($(divArr[i]).attr('class') === '') {
                        $info = $(divArr[i]).children('section[class="banner_detail"]').first().children('div[class="banner_detail_form"]').first();
                        break;
                    }
                }
                if (!$info || $info.length === 0) {
                    return handleError(new HoError('dm5 misses info'));
                }
                let setTag = new Set(['dm5', '漫畫', 'comic', '圖片集', 'image book', '圖片', 'image']);
                $info.children('div[class="info"]').first().children('p[class="subtitle"]').first().children('a').each((_, a) => {
                    setTag.add(OpenCC.simplifiedToTraditional($(a).text().trim()));
                });
                const $block = $info.children('div[class="info"]').first().children('p[class="tip"]').first().children('span[class="block"]').eq(1);
                if ($block.length > 0) {
                    $block.children('a').each((_, a) => {
                        setTag.add(OpenCC.simplifiedToTraditional($(a).children('span').first().text().trim()));
                    });
                }
                let newTag = new Set();
                setTag.forEach(i => newTag.add(DM5_ORI_LIST.includes(i) ? DM5_CH_LIST[DM5_ORI_LIST.indexOf(i)] : i));
                return [
                    OpenCC.simplifiedToTraditional($info.children('div[class="info"]').first().children('p[class="title"]').first().text().trim()),
                    newTag,
                    new Set(),
                    'dm5',
                    $info.children('div[class="cover"]').first().children('img').first().attr('src'),
                    url,
                ];
            });
            default:
            return handleError(new HoError('unknown external type'));
        }
    },
}