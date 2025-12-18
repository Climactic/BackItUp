# verify

Verify backup integrity by checking that files exist and checksums match.

## Usage

```bash
backitup verify [BACKUP_ID...] [OPTIONS]
backitup verify --all [OPTIONS]
```

## Options

| Option            | Short | Description                                             |
| ----------------- | ----- | ------------------------------------------------------- |
| `--config <path>` | `-c`  | Path to config file (default: `./backitup.config.yaml`) |
| `--all`           |       | Verify all active backups                               |
| `--fix`           |       | Update database for missing files                       |
| `--force`         |       | Skip confirmation when using `--fix`                    |
| `--verbose`       | `-v`  | Enable verbose logging                                  |
| `--help`          | `-h`  | Show help message                                       |

## Verification Checks

For each backup, verify checks:

1. **Local file exists** - If local storage is configured
2. **S3 object exists** - If S3 storage is configured
3. **Checksum matches** - For local files, verifies SHA-256 checksum

## Examples

### Basic Usage

```bash
# Verify specific backup by ID
backitup verify a1b2c3d4-e5f6-7890-abcd-ef1234567890

# Verify multiple backups
backitup verify abc123 def456 ghi789

# Verify all active backups
backitup verify --all
```

### Finding Backup IDs

```bash
# List backups with IDs
backitup list -v

# Get ID from JSON output
backitup list --format json | jq -r '.[0].backup_id'
```

### Fixing Issues

When backups have missing files, use `--fix` to update the database:

```bash
# Verify and fix (with confirmation)
backitup verify --all --fix

# Verify and fix without confirmation
backitup verify --all --fix --force
```

**What --fix does:**

- Marks backups with missing files as "deleted" in the database
- Does NOT delete any actual files
- Allows cleanup to properly account for missing backups

## Output

### All Healthy

```
◆  backitup verify
│
◇  Verifying 5 backup(s)...
◇  Verification complete
│
✔  backitup_app_daily_2024-01-15_020000_abc123.tar.gz
✔  backitup_app_daily_2024-01-14_020000_def456.tar.gz
✔  backitup_app_daily_2024-01-13_020000_ghi789.tar.gz
✔  backitup-volume-postgres_data-daily-2024-01-15T02-00-00-000Z.tar.gz
✔  backitup-volume-postgres_data-daily-2024-01-14T02-00-00-000Z.tar.gz
│
│  ┌──────────────────────────────┐
│  │ Verified:     5              │
│  │ Healthy:      5              │
│  │ With issues:  0              │
│  │ Total issues: 0              │
│  └──────────────────────────────┘
│
◇  All backups verified!
```

### With Issues

```
◆  backitup verify
│
◇  Verifying 5 backup(s)...
◇  Verification complete
│
✔  backitup_app_daily_2024-01-15_020000_abc123.tar.gz
✖  backitup_app_daily_2024-01-14_020000_def456.tar.gz
│    • Local file missing: /backups/backitup_app_daily_2024-01-14_020000_def456.tar.gz
✖  backitup_app_daily_2024-01-13_020000_ghi789.tar.gz
│    • Checksum mismatch: expected abc123..., got def456...
✔  backitup-volume-postgres_data-daily-2024-01-15T02-00-00-000Z.tar.gz
✖  backitup-volume-postgres_data-daily-2024-01-14T02-00-00-000Z.tar.gz
│    • S3 object missing: s3://my-bucket/backups/backitup-volume-...
│
│  ┌──────────────────────────────┐
│  │ Verified:     5              │
│  │ Healthy:      2              │
│  │ With issues:  3              │
│  │ Total issues: 3              │
│  └──────────────────────────────┘
│
ℹ  Run with --fix to update database for missing files
│
◇  Verification found issues
```

## Common Issues

### Local File Missing

The backup file was deleted outside of BackItUp or moved.

**Resolution:**

- Run `--fix` to update the database
- Or restore the file from S3 if available

### S3 Object Missing

The S3 object was deleted or the bucket is inaccessible.

**Resolution:**

- Check S3 bucket permissions and credentials
- Run `--fix` if the object was intentionally deleted

### Checksum Mismatch

The file content doesn't match what was recorded.

**Possible causes:**

- File was modified after backup
- File corruption during storage/transfer
- Disk errors

**Resolution:**

- Investigate the cause
- Delete the corrupt backup and create a new one

## Use Cases

### Regular Health Checks

```bash
# Weekly verification cron job
0 0 * * 0 /usr/local/bin/backitup verify --all
```

### Before Restore

```bash
# Verify backup before restoring
backitup verify abc123 && tar -xzf /backups/backup.tar.gz
```

### After Storage Migration

```bash
# Verify all backups after moving to new storage
backitup verify --all --fix --force
```

## See Also

- [list](list.md) - Find backup IDs
- [backup](backup.md) - Create new backups
- [cleanup](cleanup.md) - Remove old backups
