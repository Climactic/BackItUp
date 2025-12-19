# Runtime stage - uses pre-built binary from GitHub Releases
FROM debian:stable-slim

ARG TARGETARCH
ARG VERSION

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tar gzip ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 backitup

# Create directories
RUN mkdir -p /config /data /backups && \
    chown -R backitup:backitup /config /data /backups

# Download and install binary
RUN set -eux; \
    if [ -z "$VERSION" ]; then echo "VERSION argument is required"; exit 1; fi; \
    case "${TARGETARCH}" in \
    amd64) ARCH="x64" ;; \
    arm64) ARCH="arm64" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/climactic/backitup/releases/download/${VERSION}/backitup-linux-${ARCH}" -o /usr/local/bin/backitup && \
    chmod +x /usr/local/bin/backitup

# Switch to non-root user
USER backitup

WORKDIR /app

# Default volumes
VOLUME ["/config", "/data", "/backups"]

ENTRYPOINT ["backitup"]
CMD ["--help"]
