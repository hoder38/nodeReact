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

NODE=/opt/node/bin/node-release
# SERVER_JS_FILE=/home/pi/release/nodejsAngular/src/web/controllers/server.js
SERVER_JS_FILE=/home/pi/release/nodeReact/build/back/controllers/server.js
USER=root
# OUT=/home/pi/release/nodejsAngular/log/nodejs.log
OUT=/home/pi/release/nodeReact/log/nodejs.log

case "$1" in

start)
        echo "starting node: $NODE $SERVER_JS_FILE"
        sudo -u $USER $NODE --max-old-space-size=768 $SERVER_JS_FILE >> $OUT 2>>$OUT &
        ;;

stop)
	killall $NODE
        ;;

*)
        echo "usage: $0 (start|stop)"
esac

exit 0

