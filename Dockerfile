# Runtime stage - uses pre-built binary from GitHub Releases
FROM alpine:3

ARG TARGETARCH
ARG VERSION=latest

# Install runtime dependencies (libstdc++ and libgcc required by Bun binaries)
RUN apk add --no-cache tar gzip ca-certificates curl libstdc++ libgcc

# Create non-root user
RUN adduser -D -u 1000 backitup

# Create directories
RUN mkdir -p /config /data /backups && \
    chown -R backitup:backitup /config /data /backups

# Download and install binary
RUN set -eux; \
    case "${TARGETARCH}" in \
    amd64) ARCH="x64" ;; \
    arm64) ARCH="arm64" ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    if [ "$VERSION" = "latest" ]; then \
    VERSION=$(curl -fsSL "https://api.github.com/repos/climactic/backitup/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'); \
    fi; \
    curl -fsSL "https://github.com/climactic/backitup/releases/download/${VERSION}/backitup-linux-${ARCH}" -o /usr/local/bin/backitup && \
    chmod +x /usr/local/bin/backitup

# Switch to non-root user
USER backitup

WORKDIR /app

# Default volumes
VOLUME ["/config", "/data", "/backups"]

ENTRYPOINT ["backitup"]
CMD ["--help"]
