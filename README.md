<div align="center">

# 📦 BackItUp

**A secure, flexible backup utility built with Bun**

Glob patterns • tar.gz compression • Local + S3 storage • Docker volumes • Scheduled backups • Safe cleanup

[![GitHub Release](https://img.shields.io/github/v/release/climactic/backitup?style=for-the-badge&logo=github)](https://github.com/climactic/backitup/releases)
[![License](https://img.shields.io/github/license/climactic/backitup?style=for-the-badge)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?style=for-the-badge&logo=bun)](https://bun.sh)

[![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)](https://github.com/climactic/backitup/releases)
[![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)](https://github.com/climactic/backitup/releases)
[![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)](https://github.com/climactic/backitup/releases)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/climactic/backitup/pkgs/container/backitup)

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/Climactic)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-ff5e5b?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/ClimacticCo)

</div>

---

## ✨ Features

- 🎯 **Named Sources** — Define backup sources with names and reference them in schedules
- 🔍 **Glob Patterns** — Include/exclude files using patterns (`**/*.ts`, `!**/node_modules/**`)
- 🐳 **Docker Volumes** — Backup Docker volumes with Docker Compose integration
- ☁️ **Dual Storage** — Store backups locally and/or in S3 (supports R2, MinIO, etc.)
- ⏰ **Scheduled Backups** — Cron-based scheduling with independent retention policies
- 🛡️ **Safe Cleanup** — Multi-layer validation before any deletion (checksums, path verification)
- ✅ **Integrity Verification** — Verify backups exist and checksums match

---

## 🚀 Installation

### Linux / macOS

```bash
# Quick install
curl -fsSL https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.sh | bash

# Install specific version
curl -fsSL https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.sh | bash -s -- --version v1.0.0

# Uninstall
curl -fsSL https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.sh | bash -s -- --uninstall
```

### Windows (PowerShell)

```powershell
# Quick install
irm https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.ps1 | iex

# Install specific version
$env:BACKITUP_VERSION="v1.0.0"; irm https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.ps1 | iex

# Uninstall
$env:BACKITUP_ACTION="uninstall"; irm https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.ps1 | iex
```

### Docker

```bash
docker pull ghcr.io/climactic/backitup:latest
```

📥 Binaries for all platforms available on [GitHub Releases](https://github.com/climactic/backitup/releases)

---

## ⚡ Quick Start

**1.** Create a config file ([configuration reference](docs/configuration.md)):

<details>
<summary><b>backitup.config.yaml</b> (click to expand)</summary>

```yaml
version: "1.0"

database:
  path: "./data/backitup.db"

sources:
  app:
    path: "/var/www/myapp"
    patterns:
      - "**/*.ts"
      - "**/*.js"
      - "!**/node_modules/**"

local:
  enabled: true
  path: "./backups"

s3:
  enabled: false
  bucket: "my-backups"
  # region: "us-east-1"
  # endpoint: "http://localhost:9000"  # For S3-compatible services
  # accessKeyId: "key"                 # Or use S3_ACCESS_KEY_ID env var
  # secretAccessKey: "secret"          # Or use S3_SECRET_ACCESS_KEY env var

schedules:
  daily:
    cron: "0 2 * * *"        # Daily at 2 AM
    retention:
      maxCount: 7            # Keep max 7 backups
      maxDays: 14            # Delete after 14 days
```

</details>

<details>
<summary><b>backitup.config.json</b> (click to expand)</summary>

```json
{
  "version": "1.0",
  "database": {
    "path": "./data/backitup.db"
  },
  "sources": {
    "app": {
      "path": "/var/www/myapp",
      "patterns": ["**/*.ts", "**/*.js", "!**/node_modules/**"]
    }
  },
  "local": {
    "enabled": true,
    "path": "./backups"
  },
  "s3": {
    "enabled": false,
    "bucket": "my-backups"
  },
  "schedules": {
    "daily": {
      "cron": "0 2 * * *",
      "retention": {
        "maxCount": 7,
        "maxDays": 14
      }
    }
  }
}
```

</details>

**2.** Run:

```bash
backitup backup              # Manual backup
backitup start               # Start scheduler daemon
backitup list                # List backups
backitup cleanup             # Clean old backups
backitup verify --all        # Verify integrity
```

---

## 📖 Commands

All commands support `-c, --config <path>` to specify a config file and `-h, --help` for detailed usage.

| Command            | Description             | Docs                                   |
| ------------------ | ----------------------- | -------------------------------------- |
| `backitup backup`  | Create a backup         | [backup.md](docs/commands/backup.md)   |
| `backitup start`   | Start scheduler daemon  | [start.md](docs/commands/start.md)     |
| `backitup list`    | List existing backups   | [list.md](docs/commands/list.md)       |
| `backitup cleanup` | Clean old backups       | [cleanup.md](docs/commands/cleanup.md) |
| `backitup verify`  | Verify backup integrity | [verify.md](docs/commands/verify.md)   |

```bash
backitup start                    # Start scheduler daemon
backitup start -c /etc/backup.yaml

backitup backup                   # Create backup (interactive)
backitup backup -s daily          # Create backup with schedule tag
backitup backup --dry-run         # Preview what would be backed up
backitup backup --local-only      # Skip S3 upload
backitup backup --volumes-only    # Only backup Docker volumes

backitup cleanup                  # Clean old backups (with confirmation)
backitup cleanup -s daily         # Clean only "daily" tagged backups
backitup cleanup --dry-run        # Preview deletions
backitup cleanup --force          # Skip confirmation

backitup list                     # List all backups
backitup list -s daily -n 10      # Filter by schedule, limit results
backitup list --format json       # Output as JSON or CSV

backitup verify --all             # Verify all backup checksums
backitup verify <backup-id>       # Verify specific backup
backitup verify --all --fix       # Update DB for missing files
```

---

## ⚙️ Inline Configuration

Override config file settings directly from the command line. Useful for quick backups, scripts, or CI/CD pipelines. See [full inline config documentation](docs/inline-config.md).

### Available Options

| Category          | Option                         | Description                                  |
| ----------------- | ------------------------------ | -------------------------------------------- |
| **Database**      | `--database <path>`            | Database file path                           |
| **Sources**       | `--source <path>`              | Source path to backup (can be repeated)      |
|                   | `--pattern <glob>`             | Glob pattern for filtering (can be repeated) |
| **Local Storage** | `--local-path <path>`          | Local storage path                           |
|                   | `--no-local`                   | Disable local storage                        |
| **S3 Storage**    | `--s3-bucket <name>`           | S3 bucket name                               |
|                   | `--s3-prefix <prefix>`         | S3 key prefix                                |
|                   | `--s3-region <region>`         | S3 region                                    |
|                   | `--s3-endpoint <url>`          | S3-compatible endpoint URL                   |
|                   | `--s3-access-key-id <key>`     | S3 access key ID                             |
|                   | `--s3-secret-access-key <key>` | S3 secret access key                         |
|                   | `--no-s3`                      | Disable S3 storage                           |
| **Retention**     | `--retention-count <n>`        | Maximum backups to keep                      |
|                   | `--retention-days <n>`         | Maximum days to retain backups               |
| **Archive**       | `--archive-prefix <str>`       | Archive filename prefix                      |
|                   | `--compression <0-9>`          | Compression level (default: 6)               |
| **Safety**        | `--verify-before-delete`       | Verify checksums before cleanup              |
|                   | `--no-verify-before-delete`    | Skip checksum verification                   |
| **Docker**        | `--docker`                     | Enable Docker volume backups                 |
|                   | `--no-docker`                  | Disable Docker volume backups                |
|                   | `--docker-volume <name>`       | Docker volume to backup (can be repeated)    |

### Examples

```bash
# Quick backup with inline sources
backitup backup -s manual --source /var/www/app --local-path /backups

# Multiple sources with glob patterns
backitup backup -s manual --source /data --source /logs --pattern "**/*.log" --local-path /backups

# Backup directly to S3
backitup backup -s manual --source /app --s3-bucket my-backups --s3-region us-west-2 --no-local

# Backup with S3 credentials inline
backitup backup -s manual --source /data --s3-bucket my-bucket \
  --s3-access-key-id AKIAIOSFODNN7EXAMPLE \
  --s3-secret-access-key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Start scheduler with inline overrides
backitup start --source /data --local-path /backups --s3-bucket my-bucket

# Override retention and compression
backitup backup -s manual --source /db --retention-count 5 --retention-days 7 --compression 9

# Backup Docker volumes inline
backitup backup -s manual --docker-volume postgres_data --docker-volume redis_data --local-path /backups
```

Inline options are merged with your config file. This allows you to use a base config and override specific settings as needed.

### Config-Free Mode

You can run backitup without a config file by providing the required inline options:

**Required options:**

- At least one source: `--source` or `--docker-volume`
- At least one storage: `--local-path` or `--s3-bucket`

```bash
# Minimal backup without config file
backitup backup -s manual --source /data --local-path /backups

# Backup to S3 without config file
backitup backup -s manual --source /app --s3-bucket my-backups --s3-region us-west-2

# Docker volume backup without config file
backitup backup -s manual --docker-volume postgres_data --local-path /backups

# Full example with multiple options
backitup backup -s manual \
  --source /var/www/app \
  --pattern "**/*.js" --pattern "!**/node_modules/**" \
  --local-path /backups \
  --retention-count 5 \
  --compression 9
```

If you run without a config file and don't provide sufficient options, backitup will tell you what's missing.

---

## 🐳 Docker Volume Backup

BackItUp can backup Docker volumes alongside your files. Each volume is backed up to a separate `.tar.gz` archive.

### Configuration

```yaml
version: "1.0"

# ... other config ...

docker:
  enabled: true
  volumes:
    # Direct volume name
    - name: postgres_data

    # Volume from Docker Compose service
    - name: db
      type: compose
      composePath: ./docker-compose.yml
      projectName: myapp  # Optional, inferred from directory
```

### How It Works

1. BackItUp uses a temporary Alpine container to create the backup
2. The volume is mounted read-only to ensure data safety
3. If a volume is in use by running containers, backup proceeds with a warning
4. Each volume produces a separate archive: `backitup-volume-{name}-{schedule}-{timestamp}.tar.gz`

### Docker Compose Integration

When using `type: compose`, BackItUp resolves the actual Docker volume name:

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    volumes:
      - db_data:/var/lib/postgresql/data

volumes:
  db_data:
```

```yaml
# backitup.config.yaml
docker:
  enabled: true
  volumes:
    - name: db_data                    # Direct: uses "db_data"
    - name: db                         # Compose: resolves to "myapp_db_data"
      type: compose
      composePath: ./docker-compose.yml
```

### Restoring Volume Backups

```bash
# Extract the volume backup
tar -xzf backitup-volume-postgres_data-daily-2024-01-15T14-30-22-123Z.tar.gz -C /tmp/restore

# Create a new volume and restore
docker volume create postgres_data_restored
docker run --rm -v postgres_data_restored:/data -v /tmp/restore:/backup alpine \
  sh -c "cp -a /backup/. /data/"
```

---

## 🐳 Running as a Service

### Docker

```bash
docker run -d --name backitup \
  -v ./config:/config:ro -v ./data:/data -v ./backups:/backups \
  -e S3_ACCESS_KEY_ID=key -e S3_SECRET_ACCESS_KEY=secret \
  ghcr.io/climactic/backitup:latest start
```

To backup Docker volumes from within a container, mount the Docker socket:

```bash
docker run -d --name backitup \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ./config:/config:ro -v ./data:/data -v ./backups:/backups \
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
      - S3_ACCESS_KEY_ID=key
      - S3_SECRET_ACCESS_KEY=secret
    restart: unless-stopped
```

### systemd

```ini
# /etc/systemd/system/backitup.service
[Unit]
Description=backitup scheduler
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/backitup start
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 📚 Documentation

| Document                                         | Description                      |
| ------------------------------------------------ | -------------------------------- |
| [Configuration Reference](docs/configuration.md) | Complete config file reference   |
| [Inline Configuration](docs/inline-config.md)    | CLI options and config-free mode |
| **Commands**                                     |                                  |
| [backup](docs/commands/backup.md)                | Create backups                   |
| [start](docs/commands/start.md)                  | Run scheduler daemon             |
| [list](docs/commands/list.md)                    | List existing backups            |
| [cleanup](docs/commands/cleanup.md)              | Remove old backups               |
| [verify](docs/commands/verify.md)                | Verify backup integrity          |

---

## 🛠️ Development

```bash
bun install && bun run dev   # Development with hot reload
bun test                     # Run tests
bun run build                # Build standalone executable
```

---

## 💖 Support

If you find BackItUp useful, consider supporting its development:

<a href="https://github.com/sponsors/Climactic">
<img src="https://img.shields.io/badge/Sponsor_on_GitHub-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="GitHub Sponsors">
</a>
&nbsp;
<a href="https://ko-fi.com/ClimacticCo">
<img src="https://img.shields.io/badge/Support_On_Ko--fi-ff5e5b?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Ko-fi">
</a>

Your support helps maintain and improve this project! ⭐

### 🏆 Title Sponsors

Title sponsors get their logo showcased here and in the project documentation. [Become a title sponsor →](https://github.com/sponsors/Climactic)

<!-- SPONSORS:START -->
<!-- SPONSORS:END -->

---

## 📜 License

[![License](https://img.shields.io/github/license/climactic/backitup?style=for-the-badge)](LICENSE)
