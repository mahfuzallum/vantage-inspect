FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npm run next:start & exec npm run worker"]
