import { KUBO_TYPE, GENRE_LIST, GENRE_LIST_CH, TRANS_LIST, TRANS_LIST_CH, GAME_LIST, GAME_LIST_CH, MUSIC_LIST, MUSIC_LIST_WEB, CACHE_EXPIRE, STORAGEDB } from '../constants'
import OpenCC from 'opencc'
import Htmlparser from 'htmlparser2'
import { getInfo as YouGetInfo} from 'youtube-dl'
import Redis from '../models/redis-tool'
import GoogleApi from '../models/api-tool-google'
import { normalize } from '../models/tag-tool'
import Mongo from '../models/mongo-tool'
import { handleError, HoError, toValidName, isValidString, getJson } from '../util/utility'
import { getOptionTag } from '../util/mime'
import Api from './api-tool'

const opencc = new OpenCC('s2t.json');

export default {
    //type要補到deltag裡
    getSingleList: function(type, url, post=null) {
        if (!url) {
            return Promise.resolve([]);
        }
        switch (type) {
            case 'kubo':
            return Api('url', url, {referer: 'http://www.123kubo.com/'}).then(raw_data => {
                const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                const main = findTag(body, 'div', 'main');
                if (main.length > 0) {
                    let type_id = url.match(/vod-search-id-(\d+)/);
                    if (!type_id) {
                        handleError(new HoError('unknown kubo type'));
                    }
                    type_id = type_id[1];
                    return findTag(findTag(findTag(findTag(main[0], 'div', 'list')[0], 'div', 'listlf')[0], 'ul')[0], 'li').map(v => {
                        const a = findTag(v, 'a')[0];
                        const img = findTag(a, 'img')[0];
                        let count = 0;
                        let date = '1970-01-01';
                        let tags = new Set(type_id === '1' ? ['電影', 'movie'] : type_id === '3' ? ['動畫', 'animation'] : ['電視劇', 'tv show']);
                        findTag(v, 'p').forEach(i => {
                            const t = findTag(i);
                            if (t.length > 0) {
                                let m = t[0].match(/^月熱度：(\d+)/);
                                if (m) {
                                    count = m[1];
                                } else {
                                    m = t[0].match(/^更新：(\d\d\d\d-\d\d-\d\d)/);
                                    if (m) {
                                        date = m[1];
                                    } else {
                                        m = t[0].match(/^地區\/年份：(.*)\/(\d+)/);
                                        if (m) {
                                            tags.add(m[1]).add(m[2]);
                                        } else {
                                            m = t[0].match(/^主演：$/);
                                            if (m) {
                                                findTag(i, 'a').forEach(act => tags.add(findTag(act)[0]));
                                            }
                                        }
                                    }
                                }
                            }
                        });
                        return {
                            id: a.attribs.href.match(/(\d+)\.html$/)[1],
                            name: img.attribs.alt,
                            thumb: img.attribs['data-original'],
                            count: count,
                            date: date,
                            tags: [...tags],
                        };
                    });
                } else {
                    return findTag(findTag(findTag(findTag(findTag(findTag(body, 'div')[0], 'div', 'wrapper_wrapper')[0], 'div', 'container')[0], 'div', 'content_left')[0], 'div', 'ires')[0].children[1], 'li', 'g').map(v => {
                        const td = findTag(v.children[1].children[1], 'td');
                        const a = findTag(td[1], 'h3')[0].children[0];
                        let name = '';
                        a.children.forEach(t => {
                            if (t.type === 'text' && t.data.trim()) {
                                name = `${name}${t.data.trim()}`;
                            } else if (t.type === 'tag' && t.name === 'b') {
                                name = `${name}${findTag(t)[0]}`;
                            }
                        });
                        name = name.match(/^([^\-]+)\-(.+)/);
                        let tags = new Set([name[2]]);
                        KUBO_TYPE.forEach((k, j) => {
                            if (k.includes(name[2])) {
                                if (j === 2) {
                                    tags.add('animation').add('動畫');
                                } else if (j === 0) {
                                    tags.add('movie').add('電影');
                                    switch (k.indexOf(name[2])) {
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
                                } else if (j === 1) {
                                    tags.add('tv show').add('電視劇');
                                }
                            }
                        });
                        const info = findTag(findTag(findTag(td[1], 'div', 's')[0], 'div', 'kv')[0], 'span')[0];
                        let count = findTag(info)[2].match(/月熱度:(\d+)/);
                        let date = findTag(findTag(info, 'cite')[0])[0].match(/^更新時間:(\d\d\d\d)年(\d\d)月(\d\d)日/);
                        findTag(info, 'a').forEach(i => tags.add(findTag(i)[0]));
                        return {
                            id: a.attribs.href.match(/(\d+)\.html$/)[1],
                            name: name[1],
                            thumb: td[0].children[1].children[0].children[0].attribs.src,
                            count: count? count[1]: 0,
                            date: date? `${date[1]}-${date[2]}-${date[3]}` : '1970-01-01',
                            tags: [...tags],
                        };
                    });
                }
            });
            case 'yify':
            return Api('url', url, {
                referer: 'https://yts.ag/',
                is_json: true,
            }).then(raw_data => {
                if (raw_data['status'] !== 'ok' || !raw_data['data']) {
                    handleError(new HoError('yify api fail'));
                }
                return raw_data['data']['movies'] ? raw_data['data']['movies'].map(m => {
                    let tags = new Set(['movie', '電影']);
                    tags.add(m['year'].toString());
                    m['genres'].forEach(g => {
                        const genre_item = normalize(g);
                        if (GENRE_LIST.includes(genre_item)) {
                            tags.add(genre_item).add(GENRE_LIST_CH[GENRE_LIST.indexOf(genre_item)]);
                        }
                    });
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
                        name: opencc.convertSync(img.attribs.alt),
                        thumb: img.attribs['data-img'],
                        date: new Date('1970-01-01').getTime()/1000,
                        tags: ['movie', '電影'],
                        count: opencc.convertSync(findTag(findTag(findTag(findTag(v.children[1], 'div', 'l-r')[0], 'div', 'v-info')[0], 'span', 'v-info-i gk')[0], 'span')[0].attribs.number),
                    }
                }));
            } else if (url.match(/(https|http):\/\/www\.bilibili\.com\//)) {
                return Api('url', url, {
                    referer: 'http://www.bilibili.com/',
                    is_json: true,
                }).then(raw_data => {
                    if (!raw_data || raw_data['message'] !== 'success' || !raw_data['result'] || !raw_data['result']['list']) {
                        console.log(raw_data);
                        handleError(new HoError('bilibili api fail'));
                    }
                    return raw_data['result']['list'].map(l => ({
                        id: l['season_id'],
                        name: opencc.convertSync(l['title']),
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
                        handleError(new HoError('bilibili api fail'));
                    }
                    let list = [];
                    if (json_data['html']) {
                        const dom = Htmlparser.parseDOM(json_data['html']);
                        list = findTag(dom, 'li', 'video matrix ').map(v => {
                            const a = findTag(v, 'a')[0];
                            const img = findTag(a.children[1], 'img')[0];
                            return {
                                id: a.attribs.href.match(/av\d+/)[0],
                                name: opencc.convertSync(img.attribs.title),
                                thumb: img.attribs.src,
                                date: new Date('1970-01-01').getTime() / 1000,
                                tags: ['movie', '電影'],
                                count: opencc.convertSync(findTag(findTag(findTag(findTag(v, 'div', 'info')[0], 'div', 'tags')[0], 'span', 'so-icon watch-num')[0])[0]),
                            };
                        });
                        if (list.length < 1) {
                            list = findTag(dom, 'li', 'synthetical').map(v => {
                                const a = findTag(v, 'div', 'left-img')[0].children[1];
                                return {
                                    id: a.attribs.href.match(/\d+$/)[0],
                                    name: opencc.convertSync(a.attribs.title),
                                    thumb: findTag(a, 'img')[0].attribs.src,
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
            case 'cartoonmad':
            return Api('url', url, {
                referer: 'http://www.cartoonmad.com/',
                post: post,
                not_utf8: true,
            }).then(raw_data => {
                let list = [];
                const tr = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[0], 'tr')[0], 'td')[1], 'table')[0], 'tr')[3], 'td')[0], 'table')[0], 'tr');
                if (findTag(findTag(findTag(findTag(tr[1], 'td')[1], 'table')[0], 'td')[0], 'table').length > 0) {
                    tr.forEach((v, i) => {
                        if (i === 1) {
                            list = findTag(findTag(findTag(v, 'td')[1], 'table')[0], 'td').map(vv => {
                                const a = findTag(findTag(findTag(findTag(vv, 'table')[0], 'tr')[0], 'td')[0], 'a')[0];
                                return {
                                    id: a.attribs.href.match(/\d+/)[0],
                                    name: a.attribs.title,
                                    thumb: findTag(a, 'img')[0].attribs.src,
                                    tags: ['漫畫', 'comic'],
                                };
                            });
                        } else if (i%2 === 1) {
                            list = list.concat(findTag(v, 'td').map(vv => {
                                const a = findTag(findTag(findTag(findTag(vv, 'table')[0], 'tr')[0], 'td')[0], 'a')[0];
                                return {
                                    id: a.attribs.href.match(/\d+/)[0],
                                    name: a.attribs.title,
                                    thumb: findTag(a, 'img')[0].attribs.src,
                                    tags: ['漫畫', 'comic'],
                                };
                            }));
                        }
                    });
                }
                return list;
            });
            default:
            return Promise.reject(handleError(new HoError('unknown external type')));
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
                title = title.match(/^(.*?) \((\d\d\d\d)\) - IMDb$/);
                taglist.add(title[1]).add(title[2]);
                const main = findTag(findTag(findTag(findTag(findTag(html, 'body')[0], 'div', 'wrapper')[0], 'div', 'root')[0], 'div', 'pagecontent')[0], 'div', 'content-2-wide')[0];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(main, 'div', 'main_top')[0], 'div', 'title-overview')[0], 'div', 'title-overview-widget')[0], 'div', 'minPosterWithPlotSummaryHeight')[0], 'div', 'plot_summary_wrapper')[0], 'div', 'plot_summary minPlotHeightWithPoster')[0], 'div', 'credit_summary_item').forEach(d => findTag(d, 'span').forEach(s => {
                    const cast = findTag(s, 'a');
                    if (cast.length > 0) {
                        taglist.add(findTag(findTag(cast[0], 'span')[0])[0]);
                    }
                }));
                const main_bottom = findTag(main, 'div', 'main_bottom')[0];
                findTag(findTag(findTag(main_bottom, 'div', 'titleCast')[0], 'table', 'cast_list')[0], 'tr').forEach(t => {
                    const cast = findTag(t, 'td');
                    if (cast.length > 1) {
                        taglist.add(findTag(findTag(findTag(cast[1], 'a')[0], 'span')[0])[0]);
                    }
                });
                for (let t of findTag(findTag(main_bottom, 'div', 'titleStoryLine')[0], 'div', 'see-more inline canwrap')) {
                    if (findTag(findTag(t, 'h4')[0])[0] === 'Genres:') {
                        findTag(t, 'a').forEach(a => {
                            const genre = findTag(a)[0].toLowerCase().trim();
                            taglist.add(genre);
                            const index = GENRE_LIST.indexOf(genre);
                            if (index !== -1) {
                                taglist.add(GENRE_LIST_CH[index]);
                            }
                        });
                        break;
                    }
                }
                for (let t of findTag(findTag(main_bottom, 'div', 'titleDetails')[0], 'div', 'txt-block')) {
                    if (findTag(findTag(t, 'h4')[0])[0] === 'Country:') {
                        findTag(t, 'a').forEach(a => taglist.add(findTag(a)[0]));
                        break;
                    }
                }
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
            return Promise.reject(handleError(new HoError('unknown external type')));
        }
    },
    youtubePlaylist: function(id, index, pageToken=null, back=false) {
        return GoogleApi('y playItem', Object.assign({id: id}, pageToken ? {pageToken} : {})).then(([vId_arr, total, nPageToken, pPageToken]) => {
            if (total <= 0) {
                handleError(new HoError('playlist is empty'));
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
                handleError(new HoError('index must > 0'));
            }
            sub_index = Math.round((+index)*1000)%1000;
            if (sub_index === 0) {
                sub_index++;
            }
            index = Math.floor(+index);
        } else if (type !== 'youtube'){
            handleError(new HoError('index invalid'));
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
            return youtube_id ? this.youtubePlaylist(youtube_id[1], index, pageToken, back) : [{
                id: `you_${url.match(/v=([^&]+)/)[1]}`,
                index: 1,
                showId: 1,
            }, false, 1];
            case 'lovetv':
            let prefix = url.match(/^((http|https):\/\/[^\/]+)\//);
            if (!prefix) {
                handleError(new HoError('invaild url'));
            }
            prefix = prefix[1];
            const lovetvGetlist = () => Api('url', url).then(raw_data => {
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'Blog1')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer')[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div', 'post hentry uncustomized-post-template')[0], 'div', 'post-body entry-content')[0], 'table')[0], 'tr').forEach(t => {
                    const a = findTag(findTag(findTag(t, 'td')[0], 'h3')[0], 'a')[0];
                    const name = findTag(a)[0];
                    if (!name.match(/Synopsis$/i)) {
                        list.splice(0, 0, {
                            name: name,
                            url: a.attribs.href,
                        });
                    }
                });
                let is_end = false;
                for (let i of list) {
                    if (i.url.match(/大結局/)) {
                        is_end = true;
                        break;
                    }
                }
                return [list, is_end];
            });
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    const choose = raw_list[index - 1];
                    if (!choose) {
                        handleError(new HoError('cannot find external index'));
                    }
                    return Api('url', !choose.url.match(/^(http|https):\/\//) ? `${prefix}${choose.url}` : choose.url).then(raw_data => {
                        let result = [];
                        const vs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'widget Blog')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer')[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div', 'post hentry uncustomized-post-template')[0], 'div', 'post-body entry-content')[0];
                        const getV = (v, vType='') => {
                            if (v) {
                                const vIds = findTag(findTag(v, 'div', `video_ids${vType}`)[0])[0].match(/[^,]+/g);
                                if (vIds.length > 0) {
                                    result.push({s: Number(findTag(findTag(v, 'div', `video_type${vType}`)[0])[0]), ids: vIds});
                                }
                            }
                        }
                        getV(findTag(findTag(vs, 'p')[0], 'div', 'video_div')[0]);
                        getV(findTag(vs, 'div', 'video_div_s2')[0], '_s2');
                        getV(findTag(vs, 'div', 'video_div_s3')[0], '_s3');
                        let obj = null;
                        for (let i of result) {
                            if (!obj) {
                                if (i.s === 2 && i.ids.length > 0) {
                                    obj = i;
                                }
                            } else {
                                if (i.s === 2 && i.ids.length > 0 && obj.ids.length > i.ids.length) {
                                    obj = i;
                                }
                            }
                        }
                        if (!obj) {
                            handleError(new HoError('no source'));
                        }
                        if (sub_index > obj.ids.length) {
                            sub_index = 1;
                        }
                        saveList(lovetvGetlist, raw_list, is_end, etime);
                        return [Object.assign({
                            id: `dym_${obj.ids[sub_index-1]}`,
                            index: index,
                            showId: index,
                        }, (obj.ids.length > 1) ? {
                            sub: obj.ids.length,
                            index: (index * 1000 + sub_index) / 1000,
                            showId: (index * 1000 + sub_index) / 1000,
                        } : {}), is_end, raw_list.length];
                    });
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
                    return list;
                }
                if (url.match(/^https:\/\/eztv\.ag\/search\//)) {
                    console.log('start more');
                    return Api('url', url, {referer: 'https://eztv.ag/'}).then(raw_data => [getEzList(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'table', 'forum_header_border')[2], 'tr', 'forum_header_border')), false]);
                } else {
                    return Api('url', url, {referer: 'https://eztv.ag/'}).then(raw_data => {
                        const center = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'div')[6], 'table', 'forum_header_border_normal')[0], 'tr')[1], 'td')[0], 'center')[0];
                        let tr = findTag(findTag(center, 'table', 'forum_header_noborder')[0], 'tr', 'forum_header_border');
                        const trLength = tr.length;
                        console.log(trLength);
                        const is_end = (findTag(findTag(findTag(findTag(findTag(center, 'table')[0], 'tr')[4], 'td')[0], 'b')[1])[0] === 'Ended') ? true : false;
                        if (trLength < 100) {
                            return [getEzList(tr), is_end];
                        } else {
                            console.log('too much');
                            const show_name = url.match(/^https:\/\/[^\/]+\/shows\/\d+\/([^\/]+)/);
                            if (!show_name) {
                                handleError(new HoError('unknown name!!!'));
                            }
                            return Api('url', `https://eztv.ag/search/${show_name[1]}`, {referer: 'https://eztv.ag/'}).then(raw_data => {
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
                    const choose = raw_list[index - 1];
                    if (!choose) {
                        handleError(new HoError('cannot find external index'));
                    }
                    const chooseMag = choose.splice(choose.length - 1, 1)[0];
                    let ret_obj = {
                        index: index,
                        showId: index,
                        is_magnet: true,
                        complete: false,
                    };
                    const final_check = () => {
                        isValidString(chooseMag.magnet, 'url', 'magnet is not vaild');
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
            case 'kubo':
            //bj58 fun58 drive youtube dl fun23 bilibili
            //bj wd youku
            //bj11 fun10 tudou
            //bj6 fun3 qq
            //bj5 fun1 letv
            //bj8 fun9 funshion
            //bj7 fun5 sohu
            //bj10 fun8 iqiyi f4v
            //bj12 fun19 pptv x
            //bj9 fun7 pps x
            const kuboGetlist = () => Api('url', url, {referer: 'http://www.123kubo.com/'}).then(raw_data => {
                let is_end = false;
                const main = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0];
                for(let i of findTag(findTag(findTag(findTag(main, 'div', 'datal')[0], 'div', 'vmain')[0], 'div', 'vshow')[0], 'p')) {
                    for (let j of findTag(i)) {
                        if (j.match(/連載：完結/)) {
                            is_end = true;
                            break;
                        }
                    }
                    if (is_end) {
                        break;
                    }
                }
                const hideCont = findTag(findTag(main, 'div', 'topRow')[0], 'div', 'hideCont');
                let list = [];
                if (hideCont.length === 1) {
                    findTag(findTag(findTag(findTag(findTag(hideCont[0], 'ul')[0], 'div', 'vmain')[0], 'div', 'vpl')[0], 'ul')[0], 'li').forEach(l => {
                        const a = findTag(l, 'a')[0];
                        const href = a.attribs.href;
                        if (href.match(/168player/)) {
                            list.push({
                                url: href,
                                name: findTag(a)[0],
                            });
                        }
                    });
                } else if (hideCont.length > 1) {
                    let flvUrl = null;
                    for (let d of findTag(findTag(findTag(findTag(findTag(hideCont[1], 'ul')[0], 'div', 'vmain')[0], 'div', 'vpl')[0], 'ul')[0], 'div')) {
                        switch (d.attribs.id.match(/[^_]+$/)[0]) {
                            case 'FLV58':
                            case 'FLV11':
                            case 'FLV6':
                            case 'FLV5':
                            case 'FLV8':
                            case 'FLV7':
                            flvUrl = findTag(findTag(d, 'li')[0], 'a')[0].attribs.href;
                            break;
                        }
                        if (flvUrl) {
                            break;
                        }
                    }
                    if (!flvUrl) {
                        handleError(new HoError('no source'));
                    }
                    if (!flvUrl.match(/^(https|http):\/\//)) {
                        flvUrl = flvUrl.match(/^\//) ? `http://www.123kubo.com${flvUrl}` : flvUrl = `http://www.123kubo.com/${flvUrl}`;
                    }
                    console.log(flvUrl);
                    return Api('url', flvUrl, {referer: 'http://www.123kubo.com/'}).then(raw_data1 => {
                        const ff_urls = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data1), 'html')[0], 'body')[0], 'div', 'playmar')[0], 'div', 'play')[0], 'div')[0], 'script')[0])[0].match(/var ff\_urls\=\'([^\']+)/);
                        if (!ff_urls) {
                            handleError(new HoError('empty list'));
                        }
                        const raw_multi_list = getJson(ff_urls[1].replace(/\\\"/g, '"'));
                        if (!raw_multi_list.Data) {
                            handleError(new HoError('empty list'));
                        }
                        raw_multi_list.Data.forEach(i => {
                            switch (i.playname) {
                                case 'bj58':
                                i.playurls.forEach(j => {
                                    let list_match = j[1].match(/^fun58_(.*)$/);
                                    if (list_match) {
                                        list.push({
                                            name: j[0],
                                            id: `kdr_${new Buffer(list_match[1]).toString('base64')}`,
                                        });
                                    } else {
                                        list_match = j[1].match(/^(.*)_wd1$/);
                                        if (list_match) {
                                            list.push({
                                                name: j[0],
                                                id: `yuk_${list_match[1]}`,
                                            });
                                        } else {
                                            list_match = j[1].match(/^fun23_video\/(.*)\/$/);
                                            if (list_match) {
                                                list.push({
                                                    name: j[0],
                                                    id: `bil_${list_match[1]}`,
                                                });
                                            } else {
                                                list_match = j[1].match(/^FunCnd1_(.*)$/);
                                                if (list_match) {
                                                    list.push({
                                                        name: j[0],
                                                        id: `fc1_${list_match[1]}`,
                                                    });
                                                }
                                            }
                                        }
                                    }
                                });
                                break;
                                case 'bj':
                                i.playurls.forEach(j => {
                                    list_match = j[1].match(/^(.*)_wd1$/);
                                    if (list_match) {
                                        list.push({
                                            name: j[0],
                                            id: `yuk_${list_match[1]}`,
                                        });
                                    }
                                });
                                break;
                                case 'bj11':
                                i.playurls.forEach(j => {
                                    list_match = j[1].match(/^fun10_(.*)$/);
                                    if (list_match) {
                                        list.push({
                                            name: j[0],
                                            id: `tud_${list_match[1]}`,
                                        });
                                    }
                                });
                                break;
                                case 'bj6':
                                i.playurls.forEach(j => {
                                    list_match = j[1].match(/^fun3_(.*)$/);
                                    if (list_match) {
                                        list.push({
                                            name: j[0],
                                            id: `vqq_${list_match[1]}`,
                                        });
                                    }
                                });
                                break;
                                case 'bj5':
                                i.playurls.forEach(j => {
                                    list_match = j[1].match(/^fun1_(.*)$/);
                                    if (list_match) {
                                        list.push({
                                            name: j[0],
                                            id: `let_${list_match[1]}`,
                                        });
                                    }
                                });
                                break;
                                case 'bj8':
                                i.playurls.forEach(j => {
                                    list_match = j[1].match(/^fun9_(.*)$/);
                                    if (list_match) {
                                        list.push({
                                            name: j[0],
                                            id: `fun_m_${list_match[1]}`,
                                        });
                                    }
                                });
                                break;
                                case 'bj7':
                                i.playurls.forEach(j => {
                                    list_match = j[1].match(/^fun5_(.*)$/);
                                    if (list_match) {
                                        list.push({
                                            name: j[0],
                                            id: `soh_${list_match[1]}`,
                                        });
                                    }
                                });
                                break;
                            }
                        });
                        return [list, is_end];
                    });
                }
                return [list, is_end];
            });
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    const choose = raw_list[index - 1];
                    if (!choose) {
                        handleError(new HoError('cannot find external index'));
                    }
                    saveList(kuboGetlist, raw_list, is_end, etime);
                    return choose.url ? Api('url', choose.url, {referer: 'http://www.123kubo.com/'}).then(raw_data => [{
                        id: `you_${findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container')[0], 'div', 'youtube-player')[0], 'iframe')[0].attribs.src.match(/[^\/]+$/)[0]}`,
                        title:choose.name,
                        index,
                        showId: index,
                    }, is_end, raw_list.length]) : [Object.assign({title: choose.name}, choose.id.match(/^(yuk|soh|tud|vqq)_/) ? {
                        index: (index * 1000 + sub_index) / 1000,
                        showId: (index * 1000 + sub_index) / 1000,
                        id: `${choose.id}_${sub_index}`,
                    } : {
                        index,
                        showId: index,
                        id: choose.id,
                    }), is_end, raw_list.length];
                }
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : kuboGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });
            case 'yify':
            const yifyGetlist = () => Api('url', url, {referer: 'https://yts.ag/'}).then(raw_data => {
                const json_data = getJson(raw_data);
                if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                    handleError(new HoError('yify api fail'));
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
                    isValidString(raw_list[0].magnet, 'url', 'magnet is not vaild');
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
                    handleError(new HoError('bilibili id invalid'));
                }
                const getBangumi = sId => Api('url', `http://bangumi.bilibili.com/jsonp/seasoninfo/${sId}.ver?callback=seasonListCallback&jsonp=jsonp&_=${new Date().getTime()}`, {referer: url}).then(raw_data => {
                    const json_data = getJson(raw_data.match(/^[^\(]+\((.*)\);$/)[1]);
                    if (!json_data.result || !json_data.result.episodes) {
                        handleError(new HoError('cannot get episodes'));
                    }
                    return [
                        json_data.result.episodes.map(e => ({
                            id: `bil_av${e.av_id}_${e.index}`,
                            name: e.index_title,
                        })).reverse(),
                        json_data.result.seasons,
                    ];
                });
                return bili_id[1] ? Api('url', url, {referer: 'http://www.bilibili.com/'}).then(raw_data => {
                    const select = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'b-page-body')[0], 'div', 'player-wrapper')[0], 'div', 'main-inner')[0], 'div', 'v-plist')[0], 'div', 'plist')[0], 'select');
                    return (select.length > 0) ? findTag(select[0], 'option').map(o => ({
                        id: `bil_${bili_id[0]}_${o.attribs.value.match(/index_(\d+)\.html/)[1]}`,
                        name: findTag(o)[0],
                    })) : [{
                        id: `bil_${bili_id[0]}`,
                        name: 'bil',
                    }];
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
                        handleError(new HoError('cannot find external index'));
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
            case 'cartoonmad':
            if (!url.match(/\d+/)) {
                handleError(new HoError('comic id invalid'));
            }
            const madGetlist = () => Api('url', url, {
                referer: 'http://www.cartoonmad.com/',
                not_utf8: true,
            }).then(raw_data => {
                const table = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[0], 'tr')[0], 'td')[1], 'table')[0], 'tr')[3], 'td')[0], 'table')[0], 'tr')[1], 'td')[1], 'table');
                const is_end = findTag(findTag(findTag(table[0], 'tr')[6], 'td')[0], 'img')[1].attribs.src.match(/\/image\/chap9\.gif$/) ? true : false;
                let list = [];
                findTag(findTag(findTag(findTag(table[2], 'tr')[0], 'td')[0], 'fieldset')[0], 'table').forEach(t => {
                    findTag(t, 'tr').forEach(r => {
                        findTag(r, 'td').forEach(d => {
                            const a = findTag(d, 'a');
                            if (a.length > 0) {
                                list.push(a[0].attribs.href);
                            }
                        });
                    });
                })
                return [list, is_end];
            });
            return Redis('hgetall', `url: ${encodeURIComponent(url)}`).then(item => {
                const sendList = (raw_list, is_end, etime) => {
                    const choose = raw_list[index - 1];
                    if (!choose) {
                        handleError(new HoError('cannot find external index'));
                    }
                    return Api('url', !choose.match(/^(https|http):\/\//) ? choose.match(/^\//) ? `http://www.cartoomad.com${choose}` : `http://www.cartoomad.com/${choose}` : choose, {
                        referer: 'http://www.cartoonmad.com/',
                        not_utf8: true,
                    }).then(raw_data => {
                        const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                        const sub = Number(choose.match(/(\d\d\d)\d\d\d\.html$/)[1]);
                        let pre_obj = [];
                        for (let i = 1; i <= sub; i++) {
                            pre_obj.push((i < 10) ? `00${i}.jpg` : (i < 100) ? `0${i}.jpg` : `${i}.jpg`);
                        }
                        saveList(madGetlist, raw_list, is_end, etime);
                        return [{
                            index: (index * 1000 + sub_index) / 1000,
                            showId: (index * 1000 + sub_index) / 1000,
                            title: findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(body, 'table')[0], 'tr')[1], 'td')[0], 'table')[0], 'tr')[0], 'td')[1], 'center')[0], 'li')[0], 'a')[1])[0],
                            pre_url: findTag(findTag(findTag(findTag(body, 'tr')[0], 'td')[0], 'a')[0], 'img')[0].attribs.src.match(/^(.*?)[^\/]+$/)[1],
                            sub,
                            pre_obj,
                        }, is_end, raw_list.length];
                    });
                }
                return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : madGetlist().then(([raw_list, is_end]) => sendList(raw_list, is_end, -1));
            });
            default:
            handleError(new HoError('unknown external type'));
        }
    },
}

