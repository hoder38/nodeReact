FROM node:14-alpine

WORKDIR /app

COPY ./package.json ./package-lock.json ./
RUN apk add --no-cache git python3 py3-pip build-base
RUN pip install yt-dlp
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm ci --legacy-peer-deps

COPY ./. .

RUN npm run postinstall

EXPOSE 8084

CMD ["node", "src/back/controllers/file-server.js"]
