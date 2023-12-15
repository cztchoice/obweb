#!/bin/env bash
pushd ~/obsidian_doc
git checkout master
git pull
popd

pushd front
npm install
npm run build
popd

pushd backend
pkill -f "node server.js"
npm run prod