const findTag = (node, tag=null, id=null) => {
    let ret = [];
    const item = node.children ? node.children : node;
    if (!Array.isArray(item)) {
        return ret;
    }
    for (let c of item) {
        if (tag) {
            if ((c.type === 'tag' || c.type === 'script') && c.name === tag) {
                if (id) {
                    if (c.attribs && (c.attribs.class === id || c.attribs.id === id)) {
                        ret.push(c);
                    }
                } else {
                    ret.push(c);
                }
            }
        } else {
            if (c.type === 'text' && c.data.trim()) {
                ret.push(c.data.trim());
            }
        }
    }
    return ret;
}

export const bilibiliVideoUrl = url => {
    console.log(url);
    const id = url.match(/(av)?(\d+)\/(index_(\d+)\.html)?$/);
    if (!id) {
        handleError(new HoError('bilibili id invalid'));
    }
    const page = id[3] ? Number(id[4]) - 1 : 0;
    return Api('url', `http://api.bilibili.com/view?type=json&appkey=8e9fc618fbd41e28&id=${id[2]}&page=1&batch=true`, {referer: 'http://api.bilibili.com/'}).then(raw_data => {
        const json_data = getJson(raw_data);
        if (!json_data.list) {
            handleError(new HoError('cannot get list'));
        }
        const cid = json_data.list[page].cid;
        if (!cid) {
            handleError(new HoError('cannot get cid'));
        }
        return Api('url', `http://interface.bilibili.com/playurl?platform=bilihelper&otype=json&appkey=8e9fc618fbd41e28&cid=${cid}&quality=4&type=mp4`, {
            referer: 'http://interface.bilibili.com/',
            fake_ip: '220.181.111.228',
        }).then(raw_data => {
            const json_data_1 = getJson(raw_data);
            if (!json_data_1.durl || !json_data_1.durl[0] || !json_data_1.durl[0].url) {
                handleError(new HoError('cannot find videoUrl'));
            }
            return {
                title: json_data.list[page].part,
                video: [json_data_1.durl[0].url],
            }
        });
    });
}

