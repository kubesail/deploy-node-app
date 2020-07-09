#!/usr/bin/env bash

set -e

./node_modules/.bin/eslint src --no-eslintrc -c .eslintrc.json
