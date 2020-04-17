#!/usr/bin/env bash

git clean -xdf test/ > /dev/null
git checkout -- test/*/package.json
