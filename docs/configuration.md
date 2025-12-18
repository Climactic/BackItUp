# Configuration Reference

BackItUp uses a YAML configuration file. By default, it looks for `backitup.config.yaml` in the current directory.

## Example Configuration

```yaml
version: "1.0"

# Database location (SQLite)
database:
  path: "./data/backitup.db"

# Source files/folders to backup (named sources)
# Each source has a name that can be referenced by schedules
sources:
  # Example: backup a web application
  app:
    path: "/var/www/myapp"
    patterns:
      - "**/*.ts"
      - "**/*.tsx"
      - "**/*.js"
      - "**/*.json"
      - "**/*.css"
      - "**/*.html"
      - "!**/node_modules/**"
      - "!**/.git/**"
      - "!**/dist/**"

  # Example: backup config files
  # nginx:
  #   path: "/etc/nginx"
  #   patterns:
  #     - "**/*.conf"

  # Example: backup a directory (all files)
  # documents:
  #   path: "/home/user/documents"

# Local storage configuration
local:
  enabled: true
  path: "./backups"

# S3 storage configuration
# Credentials are read from environment variables:
#   S3_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID)
#   S3_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY)
#   S3_REGION (optional, defaults to us-east-1)
#   S3_ENDPOINT (optional, for non-AWS S3-compatible services)
s3:
  enabled: false
  bucket: "my-backups"
  prefix: "backups/"
  region: "us-east-1"
  # endpoint: "http://localhost:9000"  # For MinIO or other S3-compatible services

# Schedule definitions with retention policies
# Each schedule can optionally specify which sources to backup.
# If no sources are specified, all sources are backed up.
schedules:
  hourly:
    cron: "0 * * * *"        # Every hour at minute 0
    retention:
      maxCount: 24           # Keep last 24 hourly backups
      maxDays: 2             # Delete backups older than 2 days
    # sources: [app]         # Optional: only backup specific sources

  daily:
    cron: "0 2 * * *"        # Every day at 2:00 AM
    retention:
      maxCount: 7            # Keep last 7 daily backups
      maxDays: 14            # Delete backups older than 14 days
    # No sources specified = backup all sources

  weekly:
    cron: "0 3 * * 0"        # Every Sunday at 3:00 AM
    retention:
      maxCount: 4            # Keep last 4 weekly backups
      maxDays: 35            # Delete backups older than 35 days

  monthly:
    cron: "0 4 1 * *"        # 1st of every month at 4:00 AM
    retention:
      maxCount: 12           # Keep last 12 monthly backups
      maxDays: 400           # Delete backups older than ~13 months

# Archive settings (optional)
archive:
  prefix: "backitup"         # Archive name prefix
  compression: 6             # gzip compression level (1-9)

# Safety settings (optional)
safety:
  dryRun: false                      # Set to true to test without making changes
  verifyChecksumBeforeDelete: true   # Verify file checksum before deletion

# Docker volume backup configuration (optional)
docker:
  enabled: false
  volumes:
    # Direct volume name
    - name: postgres_data

    # Another volume
    - name: redis_data

    # Resolve volume from docker-compose.yml service name
    # - name: db
    #   type: compose
    #   composePath: ./docker-compose.yml
    #   projectName: myapp  # Optional: if not set, inferred from directory name
```

## Configuration Sections

### `version`

Required. Currently must be `"1.0"`.

### `database`

| Field  | Type   | Required | Description                          |
|--------|--------|----------|--------------------------------------|
| `path` | string | Yes      | Path to SQLite database file         |

### `sources`

Named backup sources. Each source defines files to include in backups.

| Field      | Type     | Required | Description                                    |
|------------|----------|----------|------------------------------------------------|
| `path`     | string   | Yes      | Base directory path                            |
| `patterns` | string[] | No       | Glob patterns (default: `["**/*"]`)            |

**Glob Pattern Examples:**
- `**/*.ts` - All TypeScript files
- `!**/node_modules/**` - Exclude node_modules
- `src/**` - Everything in src directory

### `local`

Local filesystem storage.

| Field     | Type    | Required | Description                    |
|-----------|---------|----------|--------------------------------|
| `enabled` | boolean | Yes      | Enable local storage           |
| `path`    | string  | Yes*     | Directory for backup files     |

*Required when enabled.

### `s3`

S3-compatible storage (AWS S3, R2, MinIO, etc.).

| Field             | Type    | Required | Description                          |
|-------------------|---------|----------|--------------------------------------|
| `enabled`         | boolean | Yes      | Enable S3 storage                    |
| `bucket`          | string  | Yes*     | S3 bucket name                       |
| `prefix`          | string  | No       | Key prefix for all objects           |
| `region`          | string  | No       | AWS region (default: `us-east-1`)    |
| `endpoint`        | string  | No       | Custom endpoint for S3-compatible    |

*Required when enabled.

**Environment Variables:**
- `S3_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY` or `AWS_SECRET_ACCESS_KEY`
- `S3_REGION` (optional)
- `S3_ENDPOINT` (optional)

### `schedules`

Named schedules with cron expressions and retention policies.

| Field                  | Type     | Required | Description                              |
|------------------------|----------|----------|------------------------------------------|
| `cron`                 | string   | Yes      | Cron expression (5 fields)               |
| `retention.maxCount`   | number   | No       | Maximum backups to keep                  |
| `retention.maxDays`    | number   | No       | Delete backups older than N days         |
| `sources`              | string[] | No       | Limit to specific sources                |

**Cron Format:** `minute hour day-of-month month day-of-week`

### `archive`

Archive creation settings.

| Field         | Type   | Required | Default      | Description                    |
|---------------|--------|----------|--------------|--------------------------------|
| `prefix`      | string | No       | `"backitup"` | Archive filename prefix        |
| `compression` | number | No       | `6`          | gzip level (1-9)               |

### `safety`

Safety features for cleanup operations.

| Field                       | Type    | Required | Default | Description                           |
|-----------------------------|---------|----------|---------|---------------------------------------|
| `dryRun`                    | boolean | No       | `false` | Preview without making changes        |
| `verifyChecksumBeforeDelete`| boolean | No       | `true`  | Verify checksums before deletion      |

### `docker`

Docker volume backup configuration.

| Field     | Type    | Required | Description                    |
|-----------|---------|----------|--------------------------------|
| `enabled` | boolean | Yes      | Enable Docker volume backups   |
| `volumes` | array   | Yes*     | List of volumes to backup      |

*Required when enabled.

**Volume Entry:**

| Field         | Type   | Required | Description                                    |
|---------------|--------|----------|------------------------------------------------|
| `name`        | string | Yes      | Volume name or Compose service name            |
| `type`        | string | No       | `"volume"` (default) or `"compose"`            |
| `composePath` | string | No*      | Path to docker-compose.yml                     |
| `projectName` | string | No       | Compose project name (inferred from directory) |

*Required when `type: compose`.

## Minimal Configuration

```yaml
version: "1.0"

database:
  path: "./data/backitup.db"

sources:
  myapp:
    path: "/path/to/backup"

local:
  enabled: true
  path: "./backups"

schedules:
  daily:
    cron: "0 2 * * *"
    retention:
      maxCount: 7
```
