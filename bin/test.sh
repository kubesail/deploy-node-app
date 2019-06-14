#!/usr/bin/env bash

set -eE
function finish {
  set +x
  echo "Tests Failed!"
}
trap finish ERR

WORKDIR=$(pwd)
mkdir -p tmp
cd tmp

if [ ! -d testapp ]; then
  ../node_modules/.bin/create-node-app testapp
fi

cd testapp

set -x

${WORKDIR}/src/index.js --generate-local-env --format compose

fgrep "REDIS_SERVICE_PORT=6379" .env
fgrep "REDIS_SERVICE_HOST" .env

