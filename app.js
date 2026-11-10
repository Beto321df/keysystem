(() => {
  'use strict';
  const TOKEN_KEY = 'key-control.admin-token';
  const MAX_SECONDS = 365 * 24 * 60 * 60;
  const $ = (id) => document.getElementById(id);
  const fields = { days: $('days'), hours: $('hours'), minutes: $('minutes'), seconds: $('seconds') };
  let records = [];
  let toastTimer;
  let refreshing = false;
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';

  function prettyDuration(totalSeconds) {
    let rest = totalSeconds;
    const units = [['año', 31536000], ['día', 86400], ['hora', 3600], ['min', 60], ['seg', 1]];
    const parts = [];
    for (const [name, size] of units) {
      const amount = Math.floor(rest / size);
      if (amount) {
        rest %= size;
        const plural = amount === 1 ? name : ({ año: 'años', día: 'días', hora: 'horas' }[name] || `${name}s`);
        parts.push(`${amount} ${plural}`);
      }
    }
    return parts.join(' ') || '0 segundos';
  }

  function setDuration(seconds) {
    let rest = seconds;
    const d = Math.floor(rest / 86400); rest %= 86400;
    const h = Math.floor(rest / 3600); rest %= 3600;
    const m = Math.floor(rest / 60); const s = rest % 60;
    fields.days.value = d; fields.hours.value = h; fields.minutes.value = m; fields.seconds.value = s;
    updateDuration();
  }

  function durationSeconds() {
    return Number(fields.days.value || 0) * 86400 + Number(fields.hours.value || 0) * 3600 + Number(fields.minutes.value || 0) * 60 + Number(fields.seconds.value || 0);
  }

  function updateDuration() {
    const total = durationSeconds();
    document.querySelectorAll('.preset').forEach((button) => button.classList.toggle('selected', Number(button.dataset.seconds) === total));
    $('duration-preview').textContent = total > MAX_SECONDS ? 'Máximo: 1 año' : prettyDuration(total);
  }

  function dateTime(timestamp) {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
  }

  function remaining(timestamp) {
    const left = Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
    const days = Math.floor(left / 86400), hours = Math.floor((left % 86400) / 3600), minutes = Math.floor((left % 3600) / 60), seconds = left % 60;
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  async function request(method = 'GET', data = null, query = '') {
    const response = await fetch(`/api/admin/keys${query}`, {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token()}`, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new Error(payload.error || `Error HTTP ${response.status}`);
    return payload;
  }

  function setConnection(connected, label) {
    const pill = $('api-status');
    pill.innerHTML = `<span></span> ${connected ? 'FIREBASE ACTIVO' : escapeHTML(label || 'SIN CONEXIÓN')}`;
    pill.classList.toggle('api-offline', !connected);
    $('admin-auth').querySelector('span').textContent = connected ? 'Desconectar' : 'Conectar';
  }

  function showToast(message) {
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  async function copyKey(key) {
    try { await navigator.clipboard.writeText(key); }
    catch {
      const area = document.createElement('textarea'); area.value = key; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
    }
    showToast('Key copiada al portapapeles.');
  }

  function renderLatest() {
    const host = $('latest-content');
    const latest = records.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!latest) {
      host.className = 'latest-empty';
      host.innerHTML = '<div class="empty-art"><span>⌘</span><i></i></div><h3>Todo listo para empezar</h3><p>La próxima key que generes<br>aparecerá aquí.</p>';
      return;
    }
    host.className = 'latest-filled';
    const bindText = latest.bound ? `HWID ${escapeHTML(latest.hwid || 'vinculado')}` : 'Se vincula al primer uso';
    host.innerHTML = `<div class="latest-key"><small>KEY PREMIUM</small><code>${escapeHTML(latest.key)}</code></div><div class="latest-meta"><span>Vigencia: ${escapeHTML(prettyDuration(latest.durationSeconds))}</span><b>● ${escapeHTML(remaining(latest.expiresAt))}</b></div><div class="latest-bound">${bindText}</div><div class="latest-actions"><button class="small-btn main-action" data-copy="${escapeHTML(latest.key)}">Copiar key</button><button class="small-btn" data-delete="${escapeHTML(latest.key)}">Eliminar</button></div>`;
  }

  function renderTable() {
    const query = $('search').value.trim().toLowerCase();
    const shown = records.slice().sort((a, b) => b.createdAt - a.createdAt).filter((r) => !query || r.key.toLowerCase().includes(query));
    $('keys-body').innerHTML = shown.map((r) => {
      const binding = r.bound
        ? `<span class="badge active">AMARRADA</span><small class="bound-note">${escapeHTML(r.hwid || 'HWID registrado')}</small>`
        : '<span class="badge active">LIBRE · PRIMER USO</span>';
      return `<tr><td><div class="key-cell"><code>${escapeHTML(r.key)}</code><button class="copy-mini" data-copy="${escapeHTML(r.key)}" title="Copiar">▢</button></div></td><td class="date-cell">${escapeHTML(dateTime(r.createdAt))}</td><td class="duration-cell">${escapeHTML(prettyDuration(r.durationSeconds))}</td><td class="date-cell">${escapeHTML(dateTime(r.expiresAt))}</td><td>${binding}</td><td><div class="row-actions"><button class="delete-btn" data-delete="${escapeHTML(r.key)}" title="Eliminar key" aria-label="Eliminar ${escapeHTML(r.key)}">×</button></div></td></tr>`;
    }).join('');
    const empty = $('table-empty');
    empty.style.display = shown.length ? 'none' : 'flex';
    if (query && !shown.length) empty.innerHTML = '<span>⌕</span><b>Sin resultados</b><small>No hay keys que coincidan con esa búsqueda.</small>';
    else if (!records.length) empty.innerHTML = token()
      ? '<span>⌘</span><b>No hay keys todavía</b><small>Genera una key para verla aquí.</small>'
      : '<span>⌑</span><b>Conecta el panel</b><small>Usa tu llave de administración para cargar las keys.</small>';
  }

  function renderStats() {
    const now = Date.now();
    $('stat-total').textContent = records.length;
    $('stat-active').textContent = records.filter((r) => r.expiresAt > now).length;
    $('stat-soon').textContent = records.filter((r) => r.expiresAt - now <= 86400000).length;
    $('nav-count').textContent = records.length;
    $('key-count-label').textContent = `(${records.length})`;
  }

  function render() { renderStats(); renderLatest(); renderTable(); }

  async function refresh() {
    if (!token() || refreshing) return;
    refreshing = true;
    try {
      const payload = await request('GET');
      records = Array.isArray(payload.keys) ? payload.keys : [];
      setConnection(true); render();
    } catch (error) {
      if (/administración inválida|no autorizado/i.test(error.message)) sessionStorage.removeItem(TOKEN_KEY);
      setConnection(false, 'API SIN RESPUESTA'); render();
    } finally { refreshing = false; }
  }

  function openAuth() {
    $('admin-secret').value = token();
    $('auth-modal').classList.add('open'); $('auth-modal').setAttribute('aria-hidden', 'false');
    if (!token()) $('admin-secret').focus();
  }

  function closeAuth() { $('auth-modal').classList.remove('open'); $('auth-modal').setAttribute('aria-hidden', 'true'); }

  async function connect() {
    const candidate = $('admin-secret').value.trim();
    if (!candidate) return showToast('Pega la llave de administración.');
    sessionStorage.setItem(TOKEN_KEY, candidate);
    $('auth-submit').disabled = true;
    try {
      const payload = await request('GET');
      records = Array.isArray(payload.keys) ? payload.keys : [];
      closeAuth(); setConnection(true); render(); showToast('Panel conectado a Firebase.');
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY); setConnection(false, 'SIN CONEXIÓN');
      showToast(error.message || 'No se pudo conectar con el servidor.');
    } finally { $('auth-submit').disabled = false; }
  }

  async function deleteKey(key) {
    if (!token()) return openAuth();
    try {
      await request('DELETE', null, `?key=${encodeURIComponent(key)}`);
      records = records.filter((record) => record.key !== key); render(); showToast('Key eliminada de Firebase.');
    } catch (error) { showToast(error.message); }
  }

  $('today-label').textContent = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  document.querySelectorAll('.preset').forEach((button) => button.addEventListener('click', () => setDuration(Number(button.dataset.seconds))));
  Object.values(fields).forEach((field) => field.addEventListener('input', () => {
    const max = Number(field.max), min = Number(field.min);
    if (field.value !== '') field.value = Math.max(min, Math.min(max, Math.floor(Number(field.value) || 0)));
    updateDuration();
  }));
  $('generate').addEventListener('click', async () => {
    if (!token()) return openAuth();
    const durationSeconds = durationSecondsFn();
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1) return showToast('Elige una duración de al menos 1 segundo.');
    if (durationSeconds > MAX_SECONDS) return showToast('La duración máxima es 1 año.');
    const button = $('generate'); button.disabled = true;
    try {
      const created = await request('POST', { durationSeconds });
      records.unshift({ key: created.key, createdAt: created.createdAt, expiresAt: created.expiresAt, durationSeconds: created.durationSeconds, bound: false, hwid: '' });
      render();
      $('new-key-value').textContent = created.key; $('new-key-expiry').textContent = dateTime(created.expiresAt);
      $('modal').classList.add('open'); $('modal').setAttribute('aria-hidden', 'false');
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });
  function durationSecondsFn() { return Number(fields.days.value || 0) * 86400 + Number(fields.hours.value || 0) * 3600 + Number(fields.minutes.value || 0) * 60 + Number(fields.seconds.value || 0); }
  $('search').addEventListener('input', renderTable);
  $('admin-auth').addEventListener('click', () => {
    if (token()) { sessionStorage.removeItem(TOKEN_KEY); records = []; render(); setConnection(false, 'SIN CONEXIÓN'); showToast('Sesión de administración cerrada.'); }
    else openAuth();
  });
  $('auth-submit').addEventListener('click', connect);
  $('admin-secret').addEventListener('keydown', (event) => { if (event.key === 'Enter') connect(); });
  document.addEventListener('click', (event) => {
    const copyButton = event.target.closest('[data-copy]');
    if (copyButton) copyKey(copyButton.dataset.copy);
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) deleteKey(deleteButton.dataset.delete);
    if (event.target.closest('[data-close]')) { $('modal').classList.remove('open'); $('modal').setAttribute('aria-hidden', 'true'); }
    if (event.target.closest('[data-auth-close]')) closeAuth();
  });
  $('copy-new').addEventListener('click', () => copyKey($('new-key-value').textContent));
  $('modal-done').addEventListener('click', () => { $('modal').classList.remove('open'); $('modal').setAttribute('aria-hidden', 'true'); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { $('modal').classList.remove('open'); $('modal').setAttribute('aria-hidden', 'true'); closeAuth(); }
  });
  setInterval(() => { if (token()) refresh(); }, 30000);
  updateDuration(); render();
  if (token()) refresh(); else { setConnection(false, 'SIN CONEXIÓN'); openAuth(); }
})();
