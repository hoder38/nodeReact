import { GENRE_LIST, GENRE_LIST_CH, DM5_ORI_LIST, DM5_CH_LIST, GAME_LIST, GAME_LIST_CH, MUSIC_LIST, MUSIC_LIST_WEB, CACHE_EXPIRE, STORAGEDB, MONTH_NAMES, DOCDB } from '../constants.js'
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
            return Api('url', 'https://www.bea.gov/news/current-releases', {agent: {}}).then(raw_data => {
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
                const div = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'publicationWrap esfPubWrap')[0];
                if (div) {
                    if (findTag(findTag(findTag(findTag(findTag(findTag(div, 'section', 'mbN-40')[0], 'div', 'publctnInWrap mbN-80 pubHubGrayBox')[0], 'div', 'mainContainer')[0], 'div', 'chConferences')[0], 'p', 'date')[0])[0].includes(docDate)) {
                        list.push({
                            url: 'https://www.conference-board.org/data/consumerconfidence.cfm',
                            name: toValidName('Consumer Confidence Survey'),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                } else if (findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'publicationWrap esfPubWrap esfTopicsBannerMain')[0], 'section', 'mbN-40')[0], 'div', 'publctnInWrap mbN-80 pubHubGrayBox')[0], 'div', 'mainContainer')[0], 'div', 'chConferences')[0], 'p', 'date')[0])[0].includes(docDate)) {
                    list.push({
                        url: 'https://www.conference-board.org/data/consumerconfidence.cfm',
                        name: toValidName('Consumer Confidence Survey'),
                        date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                    });
                }
                return list;
                /*if (body) {
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
                });*/
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
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'section container')[0], 'div', 'row')[0], 'div', 'col-sm-9 leftnav-content-wrapper')[0], 'div', 'newsroom-lists')[0], 'div', 'news-col block')[1], 'ul', 'block-list')[0], 'li', 'news-event-item linked').forEach(l => {
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
            return Api('url', 'https://www.dol.gov/newsroom/releases', {agent: {}, }).then(raw_data => {
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
                console.log(raw_data);
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
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'div', 'group sys-root')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-wrapper')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'base-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-page-area')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-section')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group page-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'area-table rwd-straight')[0], 'div')[0], 'div')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr').forEach(t => {
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
                const application = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'function-cabinet')[0], 'div', 'container')[0], 'div', 'row')[0], 'div', 'left-content')[0], 'div', 'left-content-text')[0], 'div', 'paging-content')[0], 'div', 'application')[0];
                if (application) {
                    for (let l of findTag(findTag(findTag(application, 'table')[0], 'tbody')[0], 'tr')) {
                        const t2 = findTag(l, 'td')[2];
                        if (t2) {
                            const t2s = findTag(t2, 'span')[0];
                            if (t2s) {
                                if (findTag(t2s)[0] === docDate) {
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
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'div', 'group sys-root')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-wrapper')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'base-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-page-area')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-section')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group page-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'area-table rwd-straight')[0], 'div')[0], 'div')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr').forEach(t => {
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
                    findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'div', 'group sys-root')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-wrapper')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'base-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-page-area')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-section')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group page-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'area-table rwd-straight')[0], 'div')[0], 'div')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr').forEach(t => {
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
                return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath, agent: {}}).then(() => GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    filePath,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => handleError(err),
                })));
            }
            return Api('url', obj.url, {agent: {}}).then(raw_data => {
                const hs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'div')[0], 'div', 'row')[0], 'div', 'test')[0], 'div', 'region region-content')[0], 'article')[0], 'div', 'row')[0], 'div', 'container')[0], 'div', 'tab-content')[0], 'div', 'menu1')[0], 'div', 'row')[0], 'div')[0], 'h3');
                for (let h of hs) {
                    const a = findTag(h, 'a')[0];
                    const tex = findTag(a)[0] ? findTag(a)[0] : findTag(findTag(a, 'div')[0])[0];
                    if (tex.match(/^Full Release/)) {
                        const url = addPre(a.attribs.href, 'http://www.bea.gov');
                        driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                        console.log(driveName);
                        return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath, agent: {}}).then(() => GoogleApi('upload', {
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
            /*console.log(obj);
            driveName = `${obj.name} ${obj.date}${PathExtname(obj.url)}`;
            console.log(driveName);
            return mkFolder(PathDirname(filePath)).then(() => Api('url', obj.url, {filePath}).then(() => GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                filePath,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => handleError(err),
            })));*/
            case 'sta':
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
            /*console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'div', 'group sys-root')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-wrapper')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'base-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-page-area')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group base-section')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'group page-content')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'area-essay page-caption-p')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0], 'div', 'p')[0], 'p')[0], 'span')[0], 'p').forEach(p => {
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
            });*/
            case 'mof':
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
            /*console.log(obj);
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
            });*/
            case 'moe':
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
            /*console.log(obj);
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
            });*/
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



const updateDocDate = (type, date) => Mongo('update', DOCDB, {type}, {$set: {type, date}}, {upsert: true});
