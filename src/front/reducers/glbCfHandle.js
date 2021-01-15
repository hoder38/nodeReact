import { SEND_GLB_CF, CLOSE_GLB_CF } from '../constants.js'

const initialState = []

export default function glbCfHandle (state = initialState, action) {
    switch (action.type) {
        case SEND_GLB_CF:
        return [
            action.callback,
            action.text,
            ...state,
        ]
        case CLOSE_GLB_CF:
        let new_state = [...state]
        new_state.splice(0, 2)
        return new_state
        default:
        return state
    }
}
