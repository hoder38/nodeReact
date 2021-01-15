import { arrayObject } from '../utility.js'

const initialState = new Map()

export default function simpleDataHandle (push, pop) {
    return (state = initialState, action) => {
        switch (action.type) {
            case push:
            return arrayObject('push', Array.isArray(action.simple) ? [] : state, action.simple, 'id')
            case pop:
            return arrayObject('pop', state, action.id)
            default:
            return state
        }
    }
}
