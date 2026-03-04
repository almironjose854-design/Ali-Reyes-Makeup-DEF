let turnos = [];
let usuario = null;
let colaboradoresDisponibles = [];
let configColab = {};
let mesActualColab = new Date();
let fechaSeleccionadaColab = '';
let timerServicioHandle = null;

const seccionesColab = ['resumen', 'pendientes', 'terminados', 'agenda'];
const ESTADOS_COLAB = ['pendiente', 'confirmado', 'en_camino', 'en_servicio', 'no_show', 'finalizado', 'cancelado', 'en_progreso', 'completado'];
const ESTADOS_ALIAS_COLAB = { en_progreso: 'en_servicio', completado: 'finalizado' };

document.addEventListener('DOMContentLoaded', async () => {
  await initColaborador();
});

window.addEventListener('beforeunload', () => {
  if (timerServicioHandle) clearInterval(timerServicioHandle);
});

async function initColaborador() {
  try {
    const auth = await fetch('/api/check-auth');
    if (auth.status === 401) {
      window.location.href = '/login.html';
      return;
    }

    const data = await auth.json();
    if (!data.authenticated || data.user?.rol !== 'colaborador') {
      window.location.href = '/admin';
      return;
    }

    usuario = data.user;
    renderHero();
    mostrarSeccionColab('resumen');
    await cargarTurnosColaborador();
  } catch (error) {
    mostrarAviso('Error verificando sesion', 'error');
  }
}

function mostrarSeccionColab(seccion) {
  const actual = seccionesColab.includes(seccion) ? seccion : 'resumen';

  seccionesColab.forEach(id => {
    const section = document.getElementById(`${id}Section`);
    if (section) section.style.display = id === actual ? 'block' : 'none';
  });

  document.querySelectorAll('.admin-nav .nav-item[data-seccion]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-seccion') === actual);
  });

  document.querySelectorAll('.quick-card[data-seccion]').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-seccion') === actual);
  });

  const titulo = document.getElementById('colabTitulo');
  const subtitulo = document.getElementById('colabSubtitulo');
  const nombre = usuario?.nombre || usuario?.username || 'Colaborador';

  const titulos = {
    resumen: `Resumen de ${nombre}`,
    pendientes: 'Turnos pendientes',
    terminados: 'Turnos terminados',
    agenda: 'Agenda colaborador'
  };

  const subtitulos = {
    resumen: 'Operacion diaria priorizada para el colaborador.',
    pendientes: 'Gestiona estados y reasigna turnos cuando sea necesario.',
    terminados: 'Comisiones y total generado solo por trabajos finalizados.',
    agenda: 'Calendario mensual y vista cronologica de tus proximos turnos.'
  };

  if (titulo) titulo.textContent = titulos[actual] || titulos.resumen;
  if (subtitulo) subtitulo.textContent = subtitulos[actual] || subtitulos.resumen;

  if (actual === 'agenda') {
    renderCalendarioMensualColab();
    renderAgendaDiaSeleccionado();
    renderCalendarioColaborador();
    renderHuecosDisponibles();
  }
}

