FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    --no-install-recommends && \
    pip3 install --break-system-packages yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Railway injects PORT dynamically — EXPOSE is just documentation
EXPOSE 3001

CMD ["node", "--unhandled-rejections=strict", "server.js"]