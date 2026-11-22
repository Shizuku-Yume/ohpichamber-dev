# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS base
WORKDIR /app

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY bun-patches ./bun-patches
COPY vendor/omp/a7135b8f/tarballs ./vendor/omp/a7135b8f/tarballs
COPY vendor/omp/a7135b8f/patches ./vendor/omp/a7135b8f/patches
COPY packages/ui/package.json ./packages/ui/
COPY packages/web/package.json ./packages/web/
COPY packages/electron/package.json ./packages/electron/
COPY packages/mobile/package.json ./packages/mobile/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/agent-contract/package.json ./packages/agent-contract/
COPY packages/agent-service/package.json ./packages/agent-service/
COPY packages/sdk/examples/browser-provider-stub/package.json ./packages/sdk/examples/browser-provider-stub/
COPY packages/sdk/examples/checklist-editor/package.json ./packages/sdk/examples/checklist-editor/
COPY packages/sdk/examples/config-editor/package.json ./packages/sdk/examples/config-editor/
COPY packages/sdk/examples/git-graph-status/package.json ./packages/sdk/examples/git-graph-status/
COPY packages/sdk/examples/github-token/package.json ./packages/sdk/examples/github-token/
COPY packages/sdk/examples/hello-kit/package.json ./packages/sdk/examples/hello-kit/
COPY packages/sdk/examples/service-echo/package.json ./packages/sdk/examples/service-echo/
COPY packages/sdk/examples/source-control-provider/package.json ./packages/sdk/examples/source-control-provider/
COPY packages/sdk/examples/tasks-demo/package.json ./packages/sdk/examples/tasks-demo/
COPY packages/sdk/examples/tools-only/package.json ./packages/sdk/examples/tools-only/
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS builder
WORKDIR /app
COPY . .
# The server imports ohpichamber-sdk at runtime, and deps installed with
# --ignore-scripts, so the root postinstall never built it. Build it here
# so the runtime stage can copy the output.
RUN bun run --cwd packages/sdk build
RUN bun run --cwd packages/agent-contract build
RUN bun run --cwd packages/agent-service build
RUN bun run build:web

FROM oven/bun:1.4.4 AS runtime
WORKDIR /home/ohpichamber

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  bzip2 \
  ca-certificates \
  git \
  less \
  nodejs \
  npm \
  openssh-client \
  python3 \
  && rm -rf /var/lib/apt/lists/*

# Replace the base image's 'bun' user (UID 1000) with 'ohpichamber'
# so mounted volumes with 1000:1000 ownership work correctly.
RUN userdel bun \
  && groupadd -g 1000 ohpichamber \
  && useradd -u 1000 -g 1000 -m -s /bin/bash ohpichamber \
  && chown -R ohpichamber:ohpichamber /home/ohpichamber

# Switch to ohpichamber user
USER ohpichamber

ENV NPM_CONFIG_PREFIX=/home/ohpichamber/.npm-global
ENV PATH=${NPM_CONFIG_PREFIX}/bin:${PATH}

RUN npm config set prefix /home/ohpichamber/.npm-global && mkdir -p /home/ohpichamber/.npm-global /home/ohpichamber/.local /home/ohpichamber/.config /home/ohpichamber/.ssh

# cloudflared 2026.3.0 - update digest explicitly when upgrading
COPY --from=cloudflare/cloudflared@sha256:6d91c121b803126f7a5344005d17a9324788fc09d305b6e2560ec6040a7ae283 /usr/local/bin/cloudflared /usr/local/bin/cloudflared

ENV NODE_ENV=production
# The base image ships with the POSIX locale, which makes bash readline treat
# every byte of a multibyte character separately in the built-in terminal.
ENV LANG=C.UTF-8

COPY scripts/docker-entrypoint.sh /home/ohpichamber/ohpichamber-entrypoint.sh

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder /app/packages/sdk/package.json ./packages/sdk/package.json
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=builder /app/packages/agent-contract/package.json ./packages/agent-contract/package.json
COPY --from=builder /app/packages/agent-contract/dist ./packages/agent-contract/dist
COPY --from=builder /app/packages/agent-service/package.json ./packages/agent-service/package.json
COPY --from=builder /app/packages/agent-service/dist ./packages/agent-service/dist
COPY --from=builder /app/packages/web/bin ./packages/web/bin
COPY --from=builder /app/packages/web/server ./packages/web/server
COPY --from=builder /app/packages/web/dist ./packages/web/dist
# Release notes shipped with the Host; Settings > About reads them offline.
COPY --from=builder /app/packages/web/resources/changelog ./packages/web/resources/changelog

EXPOSE 3000

ENTRYPOINT ["sh", "/home/ohpichamber/ohpichamber-entrypoint.sh"]
