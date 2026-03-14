// ============================================================
// API.JS — Wrapper de comunicação com Apps Script
// ============================================================

const API_URL = "https://script.google.com/macros/s/AKfycbxsWriuYAFDkqiwDDoKpu0L34u5DGa23rIz4qwN6hLklxw3qnXQrbZXjbut0kSBe56N/exec";

const api = {
  async get(evento, params = {}) {
    const token = state.get("token");
    const qs = new URLSearchParams({ evento, token, ...params }).toString();
    const res = await fetch(`${API_URL}?${qs}`);
    if (!res.ok) throw new Error("Erro de conexão.");
    return res.json();
  },

  async post(body) {
    const token = state.get("token");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token })
    });
    if (!res.ok) throw new Error("Erro de conexão.");
    return res.json();
  }
};


// ============================================================
// STATE.JS — Estado global em memória
// ============================================================

const state = (() => {
  const _s = {
    token:    null,
    promotor: null,
    slot:     null,
    solicitacoes: [],
    mapaData: null,
    historico: [],
    currentScreen: null
  };

  return {
    get: k => _s[k],
    set: (k, v) => { _s[k] = v; },
    getAll: () => ({ ..._s }),

    // Persiste token em localStorage
    saveToken(token) {
      _s.token = token;
      try { localStorage.setItem("pwa_token", token); } catch(e) {}
    },

    loadToken() {
      try {
        // 1. URL param tem prioridade
        const urlToken = new URLSearchParams(location.search).get("token");
        if (urlToken) { _s.token = urlToken; return urlToken; }
        // 2. Fallback localStorage
        const saved = localStorage.getItem("pwa_token");
        if (saved) { _s.token = saved; return saved; }
      } catch(e) {}
      return null;
    },

    clearToken() {
      _s.token = null;
      try { localStorage.removeItem("pwa_token"); } catch(e) {}
    },

    setPromotor(p) {
      _s.promotor = p;
      _s.slot = p.slot_atual || null;
    }
  };
})();


// ============================================================
// UI.JS — Helpers de interface
// ============================================================

