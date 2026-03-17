const API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL)
  || 'https://promo-telegram-gateway-v3-476120210909.southamerica-east1.run.app';

async function _parseResponse(res) {
  if (!res.ok) throw new Error(`Erro de conexão (${res.status}).`);
  return res.json();
}

const api = {
  // GET → /app/query?evento=...&token=...
  async get(evento, params = {}) {
    const token = state.get('token');
    const qs = new URLSearchParams({ evento, token: token || '', ...params }).toString();
    const res = await fetch(`${API_URL}/app/query?${qs}`);
    return _parseResponse(res);
  },

  // POST → /app/event  { evento, token, ...body }
  async post(body, options = {}) {
    const token = options.tokenOverride ?? state.get('token');
    const payload = options.skipToken ? { ...body } : { ...body, token };
    const res = await fetch(`${API_URL}/app/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return _parseResponse(res);
  }
};
