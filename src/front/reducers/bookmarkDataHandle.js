import { arrayObject } from '../utility.js'

const initialState = {
    list: new Map(),
    sortName: 'name',
    sortType: 'asc',
    page: 0,
    more: false,
}

export default function bookmarkDataHandle (push, pop) {
    return (state = initialState, action) => {
        switch (action.type) {
            case push:
            return (action.sortName !== null && action.sortType !== null) ? Object.assign({}, state, {
                list: arrayObject('push', [], action.bookmark, 'id'),
                sortName: action.sortName,
                sortType: action.sortType,
            }) : Object.assign({}, state, {list: arrayObject('push', state.list, action.bookmark, 'id')})
            case pop:
            return Object.assign({}, state, {list: arrayObject('pop', state.list, action.id)})
            default:
            return state
        }
    }
}