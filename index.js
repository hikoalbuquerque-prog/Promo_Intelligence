const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(corsMiddleware);

const CFG = loadConfig();

// Servir o PWA (pasta /public)
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  // Se for chamada de API (ex: healthcheck, curl), retorna JSON
  // Caso contrário, serve o PWA
  const acceptsHtml = req.accepts('html');
  if (!acceptsHtml || req.query.json) {
    return res.json({ ok: true, service: 'promo-telegram-gateway', version: '1.0.0', root: true, now: new Date().toISOString() });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/ready', (_req, res) => {
  res.json({ ok: true, ready: true, service: 'promo-telegram-gateway', version: '1.0.0' });
});

app.get('/healthz', (_req, res) => {

  res.json({ ok: true, service: 'promo-telegram-gateway', version: '1.0.0', now: new Date().toISOString() });
});

app.get('/app/query', async (req, res) => {
  try {
    const evento = String(req.query.evento || req.query.action || '').trim();
    if (!evento) return res.status(400).json({ ok: false, mensagem: 'evento obrigatório.' });

    const result = await callAppsScriptGet(evento, req.query);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error('[GET /app/query]', err);
    res.status(500).json({ ok: false, mensagem: 'Erro interno no Cloud Run.' });
  }
});

app.post('/app/event', async (req, res) => {
  try {
    const body = req.body || {};
    const evento = String(body.evento || body.action || '').trim();
    if (!evento) return res.status(400).json({ ok: false, mensagem: 'evento obrigatório.' });

    const result = await callAppsScriptPost({ ...body, evento });
    if (result.ok) {
      await processIntegracoes(result.integracoes, { evento, result });
      if (evento === 'ACEITAR_SLOT') {
        await reconcileAcceptedSlotMessage(result, null);
      }
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error('[POST /app/event]', err);
    res.status(500).json({ ok: false, mensagem: 'Erro interno no Cloud Run.' });
  }
});

app.post('/internal/publish-available-slots', requireAdminSecret, async (req, res) => {
  try {
    const requestedCity = req.body && req.body.cidade ? String(req.body.cidade) : '';
    const maxSlots = Number(req.body && req.body.limit ? req.body.limit : CFG.publishMaxSlots);
    const cities = requestedCity ? [requestedCity] : Object.values(CFG.cityGroups).map((g) => g.name);
    const summary = [];

    for (const city of cities) {
      const payload = await callAppsScriptPost({
        evento: 'INTERNAL_LISTAR_SLOTS_DISPONIVEIS',
        integration_secret: CFG.appsScriptSharedSecret,
        cidade: city,
        limit: maxSlots,
      });

      const slots = payload?.dados?.slots || [];
      let published = 0;

      for (const slot of slots) {
        const sent = await publishAvailableSlot(slot);
        if (sent.ok) published += 1;
      }

      summary.push({ cidade: city, encontrados: slots.length, publicados: published });
    }

    res.json({ ok: true, mensagem: 'Publicação concluída.', dados: summary });
  } catch (err) {
    console.error('[POST /internal/publish-available-slots]', err);
    res.status(500).json({ ok: false, mensagem: 'Erro ao publicar slots disponíveis.' });
  }
});

app.post(`/telegram/webhook/${CFG.telegramWebhookSecretPath}`, async (req, res) => {
  try {
    await handleTelegramUpdate(req.body || {});
  } catch (err) {
    console.error('[POST /telegram/webhook]', err);
  }

  // Telegram reenvia updates quando a resposta não é 2xx.
  res.status(200).json({ ok: true });
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, mensagem: 'Rota não encontrada.' });
});

app.listen(CFG.port, () => {
  console.log(`promo-telegram-gateway listening on :${CFG.port}`);
});

async function handleTelegramUpdate(update) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  if (update.message && typeof update.message.text === 'string') {
    await handleTextMessage(update.message);
    return;
  }
}

