FROM node:14-bullseye-slim

WORKDIR /app

COPY ./package.json ./package-lock.json ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 python3-pip build-essential p7zip-full ffmpeg qpdf megatools \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install yt-dlp pytest shioaji
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm ci --legacy-peer-deps

RUN npm run postinstall

EXPOSE 8082

CMD ["node", "src/back/controllers/server.js"]
