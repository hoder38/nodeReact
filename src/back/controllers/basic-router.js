import { ENV_TYPE } from '../../../ver'
import { EXTENT_FILE_IP, EXTENT_FILE_PORT, EXTENT_IP, WS_PORT } from '../config'
import Express from 'express'
import { checkAdmin, checkLogin } from '../util/utility'

const router = Express.Router()

router.use(function(req, res, next) {
    checkLogin(req, res, next)
})

router.route('/').get(function(req, res, next){
    console.log('get basic');
    res.json({
        id: req.user.username,
        ws_url: `wss://${EXTENT_IP(ENV_TYPE)}:${WS_PORT(ENV_TYPE)}`,
        level: checkAdmin(1, req.user) ? 2 : checkAdmin(2, req.user) ? 1 : 0,
        isEdit: checkAdmin(1, req.user) ? true : false,
        nav: checkAdmin(1, req.user) ? [{
            title: "Stock",
            hash: "/Stock",
            css: "glyphicon glyphicon-signal",
            key: 3
        }] : [],
        main_url: `https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)}`,
    })
})

router.get('/testLogin', function(req, res, next){
    res.json({apiOK: true})
})

export default router