async function handleCallbackQuery(callbackQuery) {
  const callbackId = callbackQuery.id;
  const from = callbackQuery.from || {};
  const data = String(callbackQuery.data || '').trim();

  if (!data.startsWith('accept:')) {
    await telegramApi('answerCallbackQuery', { callback_query_id: callbackId, text: 'Ação não reconhecida.', show_alert: true });
    return;
  }

  const slotId = data.slice('accept:'.length);
  const result = await callAppsScriptPost({
    evento: 'ACEITAR_SLOT_TELEGRAM',
    integration_secret: CFG.appsScriptSharedSecret,
    telegram_user_id: String(from.id || ''),
    slot_id: slotId,
  });

  if (!result.ok) {
    await telegramApi('answerCallbackQuery', {
      callback_query_id: callbackId,
      text: truncateForCallback(result.mensagem || 'Falha ao aceitar slot.'),
      show_alert: !!(result.meta && result.meta.needs_registration),
    });
    return;
  }

  await telegramApi('answerCallbackQuery', {
    callback_query_id: callbackId,
    text: 'Slot aceito com sucesso.',
  });

  if (callbackQuery.message) {
    await reconcileAcceptedSlotMessage(result, {
      chatId: callbackQuery.message.chat && callbackQuery.message.chat.id,
      messageId: callbackQuery.message.message_id,
      originalText: callbackQuery.message.text || callbackQuery.message.caption || '',
      acceptedBy: from.first_name || 'Promotor',
    });
  }

  await processIntegracoes(result.integracoes, { evento: 'ACEITAR_SLOT_TELEGRAM', result });
}

async function handleTextMessage(message) {
  const chat = message.chat || {};
  const text = String(message.text || '').trim();
  const telegramUserId = String((message.from && message.from.id) || '');
  const privateChat = chat.type === 'private';

  if (!privateChat) {
    if (/^\/cadastro\b/i.test(text) || /^\/update\b/i.test(text)) {
      await telegramApi('sendMessage', {
        chat_id: chat.id,
        text: 'Faça esse comando no privado do bot para concluir o cadastro. Abra o bot e envie /cadastro.',
      });
    }
    return;
  }

  if (/^\/start\b/i.test(text)) {
    await telegramApi('sendMessage', {
      chat_id: chat.id,
      parse_mode: 'HTML',
      text:
        '👋 <b>Promo Intelligence BOT</b>\n\n' +
        'Use estes comandos no privado:\n' +
        '/cadastro — vincular seu Telegram ao promotor\n' +
        '/update — trocar promotor_id e/ou cidade\n' +
        '/cancel — cancelar o fluxo atual',
    });
    return;
  }

  if (/^\/cancel\b/i.test(text)) {
    await botClearSessionCloudRun(telegramUserId);
    await telegramApi('sendMessage', { chat_id: chat.id, text: 'Fluxo cancelado.' });
    return;
  }

  if (/^\/(cadastro|update)\b/i.test(text)) {
    await botSetSessionCloudRun(telegramUserId, 'AWAITING_PROMOTOR_ID', { mode: text.startsWith('/update') ? 'UPDATE' : 'CADASTRO' });
    await telegramApi('sendMessage', {
      chat_id: chat.id,
      parse_mode: 'HTML',
      text: 'Envie seu <b>PROMOTOR_ID</b> exatamente como está na planilha. Ex.: <code>PROM_001</code>',
    });
    return;
  }

  const session = await botGetSessionCloudRun(telegramUserId);
  const estado = session?.dados?.estado || '';
  const payload = session?.dados?.payload || {};

  if (!estado) {
    await telegramApi('sendMessage', { chat_id: chat.id, text: 'Envie /cadastro para vincular seu Telegram ou /update para trocar seu vínculo.' });
    return;
  }

  if (estado === 'AWAITING_PROMOTOR_ID') {
    await botSetSessionCloudRun(telegramUserId, 'AWAITING_CIDADE', {
      ...payload,
      promotor_id: text.toUpperCase(),
      telegram_nome: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' '),
    });
    await telegramApi('sendMessage', {
      chat_id: chat.id,
      text: 'Agora envie sua cidade exatamente como ela deve ficar no cadastro. Ex.: São Paulo',
    });
    return;
  }

  if (estado === 'AWAITING_CIDADE') {
    const result = await callAppsScriptPost({
      evento: 'BOT_VINCULAR_PROMOTOR',
      integration_secret: CFG.appsScriptSharedSecret,
      telegram_user_id: telegramUserId,
      promotor_id: payload.promotor_id,
      cidade: text,
      telegram_nome: payload.telegram_nome || [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' '),
    });

    if (!result.ok) {
      await telegramApi('sendMessage', { chat_id: chat.id, text: result.mensagem || 'Falha ao salvar cadastro.' });
      return;
    }

    await processIntegracoes(result.integracoes, { evento: 'BOT_VINCULAR_PROMOTOR', result });
    return;
  }

  await telegramApi('sendMessage', { chat_id: chat.id, text: 'Fluxo não reconhecido. Envie /cancel e comece novamente.' });
}

