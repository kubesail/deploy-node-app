#!/usr/bin/env bash

set -eE
function finish {
  set +x
  echo "Tests Failed!"
  bash ./bin/clean.sh
}
trap finish ERR

./node_modules/.bin/mocha ./test/index.js
bash ./bin/clean.sh
