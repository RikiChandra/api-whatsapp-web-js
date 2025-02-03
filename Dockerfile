FROM node:18.18.0

WORKDIR /usr/src/app

COPY package*.json ./

RUN apt-get update && apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libx11-xcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxi6 \
  libxtst6 \
  libpangocairo-1.0-0 \
  libpango-1.0-0 \
  libasound2 \
  libxss1 \
  libxrandr2 \
  libglib2.0-0 \
  libgtk-3-0 \
  fonts-liberation \
  libappindicator3-1 \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

RUN npm install

COPY . .

EXPOSE 8080

CMD [ "node", "server.js" ]
