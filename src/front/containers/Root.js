import React from 'react'
import { Provider } from 'react-redux'
import { Router, Route, IndexRoute, Redirect, browserHistory } from 'react-router'
import { syncHistoryWithStore } from 'react-router-redux'
import configureStore from '../configureStore'
import { ROOT_PAGE, LOGIN_PAGE, USER_PAGE, STORAGE_PAGE, PASSWORD_PAGE, STOCK_PAGE, FITNESS_PAGE, RANK_PAGE, LOTTERY_PAGE, BITFINEX_PAGE } from '../constants'
import ReApp from './ReApp'
import Homepage from '../components/Homepage'
import ReUserlist from './ReUserlist'
import Storage from '../components/Storage'
//import ReFitness from './ReFitness'
//import ReRank from './ReRank'
//要用rank fitess記得router加上
//<Route path={FITNESS_PAGE} component={ReFitness} />
//<Route path={RANK_PAGE} component={ReRank} />
import RePassword from './RePassword'
import ReStock from './ReStock'
import ReLottery from './ReLottery'
import ReBitfinex from './ReBitfinex'
import ReLogin from './ReLogin'
import { testLogin } from '../utility'


const store = configureStore()

const history = syncHistoryWithStore(browserHistory, store)

const isLogin = (nextState, replaceState, callback) => testLogin()
    .then(() => {
        replaceState(ROOT_PAGE)
        callback()
    }).catch(err => {
        console.log(err)
        callback()
    })

//let unsubscribe = store.subscribe(() => console.log(store.getState()))

export default function Root() {
    return (
        <Provider store={store}>
            <div>
                <Router history={history}>
                    <Route path={LOGIN_PAGE} component={ReLogin} onEnter={isLogin} />
                    <Route path={ROOT_PAGE} component={ReApp}>
                        <IndexRoute component={Homepage} />
                        <Route path={STORAGE_PAGE} component={Storage} />
                        <Route path={PASSWORD_PAGE} component={RePassword} />
                        <Route path={STOCK_PAGE} component={ReStock} />
                        <Route path={USER_PAGE} component={ReUserlist} />
                        <Route path={LOTTERY_PAGE} component={ReLottery} />
                        <Route path={BITFINEX_PAGE} component={ReBitfinex} />
                    </Route>
                    <Redirect from="*" to={ROOT_PAGE} />
                </Router>
            </div>
        </Provider>
    )
}