async function publishAvailableSlot(slot) {
  const group = resolveCityGroup(slot.cidade);
  if (!group) {
    console.warn(`Cidade sem grupo configurado: ${slot.cidade}`);
    return { ok: false, reason: 'city_not_configured' };
  }

  const message = await telegramApi('sendMessage', {
    chat_id: group.chatId,
    message_thread_id: topicId(group, 'SLOTS_DISPONIVEIS'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    text: renderAvailableSlotMessage(slot),
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Aceitar slot', callback_data: `accept:${slot.slot_id}` }]],
    },
  });

  if (message.ok && message.result && message.result.message_id) {
    await callAppsScriptPost({
      evento: 'INTERNAL_REGISTRAR_SLOT_TELEGRAM_META',
      integration_secret: CFG.appsScriptSharedSecret,
      slot_id: slot.slot_id,
      kind: 'disponivel',
      chat_id: String(group.chatId),
      topic_key: 'SLOTS_DISPONIVEIS',
      message_id: String(message.result.message_id),
    });
  }

  return { ok: !!message.ok, telegram: message };
}

async function reconcileAcceptedSlotMessage(result, callbackContext) {
  const slot = result?.dados?.slot || result?.dados?.slot_id ? result?.dados?.slot : null;
  const slotMeta = result?.dados?.slot_telegram_meta?.disponivel || {};
  const targetChatId = callbackContext?.chatId || slotMeta.chat_id;
  const targetMessageId = callbackContext?.messageId || slotMeta.message_id;
  if (!targetChatId || !targetMessageId) return;

  const slotData = result?.dados?.slot || {};
  const acceptedBy = callbackContext?.acceptedBy || 'promotor';
  const text =
    '⛔️ <b>Slot aceito</b>\n' +
    `Cidade: <b>${escapeHtml(slotData.cidade || '—')}</b>\n` +
    `Local: <b>${escapeHtml(slotData.local || '—')}</b>\n` +
    `Status: <b>${escapeHtml(slotData.status || 'ACEITO')}</b>\n` +
    `Aceito por: <b>${escapeHtml(acceptedBy)}</b>\n` +
    `Slot ID: <code>${escapeHtml(slotData.slot_id || '')}</code>`;

  await telegramApi('editMessageText', {
    chat_id: targetChatId,
    message_id: Number(targetMessageId),
    parse_mode: 'HTML',
    text,
  }).catch(() => null);

  await telegramApi('editMessageReplyMarkup', {
    chat_id: targetChatId,
    message_id: Number(targetMessageId),
    reply_markup: { inline_keyboard: [] },
  }).catch(() => null);

  if (slotData.slot_id) {
    await callAppsScriptPost({
      evento: 'INTERNAL_LIMPAR_SLOT_TELEGRAM_META',
      integration_secret: CFG.appsScriptSharedSecret,
      slot_id: slotData.slot_id,
      kind: 'disponivel',
    });
  }
}

async function processIntegracoes(integracoes, context) {
  if (!Array.isArray(integracoes) || integracoes.length === 0) return [];

  const out = [];
  for (const item of integracoes) {
    if (!item || item.canal !== 'telegram') continue;

    if (item.tipo === 'group_message') {
      const group = resolveCityGroup(item.cidade);
      if (!group) continue;

      const sent = await telegramApi('sendMessage', {
        chat_id: group.chatId,
        message_thread_id: topicId(group, item.topic_key),
        parse_mode: item.parse_mode || 'HTML',
        disable_web_page_preview: true,
        text: item.text_html || item.text || '',
      });
      out.push(sent);

      if (context?.evento && context.evento.startsWith('ACEITAR_SLOT') && item.topic_key === 'SLOTS_OCUPADOS') {
        const slotId = context?.result?.dados?.slot?.slot_id;
        if (slotId && sent.ok && sent.result?.message_id) {
          await callAppsScriptPost({
            evento: 'INTERNAL_REGISTRAR_SLOT_TELEGRAM_META',
            integration_secret: CFG.appsScriptSharedSecret,
            slot_id: slotId,
            kind: 'ocupado',
            chat_id: String(group.chatId),
            topic_key: item.topic_key,
            message_id: String(sent.result.message_id),
          });
        }
      }
    }

    if (item.tipo === 'private_message' && item.telegram_user_id) {
      const sent = await telegramApi('sendMessage', {
        chat_id: item.telegram_user_id,
        parse_mode: item.parse_mode || 'HTML',
        disable_web_page_preview: true,
        text: item.text_html || item.text || '',
      });
      out.push(sent);
    }
  }
  return out;
}

async function botGetSessionCloudRun(telegramUserId) {
  return callAppsScriptPost({
    evento: 'BOT_GET_SESSION',
    integration_secret: CFG.appsScriptSharedSecret,
    telegram_user_id: String(telegramUserId || ''),
  });
}

