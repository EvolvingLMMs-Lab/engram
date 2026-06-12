# AGENTS.md

Project guidance for agents working in this repository.

## Repository Management

- This workspace is managed with Jujutsu. Prefer `jj status`, `jj log`,
  `jj git fetch`, and `jj git push` for repository operations.
- Use `git` directly only for Git-specific inspection or interoperability.

## Toolchain

- Use Node.js 20.x.
- Use pnpm through Corepack. The repository currently declares
  `pnpm@8.15.1`.
- Install dependencies with `pnpm install`.

## Common Commands

- Build all packages: `pnpm build`
- Typecheck all packages: `pnpm -r typecheck`
- Run tests once: `pnpm exec vitest run`
- Run lint: `pnpm lint`
- Check dependency vulnerabilities: `pnpm audit --audit-level moderate`
- Check production dependency vulnerabilities:
  `pnpm audit --prod --audit-level moderate`
- In a clean checkout, run `pnpm build` before `pnpm lint` or tests. Workspace
  package exports point at `dist/` declaration files, and the server E2E tests
  require the built server binary.

## Dependencies

- Native dependencies include `better-sqlite3`, `keytar`, and `sharp`. If
  dependencies were installed with `--ignore-scripts`, rebuild or run their
  install scripts before running database, keychain, or image tests.
- The root `pnpm.overrides.protobufjs` entry is intentional. It keeps audit
  clean while `@xenova/transformers` still pulls `protobufjs` transitively via
  `onnxruntime-web` / `onnx-proto`.

## Generated Files

- Package `dist/` directories are generated build output. Do not edit them by
  hand.
