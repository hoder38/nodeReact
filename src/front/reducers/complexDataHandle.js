import { arrayObject, arrayId } from '../utility'
import { SET_LOTTERY, SET_BITFINEX } from '../constants'

const rest_item = item => {
    if (item.utime) {
        const date = new Date(item.utime * 1000)
        item.utime = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
    }
    return item
}

const rest_item1 = item => {
    if (item.utime > 10000) {
        const date = new Date(item.utime * 1000)
        const h = date.getHours();
        const m = date.getMinutes();
        const s = date.getSeconds();
        item.utime = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`
    }
    return item
}

const rest_item2 = item => {
    if (item.utime > 10000) {
        const date = new Date(item.utime * 1000)
        const h = date.getHours();
        const m = date.getMinutes();
        const s = date.getSeconds();
        item.utime = `${date.getMonth() + 1}/${date.getDate()} ${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`
    }
    return item
}

let key = 0

export default function complexDataHandle (push, pop, set) {
    const initialState = {
        list: new Map(),
        multi: false,
        path: {
            cur: [],
            exactly: [],
            his: [],
        },
        latest: '',
        item: {
            list: new Set(),
            sortName: 'name',
            sortType: 'asc',
            bookmark: '',
            page: 0,
            more: true,
            pageToken: '',
        },
        select: new Set(),
    }
    return (state = initialState, action) => {
        switch (action.type) {
            case set:
            if (action.list) {
                let newList = new Set()
                let page = 0
                let index = 0
                let more = state.item.more
                if (Array.isArray(action.list)) {
                    newList = action.list.map(i => {
                        i.id = action.id
                        i.complete = false
                        return i
                    })
                    index = action.time
                    action.list = 9
                    more = false
                } else {
                    state.item.list.forEach(item => {
                        let tmp = state.list.get(item)
                        if (tmp.status === action.list) {
                            newList.add(item)
                            if (item === action.id) {
                                index = newList.size
                            }
                            if (!tmp.noDb) {
                                page++
                            }
                        }
                    })
                }
                return Object.assign({}, state, {
                    select: action.select === null ? state.select : (typeof action.select === 'string') ? state.item.list : action.select,
                    latest: (action.bookmark && action.latest) ? (action.bookmark === state.item.bookmark) ? action.latest : state.latest : state.latest,
                    multi: action.multi === null ? state.multi : action.multi,
                    [action.list]: Object.assign({}, state.item, {
                        list: newList,
                        page,
                        index,
                        count: key++,
                        opt: action.opt,
                        more,
                    })
                })
            } else {
                return Object.assign({}, state, {
                    select: action.select === null ? state.select : (typeof action.select === 'string') ? state.item.list : action.select,
                    latest: (action.bookmark && action.latest) ? (action.bookmark === state.item.bookmark) ? action.latest : state.latest : state.latest,
                    multi: action.multi === null ? state.multi : action.multi,
                })
            }
            case push:
            if (action.sortName !== null && action.sortType !== null) {
                if (action.list === 'item') {
                    window.scrollTo(0, 0)
                    return Object.assign({}, state, {
                        list: arrayObject('push', state.list, action.item, 'id', (set === SET_LOTTERY) ? rest_item1 : (set === SET_BITFINEX) ? rest_item2 : rest_item),
                        latest: action.latest === null ? '' : action.latest,
                        path: action.path === null ? state.path : action.path,
                        select: new Set(),
                        item: {
                            sortName: action.sortName,
                            sortType: action.sortType,
                            bookmark: (action.bookmark === null) ? '' : action.bookmark,
                            page: action.item.length,
                            more: (action.item.length === 0) ? false : true,
                            list: arrayId('push', [], action.item, 'id'),
                            pageToken: '',
                        },
                    })
                } else {
                    return state
                }
            } else {
                if (action.pageToken === null) {
                    return Object.assign({}, state, {
                        list: arrayObject('push', state.list, action.item, 'id', (set === SET_LOTTERY) ? rest_item1 : (set === SET_BITFINEX) ? rest_item2 : rest_item),
                        [action.list]: Object.assign({}, state[action.list], {
                            page: action.item.length ? state[action.list].page + action.item.length : state[action.list].page,
                            more: (Array.isArray(action.item) && action.item.length === 0) ? false : true,
                            list: arrayId('push', state[action.list].list, action.item, 'id', (set === SET_LOTTERY) ? rest_item1 : (set === SET_BITFINEX) ? rest_item2 : rest_item),
                        }),
                    })
                } else {
                    for (let i in action.path.cur) {
                        if (action.path.cur[i] !== state.path.cur[i]) {
                            return state
                        }
                    }
                    return Object.assign({}, state, {
                        list: arrayObject('push', state.list, action.item, 'id', (set === SET_LOTTERY) ? rest_item1 : (set === SET_BITFINEX) ? rest_item2 : rest_item),
                        [action.list]: Object.assign({}, state[action.list], {
                            pageToken: action.pageToken,
                            more: (!state[action.list].more && action.item.length === 0) ? false : true,
                            list: arrayId('push', state[action.list].list, action.item, 'id', (set === SET_LOTTERY) ? rest_item1 : (set === SET_BITFINEX) ? rest_item2 : rest_item),
                        }),
                    })
                }
            }
            case pop:
            return Object.assign({}, state, {
                list: arrayObject('pop', state.list, action.id),
                item: Object.assign({}, state.item, {
                    list: arrayId('pop', state.item.list, action.id),
                    page: state.item.page - 1,
                }),
                select: arrayId('pop', state.select, action.id),
            }, state[2] ? {
                2: Object.assign({}, state[2], {
                    list: arrayId('pop', state[2].list, action.id),
                    page: state[2].page - 1,
                }),
            } : {}, state[3] ? {
                3: Object.assign({}, state[3], {
                    list: arrayId('pop', state[3].list, action.id),
                    page: state[3].page - 1,
                }),
            } : {}, state[4] ? {
                4: Object.assign({}, state[4], {
                    list: arrayId('pop', state[4].list, action.id),
                    page: state[4].page - 1,
                }),
            } : {})
            default:
            return state
        }
    }
}