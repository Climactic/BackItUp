# list

List existing backups tracked in the database.

## Usage

```bash
backitup list [OPTIONS]
```

## Options

| Option              | Short | Description                                              |
| ------------------- | ----- | -------------------------------------------------------- |
| `--config <path>`   | `-c`  | Path to config file (default: `./backitup.config.yaml`)  |
| `--schedule <name>` | `-s`  | Filter by schedule name                                  |
| `--type <type>`     | `-t`  | Filter by backup type: `files` or `volume`               |
| `--limit <n>`       | `-n`  | Limit number of results                                  |
| `--format <format>` |       | Output format: `table`, `json`, `csv` (default: `table`) |
| `--verbose`         | `-v`  | Show detailed info (backup IDs, storage status)          |
| `--help`            | `-h`  | Show help message                                        |

## Output Formats

### Table (default)

Compact view showing archive names:

```
◆  backitup list
│
│  Backups:
│  Archive                                        Type    Schedule   Created              Size
│  ─────────────────────────────────────────────────────────────────────────────────────────────
│  backitup_app_daily_2024-01-15_020000_abc123    files   daily      2024-01-15 02:00:00  2.5 MB
│  backitup_app_daily_2024-01-14_020000_def456    files   daily      2024-01-14 02:00:00  2.4 MB
│  [vol] postgres_data                            volume  daily      2024-01-15 02:00:05  150 MB
│  ─────────────────────────────────────────────────────────────────────────────────────────────
│
◇  3 backup(s) total
```

### Table with --verbose

Shows backup IDs and storage status:

```
│  ID                                    Type    Schedule   Created              Size       Files  Status
│  ───────────────────────────────────────────────────────────────────────────────────────────────────────
│  a1b2c3d4-e5f6-7890-abcd-ef1234567890  files   daily      2024-01-15 02:00:00  2.5 MB     156    L:ok, S3:ok
│  b2c3d4e5-f6a7-8901-bcde-f12345678901  files   daily      2024-01-14 02:00:00  2.4 MB     152    L:ok, S3:ok
│  ───────────────────────────────────────────────────────────────────────────────────────────────────────
```

Status indicators:

- `L:ok` - Local file exists
- `L:del` - Local file deleted
- `S3:ok` - S3 object exists
- `S3:del` - S3 object deleted

### JSON

Machine-readable output:

```bash
backitup list --format json
```

```json
[
  {
    "backup_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "backup_type": "files",
    "schedule_name": "daily",
    "archive_name": "backitup_app_daily_2024-01-15_020000_abc123.tar.gz",
    "created_at": "2024-01-15T02:00:00.000Z",
    "archive_size_bytes": 2621440,
    "files_count": 156,
    "local_path": "/backups/backitup_app_daily_2024-01-15_020000_abc123.tar.gz",
    "s3_bucket": "my-bucket",
    "s3_key": "backups/backitup_app_daily_2024-01-15_020000_abc123.tar.gz",
    "status": "active"
  }
]
```

### CSV

Spreadsheet-compatible output:

```bash
backitup list --format csv
```

```csv
backup_id,backup_type,schedule_name,archive_name,created_at,size_bytes,files_count,volume_name,local_path,s3_bucket,s3_key,status
a1b2c3d4-e5f6-7890-abcd-ef1234567890,files,daily,backitup_app_daily_2024-01-15_020000_abc123.tar.gz,2024-01-15T02:00:00.000Z,2621440,156,,/backups/...,my-bucket,backups/...,active
```

## Examples

### Basic Usage

```bash
# List all backups
backitup list

# List with full details
backitup list -v
```

### Filtering

```bash
# Filter by schedule
backitup list -s daily
backitup list -s hourly

# Filter by type
backitup list -t files     # File backups only
backitup list -t volume    # Docker volume backups only

# Combine filters
backitup list -s daily -t volume
```

### Limiting Results

```bash
# Last 10 backups
backitup list -n 10

# Last 5 daily backups
backitup list -s daily -n 5
```

### Scripting

```bash
# Get backup count
backitup list --format json | jq length

# Get total size
backitup list --format json | jq '[.[].archive_size_bytes] | add'

# Get latest backup ID
backitup list --format json -n 1 | jq -r '.[0].backup_id'

# Export to file
backitup list --format csv > backups.csv
```

## See Also

- [backup](backup.md) - Create backups
- [verify](verify.md) - Verify backup integrity
- [cleanup](cleanup.md) - Remove old backups
