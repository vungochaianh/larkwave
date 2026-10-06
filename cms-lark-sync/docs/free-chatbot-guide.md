# Huong dan xay dung Free Chatbot (Telegram + Lark)

> **Mien phi hoan toan** nho su dung Ollama (self-hosted) hoac NVIDIA NIM (free tier).
> Chatbot ho tro: RAG knowledge base, multi-turn conversation, custom commands.

---

## Muc luc

1. [Tong quan kien truc](#1-tong-quan-kien-truc)
2. [Cai dat Ollama (self-hosted, mien phi)](#2-cai-dat-ollama)
3. [Cai dat NVIDIA NIM (cloud, free tier)](#3-cai-dat-nvidia-nim)
4. [Tao Telegram Bot](#4-tao-telegram-bot)
5. [Tao Lark Bot](#5-tao-lark-bot)
6. [Cau hinh AIConfig trong CMS](#6-cau-hinh-aiconfig-trong-cms)
7. [Tao AI Agent va train knowledge](#7-tao-ai-agent-va-train-knowledge)
8. [Deploy bot len Telegram va Lark](#8-deploy-bot-len-telegram-va-lark)
9. [Custom Commands](#9-custom-commands)
10. [Troubleshooting](#10-troubleshooting)
11. [Agents v2 Roadmap](#11-agents-v2-roadmap)

---

## 1. Tong quan kien truc

```
User (Telegram/Lark) 
    |
    v
Webhook --> api-lark-all (Express)
    |
    +--> channelAdapter.js  (parse message theo platform)
    +--> BotCommand check   (custom commands truoc)
    +--> AIAgent chat       (RAG context + LLM call)
    |       |
    |       +--> AgentKnowledge (Q&A matching, doc context)
    |       +--> AIConfig       (provider + model + API key)
    |       +--> BotSession     (conversation memory, 2h TTL)
    |       |
    |       +--> Ollama (local, free)   <-- docker-compose
    |       +--> NVIDIA NIM (cloud, free tier)
    |
    v
Reply --> Telegram API / Lark API
```

### Tai sao mien phi?

| Provider | Chi phi | Mo ta |
|----------|---------|-------|
| **Ollama** | $0 | Chay tren may cua ban, can GPU (hoac CPU cham hon) |
| **NVIDIA NIM** | $0 (free tier) | 1000 requests/ngay mien phi, khong can GPU |

### Models khuyen dung (mien phi)

| Provider | Model | RAM/VRAM | Chat quality |
|----------|-------|----------|-------------|
| Ollama | `llama3.1:8b` | 8GB | Tot cho tieng Viet |
| Ollama | `llama3.3:70b` | 48GB+ | Rat tot, can GPU manh |
| Ollama | `mistral:latest` | 8GB | Nhanh, tot cho tieng Anh |
| Ollama | `qwen2.5:7b` | 8GB | Tot cho tieng Viet + Trung |
| NVIDIA | `meta/llama-3.3-70b-instruct` | Cloud | Rat tot, mien phi |
| NVIDIA | `deepseek-ai/deepseek-r1` | Cloud | Reasoning tot |
| NVIDIA | `qwen/qwen2.5-72b-instruct` | Cloud | Da ngon ngu |

---

## 2. Cai dat Ollama

### Option A: Docker (khuyen dung - chay cung api-lark-all)

File `docker-compose.yml` da co san trong `api-lark-all/`:

```yaml
services:
  apihoanam:
    build: .
    container_name: apihoanam
    restart: always
    env_file:
      - .env
    ports:
      - "6000:3000"
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "127.0.0.1:11434:11434"
    environment:
      - OLLAMA_KEEP_ALIVE=30m
      - OLLAMA_NUM_CTX=8192

volumes:
  ollama_data:
```

**Khoi dong:**

```bash
cd api-lark-all
docker compose up -d
```

**Pull model (bat buoc truoc khi dung):**

```bash
# Model nhe, chay duoc tren CPU (8GB RAM)
docker exec ollama ollama pull llama3.1:8b

# Model manh hon (can GPU 48GB+)
docker exec ollama ollama pull llama3.3:70b

# Model tieng Viet tot
docker exec ollama ollama pull qwen2.5:7b
```

**Kiem tra hoat dong:**

```bash
# List models da pull
docker exec ollama ollama list

# Test chat
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:8b",
    "messages": [{"role": "user", "content": "Xin chao!"}]
  }'
```

### Option B: Cai truc tiep tren may (khong Docker)

```bash
# macOS
brew install ollama
ollama serve &

# Linux
curl -fsSL https://ollama.com/install.sh | sh
systemctl start ollama

# Pull model
ollama pull llama3.1:8b
```

> **Luu y**: Neu chay Ollama ngoai Docker, sua `baseUrl` trong AIConfig thanh
> `http://localhost:11434/v1` thay vi `http://ollama:11434/v1`.

### GPU Acceleration (NVIDIA)

Neu co GPU NVIDIA, mo comment trong `docker-compose.yml`:

```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

Can cai truoc: `nvidia-container-toolkit` tren host.

---

## 3. Cai dat NVIDIA NIM

NVIDIA NIM cho phep dung model lon **mien phi** qua API (khong can GPU).

### Buoc 1: Lay API Key

1. Truy cap https://build.nvidia.com
2. Dang ky tai khoan (mien phi)
3. Chon model (vd: `meta/llama-3.3-70b-instruct`)
4. Click "Get API Key" -> Copy key (bat dau bang `nvapi-...`)

### Buoc 2: Test API

```bash
curl https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer nvapi-YOUR_KEY_HERE" \
  -d '{
    "model": "meta/llama-3.3-70b-instruct",
    "messages": [{"role": "user", "content": "Xin chao!"}],
    "max_tokens": 512
  }'
```

### Free tier limits

- 1000 requests/ngay (du cho bot nho-trung binh)
- Khong gioi han token/request
- Nhieu model lon: Llama 3.3 70B, DeepSeek R1, Qwen 72B

---

## 4. Tao Telegram Bot

### Buoc 1: Tao bot voi BotFather

1. Mo Telegram, tim `@BotFather`
2. Gui lenh `/newbot`
3. Dat ten bot (vd: "Hoa Nam Assistant")
4. Dat username (vd: `hoanam_assistant_bot`)
5. BotFather tra ve **Bot Token**: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

> **Luu token nay** - se dung khi deploy bot trong CMS.

### Buoc 2: Cau hinh bot (tuy chon)

Gui cac lenh nay cho BotFather:

```
/setdescription - Dat mo ta bot
/setabouttext - Dat about text
/setuserpic - Upload avatar
/setcommands - Dat menu lenh:
  help - Xem huong dan
  reset - Xoa lich su hoi thoai
  status - Trang thai bot
```

### Buoc 3: Lay Chat ID (de test)

1. Gui tin nhan bat ky cho bot
2. Truy cap: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Tim `"chat":{"id": 123456789}` - do la chat ID cua ban

---

## 5. Tao Lark Bot

### Buoc 1: Tao app tren Lark Developer Console

1. Truy cap https://open.larksuite.com/app (hoac https://open.feishu.cn/app cho Feishu)
2. Click "Create Custom App"
3. Dat ten (vd: "Hoa Nam Bot")
4. Ghi nhan **App ID** va **App Secret**

### Buoc 2: Cau hinh Bot

1. Trong app settings -> **Bot** -> Enable bot
2. **Event Subscriptions**:
   - Request URL: `https://apihoanam.toolswave.net/api/bots/<BOT_ID>/webhook/lark`
   - Subscribe events:
     - `im.message.receive_v1` (nhan tin nhan)
3. **Permissions** (Scopes):
   - `im:message` (doc tin nhan)
   - `im:message:send_as_bot` (gui tin nhan)
   - `im:chat` (doc thong tin chat)

### Buoc 3: Publish app

1. **Version Management** -> Create version
2. Submit for review (tu dong approve cho custom app)
3. Publish

### Buoc 4: Add bot vao group

1. Mo Lark group chat
2. Settings -> Add bot -> Chon bot vua tao
3. Bot se nhan tin nhan qua webhook

---

## 6. Cau hinh AIConfig trong CMS

Truy cap CMS tai `https://cms.toolswave.net/settings/ai` (hoac `http://localhost:8080/settings/ai`).

### Tao config Ollama

1. Click "Them cau hinh" (Add config)
2. Dien thong tin:

| Field | Value |
|-------|-------|
| Ten | Ollama Local |
| Provider | `ollama` |
| Base URL | `http://ollama:11434/v1` (Docker) hoac `http://localhost:11434/v1` (local) |
| API Key | `ollama` (bat ky, Ollama khong can key) |
| Model mac dinh | `llama3.1:8b` |
| Input price/M | `0` |
| Output price/M | `0` |

3. Save -> Kiem tra ket noi

### Tao config NVIDIA NIM

| Field | Value |
|-------|-------|
| Ten | NVIDIA Free |
| Provider | `nvidia` |
| Base URL | `https://integrate.api.nvidia.com/v1` |
| API Key | `nvapi-YOUR_KEY_HERE` |
| Model mac dinh | `meta/llama-3.3-70b-instruct` |
| Input price/M | `0` |
| Output price/M | `0` |

### Tat credit blocking (vi mien phi)

Vao `/settings/credits` -> Tim config vua tao -> **Tat "Block on Zero"** de bot khong bi chan khi het credit (vi gia = 0, credit luon du).

---

## 7. Tao AI Agent va train knowledge

Truy cap `/lark/agent` trong CMS.

### Buoc 1: Tao Agent

1. Click "Tao Agent moi"
2. Dien thong tin:

| Field | Value |
|-------|-------|
| Ten | Tro ly Hoa Nam |
| Mo ta | Chatbot ho tro khach hang |
| AI Config | Chon "Ollama Local" hoac "NVIDIA Free" |
| Model | Chon model tu danh sach |
| System Prompt | *(Xem mau ben duoi)* |
| Welcome Message | Xin chao! Toi la tro ly Hoa Nam. |

### Mau System Prompt

```
Ban la tro ly AI cua Hoa Nam, ho tro khach hang bang tieng Viet.

Nguyen tac:
- Tra loi ngan gon, than thien, chinh xac
- Neu khong biet, noi "Toi se chuyen cau hoi nay cho nhan vien ho tro"
- Khong tra loi cau hoi ngoai pham vi (chinh tri, ton giao, ...)
- Su dung thong tin tu knowledge base khi co

Thong tin cong ty:
- Ten: Hoa Nam
- Linh vuc: [dien thong tin]
- Hotline: [dien so]
- Email: [dien email]
```

### Buoc 2: Train Knowledge Base

Tab "Knowledge" trong trang Agent:

#### Cach 1: Them Q&A thu cong

Phu hop nhat cho chatbot - tao cap hoi-dap:

```
Q: Gio lam viec la may gio?
A: Chung toi lam viec tu 8h-17h30, thu 2 den thu 7.

Q: Dia chi cong ty o dau?
A: Dia chi: 123 Nguyen Van Linh, Quan 7, TP.HCM.

Q: Cach dat hang nhu the nao?
A: Ban co the dat hang qua website, goi hotline 0901234567, 
   hoac nhan tin truc tiep cho chung toi.
```

> **Meo**: Q&A matching dung bidirectional scoring - cang nhieu tu khoa trung
> voi cau hoi cua user, cang duoc uu tien. Nen viet Q da dang (nhieu cach hoi).

#### Cach 2: Them tai lieu

Upload hoac nhap noi dung tai lieu (huong dan san pham, chinh sach, FAQ, ...).
He thong se trích keyword va inject vao context khi user hoi cau lien quan.

#### Cach 3: Sync tu Lark Base

Neu da co du lieu trong Lark Bitable, co the sync tu dong:
1. Tab Knowledge -> "Sync tu Bitable"
2. Chon base + table
3. Map field: title, content, tags
4. Bat tu dong sync

### Buoc 3: Test chat

Tab "Chat" trong trang Agent:
1. Gui thu tin nhan
2. Kiem tra bot tra loi dung context tu knowledge
3. Dieu chinh system prompt neu can

---

## 8. Deploy bot len Telegram va Lark

### Buoc 1: Tao Bot deployment

Tab "Deploy" trong trang Agent:

1. Click "Them Bot moi"
2. Chon platform: **Telegram** hoac **Lark**

#### Telegram config

| Field | Value |
|-------|-------|
| Platform | `telegram` |
| Bot Token | Token tu BotFather (buoc 4) |
| Ten bot | Hoa Nam Bot |

#### Lark config

| Field | Value |
|-------|-------|
| Platform | `lark` |
| App ID | App ID tu Lark Developer Console |
| App Secret | App Secret tu Lark Developer Console |
| Ten bot | Hoa Nam Lark Bot |

3. Save -> He thong tao webhook URL tu dong

### Buoc 2: Set webhook

#### Telegram

He thong tu dong set webhook khi tao bot. Neu can set thu cong:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://apihoanam.toolswave.net/api/bots/<BOT_ID>/webhook/telegram"
  }'
```

#### Lark

Vao Lark Developer Console -> Event Subscriptions:
- URL: `https://apihoanam.toolswave.net/api/bots/<BOT_ID>/webhook/lark`
- He thong tu dong handle URL verification challenge

### Buoc 3: Test

- **Telegram**: Gui tin nhan cho bot tren Telegram
- **Lark**: @ mention bot trong group hoac gui DM

### Xu ly webhook flow

```
1. Platform gui POST den /api/bots/:botId/webhook/:platform
2. botWebhook.route.js:
   - Lookup Bot document (credentials + linked agentId)
   - Lookup AIAgent (system prompt + knowledge)
   - channelAdapter parse message theo platform
3. Check BotCommand truoc (prefix/exact/contains/regex match)
4. Neu khong match command -> goi AI chat:
   - Load BotSession (conversation history)
   - Build RAG context tu AgentKnowledge
   - Call LLM (Ollama/NVIDIA) qua OpenAI SDK
   - Save response to BotSession
5. channelAdapter gui reply ve platform
```

---

## 9. Custom Commands

Tao cac lenh dac biet cho bot (xu ly truoc khi goi AI):

### Trong CMS: Tab "Commands"

| Trigger | Match type | Response type | Response |
|---------|-----------|---------------|----------|
| `/help` | prefix | text | `Cac lenh:\n/help - Huong dan\n/reset - Xoa hoi thoai\n/hotline - So dien thoai` |
| `/hotline` | exact | text | `Hotline: 0901234567\nEmail: info@hoanam.vn` |
| `/reset` | exact | reset | *(xoa session)* |
| `gia` | contains | llm-prompt | `Ban la chuyen gia tu van gia. Tra loi chi tiet ve gia san pham dua tren knowledge base.` |
| `/feedback (.+)` | regex | text | `Cam on ban da gop y: {{text}}` |

### Bien the (variables)

| Variable | Mo ta |
|----------|-------|
| `{{text}}` | Noi dung tin nhan (sau command) |
| `{{senderName}}` | Ten nguoi gui |
| `{{chatId}}` | ID cuoc hoi thoai |
| `{{botName}}` | Ten bot |

### Built-in commands (tu dong co)

| Command | Mo ta |
|---------|-------|
| `!help` | Hien thi huong dan |
| `!reset` | Xoa lich su hoi thoai |
| `!status` | Trang thai bot + session |
| `!learn Q: ... \| A: ...` | Them Q&A nhanh |
| `!qa` | Xem danh sach Q&A |
| `!feedback ...` | Gui feedback |

---

## 10. Troubleshooting

### Ollama khong tra loi

```bash
# Kiem tra Ollama dang chay
docker ps | grep ollama

# Kiem tra model da pull chua
docker exec ollama ollama list

# Test truc tiep
docker exec ollama ollama run llama3.1:8b "Hello"

# Xem log
docker logs ollama --tail 50
```

### NVIDIA NIM loi 401/403

- Kiem tra API key con hieu luc tai https://build.nvidia.com
- Free tier: 1000 req/ngay - co the da het quota
- Mot so model can approve truoc khi dung

### Telegram bot khong nhan tin nhan

```bash
# Kiem tra webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Nen tra ve:
# "url": "https://apihoanam.toolswave.net/api/bots/<ID>/webhook/telegram"
# "pending_update_count": 0
# "last_error_message": "" (khong loi)
```

- Webhook URL phai la HTTPS
- Server phai public (khong dung localhost)
- Kiem tra Bot Token dung

### Lark bot khong nhan event

- Kiem tra Event Subscription URL dung format
- Kiem tra da subscribe `im.message.receive_v1`
- Kiem tra app da publish va bot da add vao group
- Xem logs: `docker logs apihoanam --tail 100`

### Bot tra loi cham

- **Ollama**: Model lon + CPU = cham. Thu model nho hon (`llama3.1:8b`)
- **NVIDIA**: Network latency. Kiem tra curl response time
- **RAM**: Ollama can du RAM cho model. `llama3.1:8b` can ~8GB

### Session bi mat

- BotSession co TTL 2 gio - tu dong xoa neu khong hoat dong
- Moi user/chat co session rieng
- `!reset` xoa session thu cong

---

## 11. Agents v2 Roadmap

> **Ghi chu**: Giao dien Agent hien tai (tai `/lark/agent`) la v1, da hoat dong.
> Agents v2 se la giao dien **hoan toan moi**, tich hop nhieu loai agents khac nhau.

### V2 se bao gom

#### Nhieu loai Agent

| Loai | Mo ta | Use case |
|------|-------|----------|
| **Chat Agent** | Chatbot hoi dap (hien tai) | CSKH, FAQ bot |
| **Task Agent** | Thuc hien tac vu cu the | Dat lich, tao don hang |
| **Workflow Agent** | Chuoi hanh dong tu dong | Onboarding, approval flow |
| **RAG Agent** | Tra cuu tai lieu nang cao | Tim kiem noi bo, knowledge base |
| **Code Agent** | Ho tro lap trinh | Review code, debug |
| **Multi-Agent** | Nhieu agent phoi hop | Complex workflows |

#### Giao dien v2 (du kien)

```
/agents                     # Dashboard - tat ca agents
/agents/create              # Wizard tao agent moi (chon loai)
/agents/:id                 # Chi tiet agent
/agents/:id/train           # Train interface (Q&A, docs, files)
/agents/:id/deploy          # Deploy nhieu kenh
/agents/:id/analytics       # Thong ke su dung
/agents/:id/playground      # Test sandbox
```

#### Tinh nang moi du kien

- [ ] **Agent Templates**: Mau agent co san (CSKH, ban hang, noi bo, ...)
- [ ] **Visual Flow Builder**: Keo tha workflow cho Task/Workflow Agent
- [ ] **Multi-model routing**: Tu dong chon model theo do phuc tap cau hoi
- [ ] **Conversation analytics**: Dashboard thong ke hoi thoai
- [ ] **A/B testing**: Test nhieu prompt/model dong thoi
- [ ] **Human handoff**: Chuyen sang nhan vien khi bot khong tra loi duoc
- [ ] **Web embed widget**: Nhung chatbot vao website bat ky
- [ ] **Voice support**: Tich hop speech-to-text / text-to-speech
- [ ] **File upload**: User gui file cho bot xu ly
- [ ] **Scheduled messages**: Bot gui tin nhan tu dong theo lich

#### API moi cho v2

```
POST   /api/v2/agents              # Tao agent (nhieu loai)
GET    /api/v2/agents              # List agents + filter
GET    /api/v2/agents/:id          # Chi tiet
PUT    /api/v2/agents/:id          # Cap nhat
DELETE /api/v2/agents/:id          # Xoa

POST   /api/v2/agents/:id/train    # Train knowledge
POST   /api/v2/agents/:id/chat     # Chat (tat ca loai agent)
GET    /api/v2/agents/:id/sessions # Lich su hoi thoai
GET    /api/v2/agents/:id/analytics # Thong ke

POST   /api/v2/agents/:id/deploy   # Deploy len platform
GET    /api/v2/agents/:id/bots     # List bots cua agent
```

> **Tien do**: V2 se duoc xay dung dan, bat dau tu refactor Agent model
> va tao giao dien moi. V1 van hoat dong song song trong qua trinh chuyen doi.

---

## Tham khao nhanh

### Cac endpoint API hien tai

| Method | Endpoint | Mo ta |
|--------|----------|-------|
| GET | `/api/ai-agents` | List agents |
| POST | `/api/ai-agents` | Tao agent |
| PUT | `/api/ai-agents/:id` | Cap nhat agent |
| POST | `/api/ai-agents/:id/chat` | Chat voi agent |
| POST | `/api/bots` | Tao bot deployment |
| POST | `/api/bots/:id/webhook/:platform` | Webhook receiver |
| GET | `/api/ai-configs` | List AI configs |
| POST | `/api/ai-configs` | Tao AI config |

### Cac file quan trong

| File | Mo ta |
|------|-------|
| `api-lark-all/docker-compose.yml` | Docker config (Ollama) |
| `api-lark-all/utils/aiProviders.js` | Provider URLs + options |
| `api-lark-all/services/channelAdapter.js` | Multi-platform adapter |
| `api-lark-all/routes/aiAgent.route.js` | Agent chat logic |
| `api-lark-all/modules/bots/` | Bot management module |
| `api-lark-all/models/AIConfig.js` | Provider config model |
| `api-lark-all/models/AIAgent.model.js` | Agent model |
| `api-lark-all/models/BotSession.model.js` | Session memory |
| `api-lark-all/models/AgentKnowledge.model.js` | Knowledge base |

### Ports

| Service | Port | Mo ta |
|---------|------|-------|
| API (local) | 3000 | Express server |
| API (Docker) | 6000 | Mapped tu container |
| CMS | 8080 | Next.js frontend |
| Ollama | 11434 | LLM inference (localhost only) |
