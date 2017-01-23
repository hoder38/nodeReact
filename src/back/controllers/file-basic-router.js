import Express from 'express'
import { checkLogin } from '../util/utility'

const router = Express.Router()

router.use(function(req, res, next) {
    checkLogin(req, res, next, 1)
})

router.get('/testLogin', function(req, res, next){
    res.json({apiOK: true})
})

export default router