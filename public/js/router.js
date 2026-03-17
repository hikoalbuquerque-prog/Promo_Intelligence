const router = (() => {
  const _history = [];

  const routes = {
    splash:             () => auth.renderSplash(),
    home:               () => homeScreen.render(),
    slot:               () => slotScreen.render(),
    // Operação — cada sub-estado tem rota própria
    checkin:            () => operacao.renderCheckin(),
    'em-atividade':     () => operacao.renderAtivo(),
    pausa:              () => operacao.renderPausa(),
    pausado:            () => operacao.renderPausado(),
    resume:             () => operacao.renderPausado(), // compat
    checkout:           () => operacao.renderCheckout(),
    encerrado:          () => operacao.renderEncerrado(),
    operacao:           () => operacao.renderPorStatus(), // dispatch automático
    // Solicitações
    'solicitacoes-nova':  () => solicitacoes.renderNova(),
    'solicitacoes-lista': () => solicitacoes.renderLista(),
    'sol-realocacao':     () => solicitacoes.renderRealocacao(),
    'sol-reforco':        () => solicitacoes.renderReforco(),
    'sol-bateria':        () => solicitacoes.renderBateria(),
    'sol-ocorrencia':     () => solicitacoes.renderOcorrencia(),
    // Outros
    vendas:             () => vendas.render(),
    mapa:               () => mapa.render(),
    historico:          () => historico.render(),
  };

  return {
    go(screen, pushHistory = true) {
      // Limpar listeners de GPS/timer da tela anterior
      const gpsUnsub   = state.get('_gpsUnsub');
      const timerUnsub = state.get('_timerUnsub');
      if (typeof gpsUnsub   === 'function') { gpsUnsub();   state.set('_gpsUnsub', null); }
      if (typeof timerUnsub === 'function') { timerUnsub(); state.set('_timerUnsub', null); }

      const fn = routes[screen];
      if (!fn) { console.warn('Rota não encontrada:', screen); return; }
      if (pushHistory && state.get('currentScreen')) _history.push(state.get('currentScreen'));
      state.set('currentScreen', screen);
      fn();
      window.scrollTo(0, 0);
    },
    back() {
      const prev = _history.pop();
      this.go(prev || 'home', false);
    },
    replace(screen) {
      this.go(screen, false);
    }
  };
})();

window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  auth.init();
});
