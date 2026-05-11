import { GENRE_LIST, GENRE_LIST_CH, DM5_ORI_LIST, DM5_CH_LIST, GAME_LIST, GAME_LIST_CH, MUSIC_LIST, MUSIC_LIST_WEB, CACHE_EXPIRE, STORAGEDB } from '../constants.js'
import OpenCC from 'node-opencc'
import Htmlparser from 'htmlparser2'
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
import { handleError, HoError, toValidName, isValidString, getJson, completeZero, getFileLocation, findTag, addPre, torrent2Magnet } from '../util/utility.js'
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
                            title = findTag(findTag(findTag(a, 'div', 'info')[0], 'p', 'title')[0])[0];
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



