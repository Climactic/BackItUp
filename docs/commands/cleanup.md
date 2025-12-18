# cleanup

Remove old backups based on retention policies defined in your configuration.

## Usage

```bash
backitup cleanup [OPTIONS]
```

## Options

| Option              | Short | Description                                             |
| ------------------- | ----- | ------------------------------------------------------- |
| `--config <path>`   | `-c`  | Path to config file (default: `./backitup.config.yaml`) |
| `--schedule <name>` | `-s`  | Only cleanup specific schedule                          |
| `--dry-run`         |       | Preview deletions without removing files                |
| `--force`           |       | Skip confirmation prompt                                |
| `--verbose`         | `-v`  | Enable verbose logging                                  |
| `--help`            | `-h`  | Show help message                                       |

## Retention Policy

Each schedule defines its retention policy:

```yaml
schedules:
  hourly:
    cron: "0 * * * *"
    retention:
      maxCount: 24    # Keep at most 24 backups
      maxDays: 2      # Delete backups older than 2 days
```

A backup is deleted if it exceeds **either** limit:

- More than `maxCount` backups exist for the schedule
- Backup is older than `maxDays`

## Safety Features

Cleanup includes multiple safety checks before deleting any file:

1. **Database verification** - File must be tracked in BackItUp database
2. **Name pattern validation** - Archive name must match BackItUp naming pattern
3. **Path validation** - Local files must be within configured backup directory
4. **S3 validation** - S3 keys must match configured bucket and prefix
5. **Checksum verification** - File checksum must match database (if enabled)

Any file failing validation is **skipped** and reported.

## Examples

### Basic Usage

```bash
# Cleanup all schedules (with confirmation)
backitup cleanup

# Preview what would be deleted
backitup cleanup --dry-run
```

### Filtering by Schedule

```bash
# Only cleanup hourly backups
backitup cleanup -s hourly

# Only cleanup daily backups
backitup cleanup -s daily
```

### Automation

```bash
# Skip confirmation (for cron jobs)
backitup cleanup --force

# Preview without prompts
backitup cleanup --dry-run --force
```

## Output

### Preview

```
◆  backitup cleanup
│
│  Found 3 backup(s) to delete:
│    • backitup_app_hourly_2024-01-13_100000_abc123.tar.gz (age limit)
│    • backitup_app_hourly_2024-01-13_110000_def456.tar.gz (age limit)
│    • backitup_app_hourly_2024-01-13_120000_ghi789.tar.gz (count limit)
│
◆  Delete 3 backup(s)?
│  ○ Yes  ● No
```

### After Deletion

```
◆  backitup cleanup
│
◇  Cleanup complete
│
│  Deletions:
│    [OK] backitup_app_hourly_2024-01-13_100000_abc123.tar.gz (age limit)
│    [OK] backitup_app_hourly_2024-01-13_110000_def456.tar.gz (age limit)
│    [OK] backitup_app_hourly_2024-01-13_120000_ghi789.tar.gz (count limit)
│
│  ┌─────────────────────────────────┐
│  │ Checked:  25                    │
│  │ Deleted:  3                     │
│  │ Skipped:  0                     │
│  └─────────────────────────────────┘
│
◇  Cleanup complete!
```

### With Errors

```
│  Deletions:
│    [OK] backitup_app_hourly_2024-01-13_100000_abc123.tar.gz (age limit)
│    [FAILED] backitup_app_hourly_2024-01-13_110000_def456.tar.gz (age limit)
│             Checksum mismatch - file may have been modified
│
⚠  Some backups were skipped due to validation errors
```

## Automatic Cleanup

When running `backitup start`, cleanup runs automatically after each scheduled backup. Manual cleanup is only needed for:

- Running cleanup outside the scheduler
- Cleaning up after manual backups
- Recovering from errors

## Dry Run

Always use `--dry-run` first when cleaning up manually:

```bash
# See what would be deleted
backitup cleanup --dry-run

# Then actually delete
backitup cleanup
```

## See Also

- [backup](backup.md) - Create backups
- [start](start.md) - Automatic cleanup with scheduler
- [verify](verify.md) - Check backup integrity before cleanup
- [Configuration Reference](../configuration.md) - Retention settings
