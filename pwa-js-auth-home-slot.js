// ============================================================
// AUTH.JS — Splash, validação de token, login
// ============================================================

const auth = {
  async init() {
    router.go("splash", false);
    const token = state.loadToken();

    if (!token) {
      this.renderAcesso("negado", "Nenhum token encontrado. Verifique o link recebido.");
      return;
    }

    // Validar token no Apps Script
    try {
      const res = await api.get("VALIDAR_TOKEN", { token });

      if (!res.ok) {
        const tipo = res.mensagem?.includes("expirado") ? "expirado" : "negado";
        this.renderAcesso(tipo, res.mensagem);
        return;
      }

      state.saveToken(token);
      state.setPromotor(res.dados);
      router.replace("home");

    } catch(e) {
      this.renderAcesso("erro", "Sem conexão. Verifique sua internet e tente novamente.");
    }
  },

  renderSplash() {
    ui.render(`
      <div class="screen no-bottom" style="align-items:center;justify-content:center;gap:24px">
        <div style="font-size:64px">🛴</div>
        <div style="font-size:22px;font-weight:800;color:var(--accent)">Promotor App</div>
        ${ui.spinner("Verificando acesso…")}
      </div>`);
  },

  renderAcesso(tipo, msg) {
    const configs = {
      negado:   { icon: "🔒", color: "var(--red)",    btn: false },
      expirado: { icon: "⏰", color: "var(--yellow)", btn: false },
      erro:     { icon: "📡", color: "var(--gray)",   btn: true  },
    };
    const { icon, color, btn } = configs[tipo] || configs.negado;

    ui.render(`
      <div class="screen no-bottom" style="align-items:center;justify-content:center;gap:20px;padding:32px">
        <div style="font-size:64px">${icon}</div>
        <div style="font-size:18px;font-weight:700;color:${color};text-align:center">${msg}</div>
        ${btn ? `<button class="btn btn-ghost" onclick="auth.init()">🔄 Tentar novamente</button>` : ""}
      </div>`);
  }
};


// ============================================================
// HOME SCREEN
// ============================================================

const homeScreen = {
  render() {
    const p    = state.get("promotor");
    const slot = state.get("slot");

    if (!p) { router.go("splash"); return; }

    const statusAtual = slot?.status || "SEM_SLOT";

    ui.render(`
      <div class="screen">
        <!-- Header -->
        <div class="header">
          <div style="font-size:28px">🛴</div>
          <div style="flex:1">
            <div class="header-title">${p.nome}</div>
            <div class="header-sub">${p.cidade}</div>
          </div>
          <div style="text-align:right">
            ${ui.statusBadge(statusAtual)}
          </div>
        </div>

        <div class="content">

          <!-- Score -->
          <div class="score-card">
            <div class="score-icon">⭐</div>
            <div>
              <div class="score-value">${p.score_atual || 0}</div>
              <div class="score-label">pontos · ${p.nivel_atual || "Bronze"}</div>
            </div>
            ${(p.badges_recentes || []).map(b =>
              `<span style="font-size:22px;margin-left:4px" title="${b.nome}">${b.icone || "🏅"}</span>`
            ).join("")}
          </div>

          <!-- Slot atual -->
          ${slot ? this._slotCard(slot) : this._semSlot()}

          <!-- Ações principais -->
          <div>
            <div class="section-label">Ações</div>
            ${this._acoes(statusAtual)}
          </div>

          <!-- Ações de navegação -->
          <div class="action-grid">
            <button class="action-btn" onclick="router.go('solicitacoes-lista')">
              <span class="icon">📋</span>Minhas Solicitações
            </button>
            <button class="action-btn" onclick="router.go('mapa')">
              <span class="icon">🗺️</span>Mapa
            </button>
            <button class="action-btn" onclick="router.go('historico')">
              <span class="icon">📊</span>Histórico
            </button>
            <button class="action-btn" onclick="router.go('vendas')">
              <span class="icon">💰</span>Vendas
            </button>
          </div>

        </div>
        ${ui.bottomNav("home")}
      </div>`);
  },

  _slotCard(slot) {
    return `
      <div class="slot-card" onclick="router.go('slot')" style="cursor:pointer">
        <div class="slot-card-top">
          <div class="slot-local">📍 ${slot.local || "—"}</div>
          ${ui.statusBadge(slot.status)}
        </div>
        <div class="slot-horario">
          🕐 ${ui.hora(slot.inicio)} – ${ui.hora(slot.fim)}
          &nbsp;·&nbsp; ${slot.tipo_atividade || "—"}
        </div>
        <div class="text2" style="font-size:12px">Toque para ver detalhes →</div>
      </div>`;
  },

  _semSlot() {
    return `
      <div class="card" style="text-align:center;gap:8px;display:flex;flex-direction:column;align-items:center">
        <div style="font-size:32px">📭</div>
        <div class="text2">Nenhum slot ativo no momento</div>
      </div>`;
  },

  _acoes(status) {
    const btns = {
      SEM_SLOT: [],
      ACEITO: [
        { label: "CHECK-IN", icon: "✅", cls: "btn-success", action: "router.go('checkin')", span: true }
      ],
      EM_ATIVIDADE: [
        { label: "Pausar", icon: "⏸️", cls: "btn-warning", action: "router.go('pausa')" },
        { label: "Check-out", icon: "🏁", cls: "btn-ghost", action: "router.go('checkout')" },
        { label: "Nova Solicitação", icon: "📋", cls: "btn-primary", action: "router.go('solicitacoes-nova')", span: true }
      ],
      PAUSADO: [
        { label: "Retomar", icon: "▶️", cls: "btn-success", action: "router.go('resume')" },
        { label: "Check-out", icon: "🏁", cls: "btn-ghost", action: "router.go('checkout')" }
      ],
      ENCERRADO: [
        { label: "Resultado de Vendas", icon: "💰", cls: "btn-primary", action: "router.go('vendas')", span: true }
      ],
      REALOCADO: [
        { label: "Ver novo slot", icon: "🔄", cls: "btn-purple", action: "router.go('slot')", span: true }
      ]
    };

    const lista = btns[status] || [];
    if (!lista.length) return "";

    return `
      <div class="action-grid" style="margin-top:0">
        ${lista.map(b => `
          <button class="btn ${b.cls} ${b.span ? "action-btn primary" : ""}"
                  onclick="${b.action}"
                  style="${b.span ? "" : "flex-direction:column;gap:6px;padding:16px 10px"}">
            <span>${b.icon}</span>${b.label}
          </button>`).join("")}
      </div>`;
  }
};


