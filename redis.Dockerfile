FROM redis:5.0.7

COPY ./config/redis.conf /etc/redis/redis.conf
