#!/bin/bash

rm -rf build || true
rm package-lock.json || true

npx tsc --build tsconfig.esm.json tsconfig.cjs.json tsconfig.types.json && ./fix-export.sh
