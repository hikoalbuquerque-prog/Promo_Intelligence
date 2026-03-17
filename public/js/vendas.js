const vendas = {
  render() {
    const jornada = state.loadJornada();
    const slot    = state.get('slot');
    ui.render(`
      <div class="screen">
        ${ui.header('Registrar Resultado', '', true)}
        <div class="content">
          <div class="card">
            <div class="section-label" style="margin-bottom:8px">QUANTIDADE DE ATIVAÇÕES</div>
            <input id="vendas-qty" class="input" type="number" min="0" placeholder="0" style="font-size:24px;text-align:center;font-weight:700">
          </div>
          <div class="card">
            <div class="section-label" style="margin-bottom:8px">OBSERVAÇÃO (opcional)</div>
            <textarea id="vendas-obs" class="input" style="min-height:80px;resize:none;line-height:1.5"
              placeholder="Detalhes sobre os resultados..."></textarea>
          </div>
          <button id="btn-vendas" class="btn btn-primary" onclick="vendas._enviar()">Registrar Resultado</button>
          <button class="btn btn-ghost" onclick="router.back()">Cancelar</button>
        </div>
      </div>
    `);
  },

  async _enviar() {
    const qty     = parseInt(document.getElementById('vendas-qty')?.value || '0');
    const obs     = document.getElementById('vendas-obs')?.value?.trim() || '';
    const jornada = state.loadJornada();
    const slot    = state.get('slot');

    if (!qty && qty !== 0) { ui.toast('Informe a quantidade', 'warning'); return; }

    ui.setLoading('btn-vendas', true);
    try {
      const res = await api.post({
        evento:         'REGISTRAR_RESULTADO_VENDAS',
        jornada_id:     jornada?.jornada_id || '',
        slot_id:        slot?.slot_id || '',
        tipo_resultado: 'ATIVACAO',
        quantidade:     qty,
        observacao:     obs,
      });
      if (res.ok) {
        ui.toast('✅ Resultado registrado!', 'success');
        router.go('em-atividade');
      } else {
        ui.toast('❌ ' + (res.erro || res.mensagem || 'Erro'), 'error');
        ui.setLoading('btn-vendas', false);
      }
    } catch (_) {
      ui.toast('❌ Sem conexão.', 'error');
      ui.setLoading('btn-vendas', false);
    }
  }
};
