FROM oven/bun:1 AS bun

FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

USER root

RUN apt-get update \
  && apt-get install --no-install-recommends --yes libgtk-3-0 \
  && rm --force --recursive /var/lib/apt/lists/*

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln --symbolic /usr/local/bin/bun /usr/local/bin/bunx

USER node
WORKDIR /workspaces/omity
