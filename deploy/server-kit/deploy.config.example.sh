# Copy to ../deploy.config.sh (project root) and edit. Sourced by deploy.sh.
# shellcheck shell=bash

# SSH target: a server with docker + nginx (:80) + cloudflared.
SERVER="root@100.100.164.92"

# Where the project is synced to on the server.
REMOTE_DIR="/var/www/myapp"

# Docker Compose project name — keeps this app's containers/network isolated
# from every other app on the shared server. Must be unique per project.
PROJECT="myapp"

# The existing cloudflared tunnel id (the "toolswave" tunnel).
TUNNEL_ID="e0cbd60e-efa9-4041-933f-e2c268a2bfdf"

# Subdomain → published host port (the LEFT side of a compose "ports" mapping).
# Pick host ports in a FREE block to avoid clashing with other apps (the server
# already uses many 3xxx/5xxx/6xxx/7xxx/9xxx ports). 92xx is a good unused block.
#   "<subdomain>:<host_port>"  → https://<subdomain>.toolswave.net → 127.0.0.1:<host_port>
ROUTES=(
  "myapp:9200"      # web frontend
  "apimyapp:9201"   # backend API
  "cmsmyapp:9202"   # admin (optional)
)