function renderHero() {
  const nombre = usuario?.nombre || usuario?.username || 'Colaborador';
  const nombreEl = document.getElementById('colabNombre');
  if (nombreEl) nombreEl.textContent = nombre;

  const userEl = document.getElementById('colabUsuario');
  if (userEl) userEl.textContent = usuario?.username ? `Usuario: ${usuario.username}` : '';

  const avatar = document.getElementById('colabAvatar');
  const iniciales = nombre
    .split(' ')
    .map(parte => parte[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (avatar) {
    if (usuario?.foto) {
      avatar.style.backgroundImage = `url('${usuario.foto}')`;
      avatar.textContent = '';
      avatar.classList.add('colab-avatar-img');
    } else {
      avatar.textContent = iniciales || 'AR';
      avatar.style.backgroundImage = '';
      avatar.classList.remove('colab-avatar-img');
    }
  }

  const colorBadge = document.getElementById('colabColorBadge');
  if (colorBadge) {
    const color = usuario?.color || '#0f766e';
    colorBadge.textContent = 'Color agenda';
    colorBadge.style.borderColor = color;
    colorBadge.style.color = color;
  }

  const serviciosEl = document.getElementById('colabServicios');
  if (serviciosEl) {
    const especialidades = Array.isArray(usuario?.especialidades) ? usuario.especialidades : [];
    serviciosEl.textContent = especialidades.length
      ? `Especialidades: ${especialidades.join(', ')}`
      : 'Disponible para varios servicios';
  }

  const telEl = document.getElementById('colabTelefono');
  if (telEl) telEl.textContent = usuario?.telefono || 'Sin telefono';

  const mailEl = document.getElementById('colabEmail');
  if (mailEl) mailEl.textContent = usuario?.email || 'Sin email';
}

async function cargarTurnosColaborador() {
  try {
    const [resTurnos, resColabs, resConfig] = await Promise.all([
      fetch('/api/turnos'),
      fetch('/api/colaboradores?public=1'),
      fetch('/api/config')
    ]);

    if (resTurnos.status === 401) {
      window.location.href = '/login.html';
      return;
    }

    turnos = resTurnos.ok ? await resTurnos.json() : [];
    colaboradoresDisponibles = resColabs.ok ? await resColabs.json() : [];
    configColab = resConfig.ok ? await resConfig.json() : {};

    if (!Array.isArray(turnos)) turnos = [];
    if (!Array.isArray(colaboradoresDisponibles)) colaboradoresDisponibles = [];
    if (!configColab || typeof configColab !== 'object') configColab = {};
  } catch {
    turnos = [];
    colaboradoresDisponibles = [];
    configColab = {};
  } finally {
    if (!fechaSeleccionadaColab) fechaSeleccionadaColab = toDateISO(new Date());
    renderStatsColaborador();
    renderMetasColaborador();
    renderTopServiciosColaborador();
    renderTurnosPendientes();
    renderTurnosTerminados();
    renderCalendarioColaborador();
    renderCalendarioMensualColab();
    renderAgendaDiaSeleccionado();
    renderHuecosDisponibles();
    iniciarTimerServicios();
  }
}

function obtenerTurnosPendientes() {
  return turnos.filter(t => {
    const estado = normalizarEstado(t.estado);
    return !['cancelado', 'finalizado', 'no_show'].includes(estado);
  });
}

function obtenerTurnosTerminados() {
  return turnos.filter(t => normalizarEstado(t.estado) === 'finalizado');
}

function ordenarPorFechaHora(lista, direccion = 'asc') {
  const sorted = [...lista].sort((a, b) => {
    const fa = new Date(`${a.fecha || '1970-01-01'}T${a.hora || '00:00'}`).getTime();
    const fb = new Date(`${b.fecha || '1970-01-01'}T${b.hora || '00:00'}`).getTime();
    return fa - fb;
  });
  return direccion === 'desc' ? sorted.reverse() : sorted;
}

function renderStatsColaborador() {
  const container = document.getElementById('colabStats');
  if (!container) return;

  const pendientes = obtenerTurnosPendientes();
  const terminados = obtenerTurnosTerminados();
  const hoy = toDateISO(new Date());
  const ahora = new Date();
  const limite = new Date();
  limite.setDate(ahora.getDate() + 7);

  const pendientesHoy = pendientes.filter(t => t.fecha === hoy).length;
  const pendientesSemana = pendientes.filter(t => {
    const fecha = new Date(`${t.fecha || ''}T00:00:00`);
    return !Number.isNaN(fecha.getTime()) && fecha >= ahora && fecha <= limite;
  }).length;

  const totalGenerado = terminados.reduce((acc, t) => acc + (parseInt(t.precio, 10) || 0), 0);
  const totalComision = terminados.reduce((acc, t) => acc + (parseInt(t.colaboradorComision, 10) || 0), 0);
  const clientesAtendidos = new Set(
    terminados
      .map(t => t.telefono || t.ci || t.nombre || '')
      .filter(Boolean)
  ).size;

  const stats = [
    { label: 'Pendientes', value: pendientes.length, icon: 'fa-list-check', color: '#0f766e', bg: 'rgba(15,118,110,0.12)' },
    { label: 'Pendientes hoy', value: pendientesHoy, icon: 'fa-sun', color: '#c7a36a', bg: 'rgba(199,163,106,0.18)' },
    { label: 'Prox. 7 dias', value: pendientesSemana, icon: 'fa-calendar-week', color: '#4f46e5', bg: 'rgba(79,70,229,0.12)' },
    { label: 'Terminados', value: terminados.length, icon: 'fa-circle-check', color: '#1b5e20', bg: 'rgba(76,175,80,0.18)' },
    { label: 'Total generado', value: `${totalGenerado.toLocaleString('es-PY')} Gs`, icon: 'fa-coins', color: '#0ea5e9', bg: 'rgba(14,165,233,0.14)' },
    { label: 'Comision', value: `${totalComision.toLocaleString('es-PY')} Gs`, icon: 'fa-hand-holding-dollar', color: '#f97316', bg: 'rgba(249,115,22,0.14)' },
    { label: 'Clientes atendidos', value: clientesAtendidos, icon: 'fa-users', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' }
  ];

  container.innerHTML = stats.map(item => `
    <div class="stat-card stat-card-colab">
      <div class="stat-icon" style="background:${item.bg};color:${item.color};"><i class="fas ${item.icon}"></i></div>
      <div>
        <span class="stat-label">${item.label}</span>
        <h3>${item.value}</h3>
      </div>
    </div>
  `).join('');

  const terminadosCount = document.getElementById('colabTerminadosCount');
  const generadoTotal = document.getElementById('colabGeneradoTotal');
  const comisionTotal = document.getElementById('colabComisionTotal');

  if (terminadosCount) terminadosCount.textContent = String(terminados.length);
  if (generadoTotal) generadoTotal.textContent = `${totalGenerado.toLocaleString('es-PY')} Gs`;
  if (comisionTotal) comisionTotal.textContent = `${totalComision.toLocaleString('es-PY')} Gs`;
}

function rangoSemanaActual() {
  const hoy = new Date();
  const inicio = new Date(hoy);
  const day = (hoy.getDay() + 6) % 7;
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(hoy.getDate() - day);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

function rangoMesActual() {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0, 0);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999);
  return { inicio, fin };
}

function calcularComisionEnRango(inicio, fin) {
  return obtenerTurnosTerminados().reduce((acc, t) => {
    const fechaHora = new Date(`${t.fecha || ''}T${t.hora || '00:00'}`);
    if (Number.isNaN(fechaHora.getTime())) return acc;
    if (fechaHora < inicio || fechaHora > fin) return acc;
    return acc + (parseInt(t.colaboradorComision, 10) || 0);
  }, 0);
}

function renderMetasColaborador() {
  const box = document.getElementById('colabMetasProgreso');
  if (!box) return;
  const metas = configColab?.metasColaborador || {};
  const metaSemanal = parseInt(metas.semanalComision, 10) || 0;
  const metaMensual = parseInt(metas.mensualComision, 10) || 0;
  const semana = rangoSemanaActual();
  const mes = rangoMesActual();
  const actualSemanal = calcularComisionEnRango(semana.inicio, semana.fin);
  const actualMensual = calcularComisionEnRango(mes.inicio, mes.fin);
  const pctSemanal = metaSemanal > 0 ? Math.min(100, Math.round((actualSemanal / metaSemanal) * 100)) : 0;
  const pctMensual = metaMensual > 0 ? Math.min(100, Math.round((actualMensual / metaMensual) * 100)) : 0;

  box.innerHTML = `
    <article class="colab-meta-progress">
      <div><strong>Meta semanal</strong> · ${actualSemanal.toLocaleString('es-PY')} / ${metaSemanal.toLocaleString('es-PY')} Gs</div>
      <div class="colab-progress-track"><div class="colab-progress-fill" style="width:${pctSemanal}%"></div></div>
      <small>${pctSemanal}% completado</small>
    </article>
    <article class="colab-meta-progress">
      <div><strong>Meta mensual</strong> · ${actualMensual.toLocaleString('es-PY')} / ${metaMensual.toLocaleString('es-PY')} Gs</div>
      <div class="colab-progress-track"><div class="colab-progress-fill" style="width:${pctMensual}%"></div></div>
      <small>${pctMensual}% completado</small>
    </article>
  `;
}

function renderTopServiciosColaborador() {
  const box = document.getElementById('colabTopServicios');
  if (!box) return;
  const map = {};
  obtenerTurnosTerminados().forEach(turno => {
    const servicios = (turno.servicios || []).length
      ? turno.servicios
      : (turno.servicio ? [{ nombre: turno.servicio }] : []);
    servicios.forEach(servicio => {
      const nombre = servicio.nombre || 'Servicio';
      map[nombre] = (map[nombre] || 0) + 1;
    });
  });
  const top = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  box.innerHTML = top.length
    ? top.map(([name, count]) => `<li>${escapeHtml(name)} <span>${count}</span></li>`).join('')
    : '<li>Sin servicios finalizados todav&iacute;a.</li>';
}

function minutosDesdeHoraLocal(hora) {
  if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) return null;
  const [h, m] = String(hora).split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h * 60) + m;
}

