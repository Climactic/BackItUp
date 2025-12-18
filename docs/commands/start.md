# start

Start the backup scheduler daemon. This runs BackItUp as a long-running process that executes backups according to your configured schedules.

## Usage

```bash
backitup start [OPTIONS]
```

## Options

| Option            | Short | Description                                             |
| ----------------- | ----- | ------------------------------------------------------- |
| `--config <path>` | `-c`  | Path to config file (default: `./backitup.config.yaml`) |
| `--verbose`       | `-v`  | Enable verbose logging                                  |
| `--help`          | `-h`  | Show help message                                       |

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

## How It Works

1. **Reads configuration** - Loads schedules from config file or inline options
2. **Initializes scheduler** - Sets up cron jobs for each schedule
3. **Runs continuously** - Executes backups when schedules trigger
4. **Auto cleanup** - Runs retention cleanup after each backup
5. **Graceful shutdown** - Handles SIGINT/SIGTERM signals

## Cron Format

Schedules use standard 5-field cron format:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *
```

### Common Patterns

| Pattern        | Description                 |
| -------------- | --------------------------- |
| `0 * * * *`    | Every hour at minute 0      |
| `0 2 * * *`    | Daily at 2:00 AM            |
| `0 3 * * 0`    | Weekly on Sunday at 3:00 AM |
| `0 4 1 * *`    | Monthly on 1st at 4:00 AM   |
| `*/15 * * * *` | Every 15 minutes            |
| `0 */6 * * *`  | Every 6 hours               |

## Examples

### Basic Usage

```bash
# Start with default config
backitup start

# Start with specific config file
backitup start -c /etc/backitup/config.yaml

# Start with verbose logging
backitup start -v
```

### Config-Free Mode

Run without a config file (Note: schedules from config are required for the daemon):

```bash
# Override storage settings
backitup start --source /data --local-path /backups --s3-bucket my-bucket

# Override S3 region
backitup start --s3-region eu-west-1
```

**Note:** Config-free mode for `start` still requires a config file with schedule definitions. Inline options override storage and source settings.

## Output

```
◆  backitup scheduler
│
│  Configured schedules:
│    hourly       0 * * * *       next: 1/15/2024, 3:00:00 PM
│    daily        0 2 * * *       next: 1/16/2024, 2:00:00 AM
│    weekly       0 3 * * 0       next: 1/21/2024, 3:00:00 AM
│
✔  Scheduler is running
│
ℹ  Press Ctrl+C to stop
```

## Running as a Service

### Docker

```bash
docker run -d --name backitup \
  -v ./config:/config:ro \
  -v ./data:/data \
  -v ./backups:/backups \
  ghcr.io/climactic/backitup:latest start
```

### Docker Compose

```yaml
services:
  backitup:
    image: ghcr.io/climactic/backitup:latest
    command: start
    volumes:
      - ./config:/config:ro
      - ./data:/data
      - ./backups:/backups
      - /var/run/docker.sock:/var/run/docker.sock  # For volume backups
    environment:
      - S3_ACCESS_KEY_ID=your-key
      - S3_SECRET_ACCESS_KEY=your-secret
    restart: unless-stopped
```

### systemd

```ini
# /etc/systemd/system/backitup.service
[Unit]
Description=BackItUp Scheduler
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/backitup start -c /etc/backitup/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable backitup
sudo systemctl start backitup
sudo systemctl status backitup
```

### PM2

```bash
pm2 start backitup -- start -c /path/to/config.yaml
pm2 save
```

## Logging

The scheduler logs backup activity:

- **INFO** - Backup started/completed, schedule triggers
- **WARN** - Non-fatal issues (e.g., volumes in use)
- **ERROR** - Backup failures, S3 errors

Use `-v` for debug-level logging.

## See Also

- [backup](backup.md) - Run a single backup
- [cleanup](cleanup.md) - Manual cleanup
- [Configuration Reference](../configuration.md)
