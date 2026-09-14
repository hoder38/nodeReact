FROM nginx:1.18-alpine

# Dev and release share this image: the dev stack serves app.html/main.js
# (unminified, webpack --watch friendly), release serves release.html/release.js.
ARG NGINX_CONF=config/nginx-release.conf

RUN rm /etc/nginx/conf.d/default.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY ./public/. /app/public/.

EXPOSE 443
EXPOSE 80