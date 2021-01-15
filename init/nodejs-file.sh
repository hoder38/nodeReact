#!/bin/sh

### BEGIN INIT INFO
# Provides: scriptname
# Required-Start: $remote_fs $syslog
# Required-Stop: $remote_fs $syslog
# Default-Start: 2 3 4 5
# Default-Stop: 0 1 6
# Short-Description: Start daemon at boot time
# Description: Enable service provided by daemon.
### END INIT INFO

NODE=/usr/bin/node
NAME=nodejs-file
DESC=nodejs-file
SERVER_JS_FILE=/home/pipipi/app/nodeReact/src/back/controllers/file-server.js
USER=root
OUT=/home/pipipi/app/nodeReact/log/file-nodejs.log

case "$1" in

start)
    echo "starting node: $NODE $SERVER_JS_FILE"
    sudo -u $USER $NODE $SERVER_JS_FILE >> $OUT 2>>$OUT &
    ;;

stop)
    killall $NODE -u $USER
    ;;

*)
    echo "usage: $0 (start|stop)"
esac

exit 0

