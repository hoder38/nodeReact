import { ENV_TYPE } from '../../../ver'
import { HINT } from '../config'
import { STORAGEDB, STOCKDB, PASSWORDDB, DEFAULT_TAGS, STORAGE_PARENT, PASSWORD_PARENT, STOCK_PARENT, HANDLE_TIME, UNACTIVE_DAY, UNACTIVE_HIT, QUERY_LIMIT, BILI_TYPE, BILI_INDEX, MAD_INDEX, RELATIVE_LIMIT, RELATIVE_UNION, RELATIVE_INTER, GENRE_LIST, GENRE_LIST_CH, COMIC_LIST, ANIME_LIST, BOOKMARK_LIMIT, ADULTONLY_PARENT, GAME_LIST, GAME_LIST_CH, MEDIA_LIST, MEDIA_LIST_CH, TRANS_LIST, TRANS_LIST_CH, FITNESSDB, FITNESS_PARENT, RANKDB, RANK_PARENT, KUBO_COUNTRY } from '../constants'
import { checkAdmin, isValidString, selectRandom, handleError, HoError } from '../util/utility'
import Mongo, { objectID } from '../models/mongo-tool'
import { getOptionTag } from '../util/mime'

export default function process(collection) {
    let getQuerySql = null;
    let getQueryTag = null;
    let getSortName = null;
    let parent_arr = [];
    switch(collection) {
        case STORAGEDB:
        getQuerySql = getStorageQuerySql;
        getQueryTag = getStorageQueryTag;
        getSortName = getStorageSortName;
        parent_arr = STORAGE_PARENT;
        break;
        case PASSWORDDB:
        getQuerySql = getPasswordQuerySql;
        getQueryTag = getPasswordQueryTag;
        getSortName = getPasswordSortName;
        parent_arr = PASSWORD_PARENT;
        break;
        case STOCKDB:
        getQuerySql = getStockQuerySql;
        getQueryTag = getStockQueryTag;
        getSortName = getStockSortName;
        parent_arr = STOCK_PARENT;
        break;
        case FITNESSDB:
        getQuerySql = getFitnessQuerySql;
        getQueryTag = getFitnessQueryTag;
        getSortName = getFitnessSortName;
        parent_arr = FITNESS_PARENT;
        break;
        case RANKDB:
        getQuerySql = getRankQuerySql;
        getQueryTag = getRankQueryTag;
        getSortName = getRankSortName;
        parent_arr = RANK_PARENT;
        break;
        default:
        return false;
    }
    const inParentArray = parent => {
        for (let p of parent_arr) {
            if (p.name === parent) {
                return true;
            }
        }
        return false;
    };
    const getLatest = bookmark => Mongo('find', `${collection}User`, {_id: objectID(bookmark)}, {limit: 1}).then(items => {
        if (items.length > 0 && items[0].latest) {
            const youtubeMatch = items[0].latest.toString().match(/^y_(.*)$/);
            return youtubeMatch ? youtubeMatch[1] : items[0].latest;
        } else {
            return false;
        }
    });
    const returnPath = (items, parentList) => parentList.bookmark ? getLatest(parentList.bookmark).then(latest => latest ? ({
        items: items,
        parentList: parentList,
        latest: latest,
        bookmark: parentList.bookmark,
    }) : ({
        items: items,
        parentList: parentList,
        bookmark: parentList.bookmark,
    })) : Promise.resolve({
        items: items,
        parentList: parentList,
    });
    return {
        tagQuery: function(page, tagName, exactly, index, sortName, sortType, user, session, customLimit=QUERY_LIMIT) {
            const tags = this.searchTags(session);
            let parentList = null;
            if (!tagName) {
                parentList = tags.getArray();
            } else if (!index) {
                const defau = isDefaultTag(normalize(tagName));
                let validTagName = '';
                if ((collection === STOCKDB && defau.index === 31) || (collection === STORAGEDB && defau.index === 31)) {
                    validTagName = tagName;
                } else {
                    validTagName = isValidString(tagName, 'name');
                    if (!validTagName) {
                        return handleError(new HoError('name not vaild!!!'));
                    }
                }
                parentList = tags.getArray(validTagName, exactly);
            } else {
                const defau = isDefaultTag(normalize(tagName));
                let validTagName = '';
                if ((collection === STOCKDB && defau.index === 31) || (collection === STORAGEDB && defau.index === 31)) {
                    validTagName = tagName;
                } else {
                    validTagName = isValidString(tagName, 'name');
                    if (!validTagName) {
                        return handleError(new HoError('name not vaild!!!'));
                    }
                }
                const validIndex = isValidString(index, 'parentIndex');
                if (!validIndex) {
                    return handleError(new HoError('parentIndex is not vaild!!!'));
                }
                parentList = tags.getArray(validTagName, exactly, validIndex);
            }
            const sql = getQuerySql(user, parentList.cur, parentList.exactly);
            return sql ? Mongo('find', collection, sql.nosql, sql.select ? sql.select : {}, Object.assign({
                limit: customLimit,
                skip: page,
                sort: [[
                    getSortName(sortName),
                    sortType,
                ]],
            }, sql.skip ? {skip: page + sql.skip} : {}, sql.hint ? {hint: sql.hint} : {})).then(items => {
                const getCount = () => (collection === FITNESSDB) ? Mongo('find', `${collection}Count`, {
                    owner: user._id,
                    itemId: {'$in': items.map(i => i._id)},
                }).then(counts => items.map(i => {
                    for (let c of counts) {
                        if (i._id.equals(c.itemId)) {
                            i['count'] = c['count'];
                            return i;
                        }
                    }
                    i['count'] = 0;
                    return i;
                })) : Promise.resolve(items);
                return getCount().then(items => sql.nosql.mediaType ? ({
                    items,
                    parentList: parentList,
                    mediaHadle: 1,
                }) : returnPath(items, parentList));
            }) : returnPath([], parentList);
        },
        singleQuery: function(uid, user, session) {
            const id = isValidString(uid, 'uid');
            if (!id) {
                return handleError(new HoError('uid is not vaild!!!'));
            }
            const parentList = this.searchTags(session).getArray();
            const sql = getQuerySql(user, parentList.cur, parentList.exactly);
            if (sql) {
                sql.nosql['_id'] = id;
                return Mongo('find', collection, sql.nosql, sql.select ? sql.select : {}, {
                    limit: 1,
                    hint: {_id: 1},
                }).then(items => {
                    const getCount = () => (collection === FITNESSDB) ? Mongo('find', `${collection}Count`, {
                        owner: user._id,
                        itemId: items[0]._id,
                    }).then(counts => [Object.assign(items[0], {count: (counts.length < 1) ? 0 : counts[0]['count']})]) : Promise.resolve(items);
                    return (items.length < 1) ? {empty: true} : getCount().then(items => sql.nosql.mediaType ? {
                        item: items[0],
                        mediaHadle: 1,
                    } : {item: items[0]});
                });
            } else {
                return {empty: true};
            }
        },
        resetQuery: function(sortName, sortType, user, session) {
            const parentList = this.searchTags(session).resetArray();
            const sql = getQuerySql(user, parentList.cur, parentList.exactly);
            return sql ? Mongo('find', collection, sql.nosql, sql.select ? sql.select : {}, Object.assign({
                limit: QUERY_LIMIT,
                sort: [[
                    getSortName(sortName),
                    sortType,
                ]],
            }, sql.hint ? {hint: sql.hint} : {})).then(items => {
                const getCount = () => (collection === FITNESSDB) ? Mongo('find', `${collection}Count`, {
                    owner: user._id,
                    itemId: {'$in': items.map(i => i._id)},
                }).then(counts => items.map(i => {
                    for (let c of counts) {
                        if (i._id.equals(c.itemId)) {
                            i['count'] = c['count'];
                            return i;
                        }
                    }
                    i['count'] = 0;
                    return i;
                })) : Promise.resolve(items);
                return getCount().then(items => ({
                    items,
                    parentList,
                }));
            }) : {
                items: [],
                parentList: parentList,
            };
        },
        getYoutubeQuery: function(search_arr, sortName, pageToken) {
            let query = {
                type: 0,
                maxResults: QUERY_LIMIT,
                order: (sortName === 'count') ? 'viewCount' : (sortName === 'mtime') ? 'date' : 'relevance',
            };
            let query_arr = [];
            let id_arr = [];
            let pl_arr = [];
            for (let i of search_arr) {
                const index = isDefaultTag(normalize(i));
                if (!index || index.index === 0 || index.index === 6 || index.index === 17){
                    query_arr.push(denormalize(i));
                //ymp
                } else if (index.index === 11) {
                    query.type = 20 + query.type%10;
                //ym
                } else if (index.index === 10) {
                    query.type = Math.floor(query.type/10)*10 + 2;
                //yp
                } else if (index.index === 9) {
                    query.type = 10 + query.type%10;
                //yv
                } else if (index.index === 8 || index.index === 22) {
                    query.type = Math.floor(query.type/10)*10 + 1;
                } else if (index.index === 30) {
                    const index1 = isDefaultTag(i);
                    if (index1[1] === 'ou') {
                        id_arr.push(index1[2]);
                    } else if (index1[1] === 'pl') {
                        pl_arr.push(index1[2]);
                    } else if (index1[1] === 'ch') {
                        query.channelId = index1[2];
                    } else {
                        query_arr.push(i);
                    }
                }
            }
            if (!query.type) {
                return false;
            }
            if (!query.channelId) {
                if (query_arr.length > 0) {
                    query.keyword = query_arr.join(' ');
                }
            }
            if (pageToken) {
                query.pageToken = pageToken;
            } else {
                if (id_arr.length > 0) {
                    query.id_arr = id_arr;
                }
                if (pl_arr.length > 0) {
                    query.pl_arr = pl_arr;
                }
            }
            return query;
        },
        getYifyQuery: function(search_arr, sortName, page) {
            let search = false;
            let genre = null;
            let query_term = null;
            search_arr.forEach(s => {
                const normal = normalize(s);
                const index = isDefaultTag(normal);
                if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                    if (GENRE_LIST.includes(normal)) {
                        genre = normal;
                        query_term = null;
                    } else if (GENRE_LIST_CH.includes(normal)) {
                        genre = GENRE_LIST[GENRE_LIST_CH.indexOf(normal)];
                        query_term = null;
                    } else {
                        query_term = s;
                        genre = null;
                    }
                } else if (index.index === 13 || index.index === 22) {
                    search = true;
                }
            });
            if (search) {
                let url = `https://yts.ag/api/v2/list_movies.json?sort_by=${sortName === 'count' ? 'rating' : sortName === 'mtime' ? 'year' : 'date_added'}`;
                if (page > 1) {
                    url = `${url}&page=${page}`;
                }
                if (query_term) {
                    url = `${url}&query_term=${query_term}`;
                }
                if (genre) {
                    url = `${url}&genre=${genre}`;
                }
                console.log(url);
                return url;
            } else {
                return false;
            }
        },
        getBiliQuery: function(search_arr, sortName, page, is_movie=false) {
            const order = sortName === 'mtime' ? 2 : 0;
            const mOrder = sortName === 'count' ? 'hot' : 'default';
            const sOrder = sortName === 'count' ? 'click' : null;
            let s_country = -1;
            let s_year = 0;
            let query_term = null;
            let search = 0;
            search_arr.forEach(s => {
                const normal = normalize(s);
                const index = isDefaultTag(normal);
                if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                    if (s.match(/^\d\d\d\d$/)) {
                        if (Number(s) < 2100 && Number(s) > 1800) {
                            s_year = Number(s);
                            query_term = null;
                            s_country = -1;
                        } else {
                            query_term = s;
                            s_year = 0;
                            s_country = -1;
                        }
                    } else if (BILI_TYPE.includes(normal)) {
                        s_year = 0;
                        s_country = BILI_TYPE.indexOf(normal);
                        query_term = null;
                    } else {
                        s_year = 0;
                        query_term = denormalize(s);
                        s_country = -1;
                    }
                } else if (!is_movie && (index.index === 15 || index.index === 22)) {
                    search = 1;
                } else if (is_movie && (index.index === 16 || index.index === 22)) {
                    search = 2;
                }
            });
            if (search) {
                let url = '';
                if (query_term) {
                    const s_append = search === 2 ? sOrder ? `&tids_1=23&duration=4&order=&{sOrder}` : '&tids_1=23&duration=4' : '';
                    url = `http://search.bilibili.com/ajax_api/${search === 2 ? 'video' : 'bangumi'}?keyword=${encodeURIComponent(query_term)}${s_append}`;
                    if (page > 1) {
                        url = `${url}&page=${page}`;
                    }
                } else {
                    if (search === 2) {
                        let ch_type = 0;
                        let ch_page = 0;
                        if (s_country !== -1 && s_country !== 12) {
                            switch(s_country) {
                                case 0:
                                case 3:
                                case 4:
                                ch_type = 147;
                                break;
                                case 1:
                                ch_type = 146;
                                break;
                                case 2:
                                ch_type = 145;
                                break;
                                default:
                                ch_type = 83;
                                break;
                            }
                            ch_page = page;
                        } else {
                            if (page%4 === 1) {
                                ch_type = 147;
                                ch_page = Math.round((page+3)/4);
                            } else if (page%4 === 2) {
                                ch_type = 146;
                                ch_page = Math.round((page+2)/4);
                            } else if (page%4 === 3) {
                                ch_type = 145;
                                ch_page = Math.round((page+1)/4);
                            } else {
                                ch_type = 83;
                                ch_page = Math.round(page/4);
                            }
                        }
                        const d = new Date();
                        const pd = new Date(new Date(d).setMonth(d.getMonth()-3));
                        url = `http://www.bilibili.com/list/${mOrder}-${ch_type}-${ch_page}-${pd.getFullYear()}-${pd.getMonth() + 1}-${pd.getDate() + 1}~${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}.html`;
                    } else {
                        if (s_country === 12) {
                            const d = new Date();
                            const pd = new Date(new Date(d).setMonth(d.getMonth()-3));
                            url = `http://www.bilibili.com/list/${mOrder}-32-${page}-${pd.getFullYear()}-${pd.getMonth() + 1}-${pd.getDate() + 1}~${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}.html`;
                        } else {
                            url = `http://www.bilibili.com/api_proxy?app=bangumi&pagesize=20&action=site_season_index&page=${page}&indexType=${order}`;
                            if (s_country !== -1) {
                                url = `${url}&seasonArea=${BILI_INDEX[s_country]}`;
                            }
                            if (s_year) {
                                url = `${url}&startYear=${s_year}`;
                            }
                        }
                    }
                }
                console.log(url);
                return url;
            } else {
                return false;
            }
        },
        getMadQuery: function(search_arr, sortName, page) {
            let comic_type = -1;
            let query_term = null;
            let search = false;
            search_arr.forEach(s => {
                const normal = normalize(s);
                const index = isDefaultTag(normal);
                if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                    const mIndex = ANIME_LIST.indexOf(normal);
                    if (mIndex !== -1) {
                        comic_type = mIndex;
                        query_term = null;
                    } else {
                        query_term = s;
                        comic_type = -1;
                    }
                } else if (index.index === 14 || index.index === 22) {
                    search = true;
                }
            });
            if (search) {
                if (query_term) {
                    const ret = {
                        url: 'http://www.cartoonmad.com/search.html',
                        post: {
                            keyword: query_term,
                            searchtype: 'all',
                        },
                    }
                    console.log(ret);
                    return ret;
                } else {
                    let url = `http://www.cartoonmad.com/comic${comic_type !== -1 ? MAD_INDEX[comic_type] : '99'}`;
                    if (page > 1 && page < 10) {
                        url =  `${url}.0${page}.html`;
                    } else if (page >= 10) {
                        url =  `${url}.${page}.html`;
                    } else {
                        url = `${url}.html`;
                    }
                    console.log(url);
                    return url;
                }
            } else {
                return false;
            }
        },
        getKuboQuery: function(search_arr, sortName, page) {
            let searchWord = null;
            let year = 0;
            let type = 0;
            let country = '';
            search_arr.forEach(s => {
                const normal = normalize(s);
                const index = isDefaultTag(normal);
                if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                    if (s.match(/^\d\d\d\d$/)) {
                        if (Number(s) < 2100 && Number(s) > 1800) {
                            year = Number(s);
                            searchWord = null;
                            country = '';
                        } else {
                            searchWord = s;
                            year = 0;
                            country = '';
                        }
                    } else if (KUBO_COUNTRY.includes(normal)) {
                        country = normal;
                        searchWord = null;
                        year = 0;
                    } else {
                        searchWord = s;
                        year = 0;
                        country = '';
                    }
                //movie
                } else if (index.index === 18) {
                    type = 1;
                //tv series
                } else if (index.index === 19) {
                    type = 2;
                //tv show
                } else if (index.index === 20) {
                    type = 41;
                //animation
                } else if (index.index === 21 || index.index === 22) {
                    type = 3;
                }
            });
            if (type) {
                const order = (sortName === 'mtime') ? 'vod_addtime' : 'vod_hits_month';
                const sOrder = (sortName === 'mtime') ? 1 : 2;
                const url = searchWord ? `http://www.99kubo.com/index.php?s=Vod-innersearch-q-${encodeURIComponent(searchWord)}-order-${sOrder}-page-${page}` : `http://www.99kubo.com/vod-search-id-${type}-cid--tag--area-${country}-tag--year-${year}-wd--actor--order-${order}%20desc-p-${page}.html`;
                console.log(url);
                return url;
            } else {
                return false;
            }
        },
        getRelativeTag: function(tag_arr, user, pre_arr, exactly_arr=null) {
            let q_path = [];
            let normal = null;
            if (exactly_arr) {
                q_path = tag_arr;
            } else {
                q_path = ['all item'];
                const name = isValidString(tag_arr[selectRandom(tag_arr.length)], 'name');
                if (name === false) {
                    return Promise.resolve(pre_arr);
                }
                console.log(name);
                normal = normalize(name);
                if (isDefaultTag(normal)) {
                    return Promise.resolve(pre_arr);
                }
                q_path.push(normal);
                exactly_arr = [true, false];
            }
            const sql = getQuerySql(user, q_path, exactly_arr ? exactly_arr : q_path.map(q => false));
            return Mongo('find', collection, sql.nosql, {
                _id: 0,
                tags: 1,
                name: 1,
            }, Object.assign({
                limit: RELATIVE_LIMIT,
                sort: [[
                    getSortName('name'),
                    'desc',
                ]],
            }, sql.hint ? {hint: sql.hint} : {})).then(items => {
                let relative_arr = [];
                if (items.length > 0) {
                    let u = RELATIVE_UNION;
                    let t = RELATIVE_INTER;
                    let counter_arr = [];
                    const index = items[0].tags.indexOf(normalize(items[0].name));
                    if (index !== -1) {
                        items[0].tags.splice(index, 1);
                    }
                    items[0].tags.forEach(function (e) {
                        if (!pre_arr.includes(e) && normal !== e) {
                            relative_arr.push(e);
                            counter_arr.push(0);
                        }
                    });
                    for (let i = 1; i < items.length; i++) {
                        if (t) {
                            const index1 = items[i].tags.indexOf(normalize(items[i].name));
                            if (index1 !== -1) {
                                items[i].tags.splice(index1, 1);
                            }
                            items[i].tags.forEach(function (e) {
                                if (!pre_arr.includes(e) && normal !== e) {
                                    const index2 = relative_arr.indexOf(e);
                                    if (index2 === -1) {
                                        relative_arr.push(e);
                                        counter_arr.push(0);
                                    } else {
                                        counter_arr[index2]++;
                                    }
                                }
                            });
                            t--;
                        } else {
                            break;
                        }
                    }
                    for (let i = RELATIVE_INTER + 1; i < items.length; i++) {
                        const index1 = items[i].tags.indexOf(normalize(items[i].name));
                        if (index1 !== -1) {
                            items[i].tags.splice(index1, 1);
                        }
                        let temp = [];
                        relative_arr = relative_arr.filter(function (e, j) {
                            if (!pre_arr.includes(e) && normal !== e) {
                                if (items[i].tags.indexOf(e) !== -1) {
                                    temp.push(counter_arr[j] + 1);
                                    return true;
                                } else {
                                    if (counter_arr[j] + RELATIVE_INTER >= i) {
                                        temp.push(counter_arr[j]);
                                        return true;
                                    }
                                }
                            }
                        });
                        counter_arr = temp;
                    }
                    for (let i of items) {
                        if (u) {
                            i.tags.forEach(function (e) {
                                if (!pre_arr.includes(e) && normal !== e) {
                                    if (relative_arr.indexOf(e) === -1) {
                                        relative_arr.push(e);
                                    }
                                }
                            });
                            u--;
                        } else {
                            break;
                        }
                    }
                }
                return pre_arr.concat(relative_arr);
            });
        },
        addTag: function(uid, tag, user, checkValid=true) {
            const name = isValidString(tag, 'name');
            if (!name) {
                return handleError(new HoError('name is not vaild!!!'));
            }
            const id = isValidString(uid, 'uid');
            if (id === false) {
                return new Promise((resolve, reject) => checkValid ? reject(new HoError('uid is not vaild')) : resolve({}));
            }
            let tagType = getQueryTag(user, name);
            if (!tagType.type) {
                console.log(tagType);
                return handleError(new HoError('not authority set default tag!!!'));
            }
            if (tagType.type === 2) {
                return Mongo('find', collection, {_id: id}, {limit: 1}).then(items => {
                    if (items.length < 1) {
                        return handleError(new HoError('can not find object!!!'));
                    }
                    return (tagType.tag.hasOwnProperty('adultonly') && items[0].adultonly === tagType.tag.adultonly) || (tagType.tag.hasOwnProperty('first') && items[0].first === tagType.tag.first) || (tagType.tag.hasOwnProperty('important') && items[0].important === tagType.tag.important) ? {
                        id: items[0]._id,
                        adultonly: items[0].adultonly,
                        tag: tagType.name,
                    } : Mongo('update', collection, {_id: id}, {$set: tagType.tag}).then(item2 => ({
                        id: items[0]._id,
                        adultonly: items[0].adultonly,
                        tag: tagType.name,
                    }));
                });
            } else if (tagType.type === 3) {
                return {
                    id: items[0]._id,
                    adultonly: items[0].adultonly,
                    tag: tagType.name,
                };
            } else if (tagType.type === 1) {
                return Mongo('find', collection, {_id: id}, {limit: 1}).then(items => {
                    if (items.length < 1) {
                        return handleError(new HoError('can not find object!!!'));
                    }
                    if (!items[0].tags.includes(tagType.tag.tags)) {
                        tagType.tag[user._id.toString()] = tagType.tag.tags;
                        return Mongo('update', collection, { _id: id }, {$addToSet: tagType.tag}, {upsert: true}).then(item2 => ({
                            id: items[0]._id,
                            adultonly: items[0].adultonly,
                            tag: tagType.tag.tags,
                        }));
                    } else {
                        return {
                            id: items[0]._id,
                            adultonly: items[0].adultonly,
                            tag: tagType.tag.tags,
                        };
                    }
                });
            } else {
                console.log(tagType);
                return handleError(new HoError('unknown add tag type!!!'));
            }
        },
        delTag: function(uid, tag, user, checkValid=true) {
            let name = isValidString(tag, 'name');
            if (name === false) {
                name = isValidString(tag, 'url');
                if (!name) {
                    return handleError(new HoError('name is not vaild!!!'));
                }
            }
            const id = isValidString(uid, 'uid');
            if (id === false) {
                return new Promise((resolve, reject) => checkValid ? reject(new HoError('uid is not vaild')) : resolve({}));
            }
            let tagType = getQueryTag(user, name, 0);
            if (!tagType.type) {
                console.log(tagType);
                return handleError(new HoError('not authority delete default tag!!!'));
            }
            return Mongo('find', collection, {_id: id}, {limit: 1}).then(items => {
                if (items.length < 1) {
                    return handleError(new HoError('can not find object!!!'));
                }
                if (tagType.type === 2) {
                    return Mongo('update', collection, { _id: id}, {$set: tagType.tag}).then(item1 => ({
                        id: items[0]._id,
                        adultonly: items[0].adultonly,
                        tag: tagType.name,
                    }));
                } else if (tagType.type === 1) {
                    if (tagType.tag.tags === normalize(items[0].name)) {
                        console.log(tagType.tag.tags);
                        console.log(normalize(items[0].name));
                        return handleError(new HoError('can not delete file name!!!'));
                    }
                    if (checkAdmin(1, user)) {
                        console.log('authority del tag');
                        if (!items[0].tags.includes(tagType.tag.tags)) {
                            return {
                                id: items[0]._id,
                                adultonly: items[0].adultonly,
                                tag: '',
                            };
                        } else {
                            for (let i in items[0]) {
                                if (isValidString(i, 'uid') || i === 'lovetv' || i === 'eztv') {
                                    tagType.tag[i] = tagType.tag.tags;
                                    return Mongo('update', collection, {_id: id}, {$pull: tagType.tag}).then(item1 => ({
                                        id: items[0]._id,
                                        adultonly: items[0].adultonly,
                                        tag: tagType.tag.tags,
                                    }));
                                }
                            }
                        }
                    } else {
                        if (!items[0][user._id.toString()].includes(tagType.tag.tags)) {
                            return {
                                id: items[0]._id,
                                adultonly: items[0].adultonly,
                                tag: '',
                            };
                        } else {
                            tagType.tag[user._id.toString()] = tagType.tag.tags;
                            return Mongo('update', collection, { _id: id}, {$pull: tagType.tag}).then(item1 => ({
                                id: items[0]._id,
                                adultonly: items[0].adultonly,
                                tag: tagType.tag.tags,
                            }));
                        }
                    }
                } else {
                    console.log(tagType);
                    return handleError(new HoError('unknown del tag type!!!'));
                }
            });
        },
        sendTag: function(uid, objName, tags, user) {
            tags.reverse();
            let history = [];
            let select = [];
            const validName = isValidString(objName, 'name');
            if (!validName) {
                return handleError(new HoError('name is not vaild!!!'));
            }
            const normal = normalize(validName);
            const handle_tag = index => tags[index].select ? this.addTag(uid, tags[index].tag, user) : this.delTag(uid, tags[index].tag, user);
            const recur_tag = index => handle_tag(index).then(result => {
                if (result.tag !== normal) {
                    history.push(result.tag);
                    select.push(tags[index].select);
                }
            }).catch(err => handleError(err, 'Send tag')).then(() => {
                index++;
                if (index < tags.length) {
                    return recur_tag(index);
                }
            }).then(() => {
                const id = isValidString(uid, 'uid');
                if (!id) {
                    return handleError(new HoError('uid is not vaild!!!'));
                }
                return Mongo('update', collection, {_id: id}, {$set: {untag: 0}}).then(item => Mongo('find', collection, {_id: id}, {limit: 1}).then(items => {
                    if (items.length < 1) {
                        return handleError(new HoError('can not find object!!!'));
                    }
                    return {
                        history,
                        select,
                        id: items[0]._id,
                        adultonly: items[0].adultonly,
                    };
                }));
            });
            return recur_tag(0);
        },
        searchTags: function(search) {
            if (!search[collection]) {
                search[collection] = {
                    tags: [],
                    exactly: [],
                    index: 0,
                    bookmark: '',
                    markIndex: 0,
                    save: {}
                };
            }
            return {
                getArray: function(value=null, exactly=false, index=0) {
                    if (value) {
                        if (index <= 0) {
                            if (search[collection].index > search[collection].tags.length) {
                                search[collection].index = search[collection].tags.length;
                            }
                            const pos = search[collection].tags.indexOf(value);
                            if (pos === -1 || pos >= search[collection].index) {
                                if (pos > search[collection].index) {
                                    search[collection].tags.splice(pos, 1);
                                }
                                search[collection].tags[search[collection].index] = value;
                                search[collection].exactly[search[collection].index] = exactly;
                                search[collection].index++;
                            } else {
                                search[collection].exactly[pos] = exactly;
                            }
                        } else {
                            search[collection].index = (index < search[collection].tags.length) ? index : search[collection].tags.length;
                        }
                    }
                    if (search[collection].index < search[collection].markIndex) {
                        search[collection].bookmark = '';
                        search[collection].markIndex = 0;
                    }
                    return {
                        cur: search[collection].tags.slice(0, search[collection].index),
                        his: search[collection].tags.slice(search[collection].index),
                        exactly: search[collection].exactly,
                        bookmark: search[collection].bookmark,
                    };
                },
                resetArray: function() {
                    search[collection] = {
                        tags:[],
                        exactly: [],
                        index: 0,
                        bookmark: '',
                        markIndex: 0,
                        save: search[collection].save,
                    };
                    return {
                        cur: [],
                        his: [],
                        exactly: [],
                        bookmark: '',
                    };
                },
                setArray: function(bookmark, tagList, exactly) {
                    Object.assign(search[collection], tagList ? {
                        tags: tagList,
                        exactly: exactly,
                        index: tagList.length,
                        save: search[collection].save,
                    } : {}, bookmark ? {
                        bookmark: bookmark,
                        markIndex: tagList ? tagList.length : search[collection].tags.length,
                    } : {
                        bookmark: '',
                        markIndex: 0,
                    });
                },
                getBookmark: function() {
                    return search[collection].bookmark ? search[collection].bookmark : false;
                },
                saveArray: function(saveName, sortName, sortType) {
                    search[collection].save[saveName] = {
                        tags: search[collection].tags.slice(0, search[collection].index),
                        exactly: search[collection].exactly,
                        bookmark: search[collection].bookmark,
                        sortName: getStorageSortName(sortName),
                        sortType: sortType,
                    };
                },
                loadArray: function(saveName) {
                    return search[collection].save.hasOwnProperty(saveName) ? {
                        tags: search[collection].save[saveName].tags,
                        exactly: search[collection].save[saveName].exactly,
                        bookmark: search[collection].save[saveName].bookmark,
                        sortName: search[collection].save[saveName].sortName,
                        sortType: search[collection].save[saveName].sortType,
                    } : false;
                }
            };
        },
        //bookmark
        getBookmarkList: function(sortName, sortType, user) {
            return Mongo('find', `${collection}User`, {userId: user._id}, {sort: [[
                sortName,
                sortType,
            ]]}).then(items => ({bookmarkList: items.map(i => ({
                name: i.name,
                id: i._id,
            }))}));
        },
        getBookmark: function(id, sortName, sortType, user, session) {
            const validId = isValidString(id, 'uid');
            if (!validId) {
                return handleError(new HoError('bookmark is not vaild!!!'));
            }
            return Mongo('find', `${collection}User`, {_id: validId}, {limit: 1}).then(items => {
                if (items.length < 1) {
                    return handleError(new HoError('can not find bookmark!!!'));
                }
                this.searchTags(session).setArray(items[0]._id, items[0].tag, items[0].exactly);
                return this.tagQuery(0, null, null, null, sortName, sortType, user, session);
            });
        },
        setBookmark: function(btag, bexactly, sortName, sortType, user, session) {
            this.searchTags(session).setArray('', btag, bexactly);
            return this.tagQuery(0, null, null, null, sortName, sortType, user, session);
        },
        addBookmark: function(name, user, session, bpath, bexactly) {
            let tags = null;
            if (!bpath || !bexactly) {
                tags = this.searchTags(session);
                const parentList = tags.getArray();
                bpath = parentList.cur;
                bexactly = parentList.exactly;
            }
            if (bpath.length <= 0) {
                return handleError(new HoError('empty parent list!!!'));
            }
            return Mongo('find', `${collection}User`, {
                userId: user._id,
                name,
            }, {limit: 1}).then(items => (items.length > 0) ? Mongo('update', `${collection}User`, {
                userId: user._id,
                name,
            }, {$set: {
                tag: bpath,
                exactly: bexactly,
                mtime: Math.round(new Date().getTime() / 1000),
            }}).then(item1 => {
                if (tags) {
                    tags.setArray(items[0]._id);
                }
                return {apiOk: true};
            }) : Mongo('count', `${collection}User`, {userId: user._id}).then(count => {
                if (count >= BOOKMARK_LIMIT) {
                    console.log(count);
                    return handleError(new HoError('too much bookmark!!!'));
                }
                return Mongo('insert', `${collection}User`, {
                    userId: user._id,
                    name,
                    tag: bpath,
                    exactly: bexactly,
                    mtime: Math.round(new Date().getTime() / 1000),
                }).then(item1 => {
                    if (tags) {
                        tags.setArray(item1[0]._id);
                    }
                    return {
                        name: item1[0].name,
                        id: item1[0]._id,
                    };
                });
            }));
        },
        delBookmark: function(id) {
            const validId = isValidString(id, 'uid');
            if (!validId) {
                return handleError(new HoError('bookmark is not vaild!!!'));
            }
            return Mongo('remove', `${collection}User`, {
                _id: validId,
                $isolated: 1,
            }).then(item => ({id: id}));
        },
        parentList: function() {
            return parent_arr;
        },
        adultonlyParentList: function() {
            return ADULTONLY_PARENT;
        },
        parentQuery: function(tagName, sortName, sortType, page, user) {
            const name = isValidString(tagName, 'name');
            if (!name) {
                return handleError(new HoError('name is not vaild!!!'));
            }
            if (!inParentArray(name)) {
                if (checkAdmin(2, user)) {
                    if(!inAdultonlyArray(name)) {
                        console.log(name);
                        return handleError(new HoError('name is not allow'));
                    }
                } else {
                    console.log(name);
                    return handleError(new HoError('name is not allow'));
                }
            }
            return Mongo('find', `${collection}Dir` ,{parent: name}, {
                limit: QUERY_LIMIT,
                skip : page,
                sort: [[
                    sortName === 'mtime' ? 'qtime' : sortName,
                    sortType,
                ]]
            }).then(taglist => ({taglist: taglist.map(t => ({
                id: t._id,
                name: t.name,
            }))}));
        },
        queryParentTag: function(id, single, sortName, sortType, user, session) {
            const validId = isValidString(id, 'uid');
            if (!validId) {
                return handleError(new HoError('parent is not vaild!!!'));
            }
            return Mongo('find', `${collection}Dir` ,{_id: validId}, {limit: 1}).then(parents => {
                if (parents.length < 1) {
                    return handleError(new HoError('can not find dir'));
                }
                if (single === 'single') {
                    this.searchTags(session).resetArray();
                }
                return this.tagQuery(0, parents[0].name, true, null, sortName, sortType, user, session).then(result => Mongo('update', `${collection}Dir`, {_id: parents[0]._id}, {$set: {qtime: Math.round(new Date().getTime() / 1000)}}).then(parent1 => result));
            });
        },
        addParent: function(parentName, tagName, user) {
            const name = isValidString(parentName, 'name');
            if (!name) {
                return handleError(new HoError('name is not vaild!!!'));
            }
            if (!inParentArray(name)) {
                if (checkAdmin(2, user)) {
                    if(!inAdultonlyArray(name)) {
                        console.log(name);
                        return handleError(new HoError('name is not allow'));
                    }
                } else {
                    console.log(name);
                    return handleError(new HoError('name is not allow'));
                }
            }
            const validName = isValidString(tagName, 'name');
            if (!validName) {
                return handleError(new HoError('tag name is not vaild!!!'));
            }
            const normal = normalize(validName);
            return Mongo('find', `${collection}Dir` ,{
                parent: name,
                name: normal,
            }, {limit: 1}).then(parents => parents.length < 1 ? Mongo('insert', `${collection}Dir`, {
                parent: name,
                name: normal,
                qtime: Math.round(new Date().getTime() / 1000),
            }).then(parent1 => ({
                name: parent1[0].name,
                id: parent1[0]._id
            })) : {
                name: parents[0].name,
                id: parents[0]._id,
            });
        },
        delParent: function(uid, user) {
            if (!checkAdmin(1, user)) {
                console.log(user);
                return handleError(new HoError('permission denied'));
            }
            const id = isValidString(uid, 'uid');
            if (!id) {
                return handleError(new HoError('parent is not vaild!!!'));
            }
            return Mongo('remove', `${collection}Dir`, {
                _id,
                $isolated: 1,
            }).then(parent => parent ? {id} : {apiOK: true});
        },
        setLatest: function(latest, session, saveName=false) {
            const tags = this.searchTags(session);
            let bookmark = false;
            if (saveName) {
                const save = tags.loadArray(saveName);
                if (save) {
                    bookmark = save.bookmark;
                }
            } else {
                bookmark = tags.getBookmark();
            }
            return bookmark ? Mongo('update', `${collection}User`, {_id: objectID(bookmark)}, {$set: {latest}}) : Promise.resolve();
        },
        saveSql: function(page, saveName, back, user, session) {
            const save = this.searchTags(session).loadArray(saveName);
            if (!save) {
                return false;
            }
            const sql = getQuerySql(user, save.tags, save.exactly);
            return sql ? {
                nosql: sql.nosql,
                options: Object.assign({
                    limit: QUERY_LIMIT,
                    skip : sql.skip ? page + sql.skip : page,
                    sort: [[
                        save.sortName,
                        (back === 'back') ? (save.sortType === 'desc') ? 'asc' : 'desc' : save.sortType,
                    ]],
                }, sql.hint ? {hint: sql.hint} : {}),
                select: sql.select ? sql.select : {},
                parentList: {
                    cur: save.tags,
                    his: [],
                    exactly: save.exactly,
                    bookmark: save.bookmark,
                },
            } : {empty: true};
        },
    }
}

