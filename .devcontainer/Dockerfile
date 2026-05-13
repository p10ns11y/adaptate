FROM node:24-bookworm

RUN apt-get update && apt-get install -y sudo \
    && echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.1.1

USER node
WORKDIR /workspaces
