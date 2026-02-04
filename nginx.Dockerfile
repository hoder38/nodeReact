FROM nginx:1.18-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY config/nginx-dev.conf /etc/nginx/conf.d/default.conf
COPY ./public/. /app/public/.

EXPOSE 8080
