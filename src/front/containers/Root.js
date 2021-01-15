import React from 'react'
import { Provider } from 'react-redux'
import { Route, Switch } from 'react-router-dom'
import { ConnectedRouter } from 'connected-react-router'
import configureStore, { history } from '../configureStore.js'
import { ROOT_PAGE, LOGIN_PAGE } from '../constants.js'
import ReApp from './ReApp.js'
import ReLogin from './ReLogin.js'

const store = configureStore()
//let unsubscribe = store.subscribe(() => console.log(store.getState()))

export default function Root() {
    return (
        <Provider store={store}>
            <div>
                <ConnectedRouter history={history}>
                    <Switch>
                        <Route path={LOGIN_PAGE} component={ReLogin} />
                        <Route path={ROOT_PAGE} component={ReApp} />
                    </Switch>
                </ConnectedRouter>
            </div>
        </Provider>
    )
}