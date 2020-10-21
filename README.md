# nodeReact
node react mongo

sudo apt-get update
sudo apt-get upgrade

sudo apt-get install g++-4.7
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.6 60 --slave /usr/bin/g++ g++ /usr/bin/g++-4.6
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.7 40 --slave /usr/bin/g++ g++ /usr/bin/g++-4.7
sudo update-alternatives --config gcc

nodejs: https://nodejs.org/dist/v7.4.0/
uname -a 看cpu
$wget https://nodejs.org/dist/latest-v5.x/node-v5.11.0-linux-armv7l.tar.gz
$ tar -xvzf node-v5.11.0-linux-armv7l.tar.gz
$ sudo mv node-v5.11.0-linux-armv7l /opt/node
$ sudo mkdir /opt/bin
$ sudo ln -s /opt/node/bin/* /opt/bin/
$ sudo nano /etc/profile
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/bin"

try:
curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo apt-get install -y build-essential

mongo: http://andyfelong.com/2016/01/mongodb-3-0-9-binaries-for-raspberry-pi-2-jessie/

mongo index在nodeReact/mongoIndex

wget http://download.redis.io/releases/redis-3.2.6.tar.gz
tar xzf redis-3.2.6.tar.gz
cd redis-3.2.6
make
sudo make install
wget https://github.com/ijonas/dotfiles/raw/master/etc/init.d/redis-server
wget https://github.com/ijonas/dotfiles/raw/master/etc/redis.conf
sudo mv redis-server /etc/init.d/redis-server
sudo chmod +x /etc/init.d/redis-server
sudo mv redis.conf /etc/redis.conf
sudo useradd redis
sudo mkdir -p /var/lib/redis
sudo mkdir -p /var/log/redis
sudo chown redis.redis /var/lib/redis
sudo chown redis.redis /var/log/redis
sudo update-rc.d redis-server defaults
sudo /etc/init.d/redis-server start

install nginx
wget http://mirror.ossplanet.net/raspbian/raspbian/pool/main/n/nginx/nginx_1.10.3.orig.tar.gz
tar -xzvf nginx_1.10.3.orig.tar.gz
cd nginx-1.10.3
./configure --prefix=/usr/local/nginx --with-http_stub_status_module --with-http_ssl_module --with-threads --with-http_auth_request_module
make
sudo make install
cd /usr/sbin
sudo ln -s /usr/local/nginx/sbin/nginx nginx
conf在/usr/local/nginx/conf/nginx.conf
log在/usr/local/nginx/logs
nginx用的ssl key
# Extract the Public Cert
$ openssl pkcs12 -in ./file.pfx -clcerts -nokeys -out public.crt

# Extract the Private Key
openssl pkcs12 -in ./file.pfx -nocerts -nodes -out private.rsa
password是startssl的


/etc/logrotate.conf

/home/pi/app/nodeReact/log/nodejs.log {
  daily
  missingok
  rotate 14
  notifempty
  copytruncate
}

sudo npm install --unsafe-perm

youtube-dl: sudo ln -s /usr/bin/youtube-dl youtube-dl
  update use -> sudo youtube-dl -U

googleapis: ?

pdftk
nodejs
mongodb
redis
youtube-dl
unrar
7za
python
megadl
avconv or ffmpeg

cmd:
sudo -i babel-node /home/pi/app/nodeReact/src/back/cmd/cmd.js
sudo -i node /home/pi/release/nodeReact/build/back/cmd/cmd.js
記得等db connect

google auth:
記得到 https://console.developers.google.com/apis/dashboard?project=sanguine-mark-826&authuser=0&hl=zh-tw&duration=PT1H 開啟api
sudo -i babel-node /home/pi/app/nodeReact/src/back/cmd/googledrive.js
sudo -i node /home/pi/release/nodeReact/build/back/cmd/googledrive.js
改權限記得刪權限後再要一次refresh token, https://myaccount.google.com/u/0/permissions
記得update db token


/*make p12

1. Validations Wizard: domain

2. Certificates Wizard: openssl req -newkey rsa:2048 -keyout anomopi.key -out anomopi.csr

3. Toolbox -> certificate list -> retrieve -> OtherServer

4. creat pfx: openssl pkcs12 -export -out anomopi.pfx -inkey anomopi.key -in 2_www.anomopi.com.crt

5. PFX: anomopi.pfx CA: 1_Intermediate.crt*/

新版ssl

1. anomopi.key 自己做 沿用舊的

2. anomopi.crt 到godaddy下載"其他"的憑證 更名裡面的"亂數.crt"

3. gd_bundle-g2-g1.crt 同上用裡面的 gd_bundle-g2-g1.crt

4. nginx.crt 合併anomopi.crt和gd_bundle-g2-g1.crt，anomopi.crt在前


遊戲: 請在pacjage.json加入     "redux-saga": ">=0.15.4",
並uncommnet configureStore.js

The Allstate Corporation 17
-0.94% 1309 17.39% -0.35% 24 0 -9.85% 1008 817900
Biogen Inc. 67
-2.66% 4603 43.11% 24.43% 23.33 2 -6.19% 1008 433700
Tyson Foods, Inc. 35
-6.33% 1148 29.25% 5.5% 27 0 -9.02% 1009 564200
Globe Life Inc. 20
-0.02% 1000 19.44% -0.96% 28 0 -8.33% 1009 200500
Cigna Corporation 28
0.89% 2116 23.78% -4.95% 24.5 0 -7.69% 1009 531000
Northern Trust Corporation 35
-3.31% 1266 21.84% 14.21% 26.67 1 -5.95% 1006 204300
The Charles Schwab Corporation 31
-4.91% 744 43.32% 15.99% 15.33 0 -5.2% 1006 1819000
BorgWarner Inc. 58
-3.35% 641 22.72% 35.5% 20.5 0 -7.05% 1006 331500
Kellogg Company 31
4.28% 911 15.64% 15.77% 12.33 0 -13.06% 1006 737900
Ulta Beauty, Inc. 71
-2.01% 3364 36.42% 35.06% 22.67 0 -22.95% 1006 447000