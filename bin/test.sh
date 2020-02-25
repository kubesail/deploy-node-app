#!/usr/bin/env bash

set -eE
function finish {
  set +x
  echo "Tests Failed!"
}
trap finish ERR

./node_modules/.bin/mocha ./test/index.js