// ============================================================
// SLOT SCREEN — Detalhes do slot atual
// ============================================================

const slotScreen = {
  async render() {
    ui.render(`
      <div class="screen">
        ${ui.header("Meu Slot", "", true)}
        <div class="content">${ui.spinner("Carregando slot…")}</div>
      </div>`);

    try {
      const res = await api.get("GET_SLOT_ATUAL");

      if (!res.ok || !res.dados) {
        ui.render(`
          <div class="screen">
            ${ui.header("Meu Slot", "", true)}
            <div class="content">
              <div class="empty-state">
                <div class="empty-icon">📭</div>
                <div class="empty-label">Nenhum slot ativo no momento</div>
              </div>
            </div>
            ${ui.bottomNav("slot")}
          </div>`);
        return;
      }

      const slot = res.dados;
      state.set("slot", slot);

      ui.render(`
        <div class="screen">
          ${ui.header("Meu Slot", slot.cidade, true)}
          <div class="content">

            <!-- Status -->
            <div class="card" style="display:flex;align-items:center;justify-content:space-between">
              <span class="bold">Status</span>
              ${ui.statusBadge(slot.status)}
            </div>

            <!-- Detalhes -->
            <div class="card">
              <div class="card-title" style="margin-bottom:12px">Detalhes do Slot</div>

              <div class="info-row">
                <span class="info-label">Local</span>
                <span class="info-value">${slot.local}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Atividade</span>
                <span class="info-value">${slot.tipo_atividade || "—"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Início</span>
                <span class="info-value">${ui.hora(slot.inicio)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Fim</span>
                <span class="info-value">${ui.hora(slot.fim)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Raio</span>
                <span class="info-value">${slot.raio_metros || 50}m</span>
              </div>
              <div class="info-row">
                <span class="info-label">ID</span>
                <span class="info-value" style="font-size:12px;color:var(--text2)">${slot.slot_id}</span>
              </div>
              ${slot.observacoes ? `
              <div class="info-row" style="flex-direction:column;align-items:flex-start;gap:4px">
                <span class="info-label">Observações</span>
                <span style="font-size:14px">${slot.observacoes}</span>
              </div>` : ""}
            </div>

            <!-- Botão mapa -->
            ${slot.lat && slot.lng ? `
            <button class="btn btn-ghost" onclick="window.open('https://maps.google.com/?q=${slot.lat},${slot.lng}','_blank')">
              🗺️ Ver no Google Maps
            </button>` : ""}

            <!-- Ações por estado -->
            ${this._acoes(slot.status)}

          </div>
          ${ui.bottomNav("slot")}
        </div>`);

    } catch(e) {
      ui.render(`
        <div class="screen">
          ${ui.header("Meu Slot", "", true)}
          <div class="content">
            <div class="empty-state">
              <div class="empty-icon">📡</div>
              <div class="empty-label">Erro ao carregar. Verifique sua conexão.</div>
              <button class="btn btn-ghost btn-sm" onclick="slotScreen.render()">Tentar novamente</button>
            </div>
          </div>
        </div>`);
    }
  },

  _acoes(status) {
    const mapa = {
      ACEITO:       `<button class="btn btn-success" onclick="router.go('checkin')">✅ Fazer Check-in</button>`,
      EM_ATIVIDADE: `
        <button class="btn btn-warning" onclick="router.go('pausa')">⏸️ Pausar</button>
        <button class="btn btn-ghost"   onclick="router.go('checkout')">🏁 Check-out</button>
        <button class="btn btn-primary" onclick="router.go('solicitacoes-nova')">📋 Nova Solicitação</button>`,
      PAUSADO: `
        <button class="btn btn-success" onclick="router.go('resume')">▶️ Retomar</button>
        <button class="btn btn-ghost"   onclick="router.go('checkout')">🏁 Check-out</button>`,
      ENCERRADO: `
        <button class="btn btn-primary" onclick="router.go('vendas')">💰 Lançar Vendas</button>`,
    };
    const html = mapa[status];
    if (!html) return "";
    return `<div style="display:flex;flex-direction:column;gap:10px">${html}</div>`;
  }
};
