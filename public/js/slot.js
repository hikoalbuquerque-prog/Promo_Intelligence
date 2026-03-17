const slotScreen = {
  async render() {
    ui.render(`<div class="screen">${ui.header('Meu Slot', '', true)}<div class="content">${ui.spinner('Carregando slot…')}</div></div>`);
    try {
      const res = await api.get('GET_SLOT_ATUAL');
      if (!res.ok || !res.dados) {
        ui.render(`<div class="screen">${ui.header('Meu Slot', '', true)}<div class="content"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-label">Nenhum slot ativo no momento</div></div></div>${ui.bottomNav('slot')}</div>`);
        return;
      }
      const slot = res.dados;
      state.set('slot', slot);
      ui.render(`<div class="screen">${ui.header('Meu Slot', slot.cidade || '', true)}<div class="content"><div class="card" style="display:flex;align-items:center;justify-content:space-between"><span class="bold">Status</span>${ui.statusBadge(slot.status)}</div><div class="card"><div class="info-row"><span class="info-label">Local</span><span class="info-value">${slot.local || '—'}</span></div><div class="info-row"><span class="info-label">Atividade</span><span class="info-value">${slot.tipo_atividade || '—'}</span></div><div class="info-row"><span class="info-label">Início</span><span class="info-value">${ui.hora(slot.inicio)}</span></div><div class="info-row"><span class="info-label">Fim</span><span class="info-value">${ui.hora(slot.fim)}</span></div><div class="info-row"><span class="info-label">Raio</span><span class="info-value">${slot.raio_metros || 50}m</span></div></div>${slot.lat&&slot.lng?`<button class="btn btn-ghost" onclick="window.open('https://maps.google.com/?q=${slot.lat},${slot.lng}','_blank')">🗺️ Ver no Google Maps</button>`:''}</div>${ui.bottomNav('slot')}</div>`);
    } catch(_) {
      ui.render(`<div class="screen">${ui.header('Meu Slot', '', true)}<div class="content"><div class="empty-state"><div class="empty-icon">📡</div><div class="empty-label">Erro ao carregar. Verifique sua conexão.</div></div></div></div>`);
    }
  }
};
