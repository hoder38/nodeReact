import { ALERT_PUSH, ALERT_POP } from '../constants.js'

const initialState = []

let key = 0

export default function alertHandle (state = initialState, action) {
    switch (action.type) {
        case ALERT_PUSH:
        if (action.msg.hasOwnProperty('message')) {
            action.msg = action.msg.message
        }
        if (action.msg.toString().trim()) {
            return [
                ...state,
                {
                    msg: action.msg.toString(),
                    key: key++,
                },
            ]
        }
        return state
        case ALERT_POP:
        return state.filter(alert => alert.key !== action.key)
        default:
        return state
    }
}