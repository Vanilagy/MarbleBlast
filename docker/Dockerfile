FROM --platform=$BUILDPLATFORM ubuntu:noble

RUN apt-get update && apt-get install -y \
    git \
    npm \
    && apt-get autoremove -y && apt-get clean -y && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/Vanilagy/MarbleBlast.git /home/ubuntu/MarbleBlast

WORKDIR /home/ubuntu/MarbleBlast

RUN npm install --legacy-peer-deps
RUN npm run compile