import { SEND_GLB_IN, CLOSE_GLB_IN } from '../constants'

const initialState = []

let key = 0

export default function glbInHandle (state = initialState, action) {
    switch (action.type) {
        case SEND_GLB_IN:
        return [
            {
                callback: action.callback,
                input: action.input,
                color: action.color,
                placeholder: action.placeholder,
                value: action.value === null ? '' : action.value,
                option: action.option === null ? '' : action.option,
                index: key++,
            },
            ...state.filter(i => i.input !== action.input),
        ]
        case CLOSE_GLB_IN:
        return action.input === -1 ? [] : state.filter(item => item.input !== action.input)
        default:
        return state
    }
}