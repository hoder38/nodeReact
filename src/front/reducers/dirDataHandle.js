import { arrayObject } from '../utility'

const initialState = []

export default function dirDataHandle (push, pop, set) {
    return (state = initialState, action) => {
        switch (action.type) {
            case set:
            return action.dirs.map((dir, i) => {
                dir = action.rest(dir, i)
                dir['list'] = new Map()
                dir['sortName'] = 'name'
                dir['sortType'] = 'asc'
                dir['page'] = 0
                dir['more'] = true
                return dir
            })
            case push:
            if (action.sortName !== null && action.sortType !== null) {
                return state.map(dir => dir.name === action.name ? Object.assign({}, dir, {
                    list: arrayObject('push', [], action.dir, 'id'),
                    sortName: action.sortName,
                    sortType: action.sortType,
                    page: action.dir.length,
                    more: (action.dir.length === 0) ? false : true,
                }) : dir)
            } else {
                return state.map(dir => dir.name === action.name ? Object.assign({}, dir, {
                    page: action.dir.length ? dir.page + action.dir.length : dir.page,
                    more: (Array.isArray(action.dir) && action.dir.length === 0) ? false : true,
                    list: arrayObject('push', dir.list, action.dir, 'id'),
                }) : dir)
            }
            case pop:
            return state.map(dir => dir.name === action.name ? Object.assign({}, dir, {
                list: arrayObject('pop', dir.list, action.id),
                page: dir.page - 1,
            }) : dir)
            default:
            return state
        }
    }
}