import { createStore, compose, applyMiddleware } from 'redux'
//import createSagaMiddleware from 'redux-saga'
import rootReducer from './reducers/index.js'
import { createBrowserHistory } from 'history'
import { routerMiddleware } from 'connected-react-router'
//import mySaga from './sagas/start'

//const sagaMiddleware = createSagaMiddleware()

export const history = createBrowserHistory()

export default function configureStore(preloadedState={}) {
    const store = createStore(
        rootReducer(history),
        preloadedState,
        //applyMiddleware(sagaMiddleware),
        compose(
            applyMiddleware(
                routerMiddleware(history),
            ),
        ),
    );
    //sagaMiddleware.run(mySaga);
    return store;
}