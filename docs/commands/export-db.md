# export-db

Export the BackItUp SQLite database file to a specified location.

## Usage

```bash
backitup export-db <output-path> [OPTIONS]
```

## Arguments

| Argument        | Description                                  |
| --------------- | -------------------------------------------- |
| `<output-path>` | Path where the database backup will be saved |

## Options

| Option            | Short | Description                                             |
| ----------------- | ----- | ------------------------------------------------------- |
| `--config <path>` | `-c`  | Path to config file (default: `./backitup.config.yaml`) |
| `--verbose`       | `-v`  | Verbose output                                          |
| `--help`          | `-h`  | Show help message                                       |

## Description

The `export-db` command creates a copy of the BackItUp SQLite database file. The database stores:

- Backup records (IDs, timestamps, sizes, checksums)
- File counts and metadata
- Storage locations (local paths, S3 keys)
- Deletion logs for cleanup tracking

This is useful for:

- **Backup history preservation** — Keep your backup metadata safe
- **Migration** — Move BackItUp to a new machine while retaining history
- **Disaster recovery** — Restore backup tracking after data loss
- **Snapshots** — Create checkpoints before major changes

## Examples

### Basic Usage

```bash
# Export to a specific file
backitup export-db ./backitup-db-backup.sqlite

# Export with timestamp in filename
backitup export-db /backups/db/backitup-$(date +%Y%m%d).sqlite
```

### With Custom Config

```bash
# Use a specific config file
backitup export-db ~/backup.sqlite -c /etc/backitup/config.yaml
```

### Automated Backup Script

```bash
#!/bin/bash
# backup-everything.sh

# Export the database first
backitup export-db /backups/meta/backitup-db-$(date +%Y%m%d-%H%M%S).sqlite

# Then run the regular backup
backitup backup -s daily
```

### Periodic Database Backup with Cron

```bash
# Add to crontab: crontab -e
# Export database daily at midnight
0 0 * * * /usr/local/bin/backitup export-db /backups/db/backitup-$(date +\%Y\%m\%d).sqlite
```

## Output

On success, the command displays a summary:

```
◆  export-db
│
●  Database exported
│
│  ╭─────────────────────────────────────────────────────────╮
│  │               Export Summary                            │
│  ├─────────────────────────────────────────────────────────┤
│  │  Source:  /home/user/.local/share/backitup/backitup.db  │
│  │  Output:  /backups/backitup-db-backup.sqlite            │
│  │  Size:    156 KB                                        │
│  ╰─────────────────────────────────────────────────────────╯
│
◇  Database export complete!
```

## Notes

- The command copies the database file as-is; no data transformation is performed
- If the database doesn't exist yet (no backups created), the command will fail with an informative message
- The output directory is created automatically if it doesn't exist
- Existing files at the output path will be overwritten

## See Also

- [backup](backup.md) - Create backups
- [list](list.md) - List existing backups
- [Configuration Reference](../configuration.md) - Database path configuration
