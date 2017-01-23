import { SEND_GLB_PW, CLOSE_GLB_PW } from '../constants'

const initialState = []

export default function glbPwHandle (state = initialState, action) {
    switch (action.type) {
        case SEND_GLB_PW:
        return [
            action.callback,
            ...state,
        ]
        case CLOSE_GLB_PW:
        let new_state = [...state]
        new_state.splice(0, 1)
        return new_state
        default:
        return state
    }
}