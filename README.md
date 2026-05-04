https://github.com/XIU2/TrackersListCollection
可以到上面找best.txt更新torrent的tracker

shioaji更新api key & 憑證
https://www.sinotrade.com.tw/newweb/PythonAPIKey/

use this cmd to build node_modules: nvm use 14 && npm ci --legacy-peer-deps
"detect-character-encoding": "^0.8.0"要換成"jschardet": "^3.0.0"

已安裝
node & npm
yt-dlp
python3(3.10)
p7zip-full
ffmpeg
megatools
pdftk改為qpdf "${comPath}" --split-pages=1 -- "${pdfPath}/%03d.pdf"
unrar 改為用7z

google auth:
記得到 https://console.developers.google.com/apis/dashboard?project=sanguine-mark-826&authuser=0&hl=zh-tw&duration=PT1H 開啟api
docker exec -it reactnode-file-server node ./src/back/cmd/googledrive.js
改權限記得刪權限後再要一次refresh token, https://myaccount.google.com/u/0/permissions
記得update db token
目前release dev通用token

外部更新憑證定並設定重啟nginx 掛載/etc/letsencrypt
sudo crontab -e
0 0 * * * certbot renew --deploy-hook "docker exec nginx-proxy-release nginx -s reload"

還沒做
services:
  web:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"   # 單個檔案最大 10MB
        max-file: "3"     # 最多保留 3 個舊檔
查詢檔案路徑： 執行 docker inspect --format='{{.LogPath}}' <容器ID> 即可找到該固定檔案的絕對位置。

新環境要有的git nvm docker certbot p7zip-full(data.7z用)

7z a -p -mhe=on data.7z .env .env.dev csr/

連線db要用docker exec -it mongodb mongo

docker exec -it reactnode-file-server node ./src/back/cmd/cmd.js

docker compose -f docker-compose.dev.yml logs -f | -C 100

docker system prune -a