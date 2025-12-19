# Configuration Reference

BackItUp supports both YAML and JSON configuration files. By default, it looks for these files in the current directory (in order):

1. `backitup.config.yaml`
2. `backitup.config.yml`
3. `backitup.config.json`

You can also specify a config file path with `-c, --config <path>`.

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

  # Global container stop settings (optional)
  # Stop containers before backup to ensure data consistency
  containerStop:
    stopContainers: false       # Whether to stop containers using the volume
    stopTimeout: 30             # Seconds to wait for graceful stop
    restartRetries: 3           # Number of restart attempts if restart fails
    restartRetryDelay: 1000     # Milliseconds between retry attempts

  volumes:
    # Direct volume name
    - name: postgres_data

    # Another volume with per-volume container stop override
    - name: redis_data
      containerStop:
        stopContainers: true    # Override: stop containers for this volume

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

| Field  | Type   | Required | Description                  |
| ------ | ------ | -------- | ---------------------------- |
| `path` | string | Yes      | Path to SQLite database file |

### `sources`

Named backup sources. Each source defines files to include in backups.

| Field      | Type     | Required | Description                         |
| ---------- | -------- | -------- | ----------------------------------- |
| `path`     | string   | Yes      | Base directory path                 |
| `patterns` | string[] | No       | Glob patterns (default: `["**/*"]`) |

**Glob Pattern Examples:**

- `**/*.ts` - All TypeScript files
- `!**/node_modules/**` - Exclude node_modules
- `src/**` - Everything in src directory

### `local`

Local filesystem storage.

| Field     | Type    | Required | Description                |
| --------- | ------- | -------- | -------------------------- |
| `enabled` | boolean | Yes      | Enable local storage       |
| `path`    | string  | Yes\*    | Directory for backup files |

\*Required when enabled.

### `s3`

S3-compatible storage (AWS S3, R2, MinIO, etc.).

| Field      | Type    | Required | Description                       |
| ---------- | ------- | -------- | --------------------------------- |
| `enabled`  | boolean | Yes      | Enable S3 storage                 |
| `bucket`   | string  | Yes\*    | S3 bucket name                    |
| `prefix`   | string  | No       | Key prefix for all objects        |
| `region`   | string  | No       | AWS region (default: `us-east-1`) |
| `endpoint` | string  | No       | Custom endpoint for S3-compatible |

\*Required when enabled.

**Environment Variables:**

- `S3_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY` or `AWS_SECRET_ACCESS_KEY`
- `S3_REGION` (optional)
- `S3_ENDPOINT` (optional)

### `schedules`

Named schedules with cron expressions and retention policies.

| Field                | Type     | Required | Description                      |
| -------------------- | -------- | -------- | -------------------------------- |
| `cron`               | string   | Yes      | Cron expression (5 fields)       |
| `retention.maxCount` | number   | No       | Maximum backups to keep          |
| `retention.maxDays`  | number   | No       | Delete backups older than N days |
| `sources`            | string[] | No       | Limit to specific sources        |

**Cron Format:** `minute hour day-of-month month day-of-week`

### `archive`

Archive creation settings.

| Field         | Type   | Required | Default      | Description             |
| ------------- | ------ | -------- | ------------ | ----------------------- |
| `prefix`      | string | No       | `"backitup"` | Archive filename prefix |
| `compression` | number | No       | `6`          | gzip level (1-9)        |

### `safety`

Safety features for cleanup operations.

| Field                        | Type    | Required | Default | Description                      |
| ---------------------------- | ------- | -------- | ------- | -------------------------------- |
| `dryRun`                     | boolean | No       | `false` | Preview without making changes   |
| `verifyChecksumBeforeDelete` | boolean | No       | `true`  | Verify checksums before deletion |

### `docker`

Docker volume backup configuration.

| Field           | Type    | Required | Description                            |
| --------------- | ------- | -------- | -------------------------------------- |
| `enabled`       | boolean | Yes      | Enable Docker volume backups           |
| `containerStop` | object  | No       | Global container stop/restart settings |
| `volumes`       | array   | Yes\*    | List of volumes to backup              |

\*Required when enabled.

**Container Stop Settings (`containerStop`):**

| Field               | Type    | Default | Description                               |
| ------------------- | ------- | ------- | ----------------------------------------- |
| `stopContainers`    | boolean | `false` | Stop containers before backup             |
| `stopTimeout`       | number  | `30`    | Seconds to wait for graceful stop         |
| `restartRetries`    | number  | `3`     | Number of restart attempts if fails       |
| `restartRetryDelay` | number  | `1000`  | Milliseconds between restart retry        |

**Volume Entry:**

| Field           | Type   | Required | Description                                    |
| --------------- | ------ | -------- | ---------------------------------------------- |
| `name`          | string | Yes      | Volume name or Compose service name            |
| `type`          | string | No       | `"volume"` (default) or `"compose"`            |
| `composePath`   | string | No\*     | Path to docker-compose.yml                     |
| `projectName`   | string | No       | Compose project name (inferred from directory) |
| `containerStop` | object | No       | Per-volume override of container stop settings |

\*Required when `type: compose`.

**Notes on Container Stop:**

- When `stopContainers` is enabled, BackItUp stops all containers using the volume before backup and restarts them after.
- Containers with `restart: always` or `restart: unless-stopped` policies may auto-restart after being stopped. BackItUp detects this and logs a warning.
- Per-volume `containerStop` settings override global settings.
- If a container fails to restart after all retries, the backup still succeeds but a warning is logged.

## Minimal Configuration

### YAML

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

### JSON

```json
{
  "version": "1.0",
  "database": {
    "path": "./data/backitup.db"
  },
  "sources": {
    "myapp": {
      "path": "/path/to/backup"
    }
  },
  "local": {
    "enabled": true,
    "path": "./backups"
  },
  "schedules": {
    "daily": {
      "cron": "0 2 * * *",
      "retention": {
        "maxCount": 7
      }
    }
  }
}
```
