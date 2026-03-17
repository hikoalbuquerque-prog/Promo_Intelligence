const solicitacoes = {
  renderNova() {
    ui.render(`
      <div class="screen">
        ${ui.header('Solicitar Suporte', '', true)}
        <div class="content">
          <div class="section-label">Tipo de solicitação</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="btn btn-ghost" onclick="solicitacoes.renderReforco()">🛴 Reforço de patinetes</button>
            <button class="btn btn-ghost" onclick="solicitacoes.renderBateria()">🔋 Troca de bateria</button>
            <button class="btn btn-ghost" onclick="solicitacoes.renderRealocacao()">📍 Solicitar realocação</button>
            <button class="btn btn-ghost" onclick="solicitacoes.renderOcorrencia()">⚠️ Registrar ocorrência</button>
          </div>
        </div>
      </div>
    `);
  },

  renderReforco()    { this._renderForm('REFORCO_PATINETES',  '🛴 Reforço de Patinetes',  'SOLICITAR_REFORCO_PATINETES'); },
  renderBateria()    { this._renderForm('TROCA_BATERIA',       '🔋 Troca de Bateria',       'SOLICITAR_TROCA_BATERIA'); },
  renderRealocacao() { this._renderForm('REALOCACAO',          '📍 Solicitar Realocação',   'SOLICITAR_REALOCACAO'); },
  renderOcorrencia() { this._renderForm('OCORRENCIA',          '⚠️ Registrar Ocorrência',   'REGISTRAR_OCORRENCIA'); },

  _renderForm(tipo, titulo, evento) {
    const jornada = state.loadJornada();
    const slot    = state.get('slot');
    ui.render(`
      <div class="screen">
        ${ui.header(titulo, '', true)}
        <div class="content">
          <div class="card">
            <div class="section-label" style="margin-bottom:8px">DESCRIÇÃO</div>
            <textarea id="sol-descricao" class="input" style="min-height:100px;resize:none;line-height:1.5"
              placeholder="Descreva brevemente a situação..."></textarea>
          </div>
          <button id="btn-sol" class="btn btn-primary" onclick="solicitacoes._enviar('${evento}', '${tipo}')">Enviar Solicitação</button>
          <button class="btn btn-ghost" onclick="router.back()">Cancelar</button>
        </div>
      </div>
    `);
  },

  async _enviar(evento, tipo) {
    const descricao = document.getElementById('sol-descricao')?.value?.trim() || '';
    const jornada   = state.loadJornada();
    const slot      = state.get('slot');

    ui.setLoading('btn-sol', true);
    try {
      const res = await api.post({
        evento,
        jornada_id:  jornada?.jornada_id || '',
        slot_id:     slot?.slot_id || '',
        descricao,
      });
      if (res.ok) {
        ui.toast('✅ Solicitação enviada!', 'success');
        router.go('em-atividade');
      } else {
        ui.toast('❌ ' + (res.erro || res.mensagem || 'Erro'), 'error');
        ui.setLoading('btn-sol', false);
      }
    } catch (_) {
      ui.toast('❌ Sem conexão.', 'error');
      ui.setLoading('btn-sol', false);
    }
  },

  renderLista() {
    ui.render(`<div class="screen">${ui.header('Minhas Solicitações', '', true)}<div class="content">${ui.spinner('Carregando…')}</div></div>`);
    api.get('GET_MINHAS_SOLICITACOES').then(res => {
      if (!res.ok || !res.solicitacoes?.length) {
        ui.render(`<div class="screen">${ui.header('Minhas Solicitações', '', true)}<div class="content"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-label">Nenhuma solicitação ainda</div></div></div></div>`);
        return;
      }
      const lista = res.solicitacoes.map(s => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-weight:700;font-size:14px">${s.tipo}</span>
            <span class="badge ${s.status === 'ATENDIDA' ? 'badge-green' : s.status === 'ABERTA' ? 'badge-blue' : 'badge-gray'}">${s.status}</span>
          </div>
          <div style="font-size:13px;color:var(--text2)">${s.descricao || '—'}</div>
        </div>`).join('');
      ui.render(`<div class="screen">${ui.header('Minhas Solicitações', '', true)}<div class="content">${lista}</div></div>`);
    }).catch(() => {
      ui.toast('Erro ao carregar.', 'error');
    });
  }
};
