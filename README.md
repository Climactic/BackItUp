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

**1.** Create `backitup.config.yaml` ([full reference](docs/configuration.md)):

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

| Command                     | Description                                      |
| --------------------------- | ------------------------------------------------ |
| `backitup start`            | 🚀 Start scheduler daemon                         |
| `backitup backup`           | 💾 Create manual backup                           |
| `backitup backup -s hourly` | ⏰ Use specific schedule settings                 |
| `backitup backup --dry-run` | 👀 Preview without creating                       |
| `backitup cleanup`          | 🧹 Clean old backups per retention policy         |
| `backitup list`             | 📋 List backups (`-s`, `-n`, `--format json/csv`) |
| `backitup verify --all`     | ✅ Verify all backup checksums                    |

### Docker Volume Commands

| Command                        | Description                              |
| ------------------------------ | ---------------------------------------- |
| `backitup backup`              | Backup both files and Docker volumes     |
| `backitup backup --volumes-only` | Only backup Docker volumes             |
| `backitup backup --skip-volumes` | Only backup files, skip volumes        |
| `backitup backup --volume mydb`  | Backup specific volume(s)              |
| `backitup list --type volume`    | List only volume backups               |

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