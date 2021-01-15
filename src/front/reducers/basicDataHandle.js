import { SET_BASIC } from '../constants.js'

const initialState = {
    id: 'guest',
    url: '',
    edit: false,
    level: 0,
    sub: [],
    fitness: 0,
}

export default function basicDataHandle (state = initialState, action) {
    switch (action.type) {
        case SET_BASIC:
        const id = action.id === null ? state.id : action.id
        const url = action.url === null ? state.url : action.url
        const edit = action.edit === null ? state.edit : action.edit
        const level = action.level === null ? state.level : action.level
        const sub = action.sub === null ? state.sub : [...state.sub, action.sub]
        const fitness = action.fitness === null ? state.fitness : action.fitness
        return {
            id,
            url,
            edit,
            level,
            sub,
            fitness,
        }
        default:
        return state
    }
}