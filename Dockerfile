# syntax=docker/dockerfile:1.7
#
# reviewd is a single Node process. The runtime image intentionally contains only
# the esbuild bundles and the built SPA: no source, tests, dev dependencies or agent
# CLIs. Git and ca-certificates are the only OS packages required at runtime.

ARG NODE_IMAGE=node:22.23.2-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@11.22.0

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile --prefer-offline
RUN pnpm build

FROM ${NODE_IMAGE} AS runtime
ARG VERSION=0.1.0
LABEL org.opencontainers.image.title="reviewd" \
      org.opencontainers.image.description="Harness-agnostic code review control plane" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/AKhasa9ov/reviewd"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CODE_REVIEW_HOST=0.0.0.0 \
    CODE_REVIEW_PORT=3100 \
    CODE_REVIEW_STORE=/data

WORKDIR /app

COPY --from=build --chown=node:node /app/packages/server/dist ./packages/server/dist
COPY --from=build --chown=node:node /app/packages/web/dist ./packages/web/dist
COPY --chown=node:node LICENSE ./

RUN rm -f packages/server/dist/*.map \
    && mkdir -p /data \
    && chown node:node /data /app

USER node

VOLUME ["/data"]
EXPOSE 3100
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "packages/server/dist/reviewd.js"]
