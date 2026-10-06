# Huong dan Agents Trainer — Multi-Agent AI Platform

> Service Python doc lap cho nhieu loai AI agent tren Lark (CSKH, Ky thuat, Marketing, ...).
> Ho tro: Web crawling, Ollama (mien phi), OpenAI fallback, training truc tiep trong chat.
> Kien thuc chia se: global (chung cho tat ca) + agent-specific (rieng tung agent).

---

## Muc luc

1. [Tong quan kien truc](#1-tong-quan-kien-truc)
2. [Yeu cau he thong](#2-yeu-cau-he-thong)
3. [Cai dat va deploy](#3-cai-dat-va-deploy)
4. [Cau hinh Cloudflared Tunnel](#4-cau-hinh-cloudflared-tunnel)
5. [Cau hinh Lark App](#5-cau-hinh-lark-app)
6. [Seed du lieu ban dau](#6-seed-du-lieu-ban-dau)
7. [Crawl website](#7-crawl-website)
8. [Training bot trong Lark](#8-training-bot-trong-lark)
9. [Training bot qua API](#9-training-bot-qua-api)
10. [Multi-Agent Knowledge Architecture](#10-multi-agent-knowledge-architecture)
11. [He thong phan tang (Tiered AI)](#11-he-thong-phan-tang)
12. [OpenAI Fallback](#12-openai-fallback)
13. [API Reference](#13-api-reference)
14. [CI/CD Pipeline](#14-cicd-pipeline)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Tong quan kien truc

```
User nhan tin trong Lark group
  |
  v
Lark Server --> Cloudflared Tunnel --> agents-trainer (port 6001)
                                          |
                    +---------------------+---------------------+
                    |                     |                     |
              Check FAQ match       Load knowledge        Training commands
              (score >= 0.8)        context (crawled       (!qa, !train,
              --> tra loi ngay      pages + docs)           !forget, !help)
                    |                     |
                    v                     v
              Ollama (llama3)       OpenAI (gpt-4o)
              local, mien phi       fallback khi
                    |               Ollama khong du
                    v               tu tin
              Stream response
              --> Update Lark card
              (typing effect)
```

**Components:**
- **agents-trainer**: Python/FastAPI service (port 6001, Docker)
- **Ollama**: Local LLM server (port 11434)
- **MongoDB**: Shared voi api-lark-all (cung database)
- **Cloudflared**: Tunnel de Lark gui webhook den server

---

## 2. Yeu cau he thong

| Component | Version | Ghi chu |
|-----------|---------|---------|
| Python | 3.12+ | Trong Docker image |
| Docker | 20+ | De deploy container |
| Ollama | 0.20+ | Da cai tren server |
| MongoDB | 6+ | Shared voi api-lark-all |
| Cloudflared | Latest | Tunnel cho webhook |

**Ollama models can thiet:**
```bash
ollama pull llama3          # 8B, model chinh
# Tuy chon them:
ollama pull llama3.2:1b     # 1B, Lv1 nhanh
ollama pull qwen2.5:14b     # 14B, Lv3 nang cao
```

---

## 3. Cai dat va deploy

### 3.1 Deploy tu dong qua CI/CD

Push code len GitLab → CI/CD tu dong:
1. **test:cskh** — kiem tra syntax Python
2. **build:cskh** — build Docker image
3. **deploy:cskh** — deploy container (manual trigger)

Tren GitLab: **CI/CD → Pipelines** → bam **deploy:cskh** (manual)

### 3.2 Deploy thu cong (lan dau hoac debug)

```bash
# Tren server
cd ~/repo/agents-trainer

# Build image
docker build -t agentstrainer .

# Tao env file
mkdir -p ~/env
cat > ~/env/agentstrainer.env << 'EOF'
MONGODB_URI=mongodb://your-mongodb-uri
OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o
PORT=3000
EOF

# Chay container
docker run -d \
  --name agentstrainer \
  --restart always \
  --env-file ~/env/agentstrainer.env \
  --add-host=host.docker.internal:host-gateway \
  -p 6001:3000 \
  agentstrainer

# Kiem tra health
curl http://localhost:6001/health
```

### 3.3 Kiem tra Ollama truy cap duoc

```bash
# Tu container
docker exec agentstrainer python3 -c "
import httpx, asyncio
async def test():
    r = await httpx.AsyncClient().get('http://host.docker.internal:11434/v1/models')
    print(r.json())
asyncio.run(test())
"
```

> **Luu y**: Ollama phai bind `0.0.0.0` (khong chi `127.0.0.1`).
> Kiem tra: `ss -tlnp | grep 11434` — phai thay `0.0.0.0:11434` hoac `*:11434`.
> Neu chua, sua:
> ```bash
> sudo mkdir -p /etc/systemd/system/ollama.service.d
> echo -e '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0"' | sudo tee /etc/systemd/system/ollama.service.d/override.conf
> sudo systemctl daemon-reload && sudo systemctl restart ollama
> ```

---

## 4. Cau hinh Cloudflared Tunnel

CSKH Trainer can mot public URL de Lark gui webhook events. Dung cloudflared tunnel.

### 4.1 Kiem tra cloudflared da cai

```bash
cloudflared --version
```

Neu chua cai:
```bash
# Ubuntu/Debian
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

### 4.2 Login vao Cloudflare (lan dau)

```bash
cloudflared tunnel login
```

Se mo trinh duyet de xac thuc. Chon domain (vd: toolswave.net).

### 4.3 Tao tunnel moi cho CSKH

```bash
# Tao tunnel
cloudflared tunnel create agents-trainer

# Ghi nhan Tunnel ID (vd: abc123-def456-...)
```

### 4.4 Cau hinh tunnel

```bash
mkdir -p ~/.cloudflared

cat > ~/.cloudflared/config-cskh.yml << 'EOF'
tunnel: <TUNNEL_ID>
credentials-file: /home/deveris/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: agents-hoanam.toolswave.net
    service: http://localhost:6001
  - service: http_status:404
EOF
```

Thay `<TUNNEL_ID>` bang ID thuc.

### 4.5 Tao DNS record

```bash
cloudflared tunnel route dns agents-trainer agents-hoanam.toolswave.net
```

### 4.6 Chay tunnel

```bash
# Test truoc
cloudflared tunnel --config ~/.cloudflared/config-cskh.yml run

# Chay nhu systemd service (tu dong start khi reboot)
sudo cloudflared service install --config /home/deveris/.cloudflared/config-cskh.yml
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### 4.7 Kiem tra

```bash
curl https://agents-hoanam.toolswave.net/health
# Mong doi: {"status":"OK","database":"connected",...}
```

> **Luu y**: Neu da co tunnel chung cho nhieu service, co the them route moi:
> ```yaml
> ingress:
>   - hostname: apihoanam.toolswave.net
>     service: http://localhost:6000
>   - hostname: agents-hoanam.toolswave.net
>     service: http://localhost:6001
>   - service: http_status:404
> ```

---

## 5. Cau hinh Lark App

### 5.1 Mo Lark Developer Console

Vao https://open.larksuite.com → app **lark_developer** (hoac app cua ban)

### 5.2 Cap nhat Event Subscription URL

**Events & Callbacks → Event Configuration → Request URL:**

```
https://agents-hoanam.toolswave.net/webhook
```

Bam **Save**. Lark se gui verification challenge — service tu dong tra loi.

### 5.3 Kiem tra Events da them

Can co event: **im.message.receive_v1**

Neu chua co: **Add Events** → tim "Receive message" → them.

### 5.4 Kiem tra Permissions

Can co:
- `im:message` — gui tin nhan
- `im:message:readonly` — doc tin nhan
- `im:message.reactions:write` — tha reaction

### 5.5 Kiem tra Bot capability

**Add Features** → **Bot** phai da duoc bat.

### 5.6 Publish lai (neu thay doi)

**Version Management & Release** → **Create Version** → Submit

---

## 6. Seed du lieu ban dau

### 6.1 Tao CSKH config (neu chua co)

```bash
curl -X POST http://localhost:6001/tier-configs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CSKH - Hoa Nam",
    "description": "Nhom CSKH chinh",
    "larkAppId": "cli_a93c1d248d78ded2",
    "larkAppSecret": "<LARK_APP_SECRET>",
    "larkDomain": "larksuite.com",
    "fallbackModel": "gpt-4o",
    "tiers": [
      {
        "level": 1,
        "name": "CSKH Lv1",
        "ollamaModel": "llama3",
        "webhookUrl": "",
        "confidenceThreshold": 0.6,
        "maxTokens": 1024,
        "temperature": 0.3,
        "systemPrompt": "Ban la nhan vien CSKH cap 1. Tra loi ngan gon, than thien bang tieng Viet."
      }
    ]
  }'
```

### 6.2 Kiem tra config

```bash
curl http://localhost:6001/tier-configs
```

---

## 7. Crawl website

### 7.1 Crawl tu sitemap

```bash
curl -X POST http://localhost:6001/<CSKH_TIER_ID>/knowledge/crawl-sitemap \
  -H "Content-Type: application/json" \
  -d '{"url": "https://hoanamlogistics.com/sitemap.xml"}'
```

Ket qua:
```json
{
  "success": true,
  "data": {
    "total": 25,
    "created": 23,
    "updated": 0,
    "failed": 2,
    "urls": [...]
  }
}
```

### 7.2 Kiem tra knowledge da crawl

```bash
curl "http://localhost:6001/<CSKH_TIER_ID>/knowledge?category=web-crawl"
```

### 7.3 Re-crawl (cap nhat noi dung)

Chay lai lenh crawl-sitemap — tu dong upsert (neu URL da ton tai thi update).

### 7.4 Xoa knowledge crawl

```bash
# Xoa tat ca web-crawl knowledge
curl -X DELETE "http://localhost:6001/<CSKH_TIER_ID>/knowledge?category=web-crawl"
```

---

## 8. Training bot trong Lark

Goi lenh truc tiep trong group chat co bot:

### 8.1 Day FAQ (uu tien cao nhat)

```
!qa Dich vu cua Hoa Nam la gi? | Hoa Nam Logistics cung cap dich vu van chuyen chinh ngach va tieu ngach tu Trung Quoc ve Viet Nam.
```

Format: `!qa <cau hoi> | <cau tra loi>`

Bot se ghi nho va uu tien tra loi FAQ truoc khi goi LLM.

### 8.2 Day tai lieu

```
!train Bang gia van chuyen | Gia van chuyen tu Quang Chau ve HCM: 25.000d/kg hang thuong, 35.000d/kg hang dac biet. Thoi gian 7-10 ngay.
```

Format: `!train <tieu de> | <noi dung>`

### 8.3 Xoa kien thuc

```
!forget bang gia
```

Xoa tat ca knowledge co chua "bang gia" trong title, question, hoac keywords.

### 8.4 Xem thong ke

```
!knowledge
```

Bot tra loi:
```
Kien thuc hien tai:
- FAQ: 15
- Tai lieu: 8
- Web crawl: 23
```

### 8.5 Xem danh sach lenh

```
!help
```

### 8.6 Phan quyen admin

Mac dinh: tat ca nguoi dung deu co the training.
De gioi han, them `adminUserIds` vao config:

```bash
curl -X PUT http://localhost:6001/tier-configs/<ID> \
  -H "Content-Type: application/json" \
  -d '{"adminUserIds": ["ou_abc123", "ou_def456"]}'
```

Lay open_id tu Lark Admin Console hoac log webhook.

---

## 9. Training bot qua API

### 9.1 Them FAQ

```bash
curl -X POST http://localhost:6001/<CSKH_TIER_ID>/knowledge \
  -H "Content-Type: application/json" \
  -d '{
    "type": "faq",
    "question": "Lam sao de theo doi don hang?",
    "answer": "Truy cap website hoanamlogistics.com, nhap ma van don de theo doi.",
    "keywords": ["theo doi", "don hang", "ma van don", "tracking"],
    "priority": 5
  }'
```

### 9.2 Them tai lieu

```bash
curl -X POST http://localhost:6001/<CSKH_TIER_ID>/knowledge \
  -H "Content-Type: application/json" \
  -d '{
    "type": "document",
    "title": "Chinh sach bao hiem hang hoa",
    "content": "Hang hoa duoc bao hiem 100% gia tri khai bao...",
    "category": "chinh-sach",
    "keywords": ["bao hiem", "hang hoa", "chinh sach"]
  }'
```

### 9.3 Import hang loat

```bash
curl -X POST http://localhost:6001/<CSKH_TIER_ID>/knowledge/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"type": "faq", "question": "...", "answer": "...", "keywords": [...]},
      {"type": "faq", "question": "...", "answer": "...", "keywords": [...]}
    ]
  }'
```

### 9.4 Test relevance matching

```bash
curl -X POST http://localhost:6001/<CSKH_TIER_ID>/knowledge/test-match \
  -H "Content-Type: application/json" \
  -d '{"message": "gia van chuyen tu Trung Quoc"}'
```

---

## 10. Multi-Agent Knowledge Architecture

### 10.1 Hai loai kien thuc

| Scope | Mo ta | Vi du |
|-------|-------|-------|
| `global` | Tat ca agents deu dung | Website crawl, gioi thieu cong ty, chinh sach chung |
| `agent` | Chi agent cu the dung | FAQ CSKH, quy trinh ky thuat, chien luoc marketing |

### 10.2 Cach hoat dong

Khi agent CSKH tra loi:
```
Load knowledge WHERE scope = "global"
  UNION
Load knowledge WHERE scope = "agent" AND agentId = <CSKH agent id>
  → Inject vao system prompt → LLM tra loi
```

Agent Ky thuat cung truy cap **global** nhung KHONG thay knowledge rieng cua CSKH.

### 10.3 Tao nhieu agents

```bash
# Agent CSKH
curl -X POST http://localhost:6001/tier-configs \
  -H "Content-Type: application/json" \
  -d '{"name":"CSKH Hoa Nam","role":"cskh","larkAppId":"...","larkAppSecret":"...","tiers":[...]}'

# Agent Ky thuat
curl -X POST http://localhost:6001/tier-configs \
  -H "Content-Type: application/json" \
  -d '{"name":"Ky thuat Lark","role":"tech","larkAppId":"...","larkAppSecret":"...","tiers":[...]}'

# Agent Marketing
curl -X POST http://localhost:6001/tier-configs \
  -H "Content-Type: application/json" \
  -d '{"name":"Marketing","role":"marketing","larkAppId":"...","larkAppSecret":"...","tiers":[...]}'
```

### 10.4 Training rieng tung agent

Trong Lark group cua agent CSKH:
```
!qa Thoi gian van chuyen? | Hang chinh ngach 7-10 ngay, tieu ngach 5-7 ngay
```
→ Luu vao scope="agent", agentId=<CSKH id>. Chi CSKH biet.

### 10.5 Crawl website (global)

```bash
curl -X POST http://localhost:6001/<AGENT_ID>/knowledge/crawl-sitemap \
  -H "Content-Type: application/json" \
  -d '{"url":"https://hoanamlogistics.com/sitemap.xml","scope":"global"}'
```

Tat ca agents deu doc duoc noi dung website.

### 10.6 Them knowledge agent-specific qua API

```bash
curl -X POST http://localhost:6001/<AGENT_ID>/knowledge \
  -H "Content-Type: application/json" \
  -d '{"type":"document","title":"Quy trinh xu ly khieu nai","content":"...","scope":"agent"}'
```

---

## 11. He thong phan tang (Tiered AI)

### 10.1 Cach hoat dong

```
Tin nhan nguoi dung
  |
  v
Lv1 (llama3, nhanh) --> confidence >= 0.6 --> Tra loi
  |
  v (khong du tu tin)
Lv2 (llama3, chi tiet hon) --> confidence >= 0.6 --> Tra loi
  |
  v (van khong du)
Lv3 (llama3, phai tra loi) --> Tra loi bat ke confidence
  |
  v (tat ca Ollama that bai)
OpenAI gpt-4o (fallback) --> Tra loi
```

### 10.2 Cau hinh nhieu tang

```bash
curl -X PUT http://localhost:6001/tier-configs/<ID> \
  -H "Content-Type: application/json" \
  -d '{
    "tiers": [
      {"level": 1, "name": "CSKH Lv1", "ollamaModel": "llama3.2:1b", "confidenceThreshold": 0.6, "maxTokens": 1024, "temperature": 0.3},
      {"level": 2, "name": "CSKH Lv2", "ollamaModel": "llama3", "confidenceThreshold": 0.6, "maxTokens": 2048, "temperature": 0.4},
      {"level": 3, "name": "CSKH Lv3", "ollamaModel": "qwen2.5:14b", "confidenceThreshold": 0.4, "maxTokens": 4096, "temperature": 0.5}
    ]
  }'
```

### 10.3 Giao dien stream

- Bot gui 1 card duy nhat "Dang xu ly..."
- Card duoc update lien tuc khi Ollama generate tokens (moi 800ms)
- Neu escalate: card hien "Chuyen len tang cao hon..."
- Card cuoi cung: cau tra loi + status "CSKH Lv1 - Tra loi truc tiep"

---

## 11. OpenAI Fallback

Khi tat ca Ollama tiers that bai (connection error hoac confidence qua thap):

### 11.1 Cau hinh

OpenAI API key duoc truyen qua env var `OPENAI_API_KEY` trong container.

Hoac cau hinh trong CSKH config:
```bash
curl -X PUT http://localhost:6001/tier-configs/<ID> \
  -H "Content-Type: application/json" \
  -d '{"fallbackModel": "gpt-4o"}'
```

### 11.2 Khi nao su dung

- Tat ca Ollama tiers tra ve confidence < threshold
- Ollama connection error (server down)
- Last tier confidence < 0.5

OpenAI fallback van su dung knowledge context (FAQ + crawled pages) de tra loi chinh xac.

---

## 12. API Reference

Base URL: `http://localhost:6001` (hoac `https://agents-hoanam.toolswave.net`)

### Health
| Method | Path | Mo ta |
|--------|------|-------|
| GET | `/health` | Health check |

### Webhook
| Method | Path | Mo ta |
|--------|------|-------|
| POST | `/webhook` | Lark event subscription |

### Tier Config
| Method | Path | Mo ta |
|--------|------|-------|
| POST | `/tier-configs` | Tao config |
| GET | `/tier-configs` | List configs |
| GET | `/tier-configs/{id}` | Get config |
| PUT | `/tier-configs/{id}` | Update config |
| DELETE | `/tier-configs/{id}` | Xoa config |
| GET | `/tier-configs/{id}/stats` | Xem stats |

### Knowledge
| Method | Path | Mo ta |
|--------|------|-------|
| POST | `/{cskhTierId}/knowledge` | Them knowledge |
| GET | `/{cskhTierId}/knowledge` | List (query: type, tierLevel, category) |
| PUT | `/{cskhTierId}/knowledge/{id}` | Update |
| DELETE | `/{cskhTierId}/knowledge/{id}` | Xoa |
| POST | `/{cskhTierId}/knowledge/bulk` | Import nhieu |
| POST | `/{cskhTierId}/knowledge/crawl-sitemap` | Crawl sitemap |
| POST | `/{cskhTierId}/knowledge/test-match` | Test relevance |

---

## 13. CI/CD Pipeline

### Jobs

| Job | Stage | Trigger |
|-----|-------|---------|
| test:cskh | test | Auto khi `agents-trainer/**/*` thay doi |
| build:cskh | build | Auto khi test pass (main branch) |
| deploy:cskh | deploy | **Manual** — bam tay tren GitLab |

### GitLab Variables can thiet

Vao **Settings → CI/CD → Variables** them:
- `API_MONGODB_URI` — MongoDB connection string
- `API_OPENAI_API_KEY` — OpenAI API key

### Deploy flow

```
Push code → test:cskh (syntax check)
           → build:cskh (docker build)
           → deploy:cskh (manual) → container restart → health check
```

---

## 14. Troubleshooting

### Bot khong tra loi

```bash
# Xem log
docker logs agentstrainer --tail 50 -f

# Kiem tra health
curl http://localhost:6001/health

# Kiem tra Ollama tu container
docker exec agentstrainer python3 -c "
import httpx, asyncio
async def test():
    r = await httpx.AsyncClient().get('http://host.docker.internal:11434/v1/models')
    print(r.json())
asyncio.run(test())
"
```

### Lark webhook khong nhan

1. Kiem tra tunnel: `curl https://agents-hoanam.toolswave.net/health`
2. Kiem tra Event URL trong Lark Developer Console
3. Kiem tra log: `docker logs agentstrainer | grep webhook`

### Ollama connection error

```bash
# Ollama phai bind 0.0.0.0
ss -tlnp | grep 11434
# Neu thay 127.0.0.1 → sua theo huong dan muc 3.3
```

### OpenAI fallback khong hoat dong

1. Kiem tra `OPENAI_API_KEY` trong env file
2. Kiem tra key hop le: `curl https://api.openai.com/v1/models -H "Authorization: Bearer sk-proj-..."`

### Training commands khong hoat dong

1. Kiem tra bot nhan duoc message (xem log)
2. Kiem tra `adminUserIds` — neu khong rong, chi admin moi dung duoc
3. Format dung: `!qa <question> | <answer>` (co dau `|` ngan cach)

### Crawl that bai

1. Kiem tra sitemap URL hop le: `curl https://hoanamlogistics.com/sitemap.xml`
2. Kiem tra log: `docker logs agentstrainer | grep Crawler`
3. Mot so trang co the block bot → kiem tra User-Agent
