import { GENRE_LIST, GENRE_LIST_CH, DM5_ORI_LIST, DM5_CH_LIST, GAME_LIST, GAME_LIST_CH, MUSIC_LIST, MUSIC_LIST_WEB, CACHE_EXPIRE, STORAGEDB } from '../constants.js'
import OpenCC from 'node-opencc'
import Htmlparser from 'htmlparser2'
import * as cheerio from 'cheerio/slim'
import pathModule from 'path'
const { dirname: PathDirname, extname: PathExtname, join: PathJoin } = pathModule;
import Mkdirp from 'mkdirp'
import fsModule from 'fs'
const { existsSync: FsExistsSync } = fsModule;
import ReadTorrent from 'read-torrent'
import Redis from '../models/redis-tool.js'
import GoogleApi from '../models/api-tool-google.js'
import { normalize } from '../models/tag-tool.js'
import Mongo, { objectID } from '../models/mongo-tool.js'
import { handleError, HoError, toValidName, isValidString, getJson, completeZero, getFileLocation, addPre, torrent2Magnet } from '../util/utility.js'
import Api from './api-tool.js'



export default {
    //type要補到deltag裡
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
            case 'dm5':
            return Api('url', url, {
                referer: 'http://www.dm5.com/',
                post,
                is_dm5: true,
            }).then(raw_data => {
                let list = [];
                const dom = Htmlparser.parseDOM(raw_data);
                const $ = cheerio.load(dom);
                if (dom.some(n => n.type === 'tag' && n.name === 'html')) {
                    $('body').children('section[class="box container pb40 overflow-Show"]').first()
                        .children('div[class="box-body"]').first()
                        .children('ul[class="mh-list col7"]').first()
                        .children('li').each((_, l) => {
                        const $l = $(l);
                        const a = $l.children('div[class="mh-item"]').first()
                            .children('div[class="mh-tip-wrap"]').first()
                            .children('div[class="mh-item-tip"]').first()
                            .children('a').first().get(0);
                        list.push({
                            id: a.attribs.href.match(/\/([^\/]+)/)[1],
                            name: a.attribs.title,
                            thumb: $l.children('div[class="mh-item"]').first()
                                .children('p[class="mh-cover"]').first().attr('style').match(/url\(([^\)]+)/)[1],
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
    parseTagUrl: function(type, url) {
        let taglist = new Set();
        switch (type) {
            case 'imdb':
            return Api('url', url).then(raw_data => {
                taglist.add('歐美');
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                let title = $('title').text().trim();
                console.log(title);
                title = title.match(/^(.*?) \([^\d]*(\d\d\d\d)[^\)]*\) - IMDb$/);
                taglist.add(title[1]).add(title[2]);
                $('body').children('div[class="__next"], div[id="__next"]').first()
                    .children('main').first()
                    .children('div').first()
                    .children('section').first()
                    .children('div').first()
                    .children('section').first()
                    .children('div').first()
                    .children('div').first()
                    .children('section').each((_, sec) => {
                        const testid = $(sec).attr('data-testid');
                        if (testid === 'title-cast') {
                            $(sec).children('div').eq(1).children('div').eq(1).children('div').each((_, cast) => {
                                taglist.add($(cast).children('div').eq(1).children('a').first().text().trim());
                            });
                            $(sec).children('ul').first().children('li').each((_, cast) => {
                                if ($(cast).children('div').length > 0) {
                                    $(cast).children('div').first().children('ul').first().children('li').each((_, c) => {
                                        taglist.add($(c).children('a').first().text().trim());
                                    });
                                }
                            });
                        } else if (testid === 'Storyline') {
                            $(sec).children('div').eq(1).children('ul').eq(1).children('li').eq(1).children('div').first().children('ul').first().children('li').each((_, genre) => {
                                taglist.add($(genre).children('a').first().text().trim());
                            });
                        } else if (testid === 'Details') {
                            $(sec).children('div').eq(1).children('ul').first().children('li').each((_, de) => {
                                const $de = $(de);
                                const detype = $de.children('a').length > 0
                                    ? $de.children('a').first().text().trim()
                                    : $de.children('span').first().text().trim();
                                if (detype === 'Countries of origin') {
                                    $de.children('div').first().children('ul').first().children('li').each((_, country) => {
                                        taglist.add($(country).children('a').first().text().trim());
                                    });
                                } else if (detype === 'Languages') {
                                    $de.children('div').first().children('ul').first().children('li').each((_, lang) => {
                                        taglist.add($(lang).children('a').first().text().trim());
                                    });
                                }
                            });
                        }
                    });
                return [...taglist].map(t => toValidName(t.toLowerCase()));
            });
            case 'steam':
            return Api('url', url, {cookie: 'birthtime=536425201; lastagecheckage=1-January-1987'}).then(raw_data => {
                taglist.add('歐美').add('遊戲').add('game');
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                const info = $('body')
                    .children('div[class="responsive_page_frame with_header"]').first()
                    .children('div[class="responsive_page_content"]').first()
                    .children('div[class="responsive_page_template_content"]').first()
                    .children('div[class="game_page_background game"]').first()
                    .children('div[class="page_content_ctn"]').first()
                    .children('div[class="page_content"]').first()
                    .children('div[class="rightcol game_meta_data"]').first()
                    .children('div[class="block responsive_apppage_details_left game_details underlined_links"]').first()
                    .children('div').first()
                    .children('div').first()
                    .children('div').first();
                info.contents().filter((_, n) => n.type === 'text').each((_, n) => {
                    const name = n.data.toString().trim();
                    if (name && name !== ',') {
                        const date = name.match(/^\d?\d [a-zA-Z][a-zA-Z][a-zA-Z], (\d\d\d\d)$/);
                        taglist.add(date ? date[1] : name);
                    }
                });
                info.children('a').each((_, anchorEl) => {
                    let a = $(anchorEl).text().trim().toLowerCase();
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
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                const overflow = $('body').children('div').eq(1);
                const overflowClass = overflow.attr('class');
                if (overflowClass === 'overflow-container album') {
                    const container = overflow.children('div[class="cmn_wrap"]').first().children('div[class="content-container"]').first();
                    const content = container.children('div[class="content"]').first().children('header').first().children('hgroup').first();
                    const basic = container.children('div[class="sidebar"]').first().children('section[class="basic-info"]').first();
                    taglist
                        .add(content.children('h2[class="album-artist"]').first().children('span').first().children('a').first().text().trim())
                        .add(content.children('h1[class="album-title"]').first().text().trim())
                        .add(basic.children('div[class="release-date"]').first().children('span').first().text().trim().match(/\d+$/)[0]);
                    basic.children('div[class="genre"]').first().children('div').first().children('a').each((_, a) => {
                        const genre = $(a).text().trim().toLowerCase();
                        const index = MUSIC_LIST_WEB.indexOf(genre);
                        taglist.add(index !== -1 ? MUSIC_LIST[index] : genre);
                    });
                } else if (overflowClass === 'overflow-container song') {
                    const overview = overflow.children('div[class="cmn_wrap"]').first().children('div[class="content-container"]').first().children('div[class="content overview"]').first();
                    const content = overview.children('header').first().children('hgroup').first();
                    taglist
                        .add(content.children('h2[class="song-artist"]').first().children('span').first().children('a').first().text().trim())
                        .add(content.children('h1[class="song-title"]').first().text().trim())
                        .add(overview.children('section[class="appearances"]').first().children('table').first().children('tbody').first().children('tr').first().children('td[class="year"]').first().text().trim());
                } else if (overflowClass === 'overflow-container artist') {
                    const container = overflow.children('div[class="cmn_wrap"]').first().children('div[class="content-container"]').first();
                    taglist.add(container.children('div[class="content"]').first().children('header').first().children('div[class="artist-bio-container"]').first().children('hgroup').first().children('h1[class="artist-name"]').first().text().trim());
                    container.children('div[class="sidebar"]').first().children('section[class="basic-info"]').first().children('div[class="genre"]').first().children('div').first().children('a').each((_, a) => {
                        const genre = $(a).text().trim().toLowerCase();
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
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                const textOf = el => $(el).contents().filter((_, n) => n.type === 'text').toArray()
                    .map(n => n.data.toString().trim()).filter(Boolean);
                const mwContentDivs = $('body')
                    .children('div[class="WikiaSiteWrapper"]').first()
                    .children('section[class="WikiaPage"]').first()
                    .children('div[class="WikiaPageContentWrapper"]').first()
                    .children('article[class="WikiaMainContent"]').first()
                    .children('div[class="WikiaMainContentContainer"]').first()
                    .children('div[class="WikiaArticle"]').first()
                    .children('div[class="mw-content-text"]').first()
                    .children('div');
                for (const div of mwContentDivs.toArray()) {
                    if ($(div).attr('class') !== 'center') {
                        $(div).children('div').each((i, d) => {
                            if (i === 0) {
                                const directTexts = textOf(d);
                                if (directTexts.length > 0) {
                                    taglist.add(directTexts[0]);
                                } else {
                                    for (const c of $(d).contents().toArray()) {
                                        if (c.type === 'tag') {
                                            const childTexts = textOf(c);
                                            if (childTexts.length > 0) {
                                                taglist.add(childTexts[0]);
                                                break;
                                            }
                                        }
                                    }
                                }
                            } else {
                                const ddArr = $(d).children('div').toArray();
                                if (ddArr.length > 0) {
                                    const dd0Texts = textOf(ddArr[0]);
                                    if (dd0Texts.length > 0) {
                                        if (dd0Texts[0].match(/First appearance/i)) {
                                            if (ddArr[2]) {
                                                const dateChildDivs = $(ddArr[2]).children('div').toArray();
                                                if (dateChildDivs.length > 0) {
                                                    const dateText = $(dateChildDivs[0]).children('a').first().text().trim();
                                                    const dateMatch = dateText.match(/\d+$/);
                                                    if (dateMatch) taglist.add(dateMatch[0]);
                                                }
                                            }
                                        } else if (dd0Texts[0].match(/(creator|Editor\-in\-Chief|Cover Artist|writer|penciler|inker|letterer|editor)/i)) {
                                            if (ddArr[1]) {
                                                $(ddArr[1]).children('a').each((_, a) => taglist.add($(a).text().trim()));
                                            }
                                        }
                                    } else if ($(ddArr[0]).children('span').length > 0) {
                                        const span1Text = $(ddArr[0]).children('span').eq(1).text().trim();
                                        if (span1Text.match(/(creator|Editor\-in\-Chief|Cover Artist|writer|penciler|inker|letterer|editor)/i)) {
                                            if (ddArr[1]) {
                                                $(ddArr[1]).children('a').each((_, a) => taglist.add($(a).text().trim()));
                                            }
                                        }
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
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                const fanart = $('body').children('table').first().children('tr').eq(2).children('td[class="maincontent"]').first().children('div[class="fanart"]').first();
                taglist.add(fanart.children('table').first().children('tr').first().children('td').eq(2).children('div[class="content"]').first().children('h1').first().text().trim());
                fanart.children('div[class="content"]').each((i, c) => {
                    if (i === 0) {
                        $(c).children('table').first().children('tr').first().children('td').first().children('table').first().children('tr').each((_, t) => {
                            const label = $(t).children('td').first().text().trim();
                            if (label === 'First Aired:') {
                                const dateText = $(t).children('td').eq(1).text().trim();
                                const m = dateText.match(/\d+$/);
                                if (m) taglist.add(m[0]);
                            } else if (label === 'Network:') {
                                taglist.add($(t).children('td').eq(1).text().trim());
                            } else if (label === 'Genre:') {
                                $(t).children('td').eq(1).contents().filter((_, n) => n.type === 'text').each((_, n) => {
                                    let g = n.data.toString().trim().toLowerCase();
                                    if (!g) return;
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
                        if ($(c).children('h1').first().text().trim() === 'Actors') {
                            $(c).children('table').first().children('tr').first().children('td').each((_, t) => {
                                taglist.add($(t).children('table').first().children('tr').first().children('td').first().children('h2').first().children('a').first().text().trim());
                            });
                        }
                    }
                });
                return [...taglist].map(t => toValidName(t.toLowerCase()));
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
            const madGetlist = () => Api('url', url, {
                referer: 'http://www.dm5.com/',
                cookie: 'SERVERID=node1; isAdult=1; frombot=1',
                is_dm5: true,
            }).then(raw_data => {
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
                $('body').children('div[class="view-comment"]').first()
                    .children('div[class="container"]').first()
                    .children('div[class="left-bar"]').first()
                    .children('div[class="tempc"]').first()
                    .children('div[class="chapterlistload"]').first()
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
            const getMid = () => isNaN(id) ? Api('url', `https://yts.ag/movie/${id}`, {referer: 'https://yts.ag/'}).then(raw_data => {
                const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                return $('body').children('div[class="main-content"]').first()
                    .children('div[class="movie-content"]').first()
                    .children('div[class="row"]').first()
                    .children('div[class="movie-info"]').first()
                    .attr('data-movie-id');
            }) : Promise.resolve(id);
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
            case 'dm5':
            url = `http://www.dm5.com/${id}/`;
            return Api('url', url, {is_dm5: true,}).then(raw_data => {
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



