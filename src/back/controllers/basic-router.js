import { STORAGEDB } from '../constants.js'
import { ENV_TYPE } from '../../../ver.js'
import { EXTENT_FILE_IP, EXTENT_FILE_PORT, EXTENT_IP, WS_PORT } from '../config.js'
import Express from 'express'
import TagTool from '../models/tag-tool.js'
import { checkAdmin, checkLogin } from '../util/utility.js'

const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);

router.route('/getuser').get(function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('get basic');
        res.json({
            id: req.user.username,
            ws_url: `wss://${EXTENT_FILE_IP(ENV_TYPE)}:${WS_PORT(ENV_TYPE)}/f`,
            level: checkAdmin(1, req.user) ? 2 : checkAdmin(2, req.user) ? 1 : 0,
            isEdit: checkAdmin(1, req.user) ? true : false,
            nav: checkAdmin(1, req.user) ? [{
                title: "Stock",
                hash: "/Stock",
                css: "glyphicon glyphicon-signal",
                key: 3
            }] : [],
            main_url: `https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)}/f`,
        });
    });
});

router.get('/testLogin', function(req, res, next) {
    checkLogin(req, res, () => res.json({apiOK: true}));
});

router.get('/getPath', function(req, res, next) {
    checkLogin(req, res, () => res.json({path: StorageTagTool.searchTags(req.session).getArray().cur}));
});

export default router

