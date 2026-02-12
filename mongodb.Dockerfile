FROM mongo:4.4.2

COPY ./config/mongod.conf /etc/mongo/mongod.conf
