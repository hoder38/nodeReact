### BEGIN INIT INFO
# Provides: scriptname
# Required-Start: $remote_fs $syslog
# Required-Stop: $remote_fs $syslog
# Default-Start: 2 3 4 5
# Default-Stop: 0 1 6
# Short-Description: Start daemon at boot time
# Description: Enable service provided by daemon.
### END INIT INFO

#!/bin/bash

NODE=/opt/node/bin/node
SERVER_JS_FILE=/home/pi/app/src/web/controllers/file-server.js
USER=root
OUT=/home/pi/app/file-nodejs.log

case "$1" in

start)
        echo "starting node: $NODE $SERVER_JS_FILE"
        sudo -u $USER $NODE $SERVER_JS_FILE >> $OUT 2>>$OUT &
        ;;

stop)
        killall $NODE
        ;;

*)
        echo "usage: $0 (start|stop)"
esac

exit 0

