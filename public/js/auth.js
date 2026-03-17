// ── JET·OPS Auth & GPS ───────────────────────────────────────
'use strict';

const Auth = (() => {
  async function validar(token) {
    State.setToken(token);
    const res = await API.getMe();
    if (res.ok) {
      State.set('user', res.user);
      State.save();
    } else {
      State.clearToken();
    }
    return res;
  }

  function logout() {
    GPS.parar();
    State.clearToken();
    Router.go('login');
  }

  function isLogado() {
    return !!(State.get('token') && State.get('user'));
  }

  return { validar, logout, isLogado };
})();

// ── GPS ───────────────────────────────────────────────────────
const GPS = (() => {
  let _watchId = null;
  let _callbacks = [];

  function iniciar() {
    if (!navigator.geolocation) {
      _notify({ ok: false, erro: 'GPS não disponível' });
      return;
    }
    if (_watchId !== null) return; // já ativo

    _watchId = navigator.geolocation.watchPosition(
      pos => {
        const gps = {
          ok:       true,
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          isMock:   false,
        };
        State.patch('gps', gps);
        _notify(gps);
      },
      err => {
        const gps = { ok: false, erro: err.message };
        State.patch('gps', gps);
        _notify(gps);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
  }

  function parar() {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }
  }

  function onUpdate(fn) {
    _callbacks.push(fn);
    return () => { _callbacks = _callbacks.filter(f => f !== fn); };
  }

  function _notify(gps) {
    _callbacks.forEach(fn => fn(gps));
  }

  function haversineMetros(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const d1 = lat1 * Math.PI / 180, d2 = lat2 * Math.PI / 180;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(d1)*Math.cos(d2)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function trustScore({ accuracy, isMock }) {
    let s = 100;
    if (isMock)           s -= 80;
    if (accuracy > 500)   s -= 40;
    else if (accuracy > 200) s -= 20;
    else if (accuracy > 100) s -= 10;
    return Math.max(0, Math.min(100, s));
  }

  return { iniciar, parar, onUpdate, haversineMetros, trustScore };
})();

// ── Timer ─────────────────────────────────────────────────────
const Timer = (() => {
  let _startTs   = null;
  let _accumulated = 0;
  let _interval  = null;
  let _callbacks = [];

  function iniciar() {
    _startTs = Date.now();
    if (_interval) clearInterval(_interval);
    _interval = setInterval(() => {
      _callbacks.forEach(fn => fn(segundos()));
    }, 1000);
  }

  function pausar() {
    _accumulated += Math.floor((Date.now() - _startTs) / 1000);
    _startTs = null;
    if (_interval) { clearInterval(_interval); _interval = null; }
  }

  function retomar() {
    _startTs = Date.now();
    if (_interval) clearInterval(_interval);
    _interval = setInterval(() => {
      _callbacks.forEach(fn => fn(segundos()));
    }, 1000);
  }

  function parar() {
    pausar();
    _accumulated = 0;
  }

  function segundos() {
    const base = _accumulated;
    const running = _startTs ? Math.floor((Date.now() - _startTs) / 1000) : 0;
    return base + running;
  }

  function formatar(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
  }

  function onTick(fn) {
    _callbacks.push(fn);
    return () => { _callbacks = _callbacks.filter(f => f !== fn); };
  }

  return { iniciar, pausar, retomar, parar, segundos, formatar, onTick };
})();

// ── Toast ──────────────────────────────────────────────────────
const Toast = (() => {
  function show(msg, tipo = 'info', duracao = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, duracao);
  }
  const success = (m, d) => show(m, 'success', d);
  const error   = (m, d) => show(m, 'error', d);
  const info    = (m, d) => show(m, 'info', d);
  const warn    = (m, d) => show(m, 'warn', d);
  return { show, success, error, info, warn };
})();

// ── UI Helpers ────────────────────────────────────────────────
function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function formatHora(isoOrTime) {
  if (!isoOrTime) return '--:--';
  const s = String(isoOrTime);
  // Se for ISO, pegar HH:MM no fuso local
  if (s.includes('T') || s.includes('Z')) {
    const d = new Date(s);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return s.substring(0, 5);
}

function formatData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