function inAdultonlyArray(parent) {
    for (let i of ADULTONLY_PARENT) {
        if (i.name === parent) {
            return true;
        }
    }
    return false;
}

//stotage sql
const escapeRegExp = str => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")

const getStorageQuerySql = function(user, tagList, exactly) {
    let nosql = {};
    let and = [];
    let is_first = true;
    let is_adultonly = false;
    let is_tags = false;
    let skip = 0;
    if (tagList.length < 1) {
        if (!checkAdmin(2, user)) {
            nosql['adultonly'] = 0;
            is_adultonly = true;
        }
        if (!checkAdmin(1, user)) {
            nosql['recycle'] = 0;
        }
    } else {
        for (let [i, tag] of Object.entries(tagList)) {
            const normal = normalize(tag);
            const index = isDefaultTag(normal);
            if (index.index === 30) {
                continue;
            } else if (index.index === 31) {
                if (index[1] === '') {
                    skip = Number(index.index[2]);
                }
                continue;
            } else if (index.index === 0) {
                if (checkAdmin(2, user)) {
                    nosql['adultonly'] = 1;
                    is_adultonly = true;
                }
            } else if (index.index === 17) {
                if (checkAdmin(2, user)) {
                    nosql['adultonly'] = 0;
                    is_adultonly = true;
                }
            } else if (index.index === 1) {
                if (checkAdmin(1, user)) {
                    const ret = {nosql: {
                        mediaType: {$exists: true},
                        utime: {$lt: Math.round(new Date().getTime() / 1000) - HANDLE_TIME},
                    }}
                    console.log(ret.nosql);
                    return ret;
                }
            } else if (index.index === 2) {
                if (checkAdmin(1, user)) {
                    const unDay = user.unDay? user.unDay: UNACTIVE_DAY;
                    const ret = {nosql: {
                        count: {$lt: user.unHit? user.unHit: UNACTIVE_HIT},
                        utime: {$lt: Math.round(new Date().getTime() / 1000) - unDay * 86400},
                    }};
                    console.log(ret.nosql);
                    return ret;
                }
            } else if (index.index === 12) {
                if (checkAdmin(1, user)) {
                    const unDay = user.unDay? user.unDay: UNACTIVE_DAY;
                    const ret = {nosql: {
                        count: {$lt: user.unHit? user.unHit: UNACTIVE_HIT},
                        utime: {$lt: Math.round(new Date().getTime() / 1000) - unDay * 86400},
                        tags: 'playlist',
                    }};
                    console.log(ret.nosql);
                    return ret;
                }
            } else if (index.index === 3) {
                if (checkAdmin(1, user)) {
                    const ret = {nosql: {
                        recycle: {$ne: 0},
                        utime: {$lt: Math.round(new Date().getTime() / 1000) - HANDLE_TIME},
                    }};
                    console.log(ret.nosql);
                    return ret;
                }
            } else if (index.index === 4 || index.index === 6 || index.index === 8 || index.index === 9 || index.index === 10 || index.index === 11 || index.index === 13 || index.index === 14 || index.index === 15 || index.index === 16 || index.index === 18 || index.index === 19 || index.index === 20 || index.index === 21 || index.index === 22) {
            } else if (index.index === 5) {
                is_first = false;
            } else if (index.index === 7) {
                console.log('no local');
                return false;
            } else {
                if (exactly[i]) {
                    and.push({tags: normal});
                    is_tags = true;
                } else {
                    and.push({tags: { $regex: escapeRegExp(normal) }});
                }
            }
        }
        if (!checkAdmin(1, user)) {
            nosql['recycle'] = 0;
        }
        if (!checkAdmin(2, user)) {
            nosql['adultonly'] = 0;
            is_adultonly = true;
        }
    }
    if (is_first) {
        nosql['first'] = 1;
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    const hint = Object.assign({}, is_adultonly ? {adultonly: 1} : {}, is_tags ? {tags: 1} : {}, is_first ? {first: 1} : {}, {name: 1});
    const ret = Object.assign({nosql}, HINT(ENV_TYPE) ? {hint} : {}, skip ? {skip} : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
}

function getStorageQueryTag(user, tag, del=1) {
    const normal = normalize(tag);
    const index = isDefaultTag(normal);
    if (index.index === 0) {
        return checkAdmin(2, user) ? {
            tag: {adultonly: del},
            type: 2,
            name: DEFAULT_TAGS[0],
        } : {type: 0};
    } else if (index.index === 4) {
        return {
            tag: {first: del},
            type: 2,
            name: DEFAULT_TAGS[4],
        };
    } else if (index) {
        return {type: 0};
    } else {
        return {
            tag: {tags: normal},
            type: 1,
        };
    }
}

function getStorageSortName(sortName) {
    switch (sortName) {
        case 'count':
        return sortName;
        case 'mtime':
        return 'utime';
        case 'name':
        default:
        return 'name';
    }
}

function getPasswordQuerySql(user, tagList, exactly) {
    let nosql = {owner: user._id};
    let and = [];
    let is_tags = false;
    let is_important = false;
    let skip = 0;
    if (tagList.length > 0) {
        for (let [i, tag] of Object.entries(tagList)) {
            const normal = normalize(tag);
            const index = isDefaultTag(normal);
            if (index.index === 6) {
                nosql['important'] = 1;
                is_important = true;
            } else if (index.index === 31) {
                if (index.index[1] === '') {
                    skip = Number(index.index[1]);
                }
                continue;
            } else if (index) {
            } else {
                if (exactly[i]) {
                    and.push({tags: normal});
                    is_tags = true;
                } else {
                    and.push({tags: { $regex: escapeRegExp(normal) }});
                }
            }
        }
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    const hint = Object.assign({owner: 1}, is_tags ? {tags: 1} : {}, is_important ? {important: 1} : {}, {name: 1});
    const ret = Object.assign({nosql, select: {
        password: 0,
        prePassword: 0,
        owner: 0,
    }}, HINT(ENV_TYPE) ? {hint} : {}, skip ? {skip} : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
}

function getPasswordQueryTag(user, tag, del=1) {
    const normal = normalize(tag);
    const index = isDefaultTag(normal);
    if (index.index === 6) {
        return {
            type: 3,
            name: '',
        };
    } else if (index) {
        return {type: 0};
    } else {
        return {
            tag: {tags: normal},
            type: 1,
        };
    }
}

function getPasswordSortName(sortName) {
    switch (sortName) {
        case 'count':
        return 'username';
        case 'mtime':
        return 'utime';
        case 'name':
        default:
        return 'name';
    }
}

function getStockQuerySql(user, tagList, exactly) {
    let nosql = {};
    let and = [];
    let is_tags = false;
    let is_important = false;
    let skip = 0;
    if (tagList.length > 0) {
        for (let [i, tag] of Object.entries(tagList)) {
            const normal = normalize(tag);
            const index = isDefaultTag(normal);
            if (index.index === 6) {
                nosql['important'] = 1;
                is_important = true;
            } else if (index.index === 31) {
                if (index.index[1] === '') {
                    skip = Number(index.index[1]);
                } else if (index.index[1] === 'profit') {
                    nosql['profitIndex'] = {$gte: Number(index.index[1])};
                } else if (index.index[1] === 'safety') {
                    nosql['safetyIndex'] = {$gte: Number(index.index[1])};
                } else if (index.index[1] === 'manag') {
                    nosql['managementIndex'] = {$gte: Number(index.index[1])};
                }
                continue;
            } else if (index) {
            } else {
                if (exactly[i]) {
                    and.push({tags: normal});
                    is_tags = true;
                } else {
                    and.push({tags: { $regex: escapeRegExp(normal) }});
                }
            }
        }
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    const hint = Object.assign({}, is_tags ? {tags: 1} : {}, is_important ? {important: 1} : {}, {profitIndex: 1});
    const ret = Object.assign({nosql, select: {
        cash: 0,
        asset: 0,
        sales: 0,
    }}, HINT(ENV_TYPE) ? {hint} : {}, skip ? {skip} : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
}

function getStockQueryTag(user, tag, del=1) {
    const normal = normalize(tag);
    const index = isDefaultTag(normal);
    if (index.index === 6) {
        return {
            tag: {important: del},
            type: 2,
            name: DEFAULT_TAGS[6],
        };
    } else if (index) {
        return {type: 0};
    } else {
        return {
            tag: {tags: normal},
            type: 1,
        };
    }
}

function getStockSortName(sortName) {
    switch (sortName) {
        case 'count':
        return 'managementIndex';
        case 'mtime':
        return 'safetyIndex';
        case 'name':
        default:
        return 'profitIndex';
    }
}

const getFitnessQuerySql = function(user, tagList, exactly) {
    let nosql = {};
    let and = [];
    let is_tags = false;
    let skip = 0;
    if (tagList.length < 1) {
    } else {
        for (let [i, tag] of Object.entries(tagList)) {
            const normal = normalize(tag);
            const index = isDefaultTag(normal);
            if (index.index === 31) {
                if (index[1] === '') {
                    skip = Number(index.index[2]);
                }
                continue;
            } else if (index) {
            } else {
                if (exactly[i]) {
                    and.push({tags: normal});
                    is_tags = true;
                } else {
                    and.push({tags: { $regex: escapeRegExp(normal) }});
                }
            }
        }
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    const hint = Object.assign({}, is_tags ? {tags: 1} : {}, {name: 1});
    const ret = Object.assign({nosql}, HINT(ENV_TYPE) ? {hint} : {}, skip ? {skip} : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
}

function getFitnessQueryTag(user, tag, del=1) {
    const normal = normalize(tag);
    const index = isDefaultTag(normal);
    if (index) {
        return {type: 0};
    } else {
        return {
            tag: {tags: normal},
            type: 1,
        };
    }
}
function getFitnessSortName(sortName) {
    switch (sortName) {
        case 'mtime':
        return 'price';
        case 'name':
        case 'count':
        default:
        return 'name';
    }
}

const getRankQuerySql = function(user, tagList, exactly) {
    let nosql = {};
    let and = [];
    let is_tags = false;
    let skip = 0;
    if (tagList.length < 1) {
    } else {
        for (let [i, tag] of Object.entries(tagList)) {
            const normal = normalize(tag);
            const index = isDefaultTag(normal);
            if (index.index === 31) {
                if (index[1] === '') {
                    skip = Number(index.index[2]);
                }
                continue;
            } else if (index) {
            } else {
                if (exactly[i]) {
                    and.push({tags: normal});
                    is_tags = true;
                } else {
                    and.push({tags: { $regex: escapeRegExp(normal) }});
                }
            }
        }
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    const hint = Object.assign({}, is_tags ? {tags: 1} : {}, {name: 1});
    const ret = Object.assign({nosql}, HINT(ENV_TYPE) ? {hint} : {}, skip ? {skip} : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
}

function getRankQueryTag(user, tag, del=1) {
    const normal = normalize(tag);
    const index = isDefaultTag(normal);
    if (index) {
        return {type: 0};
    } else {
        return {
            tag: {tags: normal},
            type: 1,
        };
    }
}
function getRankSortName(sortName) {
    switch (sortName) {
        case 'mtime':
        return 'start';
        case 'count':
        return 'type';
        case 'name':
        default:
        return 'name';
    }
}

//default tag
export function isDefaultTag(tag) {
    let ret = {index: DEFAULT_TAGS.indexOf(tag)}
    if (ret.index !== -1) {
        return ret
    } else {
        if (tag.match(/^y(ou|ch|pl)_([a-zA-z\d\-\_]+)/)) {
            ret.index = 30
            return ret
        }
        if (tag.match(/^(profit|safety|manag|)>(-?\d+)$/)) {
            ret.index = 31
            return ret
        }
    }
    return false
}

export function normalize(tag) {
    let result = '';
    [...tag].forEach((str, i) => result = `${result}${tag.charCodeAt(i) === 12288 ? ' ' : (tag.charCodeAt(i) > 65280 && tag.charCodeAt(i) < 65375) ? String.fromCharCode(tag.charCodeAt(i) - 65248) : String.fromCharCode(tag.charCodeAt(i))}`);
    return result.toLowerCase(result).replace(/[零一二三四五六七八九十百千萬0123456789]+/g, a => cn2ArabNum(a));
}

function cn2ArabNum(cn) {
    const cnChars = '零一二三四五六七八九'
    const mulChars = '十百千萬'
    let arab = 0
    let tmp = []
    let mul = 0
    let state = 0
    let aum = 0
    if (!cn) {
        return 0
    }
    cn = cn.replace(/[零一二三四五六七八九]/g, a => cnChars.indexOf(a))
    if (cn.match(/^[十百千萬]/)) {
        cn = `1${cn}`
    }
    let pow = 1
    while (cn.length > 0) {
        tmp = cn.match(/[\d]+$/)
        if (tmp) {
            pow = 1
            for (let i = 0; i < (aum + mul); i++) {
                pow = pow * 10
            }
            arab = arab + tmp[0] * pow
            state = mul
            mul = 0
            cn = cn.slice(0, tmp.index)
        } else {
            if (mul > 0) {
                pow = 1
                for (let i = 0; i < (aum + mul); i++) {
                    pow = pow * 10
                }
                arab = arab + pow
                state = mul
                mul = 0
            }
            mul = Math.floor(((mulChars.indexOf(cn[cn.length-1])))+1)
            if (mul <= state) {
                aum = aum + state
                state = 0
            }
            cn = cn.slice(0, -1)
        }
    }
    return arab
}

//[^\x00-\x7F]+ 非英數
function denormalize(tag) {
    const r = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '萬'];
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 1000, 10000].forEach((v, i) => tag = tag.replace(new RegExp('(^|[^\x00-\x7F])' + v + '([^\x00-\x7F]|$)'), `$1${r[i]}$2`));
    return tag;
}

export const completeMimeTag = add => {
    const tool = add ? process(STORAGEDB) : null;
    let search_number = 0;
    const recur_com = () => Mongo('find', STORAGEDB, {}, {
        limit: RELATIVE_LIMIT,
        skip : search_number,
        sort: '_id',
    }).then(items => {
        const recur_item = index => {
            let complete_tag = [];
            const getTag = (tag, list, trans) => {
                const option_index = list.indexOf(tag);
                if (option_index !== -1) {
                    if (!items[index].tags.includes(trans[option_index])) {
                        for (let j in items[index]) {
                            if (isValidString(j, 'uid') || j === 'eztv' || j === 'lovetv') {
                                if (items[index][j].includes(list[option_index])) {
                                    complete_tag.push({
                                        owner: j,
                                        tag: trans[option_index],
                                    });
                                    return trans[option_index];
                                }
                            }
                        }
                    }
                }
                return false;
            }
            const completeNext = () => {
                index++;
                if (index < items.length) {
                    return recur_item(index);
                } else {
                    search_number += items.length;
                    console.log(search_number);
                    if (items.length < RELATIVE_LIMIT) {
                        console.log('end');
                    } else {
                        return recur_com();
                    }
                }
            }
            if (items.length === 0) {
                console.log('end');
            } else {
                items[index].tags.forEach(i => {
                    const tran_tag = getTag(i, TRANS_LIST, TRANS_LIST_CH);
                    if (tran_tag) {
                        getTag(tran_tag, GENRE_LIST_CH, GENRE_LIST);
                    }
                    if (!getTag(i, GENRE_LIST, GENRE_LIST_CH)) {
                        getTag(i, GENRE_LIST_CH, GENRE_LIST);
                    }
                    if (!getTag(i, GAME_LIST, GAME_LIST_CH)) {
                        getTag(i, GAME_LIST_CH, GAME_LIST);
                    }
                    if (!getTag(i, MEDIA_LIST, MEDIA_LIST_CH)) {
                        getTag(i, MEDIA_LIST_CH, MEDIA_LIST);
                    }
                });
                if (complete_tag.length > 0) {
                    console.log(items[index].name);
                    console.log(complete_tag);
                    const recur_add = tIndex => tool.addTag(items[index]._id, complete_tag[tIndex].tag, {
                        _id: complete_tag[tIndex].owner,
                        perm: 1,
                    }).then(() => addNext(tIndex)).catch(err => {
                        handleError(err, 'Complete tag');
                        return addNext(tIndex);
                    });
                    if (add) {
                        return recur_add(0);
                    } else {
                        return completeNext();
                    }
                    function addNext(tIndex) {
                        tIndex++;
                        if (tIndex < complete_tag.length) {
                            return recur_add(tIndex);
                        } else {
                            return completeNext();
                        }
                    }
                } else {
                    return completeNext();
                }
            }
        };
        return recur_item(0);
    });
    return recur_com();
}