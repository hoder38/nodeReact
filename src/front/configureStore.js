import { createStore, applyMiddleware } from 'redux'
//import createSagaMiddleware from 'redux-saga'
import rootReducer from './reducers'
//import mySaga from './sagas/start'

//const sagaMiddleware = createSagaMiddleware()

export default function configureStore(preloadedState={}) {
    const store = createStore(
        rootReducer,
        preloadedState,
        //applyMiddleware(sagaMiddleware),
    );
    //sagaMiddleware.run(mySaga);
    return store;
}