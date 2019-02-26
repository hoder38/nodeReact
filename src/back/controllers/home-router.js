import Express from 'express'
import { checkAdmin, checkLogin } from '../util/utility'

const router = Express.Router()

router.use(function(req, res, next) {
    checkLogin(req, res, next)
})

router.get('/', function(req, res, next) {
    console.log('api homepage');
    const msg = ["hello", "壓縮檔加上.book或是cbr、cbz檔可以解壓縮，當作書本觀看", "如: xxx.book.zip , aaa.book.rar , bbb.book.7z", "", "指令：", ">50: 搜尋大於編號50", "all item: 顯示子項目", "no local: 不顯示本地搜尋結果", "youtube (music) video: 顯示youtube vidoe搜尋結果", "youtube playlist: 顯示youtube playlist", "youtube music: 顯示youtube video搜尋結果", "youtube music playlist: 顯示youtube (music) playlist搜尋結果(可支援多字詞搜尋)", "yify movie: 顯示yify電影搜尋結果(可支援劇情分類[動作, 冒險, 動畫, 傳記, 喜劇, 犯罪, 記錄, 劇情, 家庭, 奇幻, 黑色電影, 歷史, 恐怖, 音樂, 音樂劇, 神祕, 浪漫, 科幻, 運動, 驚悚, 戰爭, 西部]、字詞搜尋)", "dm5 comic: 顯示dm5漫畫搜尋結果(可支援劇情分類[動作, 浪漫, 喜劇, 驚悚, 犯罪, 神秘, 戰爭, 奇幻, 冒險, 科幻, 恐怖, 歷史, 運動, 校園, 百合, 彩虹, 後宮, 魔法, 同人, 紳士, 機甲]、字詞搜尋)", /*"bilibili movie: 顯示bilibili電影搜尋結果", "bilibili animation: 顯示bilibili動畫搜尋結果(可支援國家[台灣, 香港, 大陸, 日本, 歐美, 韓國, 法國, 泰國, 西班牙, 俄羅斯, 德國, 海外, 完結]、年份、字詞搜尋)",*/ "", "增加bookmark物件：", "在儲存bookmark或訂閱youtube channel時產生，", "方便整理完的bookmark給其它人參考", "", "指令不算在單項搜尋裡", "預設只會搜尋到有first item的檔案", "方便尋找，可以縮小範圍後再下all item顯示全部", "", "播放器 快捷鍵:", "空白鍵: 播放/暫停", "c/7: 字幕 開/關", "f/8: 全螢幕", "</4: 後退5秒", ">/5: 前進5秒", "1: 後退1%", "2: 前進1%", "上: 音量變大", "下: 音量變小", "影片跟音樂點擊 [選項] 有可開啟選項模式", "播放模式: 循環播放, 倒敘播放, 單首播放, 隨機播放(只有music)", , "校準字幕，固定目前字幕，<>/45鍵變成移動0.5秒，再選一次發送校正", "", "URL上傳支援:", "Youtube", "Youtube music: url結尾加上 :music 會儲存成音樂", "Magnet (bit torrent url)", "Torrent", "Mega", "YIFY", "DM5"/*, "Bilibili"*/]
    const adult_msg = ["", "18+指令: ", "", "18+: 顯示十八禁的檔案"/*, "18-: 不顯示十八禁的檔案"*/]
    res.json({msg: checkAdmin(2, req.user) ? [...msg, ...adult_msg] : msg})
})

export default router