# Cloud Run — Telegram Gateway

## Papel deste serviço
Este serviço é o **único responsável pelo Telegram**:
- recebe webhook
- processa inline keyboard
- faz cadastro/update via bot
- publica slots disponíveis/ocupados por tópico
- repassa eventos do app para o Apps Script
- executa as integrações de Telegram devolvidas pelo Apps Script

## Rotas
- `GET /healthz`
- `GET /app/query`
- `POST /app/event`
- `POST /internal/publish-available-slots`
- `POST /telegram/webhook/<TELEGRAM_WEBHOOK_SECRET_PATH>`

## Cadastro do promotor via bot
No privado do bot:
- `/start`
- `/cadastro`
- `/update`
- `/cancel`

Fluxo:
1. usuário envia `/cadastro` ou `/update`
2. bot pede `PROMOTOR_ID`
3. bot pede `Cidade`
4. Cloud Run chama `BOT_VINCULAR_PROMOTOR` no Apps Script
5. Apps Script grava `telegram_user_id` + `cidade` em `PROMOTORES`

## Estrutura multi-cidade
Use **1 Cloud Run** e **1 app**, com vários grupos no Telegram.
A variável `CITY_GROUPS_JSON` mapeia cidade -> grupo/tópicos.

## Deploy recomendado (CLI)
### 1. Pré-requisitos
```bash
gcloud auth login
gcloud config set project SEU_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### 2. Ajuste o `env.example.yaml`
Crie um arquivo `env.yaml` a partir do exemplo e preencha os valores reais.

### 3. Deploy do serviço
```bash
gcloud run deploy promo-telegram-gateway \
  --source . \
  --region southamerica-east1 \
  --allow-unauthenticated
```

### 4. Configure as variáveis de ambiente
```bash
gcloud run services update promo-telegram-gateway \
  --region southamerica-east1 \
  --env-vars-file env.yaml
```

### 5. Descubra a URL pública
```bash
gcloud run services describe promo-telegram-gateway \
  --region southamerica-east1 \
  --format='value(status.url)'
```

Guarde a URL retornada como `CLOUD_RUN_URL`.

### 6. Registrar o webhook do Telegram
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "<CLOUD_RUN_URL>/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET_PATH>",
    "drop_pending_updates": true
  }'
```

### 7. Publicar slots disponíveis no tópico
```bash
curl -X POST "<CLOUD_RUN_URL>/internal/publish-available-slots" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: <ADMIN_SECRET>" \
  -d '{"cidade":"São Paulo","limit":50}'
```

## App PWA
### Leituras
Pode consultar direto o Apps Script ou usar o proxy do Cloud Run:
- `GET /app/query?evento=GET_ME&token=...`
- `GET /app/query?evento=GET_SLOT_ATUAL&token=...`

### Escritas
Use o Cloud Run:
- `POST /app/event`
- `ACEITAR_SLOT`
- `CHECKIN`
- `PAUSE`
- `RESUME`
- `CHECKOUT`
- `CHECKOUT_EXCEPCIONAL`
- solicitações operacionais

## Observações importantes
- Regenerar o token do bot antes de produção.
- O Apps Script não envia Telegram.
- O Apps Script devolve `integracoes`, e o Cloud Run executa.
- Se a aba `SLOTS` tiver as colunas opcionais `tg_*`, o Cloud Run consegue editar a mensagem original de slot disponível quando ele é aceito.


## Observações de operação

- Serviço oficial atual: `promo-telegram-gateway-v3`.
- `v1` e `v2` devem ser tratados como descartados/legado.
- O `v3` foi estabilizado com `Dockerfile` explícito e rota raiz JSON.
- O endpoint `/app/query?evento=PING` está validado.
- O endpoint interno `/internal/publish-available-slots` funciona quando `X-Admin-Secret` e `APPS_SCRIPT_SHARED_SECRET` estão corretos.
- Rotacionar token do bot e segredos antes de produção.
