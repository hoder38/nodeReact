# nodeReact agent instructions

- Run every build, test and command for this repo inside a Node 14 container (`node:14-bullseye-slim`, git installed, `npm ci --legacy-peer-deps`). Never use the host's Node 22: it gives misleading failures (webpack chunk conflict, OpenSSL errors, babel mismatch).
- Do not build or test inside the running `*-release` containers or write to `public/`; use a throwaway copy (e.g. under `/tmp`) mounted into a temporary container.
- Front-end tests: `npx jest --config jest.front.cjs --forceExit src/front` inside the Node 14 container (verified: 18 suites / 1331 tests pass with the lockfile as-is, no babel upgrade needed).