async function botSetSessionCloudRun(telegramUserId, estado, payload) {
  return callAppsScriptPost({
    evento: 'BOT_SET_SESSION',
    integration_secret: CFG.appsScriptSharedSecret,
    telegram_user_id: String(telegramUserId || ''),
    estado,
    payload: payload || {},
  });
}

async function botClearSessionCloudRun(telegramUserId) {
  return callAppsScriptPost({
    evento: 'BOT_CLEAR_SESSION',
    integration_secret: CFG.appsScriptSharedSecret,
    telegram_user_id: String(telegramUserId || ''),
  });
}

async function callAppsScriptGet(evento, params = {}) {
  const url = new URL(CFG.appsScriptUrl);
  url.searchParams.set('evento', evento);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || key === 'evento' || key === 'action') continue;
    url.searchParams.set(key, String(value));
  }

  const resp = await fetch(url.toString(), { method: 'GET' });
  const text = await resp.text();
  return safeJson(text);
}

async function callAppsScriptPost(payload) {
  const resp = await fetch(CFG.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const text = await resp.text();
  return safeJson(text);
}

async function telegramApi(method, payload) {
  const url = `https://api.telegram.org/bot${CFG.telegramBotToken}/${method}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const json = await resp.json();
  if (!json.ok) {
    console.error(`[telegram:${method}]`, JSON.stringify(json));
  }
  return json;
}

function renderAvailableSlotMessage(slot) {
  return (
    '📆 <b>Slot disponível</b>\n' +
    `Cidade: <b>${escapeHtml(slot.cidade || '—')}</b>\n` +
    `Local: <b>${escapeHtml(slot.local || '—')}</b>\n` +
    `Atividade: <b>${escapeHtml(slot.tipo_atividade || '—')}</b>\n` +
    `Início: <b>${escapeHtml(formatDateTime(slot.inicio))}</b>\n` +
    `Fim: <b>${escapeHtml(formatDateTime(slot.fim))}</b>\n` +
    `Raio: <b>${escapeHtml(String(slot.raio_metros || '—'))}m</b>\n` +
    `Slot ID: <code>${escapeHtml(slot.slot_id || '')}</code>`
  );
}

function requireAdminSecret(req, res, next) {
  const provided = String(req.get('x-admin-secret') || req.body?.admin_secret || '').trim();
  if (!provided || provided !== CFG.adminSecret) {
    return res.status(401).json({ ok: false, mensagem: 'Acesso negado.' });
  }
  next();
}

function corsMiddleware(req, res, next) {
  const origin = req.get('origin') || '*';
  if (!CFG.corsOrigin || CFG.corsOrigin === '*' || origin === CFG.corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', CFG.corsOrigin || '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

function loadConfig() {
  const cityGroups = JSON.parse(process.env.CITY_GROUPS_JSON || '{}');
  const normalizedMap = {};
  for (const [rawCity, value] of Object.entries(cityGroups)) {
    normalizedMap[normalizeCity(rawCity)] = {
      name: value.name || rawCity,
      chatId: String(value.chatId),
      topics: value.topics || {},
    };
  }

  const cfg = {
    port: Number(process.env.PORT || 8080),
    appsScriptUrl: mustEnv('APPS_SCRIPT_URL'),
    appsScriptSharedSecret: mustEnv('APPS_SCRIPT_SHARED_SECRET'),
    telegramBotToken: mustEnv('TELEGRAM_BOT_TOKEN'),
    telegramWebhookSecretPath: mustEnv('TELEGRAM_WEBHOOK_SECRET_PATH'),
    adminSecret: mustEnv('ADMIN_SECRET'),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    publishMaxSlots: Number(process.env.PUBLISH_MAX_SLOTS || 50),
    defaultCity: process.env.DEFAULT_CITY || '',
    cityGroups: normalizedMap,
  };

  return cfg;
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function resolveCityGroup(city) {
  const normalized = normalizeCity(city || CFG.defaultCity || '');
  return CFG.cityGroups[normalized] || null;
}

function topicId(group, key) {
  if (!group) return undefined;
  const value = group.topics ? group.topics[key] : undefined;
  return value === null || value === '' || value === undefined ? undefined : Number(value);
}

function normalizeCity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_err) {
    return { ok: false, mensagem: 'Resposta inválida do Apps Script.', raw: text };
  }
}

function truncateForCallback(text) {
  const clean = String(text || '');
  return clean.length <= 180 ? clean : `${clean.slice(0, 177)}...`;
}