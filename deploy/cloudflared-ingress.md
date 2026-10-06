# Wiring the 3 domains through the existing Cloudflare Tunnel

The server already runs a locally-managed tunnel `toolswave`
(ID `e0cbd60e-efa9-4041-933f-e2c268a2bfdf`, config `/etc/cloudflared/config.yml`).
We only ADD three ingress rules — nothing existing is touched.

## 1) Add to `/etc/cloudflared/config.yml` ingress (BEFORE the final catch-all `- service: http_status:404`)

```yaml
  # === Toolswave App Builder ===
  - hostname: apia.toolswave.net
    service: http://localhost:4101
  - hostname: app.toolswave.net
    service: http://localhost:4100
  - hostname: aapp.toolswave.net
    service: http://localhost:4100
```

> Always back up first: `cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak.$(date +%Y%m%d-%H%M%S)`

## 2) Create the public DNS (CNAME -> tunnel) using the tunnel cert (NOT the API token)

The account `cert.pem` lives at `/root/.cloudflared/cert.pem`, so this works even
though the API token lacks DNS-write:

```bash
export TUNNEL_ORIGIN_CERT=/root/.cloudflared/cert.pem
cloudflared tunnel route dns e0cbd60e-efa9-4041-933f-e2c268a2bfdf apia.toolswave.net
cloudflared tunnel route dns e0cbd60e-efa9-4041-933f-e2c268a2bfdf app.toolswave.net
cloudflared tunnel route dns e0cbd60e-efa9-4041-933f-e2c268a2bfdf aapp.toolswave.net
```

## 3) Reload cloudflared (graceful; brief blip for all tunnel hostnames)

```bash
systemctl reload cloudflared || systemctl restart cloudflared
```

Verify: `curl -sS https://apia.toolswave.net/v1/health`
