import { GENRE_LIST, GENRE_LIST_CH, TRANS_LIST, TRANS_LIST_CH, GAME_LIST, GAME_LIST_CH, MUSIC_LIST, MUSIC_LIST_WEB, CACHE_EXPIRE, STORAGEDB, MONTH_NAMES, MONTH_SHORTS, DOCDB } from '../constants'
import OpenCC from 'opencc'
import Htmlparser from 'htmlparser2'
import { dirname as PathDirname, extname as PathExtname, join as PathJoin } from 'path'
import { getInfo as YouGetInfo} from 'youtube-dl'
import Mkdirp from 'mkdirp'
import { existsSync as FsExistsSync } from 'fs'
import Redis from '../models/redis-tool'
import GoogleApi from '../models/api-tool-google'
import { normalize, isDefaultTag } from '../models/tag-tool'
import Mongo, { objectID } from '../models/mongo-tool'
import { handleError, HoError, toValidName, isValidString, getJson, completeZero, getFileLocation, findTag, addPre } from '../util/utility'
import { addPost } from '../util/mime'
import Api from './api-tool'

const opencc = new OpenCC('s2t.json');

export default {
    //type要補到deltag裡
    getList: function(type, is_clear=false) {
        const clearExtenal = () => is_clear ? Mongo('remove', STORAGEDB, {
            owner: type,
            $isolated: 1,
        }).then(item => {
            console.log('perm external file');
            console.log(item);
        }) : Promise.resolve();
        switch (type) {
            case 'lovetv':
            const dramaList = [
                'http://tw.lovetvshow.info/2013/05/drama-list.html',
                'http://cn.lovetvshow.info/2012/05/drama-list.html',
                'http://kr.vslovetv.com/2012/04/drama-list.html',
                'http://jp.jplovetv.com/2012/08/drama-list.html',
            ];
            const recur_loveSave = (index, dramaIndex, list) => {
                const external_item = list[index];
                let name = toValidName(external_item.name);
                if (isDefaultTag(normalize(name))) {
                    name = addPost(name, '1');
                }
                return Mongo('count', STORAGEDB, {
                    owner: type,
                    name,
                }, {limit: 1}).then(count => {
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
                    }
                    setTag.add(normalize(name)).add(normalize(type));
                    if (external_item.type) {
                        setTag.add(normalize(external_item.type));
                    }
                    setTag.add(normalize(external_item.year));
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
                        url: isValidString(external_item.url, 'url', 'url is not vaild'),
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
                        return nextLove(index + 1, dramaIndex, list);
                    });
                });
            }
            const recur_loveList = dramaIndex => Api('url', dramaList[dramaIndex]).then(raw_data => {
                let list = [];
                let year = null;
                let table = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'widget Blog')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer')[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0], 'table')[0];
                const tbody = findTag(table, 'tbody')[0];
                if (tbody) {
                    table = tbody;
                }
                table.children.forEach(t => findTag(t, 'td').forEach(d => {
                    const h = findTag(d, 'h3')[0];
                    if (h) {
                        const a = findTag(h, 'a')[0];
                        if (a) {
                            const name = findTag(a)[0];
                            if (name) {
                                if (name.match(/�/)) {
                                    return true;
                                }
                                const dramaType = findTag(h)[0];
                                if (year) {
                                    list.push(Object.assign({
                                        name,
                                        url: (dramaIndex === 0) ? addPre(a.attribs.href, 'http://tw.lovetvshow.info') : (dramaIndex === 1) ? addPre(a.attribs.href, 'http://cn.lovetvshow.info') : (dramaIndex === 2) ? addPre(a.attribs.href, 'http://kr.vslovetv.com') : addPre(a.attribs.href, 'http://jp.jplovetv.com'),
                                        year,
                                    }, dramaType ? {type: dramaType.match(/^\(([^\)]+)/)[1]} : {}));
                                }
                                return true;
                            }
                        }
                        const getY = node => {
                            const y = findTag(node)[0].match(/^(Pre-)?\d+/);
                            if (y) {
                                year = y[0];
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
                console.log(list.length);
                return nextLove(0, dramaIndex, list);
            });
            function nextLove(index, dramaIndex, list) {
                if (index < list.length) {
                    return recur_loveSave(index, dramaIndex, list);
                } else {
                    dramaIndex++;
                    if (dramaIndex < dramaList.length) {
                        return recur_loveList(dramaIndex);
                    }
                }
                return Promise.resolve();
            }
            return clearExtenal().then(() => recur_loveList(0));
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
                }, {limit: 1}).then(count => {
                    if (count > 0) {
                        return nextEztv(index + 1, list);
                    }
                    const url = isValidString(external_item.url, 'url', 'url is not vaild');
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
                            const imdb = a.attribs.href.match(/http:\/\/www\.imdb\.com\/title\/(tt\d+)\//);
                            if (imdb) {
                                setTag.add(normalize(imdb[1]));
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
                        list.push({
                            name: findTag(a)[0],
                            url: addPre(a.attribs.href, 'https://eztv.ag'),
                        });
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
            handleError(new HoError('unknown external type'));
        }
    },
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
            case 'bls':
            return Api('url', 'http://www.bls.gov/bls/newsrels.htm#latest-releases').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${completeZero(date.getMonth() + 1, 2)}/${completeZero(date.getDate(), 2)}/${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'section')[0], 'div', 'wrapper-outer')[0], 'div', 'wrapper')[0], 'div', 'container')[0], 'table', 'main-content-table')[0], 'tr')[0], 'td', 'main-content-td')[0], 'div', 'bodytext')[0], 'ul')[0], 'li').forEach(l => {
                    if (findTag(l)[0] === docDate) {
                        const a = findTag(l, 'a')[0];
                        list.push({
                            url: addPre(a.attribs.href, 'http://www.bls.gov'),
                            name: toValidName(findTag(a)[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'cen':
            return Api('url', 'http://www.census.gov/economic-indicators/').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'innerPage')[0], 'div', 'econ-content-container')[0], 'table', 'indicator-table')[0], 'tbody')[0], 'tr').forEach(r => {
                    if (findTag(findTag(findTag(findTag(findTag(r, 'td', 'indicator_dates')[0], 'div')[0], 'p')[0], 'span')[0])[0] === docDate) {
                        const div = findTag(findTag(r, 'td', 'indicator_data')[0], 'div')[0];
                        list.push({
                            url: addPre(findTag(findTag(div, 'p', 'supplemental_links')[0], 'a')[0].attribs.href, 'http://www.census.gov'),
                            name: toValidName(findTag(findTag(findTag(div, 'h3')[0], 'a')[0])[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'bea':
            return Api('url', 'http://www.bea.gov/').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'cfinclude')[0], 'div', 'content')[0], 'div', 'col-sm-4 home-right pull-right')[0], 'div', 'menuPod_wrapper')[0], 'div', 'menuPod_header')[0], 'div', 'latestStatistics_wrapper')[0], 'a').forEach(a => {
                    let first = findTag(a, 'div', 'releaseHeader first')[0];
                    if (!findTag(a, 'div', 'releaseHeader first')[0]) {
                        first = findTag(a, 'div', 'releaseHeader')[0];
                    }
                    if (findTag(findTag(findTag(findTag(first, 'ul', 'latestStatistics_section')[0], 'li', 'date')[0], 'span')[0])[0] === docDate) {
                        list.push({
                            url: addPre(a.attribs.href, 'http://www.bea.gov'),
                            name: toValidName(findTag(findTag(findTag(findTag(a, 'div', 'releaseContent')[0], 'ul', 'latestStatistics_section')[0], 'li')[0])[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            case 'ism':
            return Api('url', 'https://www.instituteforsupplymanagement.org/ISMReport/MfgROB.cfm?SSO=1').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                console.log(docDate);
                const docStr = `FOR RELEASE: ${docDate}`;
                let list = [];
                if(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'bodywrapper')[0], 'div', 'column2')[0], 'div', 'home_feature_container')[0], 'div', 'content')[0], 'div', 'column1_list')[0], 'div', 'formatted_content')[0], 'span')[0], 'p')[0], 'strong')[0])[0] === docStr) {
                    list.push({
                        url: 'https://www.instituteforsupplymanagement.org/ISMReport/MfgROB.cfm?SSO=1',
                        name: toValidName('Manufacturing ISM'),
                        date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                    });
                }
                return Api('url', 'https://www.instituteforsupplymanagement.org/ISMReport/NonMfgROB.cfm?SSO=1').then(raw_data => {
                    if(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'bodywrapper')[0], 'div', 'column2')[0], 'div', 'home_feature_container')[0], 'div', 'content')[0], 'div', 'column1_list')[0], 'div', 'formatted_content')[0], 'p')[0], 'strong')[0])[0] === docStr) {
                        list.push({
                            url: 'https://www.instituteforsupplymanagement.org/ISMReport/NonMfgROB.cfm?SSO=1',
                            name: toValidName('Non-Manufacturing ISM'),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                    return list;
                });
            });
            case 'cbo':
            return Api('url', 'https://www.conference-board.org/data/consumerconfidence.cfm').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                let docDate = `${date.getDate()} ${MONTH_SHORTS[date.getMonth()]}. ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                if (findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container tcb-wrapper')[0], 'div', 'wrap')[0], 'div', 'content')[0], 'p', 'date')[0])[0] === docDate) {
                    list.push({
                        url: 'https://www.conference-board.org/data/consumerconfidence.cfm',
                        name: toValidName('Consumer Confidence Survey'),
                        date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                    });
                }
                return Api('url', 'https://www.conference-board.org/data/bcicountry.cfm?cid=1').then(raw_data => {
                    docDate = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                    console.log(docDate);
                    if (findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container tcb-wrapper')[0], 'div', 'wrap')[0], 'div', 'content')[0], 'p', 'date')[0])[0].match(/[a-zA-Z]+ \d\d?, \d\d\d\d$/)[0] === docDate) {
                        list.push({
                            url: 'https://www.conference-board.org/data/bcicountry.cfm?cid=1',
                            name: toValidName('US Business Cycle Indicators'),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                    return list;
                });
            });
            case 'sem':
            return Api('url', 'http://www.semi.org/en/NewsFeeds/SEMIHighlights/index.rss').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${completeZero(date.getDate(), 2)} ${MONTH_SHORTS[date.getMonth()]} ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'rss')[0], 'channel')[0], 'atom:link')[0], 'item').forEach(e => {
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
            return Api('url', 'http://www.oecd.org/newsroom/').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
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
            return Api('url', 'http://www.dol.gov/newsroom/releases').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${MONTH_NAMES[date.getMonth()]} ${completeZero(date.getDate(), 2)}, ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                const section = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'site-wrapper')[0], 'div', 'main-container container')[0], 'div', 'row')[0], 'section', 'col-sm-12')[0], 'div', 'region region-content')[0], 'section', 'block-system-main')[0];
                const divs = findTag(section, 'div', 'field field-name-title field-type-ds field-label-hidden');
                for (let i in divs) {
                    const a = findTag(findTag(findTag(divs[i], 'div')[0], 'div')[0], 'a')[0];
                    if (findTag(a)[0] === 'Unemployment Insurance Weekly Claims Report' && findTag(findTag(findTag(findTag(findTag(section, 'div', 'field field-name-field-release-date field-type-datetime field-label-hidden')[i], 'div')[0], 'div')[0], 'span')[0])[0].match(/[a-zA-Z]+ \d\d, \d\d\d\d$/)[0] === docDate) {
                        list.push({
                            url: addPre(a.attribs.href, 'http://www.dol.gov'),
                            name: toValidName('Unemployment Insurance Weekly Claims Report'),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                }
                return list;
            });
            case 'rea':
            return Api('url', 'http://www.realtor.org/topics/existing-home-sales').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                let link = false;
                let today = false;
                const lis = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'page clearfix')[0], 'section', 'section-content')[0], 'div', 'zone-content-wrapper')[0], 'div', 'zone-content')[0], 'div', 'region-content')[0], 'div', 'region-inner region-content-inner')[0], 'div', 'block-system-main')[0], 'div', 'block-inner clearfix')[0], 'div', 'content clearfix')[0], 'div', 'clearfix panel-display omega-grid rotheme-12-twocol-8-4-stacked')[0], 'div', 'panel-panel grid-8')[0], 'div', 'grid-8 alpha omega')[0], 'div', 'inside')[0], 'div', 'panel-pane pane-entity-field pane-node-body')[0], 'div', 'pane-content')[0], 'div', 'field field-name-body field-type-text-with-summary field-label-hidden')[0], 'div', 'field-items')[0], 'div', 'field-item even')[0], 'ul')[0], 'li');
                for (let l of lis) {
                    const a = findTag(l, 'a')[0];
                    if (findTag(a)[0] === 'Read the full news release') {
                        link = a.attribs.href;
                    }
                    const dateMatch = a.attribs.href.match(/\d\d\d\d-\d\d-\d\d/);
                    if (dateMatch && dateMatch[0] === docDate) {
                        today = true;
                    }
                    if (link && today) {
                        list.push({
                            url: addPre(link, 'http://www.realtor.org'),
                            name: toValidName('Existing-Home Sales'),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                        break;
                    }
                }
                return list;
            });
            case 'sca':
            return Api('url', 'http://www.sca.isr.umich.edu/').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
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
                    handleError(new HoError('date invalid'));
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
                return Api('url', 'http://www.federalreserve.gov/releases/g17/Current/default.htm').then(raw_data => {
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
                    return Api('url', 'http://www.federalreserve.gov/releases/g19/current/default.htm').then(raw_data => {
                        if (findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'dates')[0])[2] === `: ${docDate}`) {
                            list.push({
                                url: 'http://www.federalreserve.gov/releases/g19/current/default.htm',
                                name: toValidName('Consumer Credit'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                        return list;
                    });
                });
            });
            case 'sea':
            return Api('url', 'http://www.seaj.or.jp/english/statistics/page_en.php?CMD=1').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'table')[2], 'tr')[0], 'td')[2], 'table')[5], 'tr')[1], 'td')[0], 'table')[0], 'tr')[0], 'td')[0], 'table')[0], 'tr').forEach(t => {
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
                    handleError(new HoError('date invalid'));
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
            return Api('url', 'http://index.ndc.gov.tw/n/json/data/news', {post: {}}).then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                const json_data = getJson(raw_data);
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
            return Api('url', 'http://www.stat.gov.tw/lp.asp?ctNode=489&CtUnit=1818&BaseDSD=29').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
                console.log(docDate);
                let list = [];
                const findDoc = (title, raw_data) => {
                    const html = findTag(Htmlparser.parseDOM(raw_data), 'html')[0];
                    const html2 = findTag(html, 'html')[0];
                    findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'table')[0], 'tr').forEach(t => {
                        if (findTag(findTag(t, 'td')[1])[0] === docDate) {
                            list.push({
                                url: addPre(findTag(findTag(t, 'td')[0], 'a')[0].attribs.href, 'http://www.stat.gov.tw'),
                                name: toValidName(title),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                    });
                }
                findDoc('物價指數', raw_data);
                return Api('url', 'http://www.stat.gov.tw/lp.asp?ctNode=497&CtUnit=1818&BaseDSD=29').then(raw_data => {
                    findDoc('經濟成長率', raw_data);
                    return Api('url', 'http://www.stat.gov.tw/lp.asp?ctNode=527&CtUnit=1818&BaseDSD=29&MP=4').then(raw_data => {
                        findDoc('受僱員工薪資與生產力', raw_data);
                        return Api('url', 'http://www.stat.gov.tw/lp.asp?ctNode=2294&CtUnit=1818&BaseDSD=29&mp=4').then(raw_data => {
                            const pDate = new Date(new Date(date).setMonth(date.getMonth()-1));
                            const docDate1 = `${pDate.getFullYear() - 1911}年${pDate.getMonth() + 1}月`;
                            console.log(docDate1);
                            const html = findTag(Htmlparser.parseDOM(raw_data), 'html')[0];
                            const html2 = findTag(html, 'html')[0];
                            const lis = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                            let link = null;
                            for (let l of lis) {
                                const a = findTag(l, 'a')[0];
                                const dateMatch = findTag(a)[0].match(/^\d\d\d年\d\d?月/);
                                if (dateMatch && dateMatch[0] === docDate1) {
                                    link = addPre(a.attribs.href, 'http://www.stat.gov.tw');
                                    break;
                                }
                            }
                            return link ? Api('url', link).then(raw_data => {
                                const html = findTag(Htmlparser.parseDOM(raw_data), 'html')[0];
                                const html2 = findTag(html, 'html')[0];
                                if (findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'cp')[0], 'div', 'article')[0], 'div', 'p_date')[0])[0].match(/\d\d\d\d\/\d\d?\/\d\d?$/)[0] === docDate) {
                                    list.push({
                                        url: link,
                                        name: toValidName('失業率'),
                                        date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                                    });
                                }
                                return list;
                            }) : list;
                        });
                    });
                });
            });
            case 'mof':
            return Api('url', 'http://www.mof.gov.tw/Pages/List.aspx?nodeid=281').then(raw_data => {
                const date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'form1')[0], 'div', 'wrapper')[0], 'div', 'wrapperInner')[0], 'div', 'contentBox')[0], 'div', 'subpageBox')[0], 'div', 'rowBox_2column_s1')[0], 'div', 'rowBox_2column_s1_col-1')[0], 'div', 'normalListBox')[0], 'div', 'normalListBox_data')[0], 'div', 'tableBox')[0], 'table', 'table_list printArea')[0], 'tr').forEach(t => {
                    const td = findTag(t, 'td')[3];
                    if (td && findTag(findTag(td, 'div')[0])[0] === docDate) {
                        const a = findTag(findTag(findTag(t, 'td')[1], 'div')[0], 'a')[0];
                        if (a.attribs.title.match(/海關進出口貿易/)) {
                            list.push({
                                url: addPre(a.attribs.href, 'http://www.mof.gov.tw'),
                                name: toValidName(a.attribs.title),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                        }
                    }
                });
                return list;
            });
            case 'moe':
            return Api('url', 'http://www.stat.gov.tw/lp.asp?ctNode=2299&CtUnit=1818&BaseDSD=29').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${date.getFullYear()}-${completeZero(date.getMonth() + 1, 2)}-${completeZero(date.getDate(), 2)}`;
                console.log(docDate);
                let list = [];
                const pDate = new Date(new Date(date).setMonth(date.getMonth() - 1));
                const docDate1 = `${pDate.getFullYear() - 1911}年${pDate.getMonth() + 1}月`;
                console.log(docDate1);
                let html = findTag(Htmlparser.parseDOM(raw_data), 'html')[0];
                if (!html) {
                    console.log(raw_data);
                    handleError(new HoError('empty html'));
                }
                const html2 = findTag(html, 'html')[0];
                let lis = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                let dUrl = false;
                for (let l of lis) {
                    const a = findTag(l, 'a')[0];
                    if (a.attribs.title.match(/^\d\d\d年\d\d?月/)[0] === docDate1) {
                        dUrl = addPre(a.attribs.href, 'http://www.moea.gov.tw');
                        break;
                    }
                };
                const industrial = () => dUrl ? Api('url', dUrl).then(raw_data => {
                    const detail = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'aspnetForm')[0], 'div')[2], 'div', 'ctl00_Float_layer')[0], 'div', 'divContent')[0], 'div', 'container')[0], 'div', 'div-table-content')[0], 'div', 'row div-tr-content')[0], 'div', 'div-table-content')[0], 'div', 'ctl00_div_Content')[0], 'div', 'divNewsDetail')[0];
                    const texts = findTag(detail);
                    for (let t of texts) {
                        const matchT = t.match(/\d\d\d\d-\d\d-\d\d/);
                        if (matchT && matchT[0] === docDate) {
                            list.push({
                                url: dUrl,
                                name: toValidName('工業生產'),
                                date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                            });
                            break;
                        }
                    }
                }) : Promise.resolve();
                return industrial().then(() => Api('url', 'http://www.stat.gov.tw/lp.asp?ctNode=2300&CtUnit=1818&BaseDSD=29').then(raw_data => {
                    html = findTag(Htmlparser.parseDOM(raw_data), 'html')[0];
                    if (!html) {
                        console.log(raw_data);
                        handleError(new HoError('empty html'));
                    }
                    const html2 = findTag(html, 'html')[0];
                    lis = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                    dUrl = false;
                    for (let l of lis) {
                        const a = findTag(l, 'a')[0];
                        const aMatch = a.attribs.title.match(/^\d\d\d年\d\d?月/);
                        if (aMatch && aMatch[0] === docDate1) {
                            dUrl = addPre(a.attribs.href, 'http://www.moea.gov.tw');
                            break;
                        }
                    };
                    const output = () => dUrl ? Api('url', dUrl).then(raw_data => {
                        const detail = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'aspnetForm')[0], 'div')[2], 'div', 'ctl00_Float_layer')[0], 'div', 'divContent')[0], 'div', 'container')[0], 'div', 'div-table-content')[0], 'div', 'row div-tr-content')[0], 'div', 'div-table-content')[0], 'div', 'ctl00_div_Content')[0], 'div', 'divNewsDetail')[0];
                        const texts = findTag(detail);
                        for (let t of texts) {
                            const matchT = t.match(/\d\d\d\d-\d\d-\d\d/);
                            if (matchT && matchT[0] === docDate) {
                                list.push({
                                    url: dUrl,
                                    name: toValidName('外銷訂單統計'),
                                    date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                                });
                                break;
                            }
                        }
                    }) : Promise.resolve();
                    return output().then(() => list);
                }));
            });
            case 'cbc':
            return Api('url', 'http://www.cbc.gov.tw/rss.asp?ctNodeid=302').then(raw_data => {
                let date = new Date(url);
                if (isNaN(date.getTime())) {
                    handleError(new HoError('date invalid'));
                }
                date = new Date(new Date(date).setDate(date.getDate() - 1));
                const docDate = `${completeZero(date.getDate(), 2)} ${MONTH_SHORTS[date.getMonth()]} ${date.getFullYear()}`;
                console.log(docDate);
                let list = [];
                findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'rss')[0], 'channel')[0], 'item').forEach(t => {
                    if (findTag(findTag(t, 'pubdate')[0])[0].match(/\d\d [a-zA-Z]+ \d\d\d\d/)[0] === docDate) {
                        list.push({
                            url: addPre(findTag(t)[0], 'http://www.cbc.gov.tw'),
                            name: toValidName(findTag(findTag(t, 'title')[0])[0]),
                            date: `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`,
                        });
                    }
                });
                return list;
            });
            default:
            return Promise.reject(handleError(new HoError('unknown external type')));
        }
    },
    save2Drive: function(type, obj, parent) {
        const mkFolder = folderPath => !FsExistsSync(folderPath) ? new Promise((resolve, reject) => Mkdirp(folderPath, err => err ? reject(err) : resolve())) : Promise.resolve();
        const filePath = getFileLocation(type, objectID());
        console.log(filePath);
        let driveName = '';
        switch (type) {
            case 'bls':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                const a = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper-basic')[0], 'div', 'main-content-full-width')[0], 'div', 'bodytext')[0], 'h4')[1], 'a')[0];
                if (!findTag(a)[0].match(/PDF/i)) {
                    handleError(new HoError('cannot find release'));
                }
                const url = addPre(a.attribs.href, 'http://www.bls.gov');
                driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                console.log(driveName);
                return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    filePath,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => {
                        throw err;
                    },
                })));
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
                errhandle: err => {
                    throw err;
                },
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
                    errhandle: err => {
                        throw err;
                    },
                })));
            }
            return Api('url', obj.url).then(raw_data => {
                const a = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'cfinclude')[0], 'table')[0], 'tr')[0], 'td', 'sidebar')[0], 'div', 'sidebarRight')[0], 'ul', 'related_files')[0], 'li')[0], 'a')[0];
                if (!findTag(a)[0].match(/^Full Release/)) {
                    handleError(new HoError('cannot find release'));
                }
                const url = addPre(a.attribs.href, 'http://www.bea.gov');
                driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                console.log(driveName);
                return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    filePath,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => {
                        throw err;
                    },
                })));
            });
            case 'ism':
            console.log(obj);
            driveName = `${obj.name} ${obj.date}.txt`;
            console.log(driveName);
            return GoogleApi('upload', {
                type: 'auto',
                name: driveName,
                body: obj.url,
                parent,
                rest: () => updateDocDate(type, obj.date),
                errhandle: err => {
                    throw err;
                },
            });
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
                errhandle: err => {
                    throw err;
                },
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
                errhandle: err => {
                    throw err;
                },
            });
            case 'oec':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                const a = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'section container')[0], 'div', 'row')[0], 'div', 'col-sm-9 leftnav-content-wrapper')[0], 'div', 'block')[0], 'div', 'webEditContent')[0], 'p')[2], 'strong')[0], 'a')[0];
                if (!findTag(a)[0].match(/pdf/i)) {
                    handleError(new HoError('cannot find release'));
                }
                const url = addPre(a.attribs.href, 'http://www.oecd.org');
                driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                console.log(driveName);
                return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                    type: 'auto',
                    name: driveName,
                    filePath,
                    parent,
                    rest: () => updateDocDate(type, obj.date),
                    errhandle: err => {
                        throw err;
                    },
                })));
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
                errhandle: err => {
                    throw err;
                },
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
                errhandle: err => {
                    throw err;
                },
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
                errhandle: err => {
                    throw err;
                },
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
                    errhandle: err => {
                        throw err;
                    },
                })));
            }
            return Api('url', obj.url).then(raw_data => {
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
                            errhandle: err => {
                                throw err;
                            },
                        })));
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
                    errhandle: err => {
                        throw err;
                    },
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
                errhandle: err => {
                    throw err;
                },
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
                    errhandle: err => {
                        throw err;
                    },
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
                errhandle: err => {
                    throw err;
                },
            })));
            case 'sta':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                const html = findTag(Htmlparser.parseDOM(raw_data), 'html')[0];
                const html2 = findTag(html, 'html')[0];
                findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'cp')[0], 'div', 'article')[0], 'p').forEach(p => {
                    let as = findTag(p, 'a');
                    if (as.length > 0) {
                        for (let a of as) {
                            if (a.attribs.href.match(/\.pdf$/i)) {
                                const url = addPre(a.attribs.href, 'http://www.stat.gov.tw');
                                driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                                console.log(driveName);
                                return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                                    type: 'auto',
                                    name: driveName,
                                    filePath,
                                    parent,
                                    rest: () => updateDocDate(type, obj.date),
                                    errhandle: err => {
                                        throw err;
                                    },
                                })));
                            }
                        }
                    }
                    const bs = findTag(p, 'b');
                    if (bs.length > 0) {
                        for (let b of bs) {
                            as = findTag(b, 'a');
                            if (as.length > 0) {
                                for (let a of as) {
                                    if (a.attribs.href.match(/\.pdf$/i)) {
                                        const url = addPre(a.attribs.href, 'http://www.stat.gov.tw');
                                        driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                                        console.log(driveName);
                                        return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                                            type: 'auto',
                                            name: driveName,
                                            filePath,
                                            parent,
                                            rest: () => updateDocDate(type, obj.date),
                                            errhandle: err => {
                                                throw err;
                                            },
                                        })));
                                    }
                                }
                            }
                        }
                    }
                });
            });
            case 'mof':
            console.log(obj);
            return Api('url', obj.url, {referer: 'http://www.mof.gov.tw/Pages/List.aspx?nodeid=281'}).then(raw_data => {
                const ps = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'form1')[0], 'div', 'wrapper')[0], 'div', 'wrapperInner')[0], 'div', 'contentBox')[0], 'div', 'subpageBox')[0], 'div', 'rowBox_2column_s1')[0], 'div', 'rowBox_2column_s1_col-1')[0], 'div', 'displayDocBox printArea')[0], 'div', 'displayDocBox_content')[0], 'div', 'msgBox imgBottom')[0], 'div', 'msgBox_main')[0], 'div', 'displayDocBox_text')[0], 'p');
                for (let p of ps) {
                    const pc = findTag(p)[0];
                    if (pc && pc.match(/本文及附表/)) {
                        const url = addPre(findTag(findTag(findTag(findTag(p, 'span')[0], 'strong')[0], 'span')[0], 'a')[0].attribs.href, 'http://www.mof.gov.tw');
                        driveName = `${obj.name} ${obj.date}${PathExtname(url)}`;
                        console.log(driveName);
                        return mkFolder(PathDirname(filePath)).then(() => Api('url', url, {filePath}).then(() => GoogleApi('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath,
                            parent,
                            rest: () => updateDocDate(type, obj.date),
                            errhandle: err => {
                                throw err;
                            },
                        })));
                    }
                };
            });
            case 'moe':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                const files = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'aspnetForm')[0], 'div')[2], 'div', 'ctl00_Float_layer')[0], 'div', 'divContent')[0], 'div', 'container')[0], 'div', 'div-table-content')[0], 'div', 'row div-tr-content')[0], 'div', 'div-table-content')[0], 'div', 'ctl00_div_Content')[0], 'div', 'divNewsDetail')[0], 'div', 'ctl00_holderContent_wUctlNewsDetail_divFiles')[0], 'div', 'table-files')[0], 'div', 'tr-files');
                for (let f of files) {
                    const kind = findTag(f, 'div', 'td-filesKind')[0];
                    if (kind) {
                        const a = findTag(kind, 'a')[0];
                        if (a.attribs.title.match(/新聞稿.*pdf/)) {
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
                                errhandle: err => {
                                    throw err;
                                },
                            })));
                        }
                    }
                }
            });
            case 'cbc':
            console.log(obj);
            return Api('url', obj.url).then(raw_data => {
                const dlPdf = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'main')[0], 'div', 'cp')[0], 'div', 'zone.content')[0], 'div', 'Article')[0], 'div', 'Body')[0], 'div', 'download')[0];
                let downloadList = [];
                if (dlPdf) {
                    findTag(findTag(dlPdf, 'ul')[0], 'li').forEach(l => {
                        findTag(l, 'a').forEach(a => {
                            if (a.attribs.href.match(/\.(pdf|xlsx)$/i)) {
                                downloadList.push(addPre(a.attribs.href, 'http://www.cbc.gov.tw'));
                            }
                        });
                    });
                }
                const recur_down = dIndex => {
                    if (dIndex < downloadList.length) {
                        driveName = `${obj.name} ${obj.date}.${dIndex}${PathExtname(downloadList[dIndex])}`;
                        console.log(driveName);
                        const subPath = getFileLocation(type, objectID());
                        return mkFolder(PathDirname(subPath)).then(() => Api('url', downloadList[dIndex], {filePath: subPath}).then(() => GoogleApi('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath: subPath,
                            parent,
                            rest: () => recur_down(dIndex + 1),
                            errhandle: err => {
                                throw err;
                            },
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
                    errhandle: err => {
                        throw err;
                    },
                });
            });
            default:
            handleError(new HoError('unknown external type'));
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
                const outer = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'Blog1')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer');
                if (outer.length === 1) {
                    findTag(findTag(findTag(findTag(findTag(findTag(outer[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0], 'table')[0], 'tr').forEach(t => {
                        const h = findTag(findTag(t, 'td')[0], 'h3')[0];
                        if (h) {
                            const a = findTag(h, 'a')[0];
                            if (a) {
                                const name = findTag(a)[0];
                                if (!name.match(/Synopsis$/i)) {
                                    list.splice(0, 0, {
                                        name: name,
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
                                name: name,
                                url: a.attribs.href,
                            });
                        }
                    }
                }
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
                                        for (let i of vIds) {
                                            obj.push(`ope_${i}`);
                                        }
                                        //up2stream
                                    } else if (t === 12) {
                                        for (let i of vIds) {
                                            obj.push(`up2_${i}`);
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
                            handleError(new HoError('no source'));
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
    saveSingle: function(type, id) {
        let url = null;
        switch (type) {
            case 'yify':
            const getMid = () => isNaN(id) ? Api('url', `https://yts.ag/movie/${id}`, {referer: 'https://yts.ag/'}).then(raw_data => findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main-content')[0], 'div', 'movie-content')[0], 'div', 'row')[0], 'div', 'movie-info')[0].attribs['data-movie-id']) : Promise.resolve(id);
            return getMid().then(mid => {
                url = `https://yts.ag/api/v2/movie_details.json?with_cast=true&movie_id=${mid}`;
                return Api('url', url, {referer: 'https://yts.ag/'}).then(raw_data => {
                    const json_data = getJson(raw_data);
                    if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                        handleError(new HoError('yify api fail'));
                    }
                    let setTag = new Set(['yify', 'video', '影片', 'movie', '電影']);
                    setTag.add(json_data['data']['movie']['imdb_code']).add(json_data['data']['movie']['year'].toString());
                    json_data['data']['movie']['genres'].forEach(i => setTag.add(i));
                    if (json_data['data']['movie']['cast']) {
                        json_data['data']['movie']['cast'].forEach(i => setTag.add(i.name));
                    }
                    let newTag = new Set();
                    setTag.forEach(i => newTag.add(TRANS_LIST.includes(i) ? TRANS_LIST_CH[TRANS_LIST.indexOf(i)] : i));
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
            case 'cartoonmad':
            url = `http://www.cartoonmad.com/comic/${id}.html`;
            return Api('url', url, {
                referer: 'http://www.cartoonmad.com/',
                not_utf8: true,
            }).then(raw_data => {
                const info = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[0], 'tr')[0], 'td')[1], 'table')[0], 'tr');
                const comicPath = findTag(findTag(info[2], 'td')[1], 'a');
                const table = findTag(findTag(findTag(findTag(findTag(info[3],'td')[0], 'table')[0], 'tr')[1], 'td')[1], 'table')[0];
                let setTag = new Set(['cartoonmad', '漫畫', 'comic', '圖片集', 'image book', '圖片', 'image']);
                const category = findTag(findTag(findTag(findTag(table, 'tr')[2], 'td')[0], 'a')[0])[0];
                setTag.add(category.match(/^(.*)系列$/)[1]);
                const author = findTag(findTag(findTag(table, 'tr')[4], 'td')[0])[0];
                setTag.add(author.match(/原創作者： (.*)/)[1]);
                const type = findTag(findTag(findTag(table, 'tr')[12], 'td')[0], 'a').map(a => setTag.add(findTag(a)[0]));
                let newTag = new Set();
                setTag.forEach(i => newTag.add(TRANS_LIST.includes(i) ? TRANS_LIST_CH[TRANS_LIST.indexOf(i)] : i));
                return [
                    findTag(comicPath[comicPath.length - 1])[0],
                    newTag,
                    new Set(),
                    'cartoonmad',
                    findTag(findTag(findTag(findTag(findTag(findTag(table, 'tr')[1], 'td')[0], 'table')[0], 'tr')[0], 'td')[0], 'img')[0].attribs.src,
                    url,
                ];
            });
            case 'bilibili':
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
                    findTag(findTag(findTag(infoR, 'div', 'info-row info-cv')[0], 'em')[0], 'span').forEach(s => setTag.add(opencc.convertSync(findTag(s)[0])));
                    findTag(findTag(infoR, 'div', 'b-head')[0], 'a').forEach(a => setTag.add(opencc.convertSync(findTag(findTag(a, 'span')[0])[0])));
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
                    findTag(findTag(findTag(findTag(findTag(main[1], 'div', 'v_large')[0], 'div', 'v_info')[0], 'div', 's_tag')[0], 'ul')[0], 'li').forEach(l => setTag.add(opencc.convertSync(findTag(findTag(l, 'a')[0])[0])));
                    name = findTag(findTag(findTag(info, 'div', 'v-title')[0], 'h1')[0])[0];
                    thumb = findTag(body, 'img')[0].attribs.src;
                }
                let newTag = new Set();
                setTag.forEach(i => newTag.add(TRANS_LIST.includes(i) ? TRANS_LIST_CH[TRANS_LIST.indexOf(i)] : i));
                return [
                    name,
                    newTag,
                    new Set(),
                    'bilibili',
                    thumb,
                    url,
                ];
            });
            default:
            handleError(new HoError('unknown external type'));
        }
    },
}

export const subHdUrl = str => Api('url', `http://subhd.com/search/${encodeURIComponent(str)}`).then(raw_data => {
    const list = findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container list')[0], 'div', 'row')[0], 'div', 'col-md-9')[0];
    if (findTag(list)[0] && findTag(list)[0].match(/暂时没有/)) {
        return null;
    }
    const big_item = findTag(list, 'div', 'box')[0];
    if (!big_item) {
        console.log(raw_data);
        handleError(new HoError('sub data error!!!'));
    }
    const sub_id = findTag(findTag(findTag(findTag(findTag(findTag(big_item, 'div', 'pull-left lb_r')[0], 'table')[0], 'tr')[0], 'td')[0], 'h4')[0], 'a')[0].attribs.href;
    return Api('url', 'http://subhd.com/ajax/down_ajax', {
        post: {sub_id: sub_id.match(/\d+$/)[0]},
        is_json: true,
        referer: `http://subhd.com${sub_id}`,
    }).then(data => {
        console.log(data);
        return data.success ? data.url : Promise.reject(new HoError('too many times!!!'));
    });
});

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
        ret_obj['embed'] = [];
        ret_obj['video'].map(i => {
            if (i.match(/type=flv/)) {
                ret_obj['embed'].push(`//player.youku.com/embed/${url.match(/id_([\da-zA-Z]+)\.html$/)[1]}`);
            }
        });
    }
    return ret_obj;
});

const updateDocDate = (type, date) => Mongo('update', DOCDB, {type}, {$set: {type, date}}, {upsert: true});