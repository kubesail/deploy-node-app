#!/usr/bin/env bash

set -eE
function finish {
  set +x
  echo "Tests Failed!"
}
trap finish ERR

WORKDIR=$(pwd)

cd test
yarn

set -x

${WORKDIR}/src/index.js --generate-default-env --overwrite
${WORKDIR}/src/index.js --generate-local-ports-env --format compose --overwrite

fgrep "REDIS_SERVICE_PORT=6379" .env
fgrep "REDIS_SERVICE_HOST" .env

