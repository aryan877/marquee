#!/bin/bash
set -a
source /opt/marquee/.env
set +a
cd /opt/marquee/apps/worker
exec /opt/marquee/apps/worker/node_modules/.bin/tsx src/index.ts