const ui = {
  render(html) {
    document.getElementById("app").innerHTML = html;
  },

  // Toast
  toast(msg, type = "info", duration = 3000) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = `toast ${type}`;
    setTimeout(() => { el.className = "toast hidden"; }, duration);
  },

  // Spinner de tela cheia
  spinner(label = "Carregando…") {
    return `
      <div class="spinner-wrap">
        <div class="spinner"></div>
        <span class="spinner-label">${label}</span>
      </div>`;
  },

  // Badge de status FSM
  statusBadge(status) {
    const map = {
      EM_ATIVIDADE: ["badge-green",  "● Em atividade"],
      ACEITO:       ["badge-blue",   "● Aceito"],
      PAUSADO:      ["badge-yellow", "● Pausado"],
      ENCERRADO:    ["badge-gray",   "● Encerrado"],
      REALOCADO:    ["badge-purple", "● Realocado"],
      SEM_SLOT:     ["badge-gray",   "● Sem slot"],
      PENDENTE:     ["badge-yellow", "● Pendente"],
      APROVADA:     ["badge-green",  "● Aprovada"],
      NEGADA:       ["badge-red",    "● Negada"],
      CANCELADA:    ["badge-gray",   "● Cancelada"],
      ATENDIDA:     ["badge-blue",   "● Atendida"],
    };
    const [cls, label] = map[status] || ["badge-gray", status];
    return `<span class="badge ${cls}">${label}</span>`;
  },

  // Formatar horário
  hora(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
    catch(e) { return "—"; }
  },

  // Formatar data curta
  data(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
    catch(e) { return "—"; }
  },

  // Formatar data + hora
  dataHora(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
      });
    } catch(e) { return "—"; }
  },

  // Header padrão
  header(title, sub = "", showBack = true) {
    return `
      <div class="header">
        ${showBack ? `<button class="header-back" onclick="router.back()">‹</button>` : ""}
        <div>
          <div class="header-title">${title}</div>
          ${sub ? `<div class="header-sub">${sub}</div>` : ""}
        </div>
      </div>`;
  },

  // Bottom nav
  bottomNav(active) {
    const items = [
      { id: "home",        icon: "🏠", label: "Home",       screen: "home" },
      { id: "slot",        icon: "📍", label: "Slot",       screen: "slot" },
      { id: "solicitacoes",icon: "📋", label: "Pedidos",    screen: "solicitacoes-lista" },
      { id: "mapa",        icon: "🗺️",  label: "Mapa",       screen: "mapa" },
      { id: "historico",   icon: "📊", label: "Histórico",  screen: "historico" },
    ];
    return `
      <nav class="bottom-nav">
        ${items.map(it => `
          <button class="nav-item ${active === it.id ? "active" : ""}"
                  onclick="router.go('${it.screen}')">
            <span class="nav-icon">${it.icon}</span>
            <span>${it.label}</span>
          </button>`).join("")}
      </nav>`;
  },

  // Feedback pós-ação (score delta + badge)
  feedbackOverlay(res) {
    if (!res.score_delta && !res.badges?.length) return "";
    const delta = res.score_delta > 0
      ? `<div class="score-delta pos">+${res.score_delta} pts ⭐</div>`
      : "";
    const badges = (res.badges || []).map(b =>
      `<div style="font-size:28px">${b.icone || "🏅"} ${b.nome}</div>`
    ).join("");
    return delta || badges
      ? `<div class="card" style="text-align:center;gap:8px;display:flex;flex-direction:column;align-items:center">
           ${delta}${badges}
         </div>`
      : "";
  },

  // GPS indicator
  gpsIndicator(state = "waiting", text = "Capturando localização…") {
    return `
      <div class="gps-indicator" id="gps-indicator">
        <div class="gps-dot ${state}"></div>
        <span id="gps-text">${text}</span>
      </div>`;
  },

  updateGps(state, text) {
    const dot = document.querySelector(".gps-dot");
    const txt = document.getElementById("gps-text");
    if (dot) dot.className = `gps-dot ${state}`;
    if (txt) txt.textContent = text;
  },

  // Avisos
  avisos(lista = []) {
    if (!lista.length) return "";
    return lista.map(a =>
      `<div class="card" style="border-color:var(--yellow);background:rgba(241,196,15,0.08)">
         ⚠️ <span style="font-size:13px">${a}</span>
       </div>`
    ).join("");
  }
};


// ============================================================
// ROUTER.JS — Navegação entre telas
// ============================================================

const router = (() => {
  const _history = [];

  const routes = {
    "splash":             () => auth.renderSplash(),
    "home":               () => homeScreen.render(),
    "slot":               () => slotScreen.render(),
    "checkin":            () => operacao.renderCheckin(),
    "pausa":              () => operacao.renderPausa(),
    "resume":             () => operacao.renderResume(),
    "checkout":           () => operacao.renderCheckout(),
    "solicitacoes-nova":  () => solicitacoes.renderNova(),
    "solicitacoes-lista": () => solicitacoes.renderLista(),
    "sol-realocacao":     () => solicitacoes.renderRealocacao(),
    "sol-reforco":        () => solicitacoes.renderReforco(),
    "sol-bateria":        () => solicitacoes.renderBateria(),
    "sol-ocorrencia":     () => solicitacoes.renderOcorrencia(),
    "vendas":             () => vendas.render(),
    "mapa":               () => mapa.render(),
    "historico":          () => historico.render(),
  };

  return {
    go(screen, pushHistory = true) {
      const fn = routes[screen];
      if (!fn) { console.warn("Rota não encontrada:", screen); return; }
      if (pushHistory && state.get("currentScreen")) {
        _history.push(state.get("currentScreen"));
      }
      state.set("currentScreen", screen);
      fn();
      window.scrollTo(0, 0);
    },

    back() {
      const prev = _history.pop();
      if (prev) this.go(prev, false);
      else this.go("home", false);
    },

    replace(screen) {
      this.go(screen, false);
    }
  };
})();

// Boot
window.addEventListener("load", () => {
  auth.init();
});
