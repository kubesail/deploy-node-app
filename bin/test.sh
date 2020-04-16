#!/usr/bin/env bash

set -eE
function finish {
  set +x
  echo "Tests Failed!"
}
trap finish ERR

git clean -xdf test/
./node_modules/.bin/mocha ./test/index.js
