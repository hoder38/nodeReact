import React from 'react'
import { Provider } from 'react-redux'
import { Route, Switch } from 'react-router-dom'
import { ConnectedRouter } from 'connected-react-router'
import configureStore, { history } from '../configureStore.js'
import { ROOT_PAGE, LOGIN_PAGE, QRCODE_PAGE } from '../constants.js'
import ReApp from './ReApp.js'
import ReLogin from './ReLogin.js'
import ReQrApprove from './ReQrApprove.js'

export default function Root({ store: externalStore } = {}) {
    const store = externalStore || configureStore()
    return (
        <Provider store={store}>
            <div>
                <ConnectedRouter history={history}>
                    <Switch>
                        <Route path={LOGIN_PAGE} component={ReLogin} />
                        <Route path={`${QRCODE_PAGE}/:serial`} component={ReQrApprove} />
                        <Route path={ROOT_PAGE} component={ReApp} />
                    </Switch>
                </ConnectedRouter>
            </div>
        </Provider>
    )
}