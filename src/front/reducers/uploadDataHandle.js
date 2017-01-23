import { SET_UPLOAD } from '../constants'

const initialState = 0

export default function uploadDataHandle (state = initialState, action) {
    switch (action.type) {
        case SET_UPLOAD:
        return action.progress
        default:
        return state
    }
}