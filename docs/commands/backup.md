# backup

Create a backup of your configured sources.

## Usage

```bash
backitup backup [OPTIONS]
```

## Options

| Option              | Short | Description                                             |
| ------------------- | ----- | ------------------------------------------------------- |
| `--config <path>`   | `-c`  | Path to config file (default: `./backitup.config.yaml`) |
| `--schedule <name>` | `-s`  | Schedule name (e.g., `hourly`, `daily`, `manual`)       |
| `--dry-run`         |       | Preview backup without creating files                   |
| `--local-only`      |       | Save locally only, skip S3 upload                       |
| `--s3-only`         |       | Upload to S3 only, skip local storage                   |
| `--volumes-only`    |       | Only backup Docker volumes (skip file sources)          |
| `--skip-volumes`    |       | Skip Docker volumes (only backup file sources)          |
| `--volume <name>`   |       | Backup specific Docker volume(s) (repeatable)           |
| `--verbose`         | `-v`  | Enable verbose logging                                  |
| `--help`            | `-h`  | Show help message                                       |

### Inline Config Options

Override or provide configuration without a config file:

| Option                         | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `--database <path>`            | Database file path                            |
| `--source <path>`              | Source path to backup (repeatable)            |
| `--pattern <glob>`             | Glob pattern for filtering files (repeatable) |
| `--local-path <path>`          | Local storage directory                       |
| `--no-local`                   | Disable local storage                         |
| `--s3-bucket <name>`           | S3 bucket name                                |
| `--s3-prefix <prefix>`         | S3 key prefix                                 |
| `--s3-region <region>`         | S3 region                                     |
| `--s3-endpoint <url>`          | S3-compatible endpoint URL                    |
| `--s3-access-key-id <key>`     | S3 access key ID                              |
| `--s3-secret-access-key <key>` | S3 secret access key                          |
| `--no-s3`                      | Disable S3 storage                            |
| `--retention-count <n>`        | Maximum backups to keep                       |
| `--retention-days <n>`         | Maximum days to retain backups                |
| `--archive-prefix <str>`       | Archive filename prefix                       |
| `--compression <0-9>`          | Compression level (default: 6)                |
| `--verify-before-delete`       | Verify checksums before cleanup               |
| `--no-verify-before-delete`    | Skip checksum verification                    |
| `--docker`                     | Enable Docker volume backups                  |
| `--no-docker`                  | Disable Docker volume backups                 |
| `--docker-volume <name>`       | Docker volume to backup (repeatable)          |

## Schedules

When running `backitup backup`, you can specify a schedule name that matches one defined in your config file. The schedule determines:

- Which sources to backup (if the schedule has a `sources` filter)
- Which retention policy applies during cleanup

The special schedule `manual` is always available and backs up all sources.

## Examples

### Basic Usage

```bash
# Interactive - prompts for schedule selection
backitup backup

# Manual backup (one-time, all sources)
backitup backup -s manual

# Scheduled backup (uses schedule's source filters)
backitup backup -s hourly
backitup backup -s daily
```

### Preview and Testing

```bash
# Preview what would be backed up
backitup backup --dry-run

# Preview with verbose output
backitup backup --dry-run -v
```

### Storage Options

```bash
# Save locally only (skip S3)
backitup backup -s manual --local-only

# Upload to S3 only (skip local)
backitup backup -s manual --s3-only
```

### Docker Volume Backups

```bash
# Only backup Docker volumes
backitup backup -s manual --volumes-only

# Skip Docker volumes (files only)
backitup backup -s manual --skip-volumes

# Backup specific volumes
backitup backup -s manual --volume postgres_data --volume redis_data
```

### Config-Free Mode

Run without a config file by providing required inline options:

```bash
# Minimal backup (source + local storage)
backitup backup -s manual --source /data --local-path /backups

# Backup to S3
backitup backup -s manual --source /app --s3-bucket my-backups --s3-region us-west-2

# Multiple sources with patterns
backitup backup -s manual \
  --source /var/www/app \
  --pattern "**/*.js" \
  --pattern "!**/node_modules/**" \
  --local-path /backups

# Docker volumes without config
backitup backup -s manual --docker-volume postgres_data --local-path /backups

# Full example
backitup backup -s manual \
  --source /data \
  --local-path /backups \
  --s3-bucket my-backups \
  --s3-region us-west-2 \
  --retention-count 7 \
  --compression 9
```

**Required for config-free mode:**

- At least one source: `--source` or `--docker-volume`
- At least one storage: `--local-path` or `--s3-bucket`

## Output

A successful backup displays:

```
◆  backitup backup
│
◇  Archive created
│
◇  Saved to local and S3
│
│  ┌─────────────────────────────────────────────────────────┐
│  │ Backup ID:    a1b2c3d4-e5f6-7890-abcd-ef1234567890      │
│  │ Archive:      backitup_app_manual_2024-01-15_143022_... │
│  │ Size:         2.5 MB                                    │
│  │ Files:        156                                       │
│  │ Duration:     1.2s                                      │
│  │ Local path:   /backups/backitup_app_manual_2024-...     │
│  │ S3 location:  s3://my-bucket/backups/backitup_app_...   │
│  └─────────────────────────────────────────────────────────┘
│
◇  Backup complete!
```

## Archive Naming

Archives follow this naming pattern:

**File backups:**

```
{prefix}_{sources}_{schedule}_{date}_{time}_{id}.tar.gz
```

Example: `backitup_app_daily_2024-01-15_143022_abc123.tar.gz`

**Volume backups:**

```
{prefix}-volume-{volumename}-{schedule}-{timestamp}.tar.gz
```

Example: `backitup-volume-postgres_data-daily-2024-01-15T14-30-22-123Z.tar.gz`

## See Also

- [start](start.md) - Run as a scheduled daemon
- [list](list.md) - List existing backups
- [cleanup](cleanup.md) - Remove old backups
- [Configuration Reference](../configuration.md)
- [Inline Configuration](../inline-config.md)
