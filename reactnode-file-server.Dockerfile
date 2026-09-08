FROM node:14-bullseye-slim

WORKDIR /app

COPY . ./
# Debian 11 (bullseye) reached end-of-LTS on 2026-08-31: deb.debian.org purged the
# security pool (404 on every .deb) and its Release file is expired. Pull from
# archive.debian.org, which retains EOL releases. The bullseye-security suite is
# omitted because it exists on no mirror any more - an EOL release receives no
# further security updates. Check-Valid-Until is disabled because archived metadata
# is frozen and therefore permanently past its expiry date.
RUN printf 'deb http://archive.debian.org/debian bullseye main\ndeb http://archive.debian.org/debian bullseye-updates main\n' > /etc/apt/sources.list \
    && rm -rf /etc/apt/sources.list.d/* \
    && apt-get -o Acquire::Check-Valid-Until=false update && apt-get install -y --no-install-recommends \
    git python3 python3-pip build-essential p7zip-full ffmpeg qpdf megatools curl \
    && rm -rf /var/lib/apt/lists/*
# p7zip has no RAR codec support (proprietary format), so 7za cannot open .rar/.cbr
# archives at all ("Cannot open the file as archive"). Install RARLab's official
# freeware unrar binary instead, which is the only reliable way to extract RAR files.
RUN curl -sL https://www.rarlab.com/rar/rarlinux-x64-701.tar.gz -o /tmp/rar.tar.gz \
    && tar xzf /tmp/rar.tar.gz -C /tmp \
    && cp /tmp/rar/unrar /usr/local/bin/unrar \
    && chmod +x /usr/local/bin/unrar \
    && rm -rf /tmp/rar /tmp/rar.tar.gz
RUN pip3 install yt-dlp pytest shioaji
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
# yt-dlp releases after 2025.09.26 require Python >= 3.10, but this image only ships
# Python 3.9 (Debian bullseye). Pin youtube-dl-exec's bundled binary to the last
# release that still supports Python 3.9 to avoid "unsupported Python version" errors.
ENV YOUTUBE_DL_HOST=https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/2025.09.26
RUN npm ci --legacy-peer-deps

RUN npm run postinstall

EXPOSE 3390
EXPOSE 3391

CMD ["node", "src/back/controllers/file-server.js"]
