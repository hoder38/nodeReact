FROM nginx:1.18-alpine

# One image for both stacks. It bakes the release config and the built
# frontend so production is self-contained and immutable; the dev compose
# file bind-mounts nginx-dev.conf and ./public over these to get live reload.
RUN rm /etc/nginx/conf.d/default.conf
COPY config/nginx-release.conf /etc/nginx/conf.d/default.conf
COPY ./public/. /app/public/.

EXPOSE 443
EXPOSE 80