function obtenerHorarioPorFechaColab(fecha) {
  const cfg = configColab || {};
  const horarios = cfg.horariosPorDia || {};
  const baseA = cfg.horarioApertura || '09:00';
  const baseC = cfg.horarioCierre || '19:00';
  const date = new Date(`${fecha}T00:00:00`);
  const day = Number.isNaN(date.getTime()) ? 1 : date.getDay();
  const key = day === 0 ? 'dom' : (day === 6 ? 'sab' : 'lunVie');
  const item = horarios[key] || {};
  const activo = item.activo !== false;
  const apertura = item.apertura || baseA;
  const cierre = item.cierre || baseC;
  const inicio = minutosDesdeHoraLocal(apertura);
  const fin = minutosDesdeHoraLocal(cierre);
  if (!activo || inicio === null || fin === null || inicio >= fin) {
    return { activo: false, inicio: 0, fin: 0 };
  }
  return { activo: true, inicio, fin };
}

function obtenerBloqueosFechaColab(fecha) {
  const bloqueos = Array.isArray(configColab?.bloqueosAgenda) ? configColab.bloqueosAgenda : [];
  return bloqueos.filter(item => item.fecha === fecha);
}

function renderHuecosDisponibles() {
  const listResumen = document.getElementById('colabHuecosResumen');
  const listDetalle = document.getElementById('colabHuecosDisponibles');
  if (!listResumen && !listDetalle) return;
  const hoy = new Date();
  const intervalo = parseInt(configColab?.intervaloTurnos, 10) || 30;
  const items = [];
  for (let i = 0; i < 7; i++) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() + i);
    const iso = toDateISO(fecha);
    const horario = obtenerHorarioPorFechaColab(iso);
    if (!horario.activo) {
      items.push({ fecha: iso, texto: 'Cerrado', slots: 0 });
      continue;
    }
    const totalJornada = horario.fin - horario.inicio;
    const bloqueos = obtenerBloqueosFechaColab(iso);
    const bloqueado = bloqueos.reduce((acc, item) => {
      const desde = minutosDesdeHoraLocal(item.desde);
      const hasta = minutosDesdeHoraLocal(item.hasta);
      if (desde === null || hasta === null) return acc;
      return acc + Math.max(0, Math.min(horario.fin, hasta) - Math.max(horario.inicio, desde));
    }, 0);
    const ocupados = turnos
      .filter(t => t.fecha === iso && normalizarEstado(t.estado) !== 'cancelado')
      .reduce((acc, t) => acc + (parseInt(t.duracion, 10) || 0), 0);
    const libres = Math.max(0, totalJornada - bloqueado - ocupados);
    const slots = Math.floor(libres / Math.max(5, intervalo));
    items.push({ fecha: iso, texto: `${libres} min libres`, slots });
  }

  const htmlList = items.map(item => `<li><strong>${formatDateDisplay(item.fecha)}</strong> · ${item.texto} (${item.slots} slot${item.slots !== 1 ? 's' : ''})</li>`).join('');
  if (listResumen) listResumen.innerHTML = htmlList || '<li>Sin datos de disponibilidad.</li>';
  if (listDetalle) {
    listDetalle.innerHTML = items.length
      ? items.map(item => `<article class="proximo-item card-soft"><strong>${formatDateDisplay(item.fecha)}</strong><p class="muted">${item.texto}. Slots estimados: ${item.slots}</p></article>`).join('')
      : '<div class="alert alert-info">Sin datos de disponibilidad.</div>';
  }
}

