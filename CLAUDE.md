# BackItUp Development Guide

BackItUp is a secure backup utility with glob patterns, tar.gz archives, local + S3 storage, Docker volume support, and safe cleanup. It's built with Bun and compiled to standalone binaries for cross-platform distribution.

## Quick Reference

```bash
bun install              # Install dependencies
bun run dev              # Development with hot reload
bun test                 # Run tests
bun run lint             # Lint with oxlint
bun run format           # Format code with oxfmt
bunx tsc --noEmit        # Type check
bun run build            # Build standalone binary
```

## Bun Runtime

Use Bun instead of Node.js for everything:

- `bun <file>` instead of `node` or `ts-node`
- `bun test` instead of jest/vitest
- `bun install` instead of npm/yarn/pnpm
- `bun run <script>` instead of npm run
- `bunx <pkg>` instead of npx
- Bun auto-loads `.env` files (no dotenv needed)

### Bun APIs

- `Bun.file()` for file I/O (not `node:fs` readFile/writeFile)
- `Bun.$\`cmd\`` for shell commands (not execa)
- `bun:sqlite` for SQLite (not better-sqlite3)
- `Bun.serve()` for HTTP/WebSocket servers

## Project Structure

```
src/
├── index.ts              # CLI entry point, command routing
├── types/                # TypeScript type definitions
│   ├── config.ts         # BackitupConfig, SourceConfig, etc.
│   ├── backup.ts         # BackupResult, BackupRecord
│   ├── storage.ts        # Storage interfaces
│   └── database.ts       # DB record types
├── cli/
│   ├── commands/         # backup, cleanup, list, start, verify
│   └── ui/               # prompts, formatters, output helpers
├── core/
│   ├── backup/           # orchestrator, file-collector, archive-creator
│   ├── cleanup/          # retention, validator, orchestrator
│   └── scheduler/        # daemon, cron-parser
├── config/               # loader, validator, resolver, inline options
├── db/                   # SQLite connection, repositories, migrations
├── docker/               # volume backup, compose integration
├── storage/              # local and S3 storage backends
└── utils/                # logger, crypto, path, naming, format
tests/                    # Mirror of src/ structure
```

## Code Style

- **Linter:** oxlint (run with `bun run lint`)
- **Formatter:** oxfmt with double quotes, space indentation
- **TypeScript:** Strict mode, ESNext target, bundler module resolution

### Conventions

- Commands return `Promise<number>` (exit code)
- Use `@clack/prompts` and `picocolors` for CLI UI
- Types are defined in `src/types/` and exported via barrel files
- Repositories follow pattern: `*-repository.ts`
- Core logic is in orchestrator files

## Testing

Tests live in `tests/` mirroring `src/` structure.

```ts
import { describe, expect, test } from "bun:test";

describe("module", () => {
  test("does something", () => {
    expect(result).toBe(expected);
  });
});
```

Run tests: `bun test`

## CI/CD

CI runs on push/PR to main (`.github/workflows/ci.yml`):

1. Type check: `bunx tsc --noEmit`
2. Lint: `bun run lint`
3. Test: `bun test`

Release runs on version tags (`.github/workflows/release.yml`):

1. Same checks as CI
2. Build binaries for linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64
3. Generate SHA256 checksums
4. Create GitHub release
5. Build and push Docker image to ghcr.io

## Build Targets

```bash
bun run build              # Current platform
bun run build:linux-x64    # Linux x64
bun run build:linux-arm64  # Linux ARM64
bun run build:darwin-x64   # macOS Intel
bun run build:darwin-arm64 # macOS Apple Silicon
bun run build:windows-x64  # Windows x64
```

## Key Dependencies

- `@clack/prompts` - Interactive CLI prompts
- `picocolors` - Terminal colors (imported as `color`)
- `cron-parser` - Cron expression parsing
- `js-yaml` - YAML config parsing

Dev:

- `oxlint` - Linting
- `oxfmt` - Formatting

## Configuration Types

Main config interface is `BackitupConfig` in `src/types/config.ts`:

- `sources: Record<string, SourceConfig>` - Named backup sources
- `local: LocalStorageConfig` - Local storage settings
- `s3: S3StorageConfig` - S3/R2/MinIO settings
- `schedules: Record<string, ScheduleConfig>` - Cron schedules with retention
- `docker?: DockerConfig` - Docker volume backup settings
  - `containerStop?: ContainerStopConfig` - Global container stop/restart settings
  - `volumes[].containerStop?: ContainerStopConfig` - Per-volume override

## Common Tasks

### Adding a new command

1. Create `src/cli/commands/<name>.ts`
2. Export `<name>Command(args: string[]): Promise<number>`
3. Add case to switch in `src/index.ts`
4. Add help text to `printHelp()`

### Adding a new config option

1. Add type to `src/types/config.ts`
2. Update `src/config/defaults.ts`
3. Update `src/config/validator.ts`
4. If inline option, update `src/config/inline.ts`

### Database changes

1. Add migration to `src/db/migrations/`
2. Update `src/db/migrations/index.ts`
3. Update repository and mapper files as needed
