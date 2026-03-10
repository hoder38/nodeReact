FROM node:14-alpine

WORKDIR /app

COPY ./package.json ./package-lock.json ./
RUN apk add --no-cache git python3 py3-pip build-base p7zip
RUN pip install yt-dlp
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm ci --legacy-peer-deps

RUN npm run postinstall

EXPOSE 8082

CMD ["node", "src/back/controllers/server.js"]
