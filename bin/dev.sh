#!/bin/env bash
pushd ob
git checkout master
git pull
popd

pushd front
pnpm install
pnpm run build
popd

pushd backend
pnpm run dev

