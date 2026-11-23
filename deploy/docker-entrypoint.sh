#!/bin/sh
# Runtime Caddyfile environment variable substitution
# Caddy's built-in {$VAR} substitution is unreliable in Docker; do it ourselves.

set -e

# Substitute environment variables in Caddyfile
# Supports both {$VAR} and ${VAR} syntax
envsubst < /etc/caddy/Caddyfile.template > /etc/caddy/Caddyfile

# Execute the original Caddy entrypoint
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile "$@"