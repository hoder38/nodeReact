FROM alpine:3.19

RUN apk add --no-cache docker-cli tzdata

COPY scripts/log-backup.sh /usr/local/bin/log-backup.sh
RUN chmod +x /usr/local/bin/log-backup.sh

# Run backup daily at 1:00 AM
RUN echo "0 1 * * * /usr/local/bin/log-backup.sh >> /var/log/log-backup.log 2>&1" > /etc/crontabs/root

CMD ["crond", "-f", "-l", "8"]