function formatearDuracion(ms) {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(totalSeg / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeg % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeg % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function actualizarTimerServicios() {
  const ahora = Date.now();
  obtenerTurnosPendientes().forEach(turno => {
    const timerEl = document.getElementById(`timer-${normalizarId(turno.id)}`);
    if (!timerEl) return;
    if (!turno.checkInAt) {
      timerEl.textContent = 'Sin iniciar';
      return;
    }
    const inicio = new Date(turno.checkInAt).getTime();
    const fin = turno.checkOutAt ? new Date(turno.checkOutAt).getTime() : ahora;
    if (Number.isNaN(inicio) || Number.isNaN(fin)) {
      timerEl.textContent = 'Sin iniciar';
      return;
    }
    timerEl.textContent = formatearDuracion(fin - inicio);
  });
}

function iniciarTimerServicios() {
  if (timerServicioHandle) clearInterval(timerServicioHandle);
  actualizarTimerServicios();
  timerServicioHandle = setInterval(actualizarTimerServicios, 1000);
}

function obtenerPendientesFiltrados() {
  const texto = (document.getElementById('colabFiltroPendientesTexto')?.value || '').trim().toLowerCase();
  const estadoRaw = (document.getElementById('colabFiltroPendientesEstado')?.value || '').trim();
  const estado = estadoRaw ? normalizarEstado(estadoRaw) : '';
  const rango = document.getElementById('colabFiltroPendientesRango')?.value || 'todos';
  const hoy = new Date();
  const hoyIso = toDateISO(hoy);
  const limite7 = new Date(hoy);
  limite7.setDate(hoy.getDate() + 7);

  return obtenerTurnosPendientes().filter(turno => {
    if (estado && normalizarEstado(turno.estado) !== estado) return false;
    if (texto) {
      const servicios = (turno.servicios || []).map(s => s.nombre).join(', ') || turno.servicio || '';
      const target = `${turno.nombre || ''} ${turno.telefono || ''} ${servicios}`.toLowerCase();
      if (!target.includes(texto)) return false;
    }
    if (rango === 'hoy') return turno.fecha === hoyIso;
    if (rango === '7dias') {
      const fecha = new Date(`${turno.fecha || ''}T00:00:00`);
      return !Number.isNaN(fecha.getTime()) && fecha >= new Date(`${hoyIso}T00:00:00`) && fecha <= limite7;
    }
    return true;
  });
}

function actualizarFiltrosPendientes() {
  renderTurnosPendientes();
}

function limpiarFiltrosPendientes() {
  const txt = document.getElementById('colabFiltroPendientesTexto');
  const estado = document.getElementById('colabFiltroPendientesEstado');
  const rango = document.getElementById('colabFiltroPendientesRango');
  if (txt) txt.value = '';
  if (estado) estado.value = '';
  if (rango) rango.value = 'todos';
  renderTurnosPendientes();
}

function renderTurnosPendientes() {
  const tbody = document.getElementById('colabTurnosPendientes');
  const info = document.getElementById('colabPendientesCountInfo');
  if (!tbody) return;

  const pendientes = ordenarPorFechaHora(obtenerPendientesFiltrados(), 'asc');
  if (info) info.textContent = `${pendientes.length} turno(s) en la vista actual.`;
  if (!pendientes.length) {
    tbody.innerHTML = '<tr><td colspan="8">No tienes turnos pendientes.</td></tr>';
    return;
  }

  tbody.innerHTML = pendientes.map(turno => {
    const estado = normalizarEstado(turno.estado);
    const serviciosTag = (turno.servicios || []).length
      ? (turno.servicios || []).map(servicio => `<span class="tag">${escapeHtml(servicio.nombre || '')}</span>`).join('')
      : '<span class="tag">Sin detalle</span>';

    const precio = parseInt(turno.precio, 10) || 0;
    const selectId = `reasignar-${normalizarId(turno.id)}`;
    const normId = normalizarId(turno.id);
    const reprogFechaId = `reprog-fecha-${normId}`;
    const reprogHoraId = `reprog-hora-${normId}`;
    const notaId = `nota-${normId}`;
    const timerId = `timer-${normId}`;
    const opcionesColab = colaboradoresDisponibles.length
      ? colaboradoresDisponibles.map(colab => {
          const seleccionado = turno.colaboradorId === colab.id ? 'selected' : '';
          return `<option value="${escapeHtml(colab.id)}" ${seleccionado}>${escapeHtml(colab.nombre || 'Colaborador')}</option>`;
        }).join('')
      : '<option value="">Sin colaboradores</option>';
    const opcionesEstado = ESTADOS_COLAB
      .filter(op => !['en_progreso', 'completado'].includes(op))
      .map(op => `<option value="${op}" ${op === estado ? 'selected' : ''}>${op.replace('_', ' ')}</option>`)
      .join('');
    const btnCheckIn = turno.checkInAt ? 'disabled' : '';
    const btnCheckOut = (!turno.checkInAt || turno.checkOutAt) ? 'disabled' : '';

    return `
      <tr>
        <td><strong>${escapeHtml(turno.nombre || '')}</strong><br><small>${escapeHtml(turno.telefono || '')}</small></td>
        <td class="tags-cell">${serviciosTag}</td>
        <td>${escapeHtml(turno.fecha || '')}</td>
        <td>${escapeHtml(turno.hora || '')}</td>
        <td>${precio.toLocaleString('es-PY')} Gs</td>
        <td><span class="status-pill ${estado}">${estado.replace('_', ' ')}</span></td>
        <td>
          <div class="table-actions">
            <select class="form-control form-control-sm" id="${selectId}">
              ${opcionesColab}
            </select>
            <button class="btn btn-secondary" type="button" onclick="reasignarTurnoColab('${escapeHtml(turno.id)}','${selectId}')">
              <i class="fas fa-arrow-right-arrow-left"></i> Mover
            </button>
          </div>
        </td>
        <td>
          <div class="table-actions">
            <select class="form-control form-control-sm" onchange="actualizarEstadoColab('${escapeHtml(turno.id)}', this.value)">
              ${opcionesEstado}
            </select>
            <button class="btn btn-primary" type="button" onclick="actualizarEstadoColab('${escapeHtml(turno.id)}', 'finalizado')">Terminado</button>
            <button class="btn btn-secondary" type="button" onclick="actualizarEstadoColab('${escapeHtml(turno.id)}', 'no_show')">No-show</button>
            <button class="btn btn-secondary" type="button" onclick="actualizarEstadoColab('${escapeHtml(turno.id)}', 'cancelado')">Cancelar</button>
          </div>
          <div class="colab-row-stack">
            <div class="colab-inline-form">
              <span class="service-timer" id="${timerId}">Sin iniciar</span>
              <button class="btn btn-secondary" type="button" ${btnCheckIn} onclick="marcarCheckInTurno('${escapeHtml(turno.id)}')">Check-in</button>
              <button class="btn btn-secondary" type="button" ${btnCheckOut} onclick="marcarCheckOutTurno('${escapeHtml(turno.id)}')">Check-out</button>
            </div>
            <div class="colab-inline-form">
              <input type="date" id="${reprogFechaId}" class="form-control form-control-sm" value="${escapeHtml(turno.fecha || '')}" />
              <input type="time" id="${reprogHoraId}" class="form-control form-control-sm" value="${escapeHtml(turno.hora || '')}" />
              <button class="btn btn-secondary" type="button" onclick="reprogramarTurnoColab('${escapeHtml(turno.id)}','${reprogFechaId}','${reprogHoraId}')">Reprogramar</button>
            </div>
            <div class="colab-inline-form">
              <input type="text" id="${notaId}" class="form-control form-control-sm" value="${escapeHtml(turno.notaInterna || '')}" placeholder="Nota interna" />
              <button class="btn btn-secondary" type="button" onclick="guardarNotaInternaTurno('${escapeHtml(turno.id)}','${notaId}')">Guardar nota</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderTurnosTerminados() {
  const tbody = document.getElementById('colabTurnosTerminados');
  if (!tbody) return;

  const terminados = ordenarPorFechaHora(obtenerTurnosTerminados(), 'desc');
  if (!terminados.length) {
    tbody.innerHTML = '<tr><td colspan="7">Aun no tienes trabajos terminados.</td></tr>';
    return;
  }

  tbody.innerHTML = terminados.map(turno => {
    const servicios = (turno.servicios || []).length
      ? (turno.servicios || []).map(servicio => `<span class="tag">${escapeHtml(servicio.nombre || '')}</span>`).join('')
      : '<span class="tag">Sin detalle</span>';

    const precio = parseInt(turno.precio, 10) || 0;
    const comision = parseInt(turno.colaboradorComision, 10) || 0;

    return `
      <tr>
        <td><strong>${escapeHtml(turno.nombre || '')}</strong><br><small>${escapeHtml(turno.telefono || '')}</small></td>
        <td class="tags-cell">${servicios}</td>
        <td>${escapeHtml(turno.fecha || '')}</td>
        <td>${escapeHtml(turno.hora || '')}</td>
        <td>${precio.toLocaleString('es-PY')} Gs</td>
        <td>${comision.toLocaleString('es-PY')} Gs</td>
        <td><span class="status-pill finalizado">finalizado</span></td>
      </tr>
    `;
  }).join('');
}

function renderCalendarioColaborador() {
  const contenedor = document.getElementById('colabCalendario');
  if (!contenedor) return;

  const ahora = new Date();
  const limite = new Date();
  limite.setDate(ahora.getDate() + 14);

  const lista = turnos
    .filter(turno => !['cancelado', 'no_show', 'finalizado'].includes(normalizarEstado(turno.estado)))
    .map(turno => {
      const fechaHora = new Date(`${turno.fecha || ''}T${turno.hora || '00:00'}`);
      return { ...turno, fechaHora };
    })
    .filter(turno => !Number.isNaN(turno.fechaHora.getTime()) && turno.fechaHora >= ahora && turno.fechaHora <= limite)
    .sort((a, b) => a.fechaHora - b.fechaHora);

  if (!lista.length) {
    contenedor.innerHTML = '<div class="alert alert-info">No tienes turnos en los proximos 14 dias.</div>';
    return;
  }

  contenedor.innerHTML = lista.map(turno => {
    const estado = normalizarEstado(turno.estado);
    const precio = parseInt(turno.precio, 10) || 0;
    const comision = parseInt(turno.colaboradorComision, 10) || 0;
    const serviciosTag = (turno.servicios || []).length
      ? (turno.servicios || []).map(servicio => `<span class="tag">${escapeHtml(servicio.nombre || '')}</span>`).join('')
      : '<span class="tag">Sin detalle</span>';

    return `
      <article class="proximo-item card-soft">
        <div class="proximo-head">
          <div>
            <p class="eyebrow">${escapeHtml(turno.fecha || '')}</p>
            <h4>${escapeHtml(turno.hora || '')}</h4>
          </div>
          <span class="status-pill ${estado}">${estado.replace('_', ' ')}</span>
        </div>
        <p class="proximo-cliente"><strong>${escapeHtml(turno.nombre || '')}</strong> · ${escapeHtml(turno.telefono || '')}</p>
        <p class="muted">Total: ${precio.toLocaleString('es-PY')} Gs · Comision: ${comision.toLocaleString('es-PY')} Gs</p>
        <div class="tags-cell">${serviciosTag}</div>
      </article>
    `;
  }).join('');
}

function cambiarMesColab(delta) {
  mesActualColab.setMonth(mesActualColab.getMonth() + delta);
  renderCalendarioMensualColab();
}

function seleccionarFechaColab(fecha) {
  if (!fecha) return;
  fechaSeleccionadaColab = fecha;
  renderCalendarioMensualColab();
  renderAgendaDiaSeleccionado();
}

function renderCalendarioMensualColab() {
  const contenedor = document.getElementById('colabCalendarioMes');
  const tituloMes = document.getElementById('colabMesActual');
  if (!contenedor || !tituloMes) return;

  const year = mesActualColab.getFullYear();
  const month = mesActualColab.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const hoyStr = toDateISO(new Date());

  const formatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  tituloMes.textContent = formatter.format(mesActualColab).replace(/^\w/, l => l.toUpperCase());

  const cuentaPorDia = turnos.reduce((acc, turno) => {
    if (['cancelado', 'no_show', 'finalizado'].includes(normalizarEstado(turno.estado)) || !turno.fecha) return acc;
    acc[turno.fecha] = (acc[turno.fecha] || 0) + 1;
    return acc;
  }, {});

  const labels = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
    .map(label => `<div class="colab-calendar-label">${label}</div>`)
    .join('');

  let cells = '';
  for (let i = 0; i < offset; i++) {
    cells += '<div class="colab-day-cell empty"></div>';
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const count = cuentaPorDia[dateStr] || 0;

    const classes = ['colab-day-cell'];
    if (dateStr === hoyStr) classes.push('today');
    if (count > 0) classes.push('has-turnos');
    if (dateStr === fechaSeleccionadaColab) classes.push('selected');

    const detalle = count > 0
      ? `<span class="colab-day-count">${count} turno${count !== 1 ? 's' : ''}</span>`
      : '<span class="colab-day-count">&nbsp;</span>';

    cells += `
      <button type="button" class="${classes.join(' ')}" onclick="seleccionarFechaColab('${dateStr}')">
        <span class="colab-day-num">${day}</span>
        ${detalle}
      </button>
    `;
  }

  contenedor.innerHTML = `
    <div class="colab-calendar-grid">
      ${labels}
      ${cells}
    </div>
  `;
}

function renderAgendaDiaSeleccionado() {
  const box = document.getElementById('colabAgendaDia');
  const titulo = document.getElementById('colabDiaSeleccionado');
  if (!box || !titulo) return;

  const fechaObjetivo = fechaSeleccionadaColab || toDateISO(new Date());
  const lista = turnos
    .filter(turno => turno.fecha === fechaObjetivo && !['cancelado', 'no_show', 'finalizado'].includes(normalizarEstado(turno.estado)))
    .sort((a, b) => new Date(`${a.fecha}T${a.hora || '00:00'}`) - new Date(`${b.fecha}T${b.hora || '00:00'}`));

  titulo.textContent = `Detalle del ${formatDateDisplay(fechaObjetivo)}`;

  if (!lista.length) {
    box.innerHTML = '<div class="alert alert-info">No tienes turnos para ese dia.</div>';
    return;
  }

  box.innerHTML = lista.map(turno => {
    const estado = normalizarEstado(turno.estado);
    const precio = parseInt(turno.precio, 10) || 0;
    const comision = parseInt(turno.colaboradorComision, 10) || 0;
    const serviciosTag = (turno.servicios || []).length
      ? (turno.servicios || []).map(servicio => `<span class="tag">${escapeHtml(servicio.nombre || '')}</span>`).join('')
      : '<span class="tag">Sin detalle</span>';

    return `
      <article class="proximo-item card-soft">
        <div class="proximo-head">
          <div>
            <p class="eyebrow">${escapeHtml(turno.hora || '')}</p>
            <h4>${escapeHtml(turno.nombre || '')}</h4>
          </div>
          <span class="status-pill ${estado}">${estado.replace('_', ' ')}</span>
        </div>
        <p class="proximo-cliente"><strong>${escapeHtml(turno.telefono || '')}</strong> · CI ${escapeHtml(turno.ci || '')}</p>
        <p class="muted">Total: ${precio.toLocaleString('es-PY')} Gs · Comision: ${comision.toLocaleString('es-PY')} Gs</p>
        <div class="tags-cell">${serviciosTag}</div>
      </article>
    `;
  }).join('');
}

function seleccionarHoyColab() {
  fechaSeleccionadaColab = toDateISO(new Date());
  mesActualColab = new Date();
  renderCalendarioMensualColab();
  renderAgendaDiaSeleccionado();
}

async function copiarAgendaDia() {
  const fechaObjetivo = fechaSeleccionadaColab || toDateISO(new Date());
  const lista = turnos
    .filter(turno => turno.fecha === fechaObjetivo && !['cancelado', 'no_show', 'finalizado'].includes(normalizarEstado(turno.estado)))
    .sort((a, b) => new Date(`${a.fecha}T${a.hora || '00:00'}`) - new Date(`${b.fecha}T${b.hora || '00:00'}`));
  const lineas = [
    `Agenda ${formatDateDisplay(fechaObjetivo)}`,
    ...lista.map(t => {
      const servicios = (t.servicios || []).map(s => s.nombre).join(', ') || t.servicio || 'Sin detalle';
      return `${t.hora || '--:--'} · ${t.nombre || ''} · ${t.telefono || ''} · ${servicios}`;
    })
  ];
  try {
    await navigator.clipboard.writeText(lineas.join('\n'));
    mostrarAviso('Agenda copiada al portapapeles', 'success');
  } catch {
    mostrarAviso('No se pudo copiar la agenda', 'error');
  }
}

async function copiarResumenHoy() {
  const hoy = toDateISO(new Date());
  const pendientesHoy = obtenerTurnosPendientes().filter(t => t.fecha === hoy);
  const terminadosHoy = obtenerTurnosTerminados().filter(t => t.fecha === hoy);
  const generado = terminadosHoy.reduce((acc, t) => acc + (parseInt(t.precio, 10) || 0), 0);
  const comision = terminadosHoy.reduce((acc, t) => acc + (parseInt(t.colaboradorComision, 10) || 0), 0);
  const texto = [
    `Resumen ${formatDateDisplay(hoy)}`,
    `Pendientes: ${pendientesHoy.length}`,
    `Finalizados: ${terminadosHoy.length}`,
    `Generado: ${generado.toLocaleString('es-PY')} Gs`,
    `Comisión: ${comision.toLocaleString('es-PY')} Gs`
  ].join('\n');
  try {
    await navigator.clipboard.writeText(texto);
    mostrarAviso('Resumen copiado al portapapeles', 'success');
  } catch {
    mostrarAviso('No se pudo copiar el resumen', 'error');
  }
}

async function actualizarEstadoColab(id, estado) {
  if (!id || !estado) return;
  const estadoFinal = normalizarEstado(estado);
  const ok = await actualizarTurnoColab({ id, estado: estadoFinal }, 'Estado actualizado');
  if (ok && estadoFinal === 'finalizado') {
    mostrarSeccionColab('terminados');
  }
}

async function reasignarTurnoColab(id, selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const colaboradorId = (select.value || '').trim();
  if (!colaboradorId) {
    mostrarAviso('Selecciona un colaborador para mover el turno', 'error');
    return;
  }

  await actualizarTurnoColab({ id, colaboradorId }, 'Turno reasignado');
}

async function marcarCheckInTurno(id) {
  if (!id) return;
  const turno = turnos.find(t => t.id === id);
  if (!turno) return;
  if (turno.checkInAt) {
    mostrarAviso('Este turno ya tiene check-in.', 'info');
    return;
  }
  await actualizarTurnoColab(
    { id, checkInAt: new Date().toISOString(), estado: 'en_servicio' },
    'Check-in registrado'
  );
}

async function marcarCheckOutTurno(id) {
  if (!id) return;
  const turno = turnos.find(t => t.id === id);
  if (!turno || !turno.checkInAt) {
    mostrarAviso('Debes hacer check-in antes de cerrar servicio.', 'error');
    return;
  }
  await actualizarTurnoColab(
    { id, checkOutAt: new Date().toISOString(), estado: 'finalizado' },
    'Check-out registrado y turno finalizado'
  );
}

async function guardarNotaInternaTurno(id, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const notaInterna = input.value.trim();
  await actualizarTurnoColab({ id, notaInterna }, 'Nota interna guardada');
}

async function reprogramarTurnoColab(id, fechaId, horaId) {
  const fecha = document.getElementById(fechaId)?.value || '';
  const hora = document.getElementById(horaId)?.value || '';
  if (!fecha || !hora) {
    mostrarAviso('Selecciona fecha y hora para reprogramar.', 'error');
    return;
  }
  await actualizarTurnoColab({ id, fecha, hora }, 'Turno reprogramado');
}

async function actualizarTurnoColab(payload, mensajeOk) {
  try {
    const respuesta = await fetch('/api/turnos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !data.success) {
      throw new Error(data.error || 'No se pudo actualizar el turno');
    }

    await cargarTurnosColaborador();
    mostrarAviso(mensajeOk, 'success');
    return true;
  } catch (error) {
    mostrarAviso(error.message || 'Error actualizando turno', 'error');
    return false;
  }
}

async function cerrarSesion() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login.html';
  }
}

function normalizarEstado(estado) {
  const raw = String(estado || 'pendiente').toLowerCase();
  const canon = ESTADOS_ALIAS_COLAB[raw] || raw;
  return ESTADOS_COLAB.includes(canon) ? canon : 'pendiente';
}

function normalizarId(valor) {
  return String(valor || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
}

function toDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mostrarAviso(mensaje, tipo = 'info') {
  const region = document.getElementById('notificationRegion');
  if (!region) return;

  const alerta = document.createElement('div');
  alerta.className = `alert alert-${tipo}`;
  alerta.textContent = mensaje;

  region.innerHTML = '';
  region.appendChild(alerta);

  setTimeout(() => alerta.remove(), 3200);
}