export const youtubeVideoUrl = (id, url) => new Promise((resolve, reject) => YouGetInfo(url, [], {maxBuffer: 10 * 1024 * 1024}, (err, info) => err ? reject(err) : resolve(info))).then(info => {
    let ret_obj = {
        title: info.title,
        video: [],
    };
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
                ret_obj['video'].splice(0, 0, i.url);
            }
        });
    }
    return ret_obj;
});

export const kuboVideoUrl = (id, url, subIndex) => {
    const getList = raw_data => {
        const video_list = raw_data.match(/\!\[CDATA\[[^\]]+/g);
        if (!video_list) {
            handleError(new HoError(`${id} video invaild!!!`));
        }
        let list = [];
        for (let i of video_list) {
            const list_match = i.match(/^\!\[CDATA\[([^\]]+)$/);
            if (list_match) {
                list.push(list_match[1]);
            }
        }
        if (list.length < 1) {
            handleError(new HoError(`${id} video invaild!!!`));
        }
        if (!list[subIndex-1]) {
            handleError(new HoError(`${id} video index invaild!!!`));
        }
        return list;
    }
    if (id === 'kdr') {
        const referer = `http://forum.123kubo.com/jx/gdplayer/ck.php?url=${url}`;
        return Api('url', `http://jaiwen.com/jx/gg58/xml.php?url=gg_${url}_cq`, {referer}).then(raw_data => {
            const list = getList(raw_data);
            return list[subIndex-1].match(/&itag=35&/) ? Api('url', `http://jaiwen.com/jx/gg58/xml.php?url=gg_${url}_gq`, {referer}).then(raw_data => {
                const list2 = getList(raw_data);
                return ret_obj = Object.assign({
                    title: id,
                    video: [list2[subIndex-1]],
                }, (list2.length > 1) ? {sub: list2.length} : {});
            }) : Object.assign({
                title: id,
                video: [list[subIndex-1]],
            }, (list.length > 1) ? {sub: list.length} : {});
        });
    } else {
        return Api('url', `http://888blb1.flvapi.com/video.php?url=gq_${new Buffer(url).toString('base64')}_a`, {referer: 'http://888blb1.flvapi.com/'}).then(raw_data => {
            const list = getList(raw_data);
            if (id === 'yuk' && list[subIndex-1].match(/flv/)) {
                const base = new Buffer(url).toString('base64');
                return Api('url', `http://forum.123kubo.com/jx/show.php?playlist=1&fmt=1&rand=${new Date().getTime()}`, {
                    referer: `http://forum.123kubo.com/jx/show.php?url=${base}`,
                    post: {url: base},
                }).then(raw_data => {
                    const json_data = getJson(raw_data);
                    if (!json_data || !json_data['3gphd']) {
                        console.log(raw_data);
                        handleError(new HoError('kubo api fail'));
                    }
                    return {
                        title: json_data['title'],
                        video: [json_data['3gphd'][0].url],
                    };
                });
            } else {
                return Object.assign({
                    title: id,
                    video: [list[subIndex-1]],
                }, (list.length > 1) ? {sub: list.length} : {});
            }
        });
    }
}