# Inline Configuration

BackItUp supports passing configuration options directly via command-line flags. This is useful for:

- Quick one-off backups
- CI/CD pipelines
- Scripting and automation
- Running without a config file

## Available Options

### Database

| Option              | Description               |
| ------------------- | ------------------------- |
| `--database <path>` | SQLite database file path |

### Sources

| Option             | Description                                  |
| ------------------ | -------------------------------------------- |
| `--source <path>`  | Source directory to backup (repeatable)      |
| `--pattern <glob>` | Glob pattern for file filtering (repeatable) |

### Local Storage

| Option                | Description                        |
| --------------------- | ---------------------------------- |
| `--local-path <path>` | Directory for local backup storage |
| `--no-local`          | Disable local storage              |

### S3 Storage

| Option                         | Description                   |
| ------------------------------ | ----------------------------- |
| `--s3-bucket <name>`           | S3 bucket name                |
| `--s3-prefix <prefix>`         | S3 key prefix                 |
| `--s3-region <region>`         | AWS region                    |
| `--s3-endpoint <url>`          | Custom S3-compatible endpoint |
| `--s3-access-key-id <key>`     | S3 access key ID              |
| `--s3-secret-access-key <key>` | S3 secret access key          |
| `--no-s3`                      | Disable S3 storage            |

### Retention

| Option                  | Description                       |
| ----------------------- | --------------------------------- |
| `--retention-count <n>` | Maximum number of backups to keep |
| `--retention-days <n>`  | Maximum age in days for backups   |

### Archive

| Option                   | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `--archive-prefix <str>` | Prefix for archive filenames (default: `backitup`) |
| `--compression <0-9>`    | Gzip compression level (default: `6`)              |

### Safety

| Option                      | Description                              |
| --------------------------- | ---------------------------------------- |
| `--verify-before-delete`    | Verify checksums before cleanup deletion |
| `--no-verify-before-delete` | Skip checksum verification on cleanup    |

### Docker

| Option                       | Description                               |
| ---------------------------- | ----------------------------------------- |
| `--docker`                   | Enable Docker volume backups              |
| `--no-docker`                | Disable Docker volume backups             |
| `--docker-volume <name>`     | Docker volume to backup (repeatable)      |
| `--stop-containers`          | Stop containers before volume backup      |
| `--no-stop-containers`       | Don't stop containers (default behavior)  |
| `--stop-timeout <seconds>`   | Timeout for graceful stop (default: 30)   |
| `--restart-retries <n>`      | Retry attempts for restart (default: 3)   |

## Usage Modes

### 1. Override Mode

When a config file exists, inline options **override** specific settings:

```bash
# Override storage path from config
backitup backup -s manual --local-path /different/path

# Override S3 bucket
backitup backup -s manual --s3-bucket different-bucket

# Add compression
backitup backup -s manual --compression 9
```

### 2. Config-Free Mode

Run without any config file by providing required options:

**Requirements:**

- At least one source: `--source` or `--docker-volume`
- At least one storage: `--local-path` or `--s3-bucket`

```bash
# Minimal example
backitup backup -s manual --source /data --local-path /backups

# With S3
backitup backup -s manual --source /app --s3-bucket my-bucket --s3-region us-west-2

# Multiple sources
backitup backup -s manual \
  --source /var/www/app \
  --source /var/log/app \
  --local-path /backups
```

## Examples

### Quick Local Backup

```bash
backitup backup -s manual \
  --source /home/user/documents \
  --local-path /mnt/backup
```

### Backup to S3

```bash
backitup backup -s manual \
  --source /var/www/app \
  --s3-bucket my-backups \
  --s3-region us-west-2 \
  --s3-prefix "app-backups/"
```

### With Credentials

```bash
backitup backup -s manual \
  --source /data \
  --s3-bucket my-bucket \
  --s3-access-key-id AKIAIOSFODNN7EXAMPLE \
  --s3-secret-access-key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

Or use environment variables:

```bash
export S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

backitup backup -s manual --source /data --s3-bucket my-bucket
```

### With Glob Patterns

```bash
backitup backup -s manual \
  --source /var/www/app \
  --pattern "**/*.js" \
  --pattern "**/*.ts" \
  --pattern "!**/node_modules/**" \
  --local-path /backups
```

### Docker Volumes

```bash
backitup backup -s manual \
  --docker-volume postgres_data \
  --docker-volume redis_data \
  --local-path /backups
```

### Docker Volumes with Container Stop

For data consistency (especially with databases), stop containers before backup:

```bash
# Stop containers before backup, restart after
backitup backup -s manual \
  --docker-volume postgres_data \
  --stop-containers \
  --local-path /backups

# With custom timeout and retries
backitup backup -s manual \
  --docker-volume postgres_data \
  --stop-containers \
  --stop-timeout 60 \
  --restart-retries 5 \
  --local-path /backups
```

### S3-Compatible Storage (MinIO, R2)

```bash
# MinIO
backitup backup -s manual \
  --source /data \
  --s3-bucket backups \
  --s3-endpoint http://localhost:9000 \
  --s3-access-key-id minioadmin \
  --s3-secret-access-key minioadmin

# Cloudflare R2
backitup backup -s manual \
  --source /data \
  --s3-bucket my-bucket \
  --s3-endpoint https://ACCOUNT_ID.r2.cloudflarestorage.com \
  --s3-access-key-id YOUR_ACCESS_KEY \
  --s3-secret-access-key YOUR_SECRET_KEY
```

### Full Example

```bash
backitup backup -s manual \
  --database /var/lib/backitup/db.sqlite \
  --source /var/www/app \
  --source /etc/nginx \
  --pattern "**/*.conf" \
  --pattern "**/*.js" \
  --pattern "!**/node_modules/**" \
  --local-path /mnt/backups \
  --s3-bucket company-backups \
  --s3-prefix "server-01/" \
  --s3-region eu-west-1 \
  --retention-count 7 \
  --retention-days 30 \
  --archive-prefix "server01" \
  --compression 9
```

## Error Handling

If you run without a config file and don't provide sufficient options:

```
✖ No config file found and inline options are insufficient:
  - At least one --source or --docker-volume is required when running without a config file
  - At least one storage destination is required: --local-path or --s3-bucket

ℹ Either create a config file or provide required inline options.
ℹ Required: --source (or --docker-volume) AND (--local-path or --s3-bucket)
```

## Defaults

When running in config-free mode, these defaults apply:

| Setting              | Default         |
| -------------------- | --------------- |
| Database path        | `./backitup.db` |
| Archive prefix       | `backitup`      |
| Compression          | `6`             |
| Retention count      | `10`            |
| Retention days       | `30`            |
| Verify before delete | `true`          |

## Supported Commands

Inline config options work with:

- `backitup backup` - Full support including config-free mode
- `backitup start` - Override mode only (requires config file for schedules)

## See Also

- [backup command](commands/backup.md)
- [start command](commands/start.md)
- [Configuration Reference](configuration.md)
