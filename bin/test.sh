#!/usr/bin/env bash

set -eE
function finish {
  set +x
  echo "Tests Failed!"
}
trap finish ERR

git clean -xdf test/
git checkout -- test/*/package.json

./node_modules/.bin/mocha ./test/index.js

git clean -xdf test/ > /dev/null
git checkout -- test/*/package.json
