# TypeScript

`scripts/ts-consumer-check.mjs` packs `@adaptate/core` and `@adaptate/utils`, installs the tarballs, and typechecks a consumer that imports every published entry.

The CI job `ts7-consumer` runs that script on TypeScript 7 and TypeScript 6, each with `moduleResolution` `bundler`, `node16`, and `nodenext`.

Dev TypeScript in this repo is 7.0.2. Lint is `oxlint --type-aware` (`oxlint-tsgolint`), including `typescript/no-deprecated`.
