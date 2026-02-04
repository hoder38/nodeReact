FROM nginx:1.18-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY config/nginx-dev.conf /etc/nginx/conf.d/default.conf

RUN mkdir -p /etc/letsencrypt/live/www.anomopi.com/
COPY ./public/. /app/public/.
COPY ./nginx.crt /etc/letsencrypt/live/www.anomopi.com/fullchain.pem
COPY ./nginx.key /etc/letsencrypt/live/www.anomopi.com/privkey.pem

EXPOSE 8080
