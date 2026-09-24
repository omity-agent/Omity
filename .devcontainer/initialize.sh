#!/usr/bin/env bash
set -euo pipefail

sudo chown --recursive "$(id --user):$(id --group)" \
  node_modules dist styled-system "$OMITY_HOME" /home/node/.bun/install/cache

bun update
bun run --bun panda codegen
