let servicios = [];
let turnos = [];
let lookbook = [];
let imagenesServicioTemp = [];
let clientes = [];
let colaboradores = [];

let banners = [];
let sorteos = [];
let giftcards = [];
let giftcardVisualActual = null;
let giftcardValidacion = null;
let servicioEditando = null;
let mesActual = new Date();
let turnoContactando = null;
let pendientesAlerta = 10;
let lookbookEditando = null;
let turnoEditando = null;
let colaboradorEditando = null;
let bannerEditando = null;
let heroMosaicConfig = [];
let modalAnteriorFocus = null;
let disponibilidadTimer = null;
let horariosDisponiblesTurno = [];
let serviciosColabSeleccionados = [];
let paginaServicios = 1;
let paginaLookbook = 1;
let paginaTurnos = 1;
let paginaClientes = 1;
let ultimoFiltroServicios = { texto: '', estado: '' };
let ultimoFiltroLookbook = { texto: '', estado: '' };
let ultimoFiltroTurnos = { texto: '', estado: '', fecha: '' };
let ultimoFiltroClientes = { texto: '', estado: '', desde: '', hasta: '', min: '', max: '' };
let ultimoFiltroPagoColab = { texto: '', colaboradorId: '', modo: 'hoy', desde: '', hasta: '' };
let reporteActual = null;
let configAdmin = {};
let bloqueosAgendaAdmin = [];
let columnasTurnosConfig = {
  cliente: true,
  servicios: true,
  fecha: true,
  hora: true,
  colaborador: true,
  estado: true,
  acciones: true
};
const TURNOS_COLUMNAS_STORAGE_KEY = 'admin_turnos_columnas_v1';
const TURNOS_FILTROS_STORAGE_KEY = 'admin_turnos_filtros_v1';
const ESTADOS_TURNO_UI = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'en_camino', label: 'En camino' },
  { value: 'en_servicio', label: 'En servicio' },
  { value: 'no_show', label: 'No-show' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'en_progreso', label: 'En progreso (legado)' },
  { value: 'completado', label: 'Completado (legado)' }
];
const ESTADOS_CANONICOS = {
  en_progreso: 'en_servicio',
  completado: 'finalizado'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(value) {
  if (value === undefined || value === null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) || raw.startsWith('/')
    ? raw
    : `https://${raw}`;

  try {
    const parsed = new URL(normalized, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    return '';
  }
  return '';
}

function normalizarEstadoTurnoUI(estado) {
  const raw = String(estado || 'pendiente').toLowerCase();
  return ESTADOS_CANONICOS[raw] || raw;
}

function etiquetaEstadoTurno(estado) {
  const canon = normalizarEstadoTurnoUI(estado);
  const found = ESTADOS_TURNO_UI.find(item => item.value === canon);
  if (found) return found.label;
  return canon.replace(/_/g, ' ');
}

function renderEstadoOptions(estadoActual = 'pendiente') {
  const actualCanon = normalizarEstadoTurnoUI(estadoActual);
  return ESTADOS_TURNO_UI
    .filter(item => !['en_progreso', 'completado'].includes(item.value))
    .map(item => `<option value="${item.value}" ${item.value === actualCanon ? 'selected' : ''}>${item.label}</option>`)
    .join('');
}

function obtenerPlantillasWhatsApp() {
  const defaults = {
    confirmacion: 'Hola {nombre}, confirmamos tu turno de {servicios} el {fecha} a las {hora}.',
    recordatorio: 'Hola {nombre}, te recordamos tu turno de {servicios} el {fecha} a las {hora}.',
    reprogramacion: 'Hola {nombre}, necesitamos reprogramar tu turno de {servicios} del {fecha} a las {hora}.'
  };
  const tpl = configAdmin?.whatsappTemplates || {};
  return {
    confirmacion: String(tpl.confirmacion || defaults.confirmacion),
    recordatorio: String(tpl.recordatorio || defaults.recordatorio),
    reprogramacion: String(tpl.reprogramacion || defaults.reprogramacion)
  };
}

function construirMensajeWhatsAppTurno(turno, template = 'recordatorio') {
  const plantillas = obtenerPlantillasWhatsApp();
  const serviciosTexto = (turno.servicios || []).map(s => s.nombre).join(', ') || turno.servicio || 'servicio';
  const base = plantillas[template] || plantillas.recordatorio;
  return base
    .replace(/\{nombre\}/gi, turno.nombre || 'cliente')
    .replace(/\{fecha\}/gi, turno.fecha || '')
    .replace(/\{hora\}/gi, turno.hora || '')
    .replace(/\{servicios\}/gi, serviciosTexto);
}

function heroMosaicDefault() {
  return [
    { titulo: 'Promo destacada', descripcion: 'Descubre nuestras promociones de temporada.', imagen: '', imagenes: [], url: '', activo: false },
    { titulo: 'Novedades', descripcion: 'Nuevos servicios y combinaciones para ti.', imagen: '', imagenes: [], url: '', activo: false },
    { titulo: 'Reserva express', descripcion: 'Agenda en minutos y confirma por WhatsApp.', imagen: '', imagenes: [], url: '', activo: false }
  ];
}

function normalizarHeroMosaicAdmin(value, fallback = heroMosaicDefault()) {
  const base = Array.isArray(fallback) ? fallback : heroMosaicDefault();
  const source = Array.isArray(value) ? value : [];

  return Array.from({ length: 3 }, (_, index) => {
    const baseItem = base[index] && typeof base[index] === 'object' ? base[index] : {};
    const sourceItem = source[index] && typeof source[index] === 'object' ? source[index] : {};
    const imagenesRaw = sourceItem.imagenes !== undefined ? sourceItem.imagenes : baseItem.imagenes;
    const imagenes = Array.isArray(imagenesRaw)
      ? Array.from(new Set(imagenesRaw.map(item => sanitizeUrl(item)).filter(Boolean))).slice(0, 12)
      : [];
    let imagen = sanitizeUrl(sourceItem.imagen ?? baseItem.imagen) || '';
    let imagenesFinal = imagenes;
    if (!imagenesFinal.length && imagen) imagenesFinal = [imagen];
    if (!imagen && imagenesFinal.length) imagen = imagenesFinal[0];

    return {
      titulo: String(sourceItem.titulo ?? baseItem.titulo ?? '').trim().slice(0, 80),
      descripcion: String(sourceItem.descripcion ?? baseItem.descripcion ?? '').trim().slice(0, 160),
      imagen,
      imagenes: imagenesFinal,
      url: sanitizeUrl(sourceItem.url ?? baseItem.url) || '',
      activo: sourceItem.activo !== undefined ? sourceItem.activo !== false : baseItem.activo !== false
    };
  });
}

function parseMosaicImageLines(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/\r?\n/)
      .map(line => sanitizeUrl(line.trim()))
      .filter(Boolean)
  )).slice(0, 12);
}

function setMosaicMessage(message = '', type = '') {
  const box = document.getElementById('mosaicMensaje');
  if (!box) return;
  box.textContent = message;
  box.className = type ? `form-help ${type}` : 'form-help';
}

function obtenerImagenesMosaicoPrincipalFormulario() {
  const textarea = document.getElementById('mosaicImagenes0');
  const inputImagen = document.getElementById('mosaicImagen0');
  const lista = parseMosaicImageLines(textarea?.value || '');
  const imagenUnica = sanitizeUrl(inputImagen?.value.trim() || '') || '';
  const merged = [...lista];
  if (imagenUnica && !merged.includes(imagenUnica)) merged.unshift(imagenUnica);
  return Array.from(new Set(merged)).slice(0, 12);
}

function cargarHeroMosaicFormulario(value) {
  const lista = normalizarHeroMosaicAdmin(value, heroMosaicDefault());
  heroMosaicConfig = lista;
  lista.forEach((item, index) => {
    const titulo = document.getElementById(`mosaicTitulo${index}`);
    const descripcion = document.getElementById(`mosaicDescripcion${index}`);
    const imagen = document.getElementById(`mosaicImagen${index}`);
    const imagenesText = document.getElementById(`mosaicImagenes${index}`);
    const activo = document.getElementById(`mosaicActivo${index}`);
    if (titulo) titulo.value = item.titulo || '';
    if (descripcion) descripcion.value = item.descripcion || '';
    if (imagen) imagen.value = item.imagen || '';
    if (imagenesText) imagenesText.value = Array.isArray(item.imagenes) ? item.imagenes.join('\n') : '';
    if (activo) activo.checked = item.activo !== false;
    actualizarPreviewMosaico(index);
  });
}

function leerHeroMosaicFormulario() {
  return Array.from({ length: 3 }, (_, index) => {
    const titulo = document.getElementById(`mosaicTitulo${index}`)?.value.trim() || '';
    const descripcion = document.getElementById(`mosaicDescripcion${index}`)?.value.trim() || '';
    const url = '';
    const activo = document.getElementById(`mosaicActivo${index}`)?.checked === true;
    let imagenes = [];

    if (index === 0) {
      imagenes = obtenerImagenesMosaicoPrincipalFormulario();
    } else {
      const imagenUnica = sanitizeUrl(document.getElementById(`mosaicImagen${index}`)?.value.trim() || '') || '';
      imagenes = imagenUnica ? [imagenUnica] : [];
    }

    const imagen = imagenes[0] || '';
    return { titulo, descripcion, imagen, imagenes, url, activo };
  });
}

function actualizarPreviewMosaico(index, autoActivar = false) {
  const preview = document.getElementById(`mosaicPreview${index}`);
  const inputImagen = document.getElementById(`mosaicImagen${index}`);
  const inputTitulo = document.getElementById(`mosaicTitulo${index}`);
  const inputActivo = document.getElementById(`mosaicActivo${index}`);
  if (!preview || !inputImagen) return;

  let imagenes = [];
  if (index === 0) {
    imagenes = obtenerImagenesMosaicoPrincipalFormulario();
    if (imagenes[0] && inputImagen.value.trim() !== imagenes[0]) inputImagen.value = imagenes[0];
  } else {
    const unica = sanitizeUrl(inputImagen.value.trim()) || '';
    if (unica) imagenes = [unica];
  }

  const imagen = imagenes[0] || '';
  const titulo = (inputTitulo?.value || '').trim();
  if (autoActivar && imagen && inputActivo) inputActivo.checked = true;
  preview.classList.toggle('has-image', Boolean(imagen));
  preview.style.backgroundImage = imagen ? `url("${imagen.replace(/"/g, '%22')}")` : '';
  preview.innerHTML = imagen
    ? `<span>${escapeHtml(titulo || 'Vista previa')}</span>${index === 0 && imagenes.length > 1 ? `<small>${imagenes.length} imágenes</small>` : ''}`
    : '<span>Sin imagen</span>';
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result || '');
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

async function uploadImageData(imageData) {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success || !sanitizeUrl(result.url)) {
    throw new Error(result.error || 'No se pudo subir la imagen');
  }
  return sanitizeUrl(result.url) || '';
}

async function subirImagenMosaico(index, input) {
  const file = input?.files?.[0];
  if (!file) return;

  try {
    setMosaicMessage('Subiendo imagen...', 'muted');
    const imageData = await readFileAsDataURL(file);
    const imageUrl = await uploadImageData(imageData);

    const inputImagen = document.getElementById(`mosaicImagen${index}`);
    const inputActivo = document.getElementById(`mosaicActivo${index}`);
    if (inputImagen) inputImagen.value = imageUrl;
    if (index === 0) {
      const textArea = document.getElementById('mosaicImagenes0');
      const actuales = obtenerImagenesMosaicoPrincipalFormulario().filter(url => url !== imageUrl);
      const merged = [imageUrl, ...actuales].slice(0, 12);
      if (textArea) textArea.value = merged.join('\n');
    }
    if (inputActivo) inputActivo.checked = true;
    actualizarPreviewMosaico(index, true);
    setMosaicMessage('Imagen subida correctamente. Mosaico activado.', 'muted');
  } catch (error) {
    setMosaicMessage(error.message || 'Error subiendo imagen.', 'error');
    mostrarNotificacion(error.message || 'Error subiendo imagen', 'error');
  } finally {
    if (input) input.value = '';
  }
}

async function subirImagenesMosaicoPrincipal(input) {
  const files = Array.from(input?.files || []);
  if (!files.length) return;

  try {
    setMosaicMessage(`Subiendo ${files.length} imagen(es)...`, 'muted');
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const imageData = await readFileAsDataURL(files[i]);
      const url = await uploadImageData(imageData);
      if (url) urls.push(url);
      setMosaicMessage(`Subiendo ${i + 1}/${files.length}...`, 'muted');
    }

    if (!urls.length) throw new Error('No se pudo subir ninguna imagen');

    const textarea = document.getElementById('mosaicImagenes0');
    const inputImagen = document.getElementById('mosaicImagen0');
    const inputActivo = document.getElementById('mosaicActivo0');
    const merged = Array.from(new Set(urls)).slice(0, 12);

    if (textarea) textarea.value = merged.join('\n');
    if (inputImagen) inputImagen.value = merged[0] || '';
    if (inputActivo) inputActivo.checked = true;

    actualizarPreviewMosaico(0, true);
    setMosaicMessage(`Se cargaron ${urls.length} imagen(es) en el mosaico principal.`, 'muted');
  } catch (error) {
    setMosaicMessage(error.message || 'Error subiendo imágenes.', 'error');
    mostrarNotificacion(error.message || 'Error subiendo imágenes', 'error');
  } finally {
    if (input) input.value = '';
  }
}

async function guardarHeroMosaicAdmin() {
  const payload = leerHeroMosaicFormulario();
  try {
    setMosaicMessage('Guardando...', 'muted');
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heroMosaic: payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo guardar');

    heroMosaicConfig = normalizarHeroMosaicAdmin(result.config?.heroMosaic || payload, payload);
    cargarHeroMosaicFormulario(heroMosaicConfig);
    setMosaicMessage('Mosaicos guardados.', 'muted');
    mostrarNotificacion('Mosaicos actualizados', 'success');
  } catch (error) {
    setMosaicMessage(error.message || 'Error al guardar mosaicos.', 'error');
    mostrarNotificacion(error.message || 'Error al guardar mosaicos', 'error');
  }
}

function setTableLoading(tbodyId, colspan, message = 'Cargando...') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function obtenerModalActivo() {
  return document.querySelector('.modal-overlay.active');
}

function abrirModal(modalId, focusSelector) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  modalAnteriorFocus = document.activeElement;
  const focusEl = modal.querySelector(focusSelector || 'input,select,textarea,button');
  if (focusEl) focusEl.focus();
  document.body.style.overflow = 'hidden';
}

function cerrarModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (modalAnteriorFocus && typeof modalAnteriorFocus.focus === 'function') {
    modalAnteriorFocus.focus();
  }
  modalAnteriorFocus = null;
}

function trapFocus(event) {
  const modal = obtenerModalActivo();
  if (!modal || event.key !== 'Tab') return;
  const focusables = modal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function paginar(items, pagina, porPagina) {
  const totalPaginas = Math.max(1, Math.ceil(items.length / porPagina));
  const paginaValida = Math.min(Math.max(pagina, 1), totalPaginas);
  const inicio = (paginaValida - 1) * porPagina;
  return {
    pagina: paginaValida,
    totalPaginas,
    items: items.slice(inicio, inicio + porPagina)
  };
}

function renderPaginacion(containerId, pagina, totalPaginas, handlerName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (totalPaginas <= 1) {
    container.innerHTML = '';
    return;
  }
  const prevDisabled = pagina <= 1 ? 'disabled' : '';
  const nextDisabled = pagina >= totalPaginas ? 'disabled' : '';
  container.innerHTML = `
    <button class="btn btn-secondary" ${prevDisabled} onclick="${handlerName}(${pagina - 1})">Anterior</button>
    <span>P&aacute;gina ${pagina} de ${totalPaginas}</span>
    <button class="btn btn-secondary" ${nextDisabled} onclick="${handlerName}(${pagina + 1})">Siguiente</button>
  `;
}

async function verificarAutenticacion() {
  try {
    const response = await fetch('/api/check-auth');
    if (response.status === 401) {
      window.location.href = '/login.html';
      return false;
    }
    const data = await response.json();
    if (data.authenticated) return true;
    window.location.href = '/login.html';
    return false;
  } catch (error) {
    console.error('Error verificando autenticación:', error);
    window.location.href = '/login.html';
    return false;
  }
}

async function cargarDatosAdmin() {
  try {
    setTableLoading('listaServicios', 6, 'Cargando servicios...');
    setTableLoading('listaTurnos', 7, 'Cargando turnos...');
    const [serviciosRes, turnosRes, colabsRes, giftRes, bannersRes, sorteosRes, configRes] = await Promise.all([
      fetch('/api/servicios'),
      fetch('/api/turnos'),
      fetch('/api/colaboradores'),
      fetch('/api/giftcards'),
      fetch('/api/banners?admin=1'),
      fetch('/api/sorteos'),
      fetch('/api/config')
    ]);

    if ([turnosRes, colabsRes, giftRes, bannersRes, sorteosRes].some(r => r.status === 401)) {
      window.location.href = '/login.html';
      return;
    }
    if (![serviciosRes, turnosRes, colabsRes, giftRes, bannersRes, sorteosRes, configRes].every(r => r.ok)) {
      throw new Error('Respuesta inválida del servidor');
    }

    servicios = await serviciosRes.json();
    turnos = await turnosRes.json();
    colaboradores = await colabsRes.json();
    giftcards = await giftRes.json();
    banners = await bannersRes.json();
    sorteos = await sorteosRes.json();
    configAdmin = await configRes.json();
    if (!Array.isArray(servicios)) servicios = [];
    if (!Array.isArray(turnos)) turnos = [];
    if (!Array.isArray(colaboradores)) colaboradores = [];
    if (!Array.isArray(giftcards)) giftcards = [];
    if (!Array.isArray(banners)) banners = [];
    if (!Array.isArray(sorteos)) sorteos = [];
    if (!configAdmin || typeof configAdmin !== 'object') configAdmin = {};

    actualizarDashboard();
    restaurarFiltrosTurnosGuardados(true);
    aplicarConfiguracionColumnasTurnos(false);
    renderServiciosColabPicker();
    renderInsights();
    renderAllCharts();
    actualizarListaServicios();
    actualizarListaTurnos();
    actualizarListaClientes();
    renderColaboradores();
    actualizarVistaPagoColaborador();
    actualizarGiftcards();
    renderBannersAdmin();
    renderSorteos();
    renderResumenColaboradores();
    actualizarReporte();
    renderizarCalendario();
  } catch (error) {
    console.error('Error cargando datos admin:', error);
    mostrarNotificacion('Error al cargar datos. Intenta recargar la página.', 'error');
  }
}

function mostrarSeccion(seccion) {
  const secciones = ['dashboard', 'servicios', 'lookbook', 'turnos', 'clientes', 'colaboradores', 'giftcards', 'marketing', 'calendario', 'reportes', 'config'];
  secciones.forEach(id => {
    const elem = document.getElementById(`${id}Section`);
    if (elem) elem.style.display = 'none';
  });

  const seccionElement = document.getElementById(`${seccion}Section`);
  if (seccionElement) seccionElement.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[onclick="mostrarSeccion('${seccion}')"]`);
  if (navItem) navItem.classList.add('active');
  document.querySelectorAll('.quick-card').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-seccion') === seccion);
  });

  const title = document.getElementById('adminTitle');
  if (title) {
    const labels = {
      dashboard: 'Dashboard',
      servicios: 'Servicios',
      lookbook: 'Lookbook',
      turnos: 'Turnos',
      clientes: 'Clientes',
      colaboradores: 'Colaboradores',
      giftcards: 'Giftcards',
      marketing: 'Marketing',
      calendario: 'Calendario',
      reportes: 'Reportes',
      config: 'Configuración'
    };
    title.textContent = labels[seccion] || 'Dashboard';
  }

  limpiarResultadosBuscadorServicios();

  if (seccion === 'dashboard') {
    actualizarDashboard();
    renderInsights();
    renderAllCharts();
  }
  if (seccion === 'servicios') {
    actualizarListaServicios();
  }
  if (seccion === 'lookbook') {
    cargarLookbookAdmin();
  }
  if (seccion === 'turnos') {
    actualizarListaTurnos();
  }
  if (seccion === 'clientes') {
    actualizarListaClientes();
  }
  if (seccion === 'colaboradores') {
    renderColaboradores();
    actualizarVistaPagoColaborador();
  }
  if (seccion === 'giftcards') {
    actualizarGiftcards();
  }
  if (seccion === 'marketing') {
    renderBannersAdmin();
    renderSorteos();
    if (heroMosaicConfig.length) cargarHeroMosaicFormulario(heroMosaicConfig);
  }
  if (seccion === 'calendario') {
    renderizarCalendario();
  }
  if (seccion === 'reportes') {
    actualizarReporte();
  }
  if (seccion === 'config') {
    cargarConfiguracionAdmin();
    cargarBackups();
  }
}

function actualizarDashboard() {
  const hoy = new Date().toISOString().split('T')[0];
  const turnosHoy = turnos.filter(t => t.fecha === hoy);

  const ingresosHoy = turnosHoy.reduce((total, t) => total + (parseInt(t.precio) || 0), 0);
  const turnosPendientes = turnos.filter(t => normalizarEstadoTurnoUI(t.estado) === 'pendiente').length;
  const ahora = Date.now();
  const pendientes24h = turnos.filter(t => {
    if (normalizarEstadoTurnoUI(t.estado) !== 'pendiente') return false;
    if (!t.fecha || !t.hora) return false;
    const fechaHora = new Date(`${t.fecha}T${t.hora}`).getTime();
    if (Number.isNaN(fechaHora)) return false;
    const diff = fechaHora - ahora;
    return diff > 0 && diff <= 24 * 60 * 60 * 1000;
  }).length;
  const banner = document.getElementById('pendientesBanner');
  if (banner) {
    if (turnosPendientes >= pendientesAlerta || pendientes24h > 0) {
      banner.style.display = 'block';
      const mensajes = [];
      if (turnosPendientes >= pendientesAlerta) {
        mensajes.push(`Hay ${turnosPendientes} turnos pendientes.`);
      }
      if (pendientes24h > 0) {
        mensajes.push(`${pendientes24h} pendiente(s) con menos de 24h para confirmar.`);
      }
      banner.textContent = `${mensajes.join(' ')} Revisa confirmaciones.`;
    } else {
      banner.style.display = 'none';
    }
  }
  const contactosHoy = turnos.filter(t => {
    if (!t.ultimoContacto) return false;
    const contactoFecha = t.ultimoContacto.split('T')[0];
    return contactoFecha === hoy;
  }).length;

  document.getElementById('totalServicios').textContent = servicios.length;
  document.getElementById('turnosHoy').textContent = turnosHoy.length;
  document.getElementById('ingresosHoy').textContent = ingresosHoy.toLocaleString('es-PY') + ' Gs';
  document.getElementById('turnosPendientes').textContent = turnosPendientes;
  const contactosElem = document.getElementById('contactosHoy');
  if (contactosElem) contactosElem.textContent = contactosHoy;
}


function renderInsights() {
  const topServiciosEl = document.getElementById('topServicios');
  const topHorariosEl = document.getElementById('topHorarios');
  const proximosEl = document.getElementById('proximosTurnos');

  if (!topServiciosEl || !topHorariosEl || !proximosEl) return;

  const servicioCount = {};
  const horaCount = {};
  const hoy = new Date();
  const limite = new Date();
  limite.setDate(hoy.getDate() + 7);

  turnos.forEach(turno => {
    const serviciosTurno = turno.servicios && turno.servicios.length ? turno.servicios : (turno.servicio ? [{ nombre: turno.servicio }] : []);
    serviciosTurno.forEach(s => {
      const key = s.nombre;
      servicioCount[key] = (servicioCount[key] || 0) + 1;
    });

    const hora = turno.hora || '';
    if (hora) horaCount[hora] = (horaCount[hora] || 0) + 1;
  });

  const topServicios = Object.entries(servicioCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topHoras = Object.entries(horaCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  topServiciosEl.innerHTML = topServicios.length
    ? topServicios.map(([nombre, count]) => `<li>${escapeHtml(nombre)} <span>${count}</span></li>`).join('')
    : '<li>Sin datos</li>';

  topHorariosEl.innerHTML = topHoras.length
    ? topHoras.map(([hora, count]) => `<li>${escapeHtml(hora)} <span>${count}</span></li>`).join('')
    : '<li>Sin datos</li>';

  const proximos = turnos
    .filter(t => {
      const fecha = new Date(t.fecha + 'T00:00:00');
      return fecha >= new Date(hoy.toDateString()) && fecha <= limite;
    })
    .sort((a, b) => new Date(a.fecha + 'T' + a.hora) - new Date(b.fecha + 'T' + b.hora))
    .slice(0, 5);

  proximosEl.innerHTML = proximos.length
    ? proximos.map(t => `<div class="proximo-item"><strong>${escapeHtml(t.fecha)}</strong> · ${escapeHtml(t.hora)} · ${escapeHtml(t.nombre)}</div>`).join('')
    : '<div class="proximo-item">No hay turnos próximos</div>';
}

function setImagenesServicio(lista = []) {
  const filtradas = lista.map(item => sanitizeUrl(item)).filter(Boolean);
  imagenesServicioTemp = Array.from(new Set(filtradas));
  renderImagenesServicio();
}

function renderImagenesServicio() {
  const preview = document.getElementById('previewImagenServicio');
  if (!preview) return;
  if (!imagenesServicioTemp.length) {
    preview.innerHTML = '<div class="empty-state">Sin imágenes cargadas.</div>';
    return;
  }
  preview.innerHTML = imagenesServicioTemp.map((url, index) => `
    <div class="image-thumb">
      <img src="${escapeHtml(url)}" alt="Imagen servicio ${index + 1}" loading="lazy" />
      <button class="image-remove" type="button" onclick="eliminarImagenServicio(${index})">&times;</button>
    </div>
  `).join('');
}

function agregarImagenServicio(url, silent = false) {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) {
    if (!silent) mostrarNotificacion('URL inválida', 'error');
    return false;
  }
  if (imagenesServicioTemp.includes(safeUrl)) return true;
  imagenesServicioTemp.push(safeUrl);
  renderImagenesServicio();
  return true;
}

function agregarImagenServicioDesdeInput() {
  const input = document.getElementById('inputImagenServicio');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  const urls = raw.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
  let added = false;
  urls.forEach(url => {
    if (agregarImagenServicio(url, true)) added = true;
  });
  if (!added) mostrarNotificacion('URL inválida', 'error');
  input.value = '';
}

function eliminarImagenServicio(index) {
  imagenesServicioTemp.splice(index, 1);
  renderImagenesServicio();
}

async function subirImagenServicio(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const imageData = e.target.result;
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData })
        });
        const result = await response.json();
        if (result.success && result.url) {
          const safeUrl = sanitizeUrl(result.url);
          if (!safeUrl) throw new Error('URL inválida');
          resolve(safeUrl);
          return;
        }
        throw new Error(result.error || 'Error subiendo imagen');
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo imagen'));
    reader.readAsDataURL(file);
  });
}

function limpiarResultadosBuscadorServicios() {
  const resultados = document.getElementById('buscadorServiciosResultados');
  if (resultados) resultados.innerHTML = '';
}

function inicializarBuscadorServicios() {
  const wrapper = document.getElementById('buscadorServiciosWrapper');
  const input = document.getElementById('buscadorServicios');
  const resultados = document.getElementById('buscadorServiciosResultados');
  if (!wrapper || !input || !resultados || wrapper.dataset.ready === '1') return;
  wrapper.dataset.ready = '1';

  resultados.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const boton = target.closest('[data-servicio-id]');
    if (!boton) return;
    seleccionarServicioBuscado(boton.getAttribute('data-servicio-id'));
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) buscarServiciosGlobal();
  });

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (wrapper.contains(target)) return;
    limpiarResultadosBuscadorServicios();
  });
}

function buscarServiciosGlobal() {
  const input = document.getElementById('buscadorServicios');
  const resultados = document.getElementById('buscadorServiciosResultados');
  if (!input || !resultados) return;

  const texto = input.value.trim().toLowerCase();
  if (!texto) {
    limpiarResultadosBuscadorServicios();
    return;
  }

  const coincidencias = servicios.filter(servicio => {
    const nombre = (servicio.nombre || '').toLowerCase();
    const categoria = (servicio.categoria || '').toLowerCase();
    const descripcion = (servicio.descripcion || '').toLowerCase();
    return nombre.includes(texto) || categoria.includes(texto) || descripcion.includes(texto);
  }).slice(0, 8);

  if (!coincidencias.length) {
    resultados.innerHTML = '<div class="search-result-empty">No se encontraron servicios.</div>';
    return;
  }

  resultados.innerHTML = coincidencias.map(servicio => {
    const estado = servicio.activo !== false ? 'Activo' : 'Inactivo';
    const nombre = escapeHtml(servicio.nombre || 'Servicio');
    const categoria = escapeHtml(servicio.categoria || 'Sin categoría');
    const precio = (parseInt(servicio.precio, 10) || 0).toLocaleString('es-PY');
    return `
      <button type="button" class="search-result-item" data-servicio-id="${escapeHtml(servicio.id)}" role="option">
        <strong>${nombre}</strong>
        <span>${categoria} · ${precio} Gs · ${estado}</span>
      </button>
    `;
  }).join('');

  const seccionServicios = document.getElementById('serviciosSection');
  const filtroServicios = document.getElementById('filtroServiciosTexto');
  if (seccionServicios && seccionServicios.style.display !== 'none' && filtroServicios) {
    filtroServicios.value = input.value;
    actualizarListaServicios();
  }
}

function seleccionarServicioBuscado(servicioId) {
  const servicio = servicios.find(item => String(item.id) === String(servicioId));
  if (!servicio) return;

  const input = document.getElementById('buscadorServicios');
  if (input) input.value = servicio.nombre || '';

  mostrarSeccion('servicios');
  const filtro = document.getElementById('filtroServiciosTexto');
  if (filtro) filtro.value = servicio.nombre || '';
  paginaServicios = 1;
  actualizarListaServicios();
  limpiarResultadosBuscadorServicios();
}

function actualizarListaServicios() {
  const tbody = document.getElementById('listaServicios');
  if (!tbody) return;

  const texto = document.getElementById('filtroServiciosTexto')?.value.trim().toLowerCase() || '';
  const estadoFiltro = document.getElementById('filtroServiciosEstado')?.value || '';
  if (texto !== ultimoFiltroServicios.texto || estadoFiltro !== ultimoFiltroServicios.estado) {
    paginaServicios = 1;
    ultimoFiltroServicios = { texto, estado: estadoFiltro };
  }

  let serviciosFiltrados = [...servicios];
  if (texto) {
    serviciosFiltrados = serviciosFiltrados.filter(servicio => {
      const nombre = (servicio.nombre || '').toLowerCase();
      const categoria = (servicio.categoria || '').toLowerCase();
      const descripcion = (servicio.descripcion || '').toLowerCase();
      return nombre.includes(texto) || categoria.includes(texto) || descripcion.includes(texto);
    });
  }
  if (estadoFiltro) {
    serviciosFiltrados = serviciosFiltrados.filter(servicio => {
      const activo = servicio.activo !== false;
      return estadoFiltro === 'activo' ? activo : !activo;
    });
  }

  if (serviciosFiltrados.length === 0) {
    const mensaje = servicios.length === 0
      ? 'No hay servicios registrados.'
      : 'No hay servicios con los filtros aplicados.';
    tbody.innerHTML = `<tr><td colspan="7">${mensaje}</td></tr>`;
    renderPaginacion('paginacionServicios', 1, 1, 'cambiarPaginaServicios');
    return;
  }

  const { pagina, totalPaginas, items } = paginar(serviciosFiltrados, paginaServicios, 8);
  paginaServicios = pagina;

  tbody.innerHTML = items.map(servicio => {
    const nombre = escapeHtml(servicio.nombre);
    const descripcion = escapeHtml(servicio.descripcion || '');
    const imagenUrl = sanitizeUrl((servicio.imagenes && servicio.imagenes[0]) || servicio.imagen || '');
    const imagenTag = imagenUrl
      ? `<img src="${escapeHtml(imagenUrl)}" alt="${nombre}" style="width:60px;height:60px;object-fit:cover;border-radius:10px;" />`
      : '-';
    const activo = servicio.activo !== false;
    const comision = parseInt(servicio.comisionColaborador) || 0;
    const estadoSelect = `
      <select class="form-control form-control-sm" onchange="cambiarEstadoServicio('${escapeHtml(servicio.id)}', this.value)">
        <option value="activo" ${activo ? 'selected' : ''}>Activo</option>
        <option value="inactivo" ${!activo ? 'selected' : ''}>Inactivo</option>
      </select>
    `;

    return `
      <tr>
        <td>${imagenTag}</td>
        <td><strong>${nombre}</strong><br><small>${descripcion}</small></td>
        <td>${estadoSelect}</td>
        <td>${parseInt(servicio.duracion).toLocaleString('es-PY')} min</td>
        <td>${parseInt(servicio.precio).toLocaleString('es-PY')} Gs</td>
        <td>${comision}%</td>
        <td>
          <button class="btn btn-secondary" onclick="editarServicio('${escapeHtml(servicio.id)}')">Editar</button>
          <button class="btn btn-secondary" onclick="eliminarServicio('${escapeHtml(servicio.id)}')">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginacion('paginacionServicios', paginaServicios, totalPaginas, 'cambiarPaginaServicios');
}

function abrirModalServicio(servicioId = null) {
  servicioEditando = servicioId ? servicios.find(s => s.id === servicioId) : null;

  if (servicioEditando) {
    document.getElementById('modalTituloServicio').textContent = 'Editar servicio';
    document.getElementById('inputNombreServicio').value = servicioEditando.nombre;
    document.getElementById('inputDescripcionServicio').value = servicioEditando.descripcion || '';
    document.getElementById('inputDuracionServicio').value = servicioEditando.duracion;
    document.getElementById('inputPrecioServicio').value = servicioEditando.precio;
    document.getElementById('inputComisionServicio').value = servicioEditando.comisionColaborador || 0;
    document.getElementById('inputCategoriaServicio').value = servicioEditando.categoria || 'corte';
    document.getElementById('inputImagenServicio').value = '';
    const activoInput = document.getElementById('inputActivoServicio');
    if (activoInput) activoInput.checked = servicioEditando.activo !== false;
    const imagenes = Array.isArray(servicioEditando.imagenes) && servicioEditando.imagenes.length
      ? servicioEditando.imagenes
      : (servicioEditando.imagen ? [servicioEditando.imagen] : []);
    setImagenesServicio(imagenes);
  } else {
    document.getElementById('modalTituloServicio').textContent = 'Nuevo servicio';
    document.getElementById('inputNombreServicio').value = '';
    document.getElementById('inputDescripcionServicio').value = '';
    document.getElementById('inputDuracionServicio').value = '60';
    document.getElementById('inputPrecioServicio').value = '100000';
    document.getElementById('inputComisionServicio').value = '40';
    document.getElementById('inputCategoriaServicio').value = 'corte';
    document.getElementById('inputImagenServicio').value = '';
    const activoInput = document.getElementById('inputActivoServicio');
    if (activoInput) activoInput.checked = true;
    setImagenesServicio([]);
  }

  abrirModal('modalServicio', '#inputNombreServicio');
}

function cerrarModalServicio() {
  cerrarModal('modalServicio');
  servicioEditando = null;
  imagenesServicioTemp = [];
}

async function guardarServicio() {
  const nombre = document.getElementById('inputNombreServicio').value.trim();
  const descripcion = document.getElementById('inputDescripcionServicio').value.trim();
  const duracion = parseInt(document.getElementById('inputDuracionServicio').value);
  const precio = parseInt(document.getElementById('inputPrecioServicio').value);
  const comision = parseInt(document.getElementById('inputComisionServicio').value || '0', 10);
  const categoria = document.getElementById('inputCategoriaServicio').value;
  const imagenInput = document.getElementById('inputImagenServicio').value.trim();
  if (imagenInput) agregarImagenServicio(imagenInput, true);
  const imagenes = [...imagenesServicioTemp];
  const imagen = imagenes[0] || '';
  const activo = document.getElementById('inputActivoServicio')?.checked !== false;

  if (!nombre || !duracion || !precio) {
    mostrarNotificacion('Nombre, duración y precio son obligatorios', 'error');
    return;
  }

  const payload = { nombre, descripcion, duracion, precio, categoria, imagen, imagenes, activo, comisionColaborador: comision };

  try {
    let response;
    if (servicioEditando) {
      payload.id = servicioEditando.id;
      response = await fetch('/api/servicios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch('/api/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      mostrarNotificacion('Servicio guardado', 'success');
      cerrarModalServicio();
      await cargarDatosAdmin();
      return;
    }
    throw new Error(result.error || 'Error en la respuesta');
  } catch (error) {
    console.error('Error guardando servicio:', error);
    mostrarNotificacion('Error al guardar el servicio', 'error');
  }
}

async function eliminarServicio(id) {
  if (!confirm('¿Eliminar este servicio?')) return;
  try {
    const response = await fetch(`/api/servicios?id=${id}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      mostrarNotificacion('Servicio eliminado', 'success');
      await cargarDatosAdmin();
      return;
    }
    throw new Error(result.error || 'Error al eliminar el servicio');
  } catch (error) {
    mostrarNotificacion('Error al eliminar el servicio', 'error');
  }
}

function editarServicio(id) { abrirModalServicio(id); }

function limpiarFiltrosServicios() {
  const texto = document.getElementById('filtroServiciosTexto');
  const estado = document.getElementById('filtroServiciosEstado');
  const buscador = document.getElementById('buscadorServicios');
  if (texto) texto.value = '';
  if (buscador) buscador.value = '';
  if (estado) {
    estado.value = '';
    estado.selectedIndex = 0;
  }
  limpiarResultadosBuscadorServicios();
  actualizarListaServicios();
}

async function cambiarEstadoServicio(id, valor) {
  const activo = valor === 'activo';
  try {
    const response = await fetch('/api/servicios', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, activo })
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      mostrarNotificacion('Estado actualizado', 'success');
      await cargarDatosAdmin();
      return;
    }
    throw new Error(result.error || 'Error actualizando servicio');
  } catch (error) {
    mostrarNotificacion('Error al actualizar el estado', 'error');
  }
}

function cambiarPaginaServicios(pagina) {
  paginaServicios = pagina;
  actualizarListaServicios();
}

// LOOKBOOK
async function cargarLookbookAdmin() {
  try {
    setTableLoading('listaLookbook', 5, 'Cargando lookbook...');
    const response = await fetch('/api/lookbook?admin=1');
    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!response.ok) throw new Error('Error al cargar lookbook');
    const data = await response.json();
    lookbook = Array.isArray(data) ? data : [];
    actualizarListaLookbook();
  } catch (error) {
    console.error('Error cargando lookbook:', error);
    mostrarNotificacion('Error al cargar lookbook', 'error');
  }
}

function actualizarListaLookbook() {
  const tbody = document.getElementById('listaLookbook');
  if (!tbody) return;

  const texto = document.getElementById('filtroLookbookTexto')?.value.trim().toLowerCase() || '';
  const estadoFiltro = document.getElementById('filtroLookbookEstado')?.value || '';
  if (texto !== ultimoFiltroLookbook.texto || estadoFiltro !== ultimoFiltroLookbook.estado) {
    paginaLookbook = 1;
    ultimoFiltroLookbook = { texto, estado: estadoFiltro };
  }

  let lookbookFiltrado = [...lookbook];
  if (texto) {
    lookbookFiltrado = lookbookFiltrado.filter(item => {
      const titulo = (item.titulo || '').toLowerCase();
      const descripcion = (item.descripcion || '').toLowerCase();
      return titulo.includes(texto) || descripcion.includes(texto);
    });
  }
  if (estadoFiltro) {
    lookbookFiltrado = lookbookFiltrado.filter(item => {
      const activo = item.activo !== false;
      return estadoFiltro === 'activo' ? activo : !activo;
    });
  }

  if (!lookbookFiltrado.length) {
    const mensaje = lookbook.length === 0
      ? 'No hay items de lookbook.'
      : 'No hay items con los filtros aplicados.';
    tbody.innerHTML = `<tr><td colspan="5">${mensaje}</td></tr>`;
    renderPaginacion('paginacionLookbook', 1, 1, 'cambiarPaginaLookbook');
    return;
  }

  const { pagina, totalPaginas, items } = paginar(lookbookFiltrado, paginaLookbook, 8);
  paginaLookbook = pagina;

  tbody.innerHTML = items.map(item => {
    const titulo = escapeHtml(item.titulo);
    const imagenUrl = sanitizeUrl(item.imagen || '');
    const imagenTag = imagenUrl
      ? `<img src="${escapeHtml(imagenUrl)}" alt="${titulo}" style="width:70px;height:70px;object-fit:cover;border-radius:10px;" />`
      : '-';
    const estado = item.activo !== false ? 'Activo' : 'Inactivo';
    const orden = item.orden !== undefined ? escapeHtml(String(item.orden)) : '-';

    return `
      <tr>
        <td>${imagenTag}</td>
        <td><strong>${titulo}</strong><br><small>${escapeHtml(item.descripcion || '')}</small></td>
        <td>${estado}</td>
        <td>${orden}</td>
        <td>
          <button class="btn btn-secondary" onclick="abrirModalLookbook('${escapeHtml(item.id)}')">Editar</button>
          <button class="btn btn-secondary" onclick="eliminarLookbook('${escapeHtml(item.id)}')">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginacion('paginacionLookbook', paginaLookbook, totalPaginas, 'cambiarPaginaLookbook');
}

function abrirModalLookbook(itemId = null) {
  lookbookEditando = itemId ? lookbook.find(item => item.id === itemId) : null;

  if (lookbookEditando) {
    document.getElementById('modalTituloLookbook').textContent = 'Editar lookbook';
    document.getElementById('inputTituloLookbook').value = lookbookEditando.titulo || '';
    document.getElementById('inputDescripcionLookbook').value = lookbookEditando.descripcion || '';
    document.getElementById('inputOrdenLookbook').value = lookbookEditando.orden !== undefined ? lookbookEditando.orden : 1;
    document.getElementById('inputActivoLookbook').checked = lookbookEditando.activo !== false;
    const imagenUrl = sanitizeUrl(lookbookEditando.imagen || '');
    document.getElementById('inputImagenLookbook').value = imagenUrl || '';
    document.getElementById('previewImagenLookbook').innerHTML = imagenUrl
      ? `<img src="${escapeHtml(imagenUrl)}" style="max-width:200px;border-radius:10px;" />`
      : '';
  } else {
    document.getElementById('modalTituloLookbook').textContent = 'Nuevo lookbook';
    document.getElementById('inputTituloLookbook').value = '';
    document.getElementById('inputDescripcionLookbook').value = '';
    document.getElementById('inputOrdenLookbook').value = '1';
    document.getElementById('inputActivoLookbook').checked = true;
    document.getElementById('inputImagenLookbook').value = '';
    document.getElementById('previewImagenLookbook').innerHTML = '';
  }

  abrirModal('modalLookbook', '#inputTituloLookbook');
}

function cerrarModalLookbook() {
  cerrarModal('modalLookbook');
  lookbookEditando = null;
}

function limpiarFiltrosLookbook() {
  const texto = document.getElementById('filtroLookbookTexto');
  const estado = document.getElementById('filtroLookbookEstado');
  if (texto) texto.value = '';
  if (estado) {
    estado.value = '';
    estado.selectedIndex = 0;
  }
  actualizarListaLookbook();
}

function cambiarPaginaLookbook(pagina) {
  paginaLookbook = pagina;
  actualizarListaLookbook();
}

async function guardarLookbook() {
  const titulo = document.getElementById('inputTituloLookbook').value.trim();
  const descripcion = document.getElementById('inputDescripcionLookbook').value.trim();
  const orden = parseInt(document.getElementById('inputOrdenLookbook').value, 10) || 1;
  const activo = document.getElementById('inputActivoLookbook').checked;
  const imagen = document.getElementById('inputImagenLookbook').value.trim();

  if (!titulo) {
    mostrarNotificacion('El título es obligatorio', 'error');
    return;
  }

  if (!lookbookEditando && !imagen) {
    mostrarNotificacion('La imagen es obligatoria', 'error');
    return;
  }

  const payload = { titulo, descripcion, orden, activo };
  if (imagen) payload.imagen = imagen;

  try {
    let response;
    if (lookbookEditando) {
      payload.id = lookbookEditando.id;
      response = await fetch('/api/lookbook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch('/api/lookbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      mostrarNotificacion('Lookbook guardado', 'success');
      cerrarModalLookbook();
      await cargarLookbookAdmin();
      return;
    }
    throw new Error(result.error || 'Error al guardar lookbook');
  } catch (error) {
    mostrarNotificacion('Error al guardar lookbook', 'error');
  }
}

async function eliminarLookbook(id) {
  if (!confirm('¿Eliminar este item del lookbook?')) return;
  try {
    const response = await fetch(`/api/lookbook?id=${id}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      mostrarNotificacion('Lookbook eliminado', 'success');
      await cargarLookbookAdmin();
      return;
    }
    throw new Error(result.error || 'Error al eliminar lookbook');
  } catch (error) {
    mostrarNotificacion('Error al eliminar lookbook', 'error');
  }
}

async function previsualizarImagenLookbook(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = async function (e) {
      const imageData = e.target.result;
      document.getElementById('previewImagenLookbook').innerHTML = `<div>Cargando imagen...</div>`;
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData })
        });
        const result = await response.json();
        if (result.success) {
          const safeUrl = sanitizeUrl(result.url);
          if (!safeUrl) throw new Error('URL inválida');
          document.getElementById('inputImagenLookbook').value = safeUrl;
          document.getElementById('previewImagenLookbook').innerHTML = `<img src="${escapeHtml(safeUrl)}" style="max-width:200px;border-radius:10px;" />`;
        } else {
          throw new Error(result.error || 'Error subiendo imagen');
        }
      } catch (error) {
        mostrarNotificacion('Error subiendo imagen', 'error');
        document.getElementById('previewImagenLookbook').innerHTML = '';
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function minutosDesdeHora(hora) {
  if (!/^\d{2}:\d{2}$/.test(String(hora || ''))) return null;
  const [h, m] = String(hora).split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h * 60) + m;
}

function obtenerHorarioAtencionFechaAdmin(fecha) {
  const cfg = configAdmin || {};
  const baseApertura = cfg.horarioApertura || '09:00';
  const baseCierre = cfg.horarioCierre || '19:00';
  const horarios = cfg.horariosPorDia || {};
  const date = new Date(`${fecha}T00:00:00`);
  const day = Number.isNaN(date.getTime()) ? 1 : date.getDay();
  const key = day === 0 ? 'dom' : (day === 6 ? 'sab' : 'lunVie');
  const entry = horarios[key] || {};
  const activo = entry.activo !== false;
  const apertura = entry.apertura || baseApertura;
  const cierre = entry.cierre || baseCierre;
  const inicio = minutosDesdeHora(apertura);
  const fin = minutosDesdeHora(cierre);
  if (!activo || inicio === null || fin === null || inicio >= fin) {
    return { activo: false, inicio: 0, fin: 0, apertura, cierre };
  }
  return { activo: true, inicio, fin, apertura, cierre };
}

function cargarConfiguracionColumnasTurnos() {
  try {
    const raw = localStorage.getItem(TURNOS_COLUMNAS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    columnasTurnosConfig = {
      ...columnasTurnosConfig,
      ...parsed
    };
  } catch (error) {
    console.warn('No se pudo cargar configuración de columnas:', error);
  }
}

function togglePanelColumnasTurnos() {
  const panel = document.getElementById('panelColumnasTurnos');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

function aplicarConfiguracionColumnasTurnos(guardarStorage = true) {
  const mapaChecks = {
    cliente: document.getElementById('colTurnoCliente'),
    servicios: document.getElementById('colTurnoServicios'),
    fecha: document.getElementById('colTurnoFecha'),
    hora: document.getElementById('colTurnoHora'),
    colaborador: document.getElementById('colTurnoColaborador'),
    estado: document.getElementById('colTurnoEstado'),
    acciones: document.getElementById('colTurnoAcciones')
  };

  Object.entries(mapaChecks).forEach(([key, input]) => {
    if (input && typeof input.checked === 'boolean') {
      if (guardarStorage) {
        columnasTurnosConfig[key] = input.checked;
      } else {
        input.checked = columnasTurnosConfig[key] !== false;
      }
    }
  });

  if (guardarStorage) {
    localStorage.setItem(TURNOS_COLUMNAS_STORAGE_KEY, JSON.stringify(columnasTurnosConfig));
  }

  Object.entries(columnasTurnosConfig).forEach(([key, enabled]) => {
    const hidden = enabled === false;
    document.querySelectorAll(`th[data-col="${key}"], .col-turno-${key}`).forEach(node => {
      node.classList.toggle('is-hidden', hidden);
    });
  });
}

function guardarFiltrosTurnosActuales() {
  const payload = {
    texto: document.getElementById('filtroTextoTurnos')?.value || '',
    estado: document.getElementById('filtroEstado')?.value || '',
    fecha: document.getElementById('filtroFecha')?.value || ''
  };
  localStorage.setItem(TURNOS_FILTROS_STORAGE_KEY, JSON.stringify(payload));
  mostrarNotificacion('Filtros de turnos guardados', 'success');
}

function restaurarFiltrosTurnosGuardados(silencioso = false) {
  try {
    const raw = localStorage.getItem(TURNOS_FILTROS_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    const texto = document.getElementById('filtroTextoTurnos');
    const estado = document.getElementById('filtroEstado');
    const fecha = document.getElementById('filtroFecha');
    if (texto) texto.value = data.texto || '';
    if (estado) estado.value = data.estado || '';
    if (fecha) fecha.value = data.fecha || '';
    if (!silencioso) {
      actualizarListaTurnos();
      mostrarNotificacion('Filtros restaurados', 'info');
    }
  } catch (error) {
    console.warn('No se pudieron restaurar filtros:', error);
  }
}

function actualizarKpiTurnos(turnosFiltrados = []) {
  const noShowEl = document.getElementById('kpiNoShow');
  const confirmacionEl = document.getElementById('kpiConfirmacion');
  const ocupacionEl = document.getElementById('kpiOcupacionHora');
  if (!noShowEl || !confirmacionEl || !ocupacionEl) return;

  const relevantes = turnosFiltrados.filter(t => normalizarEstadoTurnoUI(t.estado) !== 'cancelado');
  const total = relevantes.length || 1;
  const noShow = relevantes.filter(t => normalizarEstadoTurnoUI(t.estado) === 'no_show').length;
  const confirmados = relevantes.filter(t => ['confirmado', 'en_camino', 'en_servicio', 'finalizado'].includes(normalizarEstadoTurnoUI(t.estado))).length;

  noShowEl.textContent = `${Math.round((noShow / total) * 100)}%`;
  confirmacionEl.textContent = `${Math.round((confirmados / total) * 100)}%`;

  const fechaFoco = document.getElementById('filtroFecha')?.value || new Date().toISOString().split('T')[0];
  const horario = obtenerHorarioAtencionFechaAdmin(fechaFoco);
  if (!horario.activo) {
    ocupacionEl.textContent = 'Sin jornada';
    return;
  }
  const turnosDia = turnos.filter(t => t.fecha === fechaFoco && !['cancelado', 'no_show'].includes(normalizarEstadoTurnoUI(t.estado)));
  const totalMinJornada = Math.max(1, horario.fin - horario.inicio);
  const ocupacionMinutos = turnosDia.reduce((acc, t) => acc + (parseInt(t.duracion, 10) || 0), 0);

  const horas = {};
  turnosDia.forEach(t => {
    const hora = String(t.hora || '').slice(0, 2);
    if (!hora) return;
    horas[hora] = (horas[hora] || 0) + (parseInt(t.duracion, 10) || 0);
  });
  const topHora = Object.entries(horas).sort((a, b) => b[1] - a[1])[0];
  const porcentaje = Math.min(100, Math.round((ocupacionMinutos / totalMinJornada) * 100));
  ocupacionEl.textContent = topHora ? `${topHora[0]}:00 · ${porcentaje}%` : `${porcentaje}%`;
}

function renderTimelineTurnosDia(turnosFiltrados = []) {
  const box = document.getElementById('turnosTimelineDia');
  if (!box) return;
  const fechaFoco = document.getElementById('filtroFecha')?.value || new Date().toISOString().split('T')[0];
  const lista = turnosFiltrados
    .filter(t => t.fecha === fechaFoco)
    .sort((a, b) => new Date(`${a.fecha}T${a.hora || '00:00'}`) - new Date(`${b.fecha}T${b.hora || '00:00'}`));
  if (!lista.length) {
    box.innerHTML = '<div class="empty-state">No hay turnos para ese día.</div>';
    return;
  }
  box.innerHTML = lista.map(turno => {
    const estadoCanon = normalizarEstadoTurnoUI(turno.estado);
    const serviciosTexto = (turno.servicios || []).map(s => s.nombre).join(', ') || turno.servicio || 'Sin servicio';
    const sobreturnoClass = turno.sobreturno ? 'sobreturno' : '';
    return `
      <article class="turnos-timeline-item ${sobreturnoClass}">
        <div class="turnos-timeline-head">
          <strong>${escapeHtml(turno.hora || '--:--')} · ${escapeHtml(turno.nombre || '')}</strong>
          <span class="status-pill ${estadoCanon}">${escapeHtml(etiquetaEstadoTurno(estadoCanon))}</span>
        </div>
        <div class="turnos-timeline-meta">${escapeHtml(serviciosTexto)} · ${escapeHtml(turno.colaboradorNombre || 'Sin asignar')}</div>
        ${turno.sobreturno ? `<small class="turnos-timeline-meta">Sobreturno: ${escapeHtml(turno.sobreturnoMotivo || 'Sin motivo')}</small>` : ''}
      </article>
    `;
  }).join('');
}

function actualizarListaTurnos() {
  const tbody = document.getElementById('listaTurnos');
  if (!tbody) return;

  const estadoFiltro = document.getElementById('filtroEstado')?.value;
  const fechaFiltro = document.getElementById('filtroFecha')?.value;
  const textoFiltro = document.getElementById('filtroTextoTurnos')?.value.trim().toLowerCase() || '';
  if (textoFiltro !== ultimoFiltroTurnos.texto || estadoFiltro !== ultimoFiltroTurnos.estado || fechaFiltro !== ultimoFiltroTurnos.fecha) {
    paginaTurnos = 1;
    ultimoFiltroTurnos = { texto: textoFiltro, estado: estadoFiltro, fecha: fechaFiltro };
  }
  localStorage.setItem(TURNOS_FILTROS_STORAGE_KEY, JSON.stringify({
    texto: textoFiltro,
    estado: estadoFiltro || '',
    fecha: fechaFiltro || ''
  }));

  let turnosFiltrados = [...turnos];
  if (estadoFiltro) turnosFiltrados = turnosFiltrados.filter(t => normalizarEstadoTurnoUI(t.estado) === normalizarEstadoTurnoUI(estadoFiltro));
  if (fechaFiltro) turnosFiltrados = turnosFiltrados.filter(t => t.fecha === fechaFiltro);
  if (textoFiltro) {
    turnosFiltrados = turnosFiltrados.filter(t => {
      const serviciosTexto = (t.servicios || []).map(s => s.nombre).join(', ') || t.servicio || '';
      const nombre = (t.nombre || '').toLowerCase();
      const ci = (t.ci || '').toLowerCase();
      const telefono = (t.telefono || '').toLowerCase();
      const serviciosLower = serviciosTexto.toLowerCase();
      return nombre.includes(textoFiltro) || ci.includes(textoFiltro) || telefono.includes(textoFiltro) || serviciosLower.includes(textoFiltro);
    });
  }

  turnosFiltrados.sort((a, b) => new Date(a.fecha + 'T' + a.hora) - new Date(b.fecha + 'T' + b.hora));

  if (!turnosFiltrados.length) {
    const mensaje = turnos.length === 0
      ? 'No hay turnos registrados.'
      : 'No hay turnos con los filtros aplicados.';
    tbody.innerHTML = `<tr><td colspan="7">${mensaje}</td></tr>`;
    renderPaginacion('paginacionTurnos', 1, 1, 'cambiarPaginaTurnos');
    actualizarKpiTurnos([]);
    renderTimelineTurnosDia([]);
    return;
  }

  const { pagina, totalPaginas, items } = paginar(turnosFiltrados, paginaTurnos, 10);
  paginaTurnos = pagina;

  tbody.innerHTML = items.map(turno => {
    const serviciosTexto = (turno.servicios || []).map(s => s.nombre).join(', ') || turno.servicio || '';
    const nombre = escapeHtml(turno.nombre);
    const ci = escapeHtml(turno.ci);
    const telefono = escapeHtml(turno.telefono);
    const serviciosEsc = escapeHtml(serviciosTexto);
    const fecha = escapeHtml(turno.fecha);
    const hora = escapeHtml(turno.hora);
    const estadoRaw = (turno.estado || 'pendiente').toLowerCase();
    const estadoCanon = normalizarEstadoTurnoUI(estadoRaw);
    const estadoClass = escapeHtml(estadoCanon || 'pendiente');
    const estadoTexto = escapeHtml(etiquetaEstadoTurno(estadoCanon));
    const contactos = parseInt(turno.contactos || 0, 10);
    const ultimoContacto = turno.ultimoContacto ? new Date(turno.ultimoContacto).toLocaleDateString('es-ES') : 'Sin contacto';
    const colab = escapeHtml(turno.colaboradorNombre || 'Sin asignar');

    const duracion = parseInt(turno.duracion) || 0;
    const precio = parseInt(turno.precio) || 0;

    return `
      <tr>
        <td class="col-turno-cliente"><strong>${nombre}</strong><br><small>CI: ${ci} · Tel: ${telefono} · Contactos: ${contactos} · ${ultimoContacto}</small>${turno.sobreturno ? '<br><small style="color:#b45309;">Sobreturno</small>' : ''}</td>
        <td class="col-turno-servicios">${serviciosEsc}<br><small>${duracion} min · ${precio.toLocaleString('es-PY')} Gs</small></td>
        <td class="col-turno-fecha">${fecha}</td>
        <td class="col-turno-hora">${hora}</td>
        <td class="col-turno-colaborador">${colab}</td>
        <td class="col-turno-estado"><span class="status-pill ${estadoClass}">${estadoTexto}</span></td>
        <td class="col-turno-acciones">
          <select class="form-control form-control-sm" onchange="cambiarEstadoTurno('${turno.id}', this.value)">
            ${renderEstadoOptions(estadoCanon)}
          </select>
          <div class="table-actions">
            <button class="btn btn-secondary" onclick="abrirModalTurno('${turno.id}')">Editar</button>
            <button class="btn btn-secondary" onclick="contactarClienteWhatsApp('${turno.id}', { template: 'confirmacion' })">Confirmaci&oacute;n</button>
            <button class="btn btn-secondary" onclick="contactarClienteWhatsApp('${turno.id}', { template: 'recordatorio' })">Recordatorio</button>
            <button class="btn btn-secondary" onclick="contactarClienteWhatsApp('${turno.id}', { template: 'reprogramacion' })">Reprogramar</button>
            <button class="btn btn-secondary" onclick="abrirModalContacto('${turno.id}')">Mensaje</button>
            <button class="btn btn-secondary" onclick="eliminarTurno('${turno.id}')">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginacion('paginacionTurnos', paginaTurnos, totalPaginas, 'cambiarPaginaTurnos');
  aplicarConfiguracionColumnasTurnos(false);
  actualizarKpiTurnos(turnosFiltrados);
  renderTimelineTurnosDia(turnosFiltrados);
}

async function contactarClienteWhatsApp(turnoId, options = {}) {
  const turno = turnos.find(t => t.id === turnoId);
  if (!turno) return;

  const template = options.template || 'recordatorio';
  const mensaje = construirMensajeWhatsAppTurno(turno, template);

  const telefonoLimpio = turno.telefono.replace(/\D/g, '');
  let telefonoCompleto = telefonoLimpio;
  if (!telefonoLimpio.startsWith('595') && telefonoLimpio.length <= 9) {
    telefonoCompleto = '595' + telefonoLimpio;
  }

  await registrarContacto(turnoId, `whatsapp_${template}`, mensaje);
  const url = `https://wa.me/${telefonoCompleto}?text=${encodeURIComponent(mensaje)}`;
  if (options.openInNewTab === false) {
    window.location.href = url;
    return;
  }
  window.open(url, '_blank', 'noopener');
}

async function registrarContacto(turnoId, canal = 'contacto', mensaje = '') {
  try {
    const turno = turnos.find(t => t.id === turnoId);
    if (!turno) return;
    const resumenMensaje = mensaje ? String(mensaje).slice(0, 160) : '';
    const fechaContacto = new Date().toISOString();
    turno.contactos = (turno.contactos || 0) + 1;
    turno.ultimoContacto = fechaContacto;
    if (!Array.isArray(turno.contactoHistorial)) turno.contactoHistorial = [];
    turno.contactoHistorial.push({ fecha: fechaContacto, canal, mensaje: resumenMensaje });
    await fetch('/api/turnos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: turnoId,
        ultimoContacto: fechaContacto,
        contactos: turno.contactos || 0,
        contactoHistorial: {
          fecha: fechaContacto,
          canal,
          mensaje: resumenMensaje
        }
      })
    });
  } catch (error) {
    console.error('Error registrando contacto:', error);
  }
}

function abrirModalContacto(turnoId) {
  turnoContactando = turnos.find(t => t.id === turnoId);
  if (!turnoContactando) return;

  const serviciosTexto = (turnoContactando.servicios || []).map(s => s.nombre).join(', ') || turnoContactando.servicio || '';

  document.getElementById('contactoCliente').value = turnoContactando.nombre;
  document.getElementById('contactoTelefono').value = turnoContactando.telefono;
  document.getElementById('contactoServicio').value = `${serviciosTexto} · ${turnoContactando.fecha} ${turnoContactando.hora}`;
  document.getElementById('contactoMensaje').value = `Hola ${turnoContactando.nombre}, te contacto por tu reserva de ${serviciosTexto} el ${turnoContactando.fecha} a las ${turnoContactando.hora}.`;

  abrirModal('modalContacto', '#contactoMensaje');
}

function cerrarModalContacto() {
  cerrarModal('modalContacto');
  turnoContactando = null;
}

function enviarMensajePersonalizado() {
  if (!turnoContactando) return;
  const mensaje = document.getElementById('contactoMensaje').value;
  const telefonoLimpio = turnoContactando.telefono.replace(/\D/g, '');
  let telefonoCompleto = telefonoLimpio;
  if (!telefonoLimpio.startsWith('595') && telefonoLimpio.length <= 9) {
    telefonoCompleto = '595' + telefonoLimpio;
  }
  window.location.href = `https://wa.me/${telefonoCompleto}?text=${encodeURIComponent(mensaje)}`;
  cerrarModalContacto();
  registrarContacto(turnoContactando.id, 'mensaje', mensaje);
}

function abrirModalTurno(turnoId = null) {
  turnoEditando = turnoId ? turnos.find(t => t.id === turnoId) : null;
  const hoy = new Date().toISOString().split('T')[0];
  const titulo = document.getElementById('modalTituloTurno');
  if (titulo) titulo.textContent = turnoEditando ? 'Editar turno' : 'Nuevo turno';

  document.getElementById('inputNombreTurno').value = turnoEditando?.nombre || '';
  document.getElementById('inputCiTurno').value = turnoEditando?.ci || '';
  document.getElementById('inputTelefonoTurno').value = turnoEditando?.telefono || '';
  document.getElementById('inputEstadoTurno').value = turnoEditando?.estado || 'pendiente';
  document.getElementById('inputFechaTurno').value = turnoEditando?.fecha || hoy;
  document.getElementById('inputHoraTurno').value = turnoEditando?.hora || '';
  document.getElementById('inputSobreturnoTurno').checked = turnoEditando?.sobreturno === true;
  document.getElementById('inputSobreturnoMotivo').value = turnoEditando?.sobreturnoMotivo || '';
  document.getElementById('inputNotaInternaTurno').value = turnoEditando?.notaInterna || '';
  renderColaboradorSelect(turnoEditando?.colaboradorId || '');

  const seleccionIds = obtenerServiciosSeleccionadosTurno(turnoEditando);
  renderServiciosTurno(seleccionIds);
  actualizarResumenTurno();
  cargarDisponibilidadTurno();
  limpiarErrorTurno();
  abrirModal('modalTurno', '#inputNombreTurno');
}

function cerrarModalTurno() {
  cerrarModal('modalTurno');
  turnoEditando = null;
  horariosDisponiblesTurno = [];
}

function limpiarErrorTurno() {
  const error = document.getElementById('turnoError');
  if (!error) return;
  error.style.display = 'none';
  error.textContent = '';
}

function mostrarErrorTurno(mensaje) {
  const error = document.getElementById('turnoError');
  if (!error) return;
  error.textContent = mensaje;
  error.style.display = 'block';
}

function obtenerServiciosSeleccionadosTurno(turnoActual) {
  if (!turnoActual) return [];
  if (Array.isArray(turnoActual.servicios) && turnoActual.servicios.length) {
    return turnoActual.servicios.map(s => s.id).filter(Boolean);
  }
  if (turnoActual.servicio) {
    const match = servicios.find(s => s.id === turnoActual.servicio || s.nombre === turnoActual.servicio);
    return match ? [match.id] : [];
  }
  return [];
}

function renderServiciosTurno(seleccionIds = []) {
  const container = document.getElementById('turnoServiciosList');
  if (!container) return;
  if (!servicios.length) {
    container.innerHTML = '<div class="empty-state">No hay servicios disponibles.</div>';
    return;
  }
  container.innerHTML = servicios.map(servicio => {
    const checked = seleccionIds.includes(servicio.id);
    const inactivo = servicio.activo === false;
    const disabled = inactivo && !checked ? 'disabled' : '';
    const nombre = escapeHtml(servicio.nombre);
    const duracion = parseInt(servicio.duracion) || 0;
    const precio = parseInt(servicio.precio) || 0;
    const estadoTexto = inactivo ? ' · Inactivo' : '';
    return `
      <label>
        <input type="checkbox" value="${escapeHtml(servicio.id)}" ${checked ? 'checked' : ''} ${disabled} onchange="actualizarTurnoServicios()" />
        <div>
          <strong>${nombre}</strong>${estadoTexto}
          <div class="check-meta">${duracion} min · ${precio.toLocaleString('es-PY')} Gs</div>
        </div>
      </label>
    `;
  }).join('');
}

function obtenerServiciosSeleccionadosIds() {
  return Array.from(document.querySelectorAll('#turnoServiciosList input[type="checkbox"]:checked'))
    .map(el => el.value);
}

function obtenerResumenServicios() {
  const ids = obtenerServiciosSeleccionadosIds();
  const seleccion = servicios.filter(s => ids.includes(s.id));
  const duracion = seleccion.reduce((acc, s) => acc + (parseInt(s.duracion) || 0), 0);
  const precio = seleccion.reduce((acc, s) => acc + (parseInt(s.precio) || 0), 0);
  return { ids, seleccion, duracion, precio };
}

function renderColaboradorSelect(seleccionado = '') {
  const select = document.getElementById('inputColaboradorTurno');
  if (!select) return;
  const opciones = colaboradores.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === seleccionado ? 'selected' : ''}>${escapeHtml(c.nombre || c.username || 'Colaborador')}</option>`);
  select.innerHTML = `<option value="">Auto asignar</option>${opciones.join('')}`;
}

function actualizarResumenTurno() {
  const resumen = document.getElementById('turnoResumen');
  if (!resumen) return;
  const { seleccion, duracion, precio } = obtenerResumenServicios();
  if (!seleccion.length) {
    resumen.innerHTML = '<strong>Selecciona al menos un servicio.</strong>';
    return;
  }
  const lista = seleccion.map(s => `<li>${escapeHtml(s.nombre)}</li>`).join('');
  resumen.innerHTML = `
    <strong>Resumen</strong>
    <ul>${lista}</ul>
    <div><strong>Duraci&oacute;n:</strong> ${duracion} min</div>
    <div><strong>Precio:</strong> ${precio.toLocaleString('es-PY')} Gs</div>
  `;
}

function actualizarTurnoServicios() {
  actualizarResumenTurno();
  cargarDisponibilidadTurno();
}

function renderHorariosDisponibles(horarios) {
  const container = document.getElementById('turnoHorarios');
  if (!container) return;
  horariosDisponiblesTurno = horarios;
  const horaActual = document.getElementById('inputHoraTurno')?.value || '';
  if (!horarios.length) {
    container.innerHTML = '<span class="empty-state">Sin horarios disponibles.</span>';
    return;
  }
  container.innerHTML = horarios.map(h => `
    <button type="button" class="suggestion-chip ${h === horaActual ? 'active' : ''}" onclick="seleccionarHorario('${h}')">${h}</button>
  `).join('');
}

function seleccionarHorario(hora) {
  const input = document.getElementById('inputHoraTurno');
  if (input) input.value = hora;
  renderHorariosDisponibles(horariosDisponiblesTurno);
}

function actualizarHorarioSeleccionado() {
  renderHorariosDisponibles(horariosDisponiblesTurno);
}

function cargarDisponibilidadTurno() {
  clearTimeout(disponibilidadTimer);
  disponibilidadTimer = setTimeout(async () => {
    const fecha = document.getElementById('inputFechaTurno')?.value;
    const { ids } = obtenerResumenServicios();
    const container = document.getElementById('turnoHorarios');
    if (!container) return;
    if (!fecha || !ids.length) {
      horariosDisponiblesTurno = [];
      container.innerHTML = '<span class="empty-state">Selecciona fecha y servicios.</span>';
      return;
    }
    container.innerHTML = '<span class="empty-state">Cargando horarios...</span>';
    try {
      const query = encodeURIComponent(ids.join(','));
      const response = await fetch(`/api/disponibilidad?fecha=${fecha}&servicios=${query}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Error consultando horarios');
      renderHorariosDisponibles(data.horariosDisponibles || []);
    } catch (error) {
      horariosDisponiblesTurno = [];
      container.innerHTML = '<span class="empty-state">No se pudieron cargar horarios.</span>';
    }
  }, 250);
}

async function guardarTurno() {
  const nombre = document.getElementById('inputNombreTurno').value.trim();
  const ci = document.getElementById('inputCiTurno').value.trim();
  const telefono = document.getElementById('inputTelefonoTurno').value.trim();
  const estado = document.getElementById('inputEstadoTurno').value;
  const fecha = document.getElementById('inputFechaTurno').value;
  const hora = document.getElementById('inputHoraTurno').value;
  const colaboradorId = document.getElementById('inputColaboradorTurno')?.value || null;
  const forzarSobreturno = document.getElementById('inputSobreturnoTurno')?.checked === true;
  const sobreturnoMotivo = document.getElementById('inputSobreturnoMotivo')?.value.trim() || '';
  const notaInterna = document.getElementById('inputNotaInternaTurno')?.value.trim() || '';
  const { ids } = obtenerResumenServicios();

  limpiarErrorTurno();

  if (!nombre || !ci || !telefono || !fecha || !hora || !ids.length) {
    mostrarErrorTurno('Completa todos los campos y selecciona al menos un servicio.');
    return;
  }

  const payload = {
    nombre,
    ci,
    telefono,
    fecha,
    hora,
    estado,
    servicios: ids,
    colaboradorId: colaboradorId || undefined,
    forzarSobreturno,
    sobreturnoMotivo,
    notaInterna
  };

  try {
    const response = await fetch('/api/turnos', {
      method: turnoEditando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(turnoEditando ? { ...payload, id: turnoEditando.id } : payload)
    });

    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (response.status === 409) {
      const sugerencias = Array.isArray(result.sugerencias) ? result.sugerencias : [];
      renderHorariosDisponibles(sugerencias);
      const msg = result.permiteSobreturno
        ? `${result.error || 'Horario no disponible.'} Marca "Permitir sobreturno manual" para forzar.`
        : (result.error || 'Horario no disponible.');
      mostrarErrorTurno(msg);
      return;
    }
    if (!response.ok || !result.success) throw new Error(result.error || 'Error al guardar turno');
    mostrarNotificacion('Turno guardado', 'success');
    cerrarModalTurno();
    await cargarDatosAdmin();
  } catch (error) {
    mostrarErrorTurno(error.message || 'Error al guardar el turno.');
  }
}

function filtrarTurnos() { actualizarListaTurnos(); }

function limpiarFiltros() {
  const estado = document.getElementById('filtroEstado');
  const fecha = document.getElementById('filtroFecha');
  const texto = document.getElementById('filtroTextoTurnos');

  if (estado) {
    estado.value = '';
    estado.selectedIndex = 0;
  }
  if (fecha) {
    fecha.value = '';
    fecha.removeAttribute('value');
  }
  if (texto) texto.value = '';
  localStorage.removeItem(TURNOS_FILTROS_STORAGE_KEY);
  actualizarListaTurnos();
}

function cambiarPaginaTurnos(pagina) {
  paginaTurnos = pagina;
  actualizarListaTurnos();
}

// CLIENTES
function construirClientes(listaTurnos = turnos) {
  const mapa = new Map();
  listaTurnos.forEach(turno => {
    const nombre = turno.nombre || '';
    const ci = turno.ci || '';
    const telefono = turno.telefono || '';
    const clave = (ci || telefono || nombre || '').toString().trim().toLowerCase();
    if (!clave) return;

    const fechaTurno = turno.fecha && turno.hora
      ? new Date(`${turno.fecha}T${turno.hora}`)
      : (turno.fecha ? new Date(`${turno.fecha}T00:00:00`) : null);

    const precio = parseInt(turno.precio) || 0;
    const ingreso = ['cancelado', 'no_show'].includes(normalizarEstadoTurnoUI(turno.estado)) ? 0 : precio;
    const contactos = parseInt(turno.contactos || 0, 10);

    if (!mapa.has(clave)) {
      mapa.set(clave, {
        clave,
        nombre,
        ci,
        telefono,
        turnos: [],
        contactos: 0,
        totalTurnos: 0,
        totalIngresos: 0,
        ultimoTurno: null,
        ultimoContacto: null,
        historialContactos: []
      });
    }

    const cliente = mapa.get(clave);
    if (!cliente.nombre && nombre) cliente.nombre = nombre;
    if (!cliente.ci && ci) cliente.ci = ci;
    if (!cliente.telefono && telefono) cliente.telefono = telefono;

    cliente.turnos.push(turno);
    cliente.totalTurnos += 1;
    cliente.contactos += contactos;
    cliente.totalIngresos += ingreso;

    if (fechaTurno && (!cliente.ultimoTurno || fechaTurno > cliente.ultimoTurno)) {
      cliente.ultimoTurno = fechaTurno;
    }

    if (turno.ultimoContacto) {
      const fechaContacto = new Date(turno.ultimoContacto);
      if (!cliente.ultimoContacto || fechaContacto > cliente.ultimoContacto) {
        cliente.ultimoContacto = fechaContacto;
      }
    }

    if (Array.isArray(turno.contactoHistorial)) {
      turno.contactoHistorial.forEach(item => {
        if (!item || !item.fecha) return;
        cliente.historialContactos.push({
          fecha: item.fecha,
          canal: item.canal || 'contacto',
          mensaje: item.mensaje || '',
          turnoId: turno.id,
          turnoFecha: turno.fecha,
          turnoHora: turno.hora
        });
      });
    }
  });

  return Array.from(mapa.values()).map((cliente, index) => {
    cliente._index = index;
    cliente.historialContactos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return cliente;
  }).sort((a, b) => b.totalTurnos - a.totalTurnos);
}

function actualizarListaClientes() {
  const tbody = document.getElementById('listaClientes');
  if (!tbody) return;

  const texto = document.getElementById('filtroClientesTexto')?.value.trim().toLowerCase() || '';
  const estado = document.getElementById('filtroClientesEstado')?.value || '';
  const desdeStr = document.getElementById('filtroClientesDesde')?.value || '';
  const hastaStr = document.getElementById('filtroClientesHasta')?.value || '';
  const ingresoMinStr = document.getElementById('filtroClientesIngresoMin')?.value || '';
  const ingresoMaxStr = document.getElementById('filtroClientesIngresoMax')?.value || '';

  if (texto !== ultimoFiltroClientes.texto ||
      estado !== ultimoFiltroClientes.estado ||
      desdeStr !== ultimoFiltroClientes.desde ||
      hastaStr !== ultimoFiltroClientes.hasta ||
      ingresoMinStr !== ultimoFiltroClientes.min ||
      ingresoMaxStr !== ultimoFiltroClientes.max) {
    paginaClientes = 1;
    ultimoFiltroClientes = { texto, estado, desde: desdeStr, hasta: hastaStr, min: ingresoMinStr, max: ingresoMaxStr };
  }

  let turnosBase = [...turnos];
  if (estado) {
    turnosBase = turnosBase.filter(t => normalizarEstadoTurnoUI(t.estado) === normalizarEstadoTurnoUI(estado));
  }

  let desde = desdeStr ? new Date(desdeStr + 'T00:00:00') : null;
  let hasta = hastaStr ? new Date(hastaStr + 'T23:59:59') : null;
  if (desde && hasta && desde > hasta) {
    const tmp = new Date(desde);
    desde = new Date(hasta);
    hasta = tmp;
  }
  if (desde || hasta) {
    turnosBase = turnosBase.filter(t => {
      if (!t.fecha) return false;
      const fecha = new Date(t.fecha + 'T00:00:00');
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    });
  }

  clientes = construirClientes(turnosBase);
  let clientesFiltrados = [...clientes];
  if (texto) {
    clientesFiltrados = clientesFiltrados.filter(c => {
      const nombre = (c.nombre || '').toLowerCase();
      const ci = (c.ci || '').toLowerCase();
      const telefono = (c.telefono || '').toLowerCase();
      return nombre.includes(texto) || ci.includes(texto) || telefono.includes(texto);
    });
  }

  const ingresoMin = ingresoMinStr !== '' ? parseInt(ingresoMinStr, 10) : null;
  const ingresoMax = ingresoMaxStr !== '' ? parseInt(ingresoMaxStr, 10) : null;
  if (ingresoMin !== null && !Number.isNaN(ingresoMin)) {
    clientesFiltrados = clientesFiltrados.filter(c => c.totalIngresos >= ingresoMin);
  }
  if (ingresoMax !== null && !Number.isNaN(ingresoMax)) {
    clientesFiltrados = clientesFiltrados.filter(c => c.totalIngresos <= ingresoMax);
  }

  if (!clientesFiltrados.length) {
    const hayFiltros = Boolean(texto || estado || desdeStr || hastaStr || ingresoMinStr || ingresoMaxStr);
    const mensaje = turnos.length === 0 || (!hayFiltros && clientes.length === 0)
      ? 'No hay clientes registrados.'
      : 'No hay clientes con los filtros aplicados.';
    tbody.innerHTML = `<tr><td colspan="7">${mensaje}</td></tr>`;
    renderPaginacion('paginacionClientes', 1, 1, 'cambiarPaginaClientes');
    return;
  }

  const { pagina, totalPaginas, items } = paginar(clientesFiltrados, paginaClientes, 10);
  paginaClientes = pagina;

  tbody.innerHTML = items.map(cliente => {
    const nombre = escapeHtml(cliente.nombre || 'Sin nombre');
    const ci = escapeHtml(cliente.ci || '-');
    const telefono = escapeHtml(cliente.telefono || '-');
    const ingresos = cliente.totalIngresos.toLocaleString('es-PY');
    const ultimoTurno = cliente.ultimoTurno ? cliente.ultimoTurno.toLocaleDateString('es-ES') : 'Sin turnos';
    const ultimoContacto = cliente.ultimoContacto ? cliente.ultimoContacto.toLocaleDateString('es-ES') : 'Sin contacto';

    return `
      <tr>
        <td><strong>${nombre}</strong><br><small>CI: ${ci} · Tel: ${telefono}</small></td>
        <td>${cliente.totalTurnos}</td>
        <td>${cliente.contactos}</td>
        <td>${ingresos} Gs</td>
        <td>${ultimoTurno}</td>
        <td>${ultimoContacto}</td>
        <td>
          <button class="btn btn-secondary" onclick="abrirModalCliente(${cliente._index})">Ver detalle</button>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginacion('paginacionClientes', paginaClientes, totalPaginas, 'cambiarPaginaClientes');
}

function limpiarFiltrosClientes() {
  const texto = document.getElementById('filtroClientesTexto');
  const estado = document.getElementById('filtroClientesEstado');
  const desde = document.getElementById('filtroClientesDesde');
  const hasta = document.getElementById('filtroClientesHasta');
  const min = document.getElementById('filtroClientesIngresoMin');
  const max = document.getElementById('filtroClientesIngresoMax');
  if (texto) texto.value = '';
  if (estado) {
    estado.value = '';
    estado.selectedIndex = 0;
  }
  if (desde) desde.value = '';
  if (hasta) hasta.value = '';
  if (min) min.value = '';
  if (max) max.value = '';
  actualizarListaClientes();
}

// =========================
// COLABORADORES
// =========================
function renderServiciosColabPicker() {
  const container = document.getElementById('colabServiciosList');
  if (!container) return;
  if (!servicios.length) {
    container.innerHTML = '<span class="form-help">Crea servicios primero.</span>';
    return;
  }
  container.innerHTML = servicios.map(s => {
    const activo = serviciosColabSeleccionados.includes(s.id);
    return `<button type="button" class="chip ${activo ? 'active' : ''}" onclick="toggleServicioColab('${s.id}')">${escapeHtml(s.nombre)}</button>`;
  }).join('');
}

function toggleServicioColab(id) {
  if (serviciosColabSeleccionados.includes(id)) {
    serviciosColabSeleccionados = serviciosColabSeleccionados.filter(s => s !== id);
  } else {
    serviciosColabSeleccionados.push(id);
  }
  renderServiciosColabPicker();
}

function resumenColaborador(colab) {
  const asignados = turnos.filter(t => t.colaboradorId === colab.id && normalizarEstadoTurnoUI(t.estado) !== 'cancelado');
  const completados = asignados.filter(t => normalizarEstadoTurnoUI(t.estado) === 'finalizado').length;
  const total = asignados.reduce((acc, t) => acc + (parseInt(t.precio) || 0), 0);
  const comision = asignados.reduce((acc, t) => acc + (parseInt(t.colaboradorComision) || 0), 0);
  return { asignados: asignados.length, completados, total, comision };
}

function renderColaboradores() {
  const tbody = document.getElementById('listaColaboradores');
  if (!tbody) return;
  if (!colaboradores.length) {
    tbody.innerHTML = '<tr><td colspan="7">No hay colaboradores cargados.</td></tr>';
    renderResumenColaboradores();
    renderFiltroPagoColaboradorSelect();
    actualizarVistaPagoColaborador();
    return;
  }
  tbody.innerHTML = colaboradores.map(colab => {
    const resumen = resumenColaborador(colab);
    const activo = colab.activo !== false;
    const serviciosSeleccionados = Array.isArray(colab.serviciosIds) ? colab.serviciosIds : [];
    const serviciosTexto = serviciosSeleccionados.length
      ? serviciosSeleccionados
          .map(id => servicios.find(s => s.id === id)?.nombre || id)
          .slice(0, 3)
          .join(', ')
      : 'Todos';
    return `
      <tr>
        <td><strong>${escapeHtml(colab.nombre || '')}</strong><br><small>${escapeHtml(colab.email || '')}</small></td>
        <td>${escapeHtml(colab.username || '')}</td>
        <td>${colab.comisionBase || 0}%</td>
        <td>${escapeHtml(serviciosTexto)}</td>
        <td>${resumen.asignados}</td>
        <td>${activo ? 'Sí' : 'No'}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary" onclick="editarColaborador('${colab.id}')"><i class="fas fa-pen"></i></button>
            <button class="btn btn-secondary" onclick="eliminarColaborador('${colab.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  renderResumenColaboradores();
  renderFiltroPagoColaboradorSelect();
  actualizarVistaPagoColaborador();
}

function renderFiltroPagoColaboradorSelect() {
  const select = document.getElementById('filtroColabGestionId');
  if (!select) return;

  const actual = select.value || '';
  const opciones = colaboradores
    .slice()
    .sort((a, b) => (a.nombre || a.username || '').localeCompare(b.nombre || b.username || '', 'es'))
    .map(colab => `<option value="${escapeHtml(colab.id)}">${escapeHtml(colab.nombre || colab.username || 'Colaborador')}</option>`)
    .join('');

  select.innerHTML = `<option value="">Todos los colaboradores</option>${opciones}`;
  if (actual && colaboradores.some(colab => colab.id === actual)) {
    select.value = actual;
  }
}

function resetFiltroPagoColaborador() {
  const texto = document.getElementById('filtroColabGestionTexto');
  const colaborador = document.getElementById('filtroColabGestionId');
  const modo = document.getElementById('filtroColabGestionModo');
  const desde = document.getElementById('filtroColabGestionDesde');
  const hasta = document.getElementById('filtroColabGestionHasta');

  if (texto) texto.value = '';
  if (colaborador) colaborador.value = '';
  if (modo) modo.value = 'hoy';
  if (desde) desde.value = '';
  if (hasta) hasta.value = '';

  ultimoFiltroPagoColab = { texto: '', colaboradorId: '', modo: 'hoy', desde: '', hasta: '' };
  actualizarVistaPagoColaborador();
}

function actualizarVistaPagoColaborador() {
  const stats = document.getElementById('colabGestionStats');
  const tbody = document.getElementById('colabGestionTurnos');
  if (!stats || !tbody) return;

  const textoInput = document.getElementById('filtroColabGestionTexto');
  const colabSelect = document.getElementById('filtroColabGestionId');
  const modoSelect = document.getElementById('filtroColabGestionModo');
  const desdeInput = document.getElementById('filtroColabGestionDesde');
  const hastaInput = document.getElementById('filtroColabGestionHasta');

  const texto = (textoInput?.value || '').trim().toLowerCase();
  const colaboradorId = (colabSelect?.value || '').trim();
  const modo = (modoSelect?.value || 'hoy') === 'rango' ? 'rango' : 'hoy';
  const hoy = new Date().toISOString().split('T')[0];

  if (desdeInput && hastaInput) {
    if (modo === 'hoy') {
      desdeInput.disabled = true;
      hastaInput.disabled = true;
      desdeInput.value = hoy;
      hastaInput.value = hoy;
    } else {
      desdeInput.disabled = false;
      hastaInput.disabled = false;
      if (!desdeInput.value) {
        const inicio = new Date();
        inicio.setDate(inicio.getDate() - 6);
        desdeInput.value = inicio.toISOString().split('T')[0];
      }
      if (!hastaInput.value) hastaInput.value = hoy;
    }
  }

  let desde = desdeInput?.value || hoy;
  let hasta = hastaInput?.value || hoy;
  if (desde > hasta) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
    if (desdeInput) desdeInput.value = desde;
    if (hastaInput) hastaInput.value = hasta;
  }

  const filtroCambio =
    texto !== ultimoFiltroPagoColab.texto ||
    colaboradorId !== ultimoFiltroPagoColab.colaboradorId ||
    modo !== ultimoFiltroPagoColab.modo ||
    desde !== ultimoFiltroPagoColab.desde ||
    hasta !== ultimoFiltroPagoColab.hasta;

  if (filtroCambio) {
    ultimoFiltroPagoColab = { texto, colaboradorId, modo, desde, hasta };
  }

  const colaboradoresFiltrados = colaboradores.filter(colab => {
    const nombre = (colab.nombre || '').toLowerCase();
    const usuario = (colab.username || '').toLowerCase();
    const porTexto = !texto || nombre.includes(texto) || usuario.includes(texto);
    const porColaborador = !colaboradorId || colab.id === colaboradorId;
    return porTexto && porColaborador;
  });
  const idsColaboradores = new Set(colaboradoresFiltrados.map(colab => colab.id));

  const turnosFiltrados = turnos
    .filter(turno => turno.colaboradorId && idsColaboradores.has(turno.colaboradorId))
    .filter(turno => turno.fecha && turno.fecha >= desde && turno.fecha <= hasta)
    .sort((a, b) => new Date(b.fecha + 'T' + (b.hora || '00:00')) - new Date(a.fecha + 'T' + (a.hora || '00:00')));

  const asignados = turnosFiltrados.filter(turno => normalizarEstadoTurnoUI(turno.estado) !== 'cancelado');
  const completados = turnosFiltrados.filter(turno => normalizarEstadoTurnoUI(turno.estado) === 'finalizado');
  const pendientes = turnosFiltrados.filter(turno => !['cancelado', 'finalizado', 'no_show'].includes(normalizarEstadoTurnoUI(turno.estado)));
  const generado = completados.reduce((acc, turno) => acc + (parseInt(turno.precio, 10) || 0), 0);
  const comision = completados.reduce((acc, turno) => acc + (parseInt(turno.colaboradorComision, 10) || 0), 0);

  stats.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Colaboradores en vista</span>
      <h3>${colaboradoresFiltrados.length}</h3>
    </div>
    <div class="stat-card">
      <span class="stat-label">Turnos asignados</span>
      <h3>${asignados.length}</h3>
    </div>
    <div class="stat-card">
      <span class="stat-label">Pendientes / proceso</span>
      <h3>${pendientes.length}</h3>
    </div>
    <div class="stat-card">
      <span class="stat-label">Completados</span>
      <h3>${completados.length}</h3>
    </div>
    <div class="stat-card">
      <span class="stat-label">Generado (completados)</span>
      <h3>${generado.toLocaleString('es-PY')} Gs</h3>
    </div>
    <div class="stat-card">
      <span class="stat-label">Comision a pagar</span>
      <h3>${comision.toLocaleString('es-PY')} Gs</h3>
    </div>
  `;

  if (!turnosFiltrados.length) {
    tbody.innerHTML = '<tr><td colspan="8">Sin turnos para el filtro seleccionado.</td></tr>';
    return;
  }

  tbody.innerHTML = turnosFiltrados.map(turno => {
    const serviciosTexto = (turno.servicios || []).map(s => s.nombre).join(', ') || turno.servicio || '';
    const estadoRaw = (turno.estado || 'pendiente').toLowerCase();
    const estadoCanon = normalizarEstadoTurnoUI(estadoRaw);
    const estadoClass = estadoCanon || 'pendiente';
    const colab = colaboradores.find(item => item.id === turno.colaboradorId);
    const colabNombre = colab?.nombre || turno.colaboradorNombre || 'Sin asignar';
    const precio = parseInt(turno.precio, 10) || 0;
    const comisionTurno = parseInt(turno.colaboradorComision, 10) || 0;

    return `
      <tr>
        <td>${escapeHtml(colabNombre)}</td>
        <td><strong>${escapeHtml(turno.nombre || '')}</strong><br><small>${escapeHtml(turno.telefono || '')}</small></td>
        <td>${escapeHtml(serviciosTexto)}</td>
        <td>${escapeHtml(turno.fecha || '')}</td>
        <td>${escapeHtml(turno.hora || '')}</td>
        <td><span class="status-pill ${estadoClass}">${escapeHtml(etiquetaEstadoTurno(estadoCanon))}</span></td>
        <td>${precio.toLocaleString('es-PY')} Gs</td>
        <td>${comisionTurno.toLocaleString('es-PY')} Gs</td>
      </tr>
    `;
  }).join('');
}

function renderResumenColaboradores() {
  const container = document.getElementById('resumenColaboradores');
  if (!container) return;
  if (!colaboradores.length) {
    container.innerHTML = '<p class="section-subtitle">Agrega colaboradores para ver sus métricas.</p>';
    return;
  }
  const resumenes = colaboradores.map(c => ({ ...c, resumen: resumenColaborador(c) }));
  const totalComision = resumenes.reduce((acc, c) => acc + c.resumen.comision, 0);
  const totalIngresos = resumenes.reduce((acc, c) => acc + c.resumen.total, 0);
  const top = resumenes.sort((a, b) => b.resumen.comision - a.resumen.comision).slice(0, 3);

  container.innerHTML = `
    <div class="insights-grid">
      <div class="insight-card">
        <h4>Total comisiones</h4>
        <p class="stat">${totalComision.toLocaleString('es-PY')} Gs</p>
        <p class="muted">Basado en turnos no cancelados</p>
      </div>
      <div class="insight-card">
        <h4>Facturado por colaboradores</h4>
        <p class="stat">${totalIngresos.toLocaleString('es-PY')} Gs</p>
      </div>
      <div class="insight-card">
        <h4>Top colaboradores</h4>
        <ul class="mini-list">
          ${top.map(t => `<li>${escapeHtml(t.nombre || '')}<span>${t.resumen.comision.toLocaleString('es-PY')} Gs</span></li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

function resetColaboradorForm() {
  colaboradorEditando = null;
  ['colabId', 'colabNombre', 'colabUsername', 'colabPassword', 'colabTelefono', 'colabEmail', 'colabColor', 'colabFoto', 'colabComision'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const activo = document.getElementById('colabColor');
  if (activo) activo.value = '#0f766e';
  const mensaje = document.getElementById('colabMensaje');
  if (mensaje) mensaje.textContent = '';
  serviciosColabSeleccionados = [];
  renderServiciosColabPicker();
}

async function guardarColaborador() {
  const id = document.getElementById('colabId')?.value || null;
  const nombre = document.getElementById('colabNombre')?.value.trim();
  const username = document.getElementById('colabUsername')?.value.trim();
  const password = document.getElementById('colabPassword')?.value;
  const telefono = document.getElementById('colabTelefono')?.value;
  const email = document.getElementById('colabEmail')?.value;
  const color = document.getElementById('colabColor')?.value;
  const foto = document.getElementById('colabFoto')?.value;
  const comision = parseInt(document.getElementById('colabComision')?.value || '0', 10);
  const mensaje = document.getElementById('colabMensaje');

  if (!nombre || !username || (!id && !password)) {
    if (mensaje) mensaje.textContent = 'Nombre, usuario y contraseña son obligatorios.';
    return;
  }

  const payload = {
    id: id || undefined,
    nombre,
    username,
    password: password || undefined,
    telefono,
    email,
    color,
    foto,
    comisionBase: comision || 0,
    serviciosIds: serviciosColabSeleccionados,
    activo: true
  };

  try {
    const response = await fetch('/api/colaboradores', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar');
    await recargarColaboradores();
    resetColaboradorForm();
    mostrarNotificacion('Colaborador guardado', 'success');
  } catch (error) {
    if (mensaje) mensaje.textContent = error.message || 'Error guardando colaborador';
  }
}

async function recargarColaboradores() {
  const res = await fetch('/api/colaboradores');
  if (res.ok) {
    colaboradores = await res.json();
    renderColaboradores();
  }
}

function editarColaborador(id) {
  const colab = colaboradores.find(c => c.id === id);
  if (!colab) return;
  colaboradorEditando = colab;
  document.getElementById('colabId').value = colab.id || '';
  document.getElementById('colabNombre').value = colab.nombre || '';
  document.getElementById('colabUsername').value = colab.username || '';
  document.getElementById('colabTelefono').value = colab.telefono || '';
  document.getElementById('colabEmail').value = colab.email || '';
  document.getElementById('colabColor').value = colab.color || '#0f766e';
  document.getElementById('colabFoto').value = colab.foto || '';
  document.getElementById('colabComision').value = colab.comisionBase || 0;
  serviciosColabSeleccionados = Array.isArray(colab.serviciosIds) ? [...colab.serviciosIds] : [];
  renderServiciosColabPicker();
  const mensaje = document.getElementById('colabMensaje');
  if (mensaje) mensaje.textContent = `Editando a ${colab.nombre}`;
}

async function eliminarColaborador(id) {
  if (!confirm('¿Eliminar colaborador?')) return;
  try {
    const res = await fetch(`/api/colaboradores?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar');
    colaboradores = colaboradores.filter(c => c.id !== id);
    renderColaboradores();
  } catch (error) {
    mostrarNotificacion(error.message || 'Error eliminando colaborador', 'error');
  }
}

// =========================
// GIFTCARDS
// =========================
async function actualizarGiftcards() {
  try {
    const res = await fetch('/api/giftcards');
    if (res.ok) giftcards = await res.json();
  } catch {
    giftcards = [];
  } finally {
    if (giftcardVisualActual) {
      giftcardVisualActual = giftcards.find(g => g.id === giftcardVisualActual.id) || null;
    }
    renderGiftcards();
    renderGiftcardVisual(giftcardVisualActual);
    renderGiftcardValidacion(giftcardValidacion);
  }
}

function renderGiftcards() {
  const tbody = document.getElementById('listaGiftcards');
  if (!tbody) return;
  const filtro = document.getElementById('filtroGiftEstado')?.value || '';
  const lista = filtro ? giftcards.filter(g => (g.estado || '').toLowerCase() === filtro) : giftcards;
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8">Sin solicitudes.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(g => {
    const serviciosTexto = Array.isArray(g.servicios) && g.servicios.length
      ? g.servicios.map(s => s.nombre || '').join(', ')
      : 'Servicios a elección';
    const fecha = g.creado ? new Date(g.creado).toLocaleString('es-PY') : '-';
    const codigo = g.codigo || (g.id ? String(g.id).slice(-6).toUpperCase() : '-');
    const puedeGenerar = ['pagada', 'entregada'].includes((g.estado || '').toLowerCase());

    return `
      <tr>
        <td><strong>${escapeHtml(g.clienteNombre || '')}</strong><br><small>${escapeHtml(g.telefono || '')}</small></td>
        <td>${escapeHtml(g.destinatario || '')}</td>
        <td>${formatearMontoGs(g.monto)}</td>
        <td>${escapeHtml(serviciosTexto)}</td>
        <td>
          <select class="form-control" onchange="cambiarEstadoGiftcard('${g.id}', this.value)">
            ${['pendiente','pagada','entregada','cancelado'].map(op => `<option value="${op}" ${op === g.estado ? 'selected' : ''}>${op}</option>`).join('')}
          </select>
        </td>
        <td>${fecha}</td>
        <td>${escapeHtml(codigo)}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-primary" ${puedeGenerar ? '' : 'disabled title="Disponible cuando está Pagada o Entregada"'} onclick="abrirGiftcardVisual('${g.id}')">
              <i class="fas fa-image"></i> Generar giftcard
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function estadoGiftcardMensaje(estado) {
  const est = (estado || '').toLowerCase();
  if (est === 'entregada') return { label: 'Usada / reclamada', tone: 'warn' };
  if (est === 'caducado') return { label: 'Caducada', tone: 'danger' };
  if (est === 'pagada') return { label: 'Pagada y disponible', tone: 'success' };
  if (est === 'pendiente') return { label: 'Pendiente de pago', tone: 'info' };
  if (est === 'cancelado') return { label: 'Cancelada', tone: 'danger' };
  return { label: 'Desconocido', tone: 'info' };
}

function renderGiftcardValidacion(data) {
  const box = document.getElementById('giftcardValResultado');
  if (!box) return;
  if (!data) {
    box.classList.add('muted');
    box.innerHTML = 'Ingresa un código y presiona Validar.';
    return;
  }
  if (data.status === 'loading') {
    box.classList.remove('muted');
    box.innerHTML = '<span class="validator-badge info"><i class="fas fa-spinner fa-spin"></i> Validando...</span>';
    return;
  }
  box.classList.remove('muted');
  if (!data.found) {
    box.innerHTML = `
      <span class="validator-badge danger"><i class="fas fa-times-circle"></i> Código no válido</span>
      <div>El código ingresado no corresponde a ninguna giftcard registrada.</div>
    `;
    return;
  }
  const info = estadoGiftcardMensaje(data.estado);
  const servicios = Array.isArray(data.servicios) && data.servicios.length
    ? data.servicios.join(' · ')
    : 'Servicios a elección';
  const fecha = data.fechaEntrega || data.fechaPago || data.creado;
  const fechaTxt = fecha ? new Date(fecha).toLocaleString('es-PY') : '-';
  const venceTxt = data.fechaVencimiento ? new Date(data.fechaVencimiento).toLocaleDateString('es-PY') : 'Sin fecha límite';
  box.innerHTML = `
    <span class="validator-badge ${info.tone}"><i class="fas fa-ticket-alt"></i> ${info.label}</span>
    <div><strong>Código:</strong> ${escapeHtml(data.codigo || '')}</div>
    <div><strong>Destinatario:</strong> ${escapeHtml(data.destinatario || 'Sin especificar')}</div>
    <div><strong>Cliente:</strong> ${escapeHtml(data.cliente || '')}</div>
    <div><strong>Monto:</strong> ${formatearMontoGs(data.monto || 0)}</div>
    <div><strong>Servicios:</strong> ${escapeHtml(servicios)}</div>
    <div><strong>Última fecha:</strong> ${escapeHtml(fechaTxt)}</div>
    <div><strong>Vence:</strong> ${escapeHtml(venceTxt)}</div>
    <div class="validator-buttons">
      <button class="btn btn-primary" type="button" onclick="usarGiftcardValidada()" ${['entregada','cancelado','caducado'].includes(data.estado) ? 'disabled' : ''}><i class="fas fa-check-circle"></i> Marcar como usada</button>
      <button class="btn btn-secondary" type="button" onclick="cancelarGiftcardValidada()" ${['entregada','cancelado','caducado'].includes(data.estado) ? 'disabled' : ''}><i class="fas fa-ban"></i> Cancelar</button>
    </div>
  `;
}

async function validarGiftcardCodigo() {
  const input = document.getElementById('giftcardValCodigo');
  const code = input?.value.trim();
  if (!code) {
    mostrarNotificacion('Ingresá un código para validar', 'info');
    renderGiftcardValidacion(null);
    return;
  }
  renderGiftcardValidacion({ found: false, status: 'loading' });
  try {
    const res = await fetch(`/api/giftcards/validate?code=${encodeURIComponent(code)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok && data.status === 'not_found') {
      giftcardValidacion = data;
      renderGiftcardValidacion(data);
      return;
    }
    if (!res.ok || (data.found === false && !data.status)) throw new Error(data.error || 'No se pudo validar');
    giftcardValidacion = data;
    renderGiftcardValidacion(data);
  } catch (error) {
    mostrarNotificacion(error.message || 'Error validando giftcard', 'error');
    renderGiftcardValidacion(null);
  }
}

async function actualizarGiftcardValidada(estado) {
  if (!giftcardValidacion || !giftcardValidacion.id) {
    mostrarNotificacion('Valida una giftcard primero', 'info');
    return;
  }
  try {
    const res = await fetch('/api/giftcards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: giftcardValidacion.id, estado })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo actualizar');
    mostrarNotificacion('Estado actualizado', 'success');
    await actualizarGiftcards();
    await validarGiftcardCodigo();
  } catch (error) {
    mostrarNotificacion(error.message || 'Error actualizando giftcard', 'error');
  }
}

function usarGiftcardValidada() {
  actualizarGiftcardValidada('entregada');
}

function cancelarGiftcardValidada() {
  actualizarGiftcardValidada('cancelado');
}

async function cambiarEstadoGiftcard(id, estado) {
  try {
    const res = await fetch('/api/giftcards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado })
    });
    if (!res.ok) throw new Error('No se pudo actualizar');
    await actualizarGiftcards();
    mostrarNotificacion('Giftcard actualizada', 'success');
    const estadoFinal = (estado || '').toLowerCase();
    if (['pagada', 'entregada'].includes(estadoFinal)) {
      abrirGiftcardVisual(id);
    }
  } catch (error) {
    mostrarNotificacion(error.message || 'Error actualizando giftcard', 'error');
  }
}

function formatearMontoGs(valor) {
  const num = parseInt(valor || 0, 10);
  return `${num.toLocaleString('es-PY')} Gs`;
}

function abrirGiftcardVisual(id) {
  giftcardVisualActual = giftcards.find(g => g.id === id) || null;
  renderGiftcardVisual(giftcardVisualActual);
  abrirModal('modalGiftcardVisual');
}

function cerrarModalGiftcardVisual() {
  cerrarModal('modalGiftcardVisual');
}

function renderGiftcardVisual(card) {
  const container = document.getElementById('giftcardPreview');
  if (!container) return;
  if (!card) {
    container.innerHTML = '<div class="empty-state">Selecciona una giftcard para generar el diseño.</div>';
    return;
  }
  const serviciosPills = Array.isArray(card.servicios) && card.servicios.length
    ? card.servicios.map(s => `<span class="giftcard-pill">${escapeHtml(s.nombre || 'Servicio')}</span>`).join('')
    : '<span class="giftcard-pill">Servicios a elección</span>';
  const codigo = card.codigo || (card.id ? String(card.id).slice(-6).toUpperCase() : 'ALI-GIFT');
  const fecha = card.fechaPago || card.creado || new Date().toISOString();
  const fechaBonita = new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  const mensaje = card.mensaje || 'Un mimo para vos. Disfruta esta experiencia de belleza.';
  const estadoTexto = (card.estado || 'pendiente').toString().replace(/_/g, ' ');
  const estadoTitulo = estadoTexto.charAt(0).toUpperCase() + estadoTexto.slice(1);

  container.innerHTML = `
    <div class="giftcard-card">
      <div class="giftcard-shine"></div>
      <div class="giftcard-orb giftcard-orb-left"></div>
      <div class="giftcard-orb giftcard-orb-right"></div>
      <div class="giftcard-header">
        <div>
          <p class="giftcard-label">Ali Reyes Makeup</p>
          <h3 class="giftcard-title">Gift Card de Belleza</h3>
        </div>
        <div class="giftcard-header-actions">
          <div class="giftcard-amount">${formatearMontoGs(card.monto)}</div>
          <div class="giftcard-chip"><span class="chip-dot"></span><span>VIP</span></div>
        </div>
      </div>
      <div class="giftcard-status">${escapeHtml(estadoTitulo)}</div>
      <div class="giftcard-body">
        <div class="giftcard-row">
          <div>
            <div class="giftcard-label">Para</div>
            <div class="giftcard-name">${escapeHtml(card.destinatario || 'Invitada especial')}</div>
          </div>
          <div>
            <div class="giftcard-label">De</div>
            <div class="giftcard-name">${escapeHtml(card.clienteNombre || 'Ali Reyes')}</div>
          </div>
        </div>
        <div class="giftcard-message">${escapeHtml(mensaje)}</div>
        <div class="giftcard-services">
          <div class="giftcard-label">Servicios</div>
          <div class="giftcard-pills">${serviciosPills}</div>
        </div>
      </div>
      <div class="giftcard-footer">
        <div class="giftcard-code-block">
          <div class="giftcard-label">Código</div>
          <div class="giftcard-code">${escapeHtml(codigo)}</div>
        </div>
        <div class="giftcard-stamp"><i class="fas fa-sparkles"></i> Lista para usar</div>
        <div class="giftcard-date">Emitida: ${escapeHtml(fechaBonita)}</div>
      </div>
    </div>
  `;
}

function descargarGiftcardPNG() {
  if (!giftcardVisualActual) {
    mostrarNotificacion('Selecciona una giftcard primero', 'info');
    return;
  }
  const g = giftcardVisualActual;
  const serviciosTexto = Array.isArray(g.servicios) && g.servicios.length
    ? g.servicios.map(s => s.nombre || '').join(' · ')
    : 'Servicios a elección';
  const codigo = g.codigo || (g.id ? String(g.id).slice(-6).toUpperCase() : 'ALI-GIFT');
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');

  const round = (x, y, w, h, r, mode = 'fill') => {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx[mode]();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx[mode]();
  };

  // Fondo vibrante
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#0b1724');
  grad.addColorStop(0.28, '#0c3645');
  grad.addColorStop(0.56, '#0fb9a8');
  grad.addColorStop(0.78, '#f59e0b');
  grad.addColorStop(1, '#f43f5e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Brillos circulares
  let glow = ctx.createRadialGradient(260, 150, 60, 260, 150, 320);
  glow.addColorStop(0, 'rgba(255,255,255,0.45)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  glow = ctx.createRadialGradient(canvas.width - 220, canvas.height - 220, 80, canvas.width - 220, canvas.height - 220, 380);
  glow.addColorStop(0, 'rgba(255,255,255,0.28)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Líneas diagonales suaves
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.translate(-120, -180);
  ctx.rotate(-Math.PI / 9);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = -400; i < canvas.width + canvas.height; i += 120) {
    ctx.fillRect(i, 0, 48, canvas.height * 2);
  }
  ctx.restore();

  // Marco suavizado
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 3;
  round(70, 70, canvas.width - 140, canvas.height - 140, 28, 'stroke');
  ctx.restore();

  // Chip VIP
  ctx.save();
  const chipX = canvas.width - 260;
  const chipY = 150;
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  round(chipX, chipY, 140, 70, 16, 'fill');
  ctx.fillStyle = '#0b1724';
  ctx.font = '700 26px "Manrope", sans-serif';
  ctx.fillText('VIP', chipX + 42, chipY + 44);
  ctx.restore();

  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 68px "Cormorant Garamond", serif';
  ctx.fillText('Gift Card de Belleza', 120, 190);

  ctx.font = '800 64px "Manrope", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(formatearMontoGs(g.monto), 120, 260);

  // Estado
  const estadoTexto = (g.estado || 'Pendiente').toString().replace(/_/g, ' ');
  const estadoTitulo = estadoTexto.charAt(0).toUpperCase() + estadoTexto.slice(1);
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.font = '700 26px "Manrope", sans-serif';
  const estadoW = ctx.measureText(estadoTitulo).width + 40;
  const estadoX = canvas.width - estadoW - 120;
  const estadoY = 230;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  round(estadoX, estadoY - 34, estadoW, 52, 18, 'fill');
  ctx.fillStyle = '#0b1724';
  ctx.fillText(estadoTitulo, estadoX + 20, estadoY);
  ctx.restore();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 30px "Manrope", sans-serif';
  ctx.fillText('Para', 120, 340);
  ctx.font = '800 42px "Manrope", sans-serif';
  ctx.fillText(g.destinatario || 'Invitada especial', 120, 385);

  ctx.font = '600 30px "Manrope", sans-serif';
  ctx.fillText('De', 120, 440);
  ctx.font = '800 36px "Manrope", sans-serif';
  ctx.fillText(g.clienteNombre || 'Ali Reyes', 120, 480);

  // Mensaje destacado
  const mensaje = g.mensaje || 'Un mimo para vos. Disfruta esta experiencia de belleza.';
  const boxX = 120;
  const boxY = 510;
  const boxW = canvas.width - 240;
  const boxH = 120;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  round(boxX, boxY, boxW, boxH, 18, 'fill');
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 26px "Manrope", sans-serif';
  wrapText(ctx, mensaje, boxX + 18, boxY + 38, boxW - 36, 32);

  // Servicios
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 26px "Manrope", sans-serif';
  ctx.fillText('Servicios', 120, 680);
  ctx.fillStyle = '#fefefe';
  ctx.font = '600 24px "Manrope", sans-serif';
  wrapText(ctx, serviciosTexto, 260, 680, canvas.width - 380, 30);

  // Código
  const codigoText = `Código: ${codigo}`;
  ctx.save();
  ctx.font = '800 26px "Manrope", sans-serif';
  const codeW = ctx.measureText(codigoText).width + 38;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  round(120, canvas.height - 140, codeW, 56, 16, 'fill');
  ctx.fillStyle = '#0b1724';
  ctx.fillText(codigoText, 138, canvas.height - 102);
  ctx.restore();

  // Sello y fecha
  ctx.save();
  ctx.font = '700 24px "Manrope", sans-serif';
  const badgeText = '✦ Lista para usar';
  const badgeW = ctx.measureText(badgeText).width + 60;
  const badgeX = canvas.width / 2 - badgeW / 2;
  const badgeY = canvas.height - 140;
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY - 40, badgeX + badgeW, badgeY + 10);
  badgeGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
  badgeGrad.addColorStop(1, 'rgba(255,255,255,0.68)');
  ctx.fillStyle = badgeGrad;
  round(badgeX, badgeY - 36, badgeW, 56, 22, 'fill');
  ctx.fillStyle = '#0b1724';
  ctx.fillText(badgeText, badgeX + 20, badgeY + 4);
  ctx.restore();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 22px "Manrope", sans-serif';
  const fecha = g.fechaPago || g.creado || new Date().toISOString();
  ctx.fillText(`Emitida: ${new Date(fecha).toLocaleDateString('es-ES')}`, canvas.width - 360, canvas.height - 90);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `giftcard-${codigo}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, y);
}

function obtenerEstilosGiftcard() {
  return `
    body { margin:0; padding:30px; background:#0b1220; font-family:'Manrope',sans-serif; }
    .giftcard-preview { display:flex; justify-content:center; align-items:center; padding:18px; background: radial-gradient(circle at 10% 20%, rgba(15,185,168,0.14), transparent 32%), radial-gradient(circle at 85% 15%, rgba(244,63,94,0.14), transparent 30%), #0b1220; border-radius:20px; border:1px solid rgba(255,255,255,0.06); box-shadow: inset 0 20px 60px rgba(0,0,0,0.22); }
    .giftcard-card { width:100%; max-width:780px; aspect-ratio:16/9; background: linear-gradient(135deg, #0b1724 0%, #0c3645 25%, #0fb9a8 55%, #f59e0b 78%, #f43f5e 100%); color:#f8fafc; border-radius:26px; padding:28px; position:relative; overflow:hidden; box-shadow:0 24px 70px rgba(0,0,0,0.2); display:grid; gap:16px; grid-template-rows:auto 1fr auto; border:1px solid rgba(255,255,255,0.18); }
    .giftcard-card::before { content:''; position:absolute; inset:-12% -18%; background: radial-gradient(circle at 22% 26%, rgba(255,255,255,0.26), transparent 45%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.18), transparent 40%); opacity:0.7; }
    .giftcard-card::after { content:''; position:absolute; inset:0; background: linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0.12) 60%, rgba(255,255,255,0) 100%); mix-blend-mode:screen; opacity:0.7; }
    .giftcard-shine { position:absolute; inset:-40%; background: conic-gradient(from 120deg, rgba(255,255,255,0.24), rgba(255,255,255,0.08), rgba(255,255,255,0.32), rgba(255,255,255,0.08), rgba(255,255,255,0.24)); mix-blend-mode:screen; filter: blur(48px); opacity:0.35; animation: giftcardShine 14s linear infinite; }
    .giftcard-orb { position:absolute; width:240px; height:240px; border-radius:999px; filter: blur(26px); opacity:0.38; }
    .giftcard-orb-left { background: radial-gradient(circle, rgba(255,255,255,0.34), transparent 70%); top:-70px; left:-40px; }
    .giftcard-orb-right { background: radial-gradient(circle, rgba(255,255,255,0.28), transparent 70%); bottom:-80px; right:-60px; }
    .giftcard-header { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; position:relative; z-index:1; }
    .giftcard-header-actions { display:flex; flex-direction:column; align-items:flex-end; gap:8px; text-align:right; }
    .giftcard-title { margin:0; font-family:'Cormorant Garamond',serif; font-size:2rem; letter-spacing:0.04em; }
    .giftcard-amount { font-size:2.6rem; font-weight:800; letter-spacing:0.05em; text-shadow:0 6px 18px rgba(0,0,0,0.25); }
    .giftcard-chip { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:14px; background:rgba(255,255,255,0.18); color:#0b1724; font-weight:800; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.32), 0 8px 20px rgba(0,0,0,0.18); }
    .chip-dot { width:10px; height:10px; border-radius:999px; background:#0b1724; display:inline-block; }
    .giftcard-status { align-self:start; display:inline-flex; padding:8px 14px; border-radius:999px; background:rgba(255,255,255,0.16); color:#0b1724; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; max-width:max-content; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25); }
    .giftcard-body { position:relative; z-index:1; display:grid; gap:12px; }
    .giftcard-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:12px; }
    .giftcard-label { text-transform:uppercase; letter-spacing:0.14em; font-size:0.72rem; color:rgba(248,250,252,0.78); }
    .giftcard-name { font-size:1.3rem; font-weight:800; }
    .giftcard-message { background:rgba(255,255,255,0.14); padding:12px 14px; border-radius:16px; border:1px solid rgba(255,255,255,0.28); color:#e2e8f0; box-shadow:0 14px 30px rgba(0,0,0,0.16) inset; }
    .giftcard-services { display:grid; gap:8px; align-items:flex-start; }
    .giftcard-pills { display:flex; gap:8px; flex-wrap:wrap; }
    .giftcard-pill { background:rgba(255,255,255,0.9); color:#0b1724; padding:8px 12px; border-radius:12px; font-weight:700; box-shadow:0 6px 16px rgba(0,0,0,0.12); }
    .giftcard-footer { display:flex; justify-content:space-between; align-items:center; z-index:1; position:relative; gap:10px; flex-wrap:wrap; }
    .giftcard-code-block { display:grid; gap:6px; }
    .giftcard-code { letter-spacing:0.22em; font-weight:800; font-size:1rem; background:rgba(255,255,255,0.9); color:#0b1724; padding:10px 14px; border-radius:14px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.4), 0 8px 18px rgba(0,0,0,0.12); }
    .giftcard-stamp { display:inline-flex; align-items:center; gap:8px; padding:10px 16px; border-radius:999px; background: linear-gradient(135deg, rgba(255,255,255,0.85), rgba(255,255,255,0.7)); color:#0b1724; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; box-shadow:0 10px 22px rgba(0,0,0,0.18); }
    .giftcard-date { color:rgba(248,250,252,0.9); font-size:0.95rem; font-weight:600; }
    @keyframes giftcardShine { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;
}

function imprimirGiftcard() {
  if (!giftcardVisualActual) {
    mostrarNotificacion('Selecciona una giftcard primero', 'info');
    return;
  }
  const preview = document.getElementById('giftcardPreview');
  if (!preview) return;
  const win = window.open('', '_blank');
  if (!win) return;
  const styles = `<style>${obtenerEstilosGiftcard()}</style>`;
  win.document.write(`<html><head>${styles}</head><body>${preview.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.onload = () => win.print();
}

async function copiarGiftcardHTML() {
  if (!giftcardVisualActual) {
    mostrarNotificacion('Selecciona una giftcard primero', 'info');
    return;
  }
  const preview = document.getElementById('giftcardPreview');
  if (!preview) return;
  const styles = `<style>${obtenerEstilosGiftcard()}</style>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>${preview.innerHTML}</body></html>`;
  try {
    await navigator.clipboard.writeText(html);
    mostrarNotificacion('HTML de la giftcard copiado', 'success');
  } catch (error) {
    mostrarNotificacion('No se pudo copiar el HTML', 'error');
  }
}

// =========================
// BANNERS
// =========================
function resetBannerForm() {
  bannerEditando = null;
  ['bannerId', 'bannerTitulo', 'bannerDescripcion', 'bannerImagen', 'bannerUrl', 'bannerOrden'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const activo = document.getElementById('bannerActivo');
  if (activo) activo.value = '1';
  const msg = document.getElementById('bannerMensaje');
  if (msg) msg.textContent = '';
}

async function guardarBanner() {
  const id = document.getElementById('bannerId')?.value;
  const titulo = document.getElementById('bannerTitulo')?.value.trim();
  const descripcion = document.getElementById('bannerDescripcion')?.value.trim();
  const imagen = document.getElementById('bannerImagen')?.value.trim();
  const url = document.getElementById('bannerUrl')?.value.trim();
  const orden = parseInt(document.getElementById('bannerOrden')?.value || Date.now(), 10);
  const activo = document.getElementById('bannerActivo')?.value === '1';
  const msg = document.getElementById('bannerMensaje');

  if (!titulo) {
    if (msg) msg.textContent = 'Título requerido';
    return;
  }

  const payload = { id, titulo, descripcion, imagen, url, orden, activo };

  try {
    const res = await fetch('/api/banners', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo guardar');
    await recargarBanners();
    resetBannerForm();
    mostrarNotificacion('Banner guardado', 'success');
  } catch (error) {
    if (msg) msg.textContent = error.message || 'Error guardando banner';
  }
}

async function recargarBanners() {
  const res = await fetch('/api/banners?admin=1');
  if (res.ok) banners = await res.json();
  renderBannersAdmin();
}

function renderBannersAdmin() {
  const tbody = document.getElementById('listaBanners');
  if (!tbody) return;
  if (!banners.length) {
    tbody.innerHTML = '<tr><td colspan="4">No hay banners cargados.</td></tr>';
    return;
  }
  tbody.innerHTML = banners.map(b => `
    <tr>
      <td>${escapeHtml(b.titulo || '')}</td>
      <td>${b.activo === false ? 'Inactivo' : 'Activo'}</td>
      <td>${b.orden || 0}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-secondary" onclick="editarBanner('${b.id}')"><i class="fas fa-pen"></i></button>
          <button class="btn btn-secondary" onclick="eliminarBanner('${b.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function editarBanner(id) {
  const banner = banners.find(b => b.id === id);
  if (!banner) return;
  document.getElementById('bannerId').value = banner.id || '';
  document.getElementById('bannerTitulo').value = banner.titulo || '';
  document.getElementById('bannerDescripcion').value = banner.descripcion || '';
  document.getElementById('bannerImagen').value = banner.imagen || '';
  document.getElementById('bannerUrl').value = banner.url || '';
  document.getElementById('bannerOrden').value = banner.orden || 0;
  document.getElementById('bannerActivo').value = banner.activo === false ? '0' : '1';
  const msg = document.getElementById('bannerMensaje');
  if (msg) msg.textContent = `Editando ${banner.titulo}`;
}

async function eliminarBanner(id) {
  if (!confirm('¿Eliminar banner?')) return;
  try {
    const res = await fetch(`/api/banners?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar');
    banners = banners.filter(b => b.id !== id);
    renderBannersAdmin();
  } catch (error) {
    mostrarNotificacion(error.message || 'Error eliminando banner', 'error');
  }
}

// =========================
// SORTEOS
// =========================
function renderSorteos() {
  const tbody = document.getElementById('listaSorteos');
  if (!tbody) return;
  if (!sorteos.length) {
    tbody.innerHTML = '<tr><td colspan="3">Sin sorteos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = sorteos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map(s => {
    const ganadores = Array.isArray(s.ganadores) ? s.ganadores.map(g => g.nombre || g.telefono || 'Cliente').join(', ') : '-';
    const fecha = s.fecha ? new Date(s.fecha).toLocaleString('es-PY') : '-';
    return `<tr><td>${escapeHtml(s.titulo || '')}</td><td>${escapeHtml(ganadores)}</td><td>${fecha}</td></tr>`;
  }).join('');
}

async function ejecutarSorteo() {
  const titulo = document.getElementById('sorteoTitulo')?.value.trim() || 'Sorteo';
  const ganadores = parseInt(document.getElementById('sorteoGanadores')?.value || '1', 10);
  const desde = document.getElementById('sorteoDesde')?.value || null;
  const hasta = document.getElementById('sorteoHasta')?.value || null;
  const msg = document.getElementById('sorteoMensaje');

  try {
    const res = await fetch('/api/sorteos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, ganadores, desde, hasta })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo ejecutar');
    sorteos.push(data.sorteo);
    renderSorteos();
    if (msg) msg.textContent = 'Sorteo ejecutado';
  } catch (error) {
    if (msg) msg.textContent = error.message || 'Error ejecutando sorteo';
  }
}
function cambiarPaginaClientes(pagina) {
  paginaClientes = pagina;
  actualizarListaClientes();
}

function abrirModalCliente(index) {
  const cliente = clientes.find(c => c._index === index);
  if (!cliente) return;

  const detalle = document.getElementById('clienteDetalle');
  const historial = document.getElementById('clienteHistorial');
  const turnosContainer = document.getElementById('clienteTurnos');

  if (detalle) {
    detalle.innerHTML = `
      <div><strong>Cliente:</strong> ${escapeHtml(cliente.nombre || 'Sin nombre')}</div>
      <div><strong>CI:</strong> ${escapeHtml(cliente.ci || '-')}</div>
      <div><strong>Tel&eacute;fono:</strong> ${escapeHtml(cliente.telefono || '-')}</div>
      <div><strong>Turnos:</strong> ${cliente.totalTurnos}</div>
      <div><strong>Contactos:</strong> ${cliente.contactos}</div>
      <div><strong>Ingresos:</strong> ${cliente.totalIngresos.toLocaleString('es-PY')} Gs</div>
    `;
  }

  if (historial) {
    const eventos = cliente.historialContactos.length
      ? cliente.historialContactos
      : (cliente.ultimoContacto
        ? [{ fecha: cliente.ultimoContacto.toISOString(), canal: 'contacto', mensaje: 'Último contacto registrado' }]
        : []);

    historial.innerHTML = eventos.length
      ? eventos.map(e => `
          <div class="timeline-item">
            <div><strong>${escapeHtml(e.canal)}</strong> · ${new Date(e.fecha).toLocaleString('es-ES')}</div>
            ${e.mensaje ? `<small>${escapeHtml(e.mensaje)}</small>` : ''}
            ${e.turnoFecha ? `<small>Turno: ${escapeHtml(e.turnoFecha)} ${escapeHtml(e.turnoHora || '')}</small>` : ''}
          </div>
        `).join('')
      : '<div class="empty-state">Sin contactos registrados.</div>';
  }

  if (turnosContainer) {
    const turnosOrdenados = [...cliente.turnos].sort((a, b) => new Date(b.fecha + 'T' + (b.hora || '00:00')) - new Date(a.fecha + 'T' + (a.hora || '00:00')));
    turnosContainer.innerHTML = turnosOrdenados.length
      ? turnosOrdenados.map(t => {
          const serviciosTexto = (t.servicios || []).map(s => s.nombre).join(', ') || t.servicio || '';
          return `
            <div class="timeline-item">
              <div><strong>${escapeHtml(t.fecha)}</strong> ${escapeHtml(t.hora || '')} · ${escapeHtml(t.estado || '')}</div>
              <small>${escapeHtml(serviciosTexto)}</small>
              <small>${parseInt(t.precio || 0).toLocaleString('es-PY')} Gs</small>
            </div>
          `;
        }).join('')
      : '<div class="empty-state">Sin turnos registrados.</div>';
  }

  abrirModal('modalCliente', '#modalTituloCliente');
}

function cerrarModalCliente() {
  cerrarModal('modalCliente');
}

async function cambiarEstadoTurno(turnoId, nuevoEstado) {
  try {
    const estado = normalizarEstadoTurnoUI(nuevoEstado);
    const response = await fetch('/api/turnos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: turnoId, estado })
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      mostrarNotificacion('Estado actualizado', 'success');
      await cargarDatosAdmin();
      return;
    }
    throw new Error(result.error || 'Error al actualizar estado');
  } catch (error) {
    mostrarNotificacion('Error al actualizar estado', 'error');
  }
}

async function eliminarTurno(id) {
  if (!confirm('¿Eliminar este turno?')) return;
  try {
    const response = await fetch(`/api/turnos?id=${id}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      mostrarNotificacion('Turno eliminado', 'success');
      await cargarDatosAdmin();
      return;
    }
    throw new Error(result.error || 'Error al eliminar turno');
  } catch (error) {
    mostrarNotificacion('Error al eliminar turno', 'error');
  }
}

async function enviarRecordatorios() {
  const hoy = new Date().toISOString().split('T')[0];
  const pendientes = turnos.filter(t => normalizarEstadoTurnoUI(t.estado) === 'pendiente' && t.fecha >= hoy);
  if (!pendientes.length) {
    mostrarNotificacion('No hay turnos pendientes', 'info');
    return;
  }
  if (!confirm(`Enviar recordatorios a ${pendientes.length} cliente(s)?`)) return;
  for (const turno of pendientes) {
    await contactarClienteWhatsApp(turno.id, { openInNewTab: true, template: 'recordatorio' });
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  mostrarNotificacion('Recordatorios abiertos en nuevas pestañas.', 'success');
}

// Configuración
async function cargarConfiguracionAdmin() {
  try {
    const response = await fetch('/api/config');
    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!response.ok) throw new Error('Respuesta inválida');
    const config = await response.json();
    configAdmin = config && typeof config === 'object' ? config : {};
    document.getElementById('horaApertura').value = config.horarioApertura || '09:00';
    document.getElementById('horaCierre').value = config.horarioCierre || '19:00';
    document.getElementById('intervaloTurnos').value = parseInt(config.intervaloTurnos, 10) || 30;
    document.getElementById('whatsappNumber').value = config.whatsappNumber || '595981234567';
    const ciudad = document.getElementById('ubicacionCiudad');
    const direccion = document.getElementById('ubicacionDireccion');
    const mapEmbed = document.getElementById('mapEmbedUrl');
    const mapUrl = document.getElementById('mapUrl');
    const instagram = document.getElementById('instagramUrl');
    const facebook = document.getElementById('facebookUrl');
    const tiktok = document.getElementById('tiktokUrl');
    const giftMontos = document.getElementById('giftMontosConfig');
    const giftMensaje = document.getElementById('giftMensajeConfig');
    const bankNombre = document.getElementById('bankNombreConfig');
    const bankTitular = document.getElementById('bankTitularConfig');
    const bankCuenta = document.getElementById('bankCuentaConfig');
    const bankAlias = document.getElementById('bankAliasConfig');
    const bankQr = document.getElementById('bankQrConfig');
    const tplConfirmacion = document.getElementById('tplConfirmacion');
    const tplRecordatorio = document.getElementById('tplRecordatorio');
    const tplReprogramacion = document.getElementById('tplReprogramacion');
    const metaSemanal = document.getElementById('metaComisionSemanal');
    const metaMensual = document.getElementById('metaComisionMensual');

    if (ciudad) ciudad.value = config.ciudad || '';
    if (direccion) direccion.value = config.direccion || '';
    if (mapEmbed) mapEmbed.value = config.mapEmbedUrl || '';
    if (mapUrl) mapUrl.value = config.mapUrl || '';
    if (instagram) instagram.value = config.instagramUrl || '';
    if (facebook) facebook.value = config.facebookUrl || '';
    if (tiktok) tiktok.value = config.tiktokUrl || '';
    if (giftMontos) giftMontos.value = Array.isArray(config.giftcardMontos) ? config.giftcardMontos.join(',') : '';
    if (giftMensaje) giftMensaje.value = config.giftcardMensaje || '';
    const bank = config.bankInfo || {};
    if (bankNombre) bankNombre.value = bank.banco || '';
    if (bankTitular) bankTitular.value = bank.titular || '';
    if (bankCuenta) bankCuenta.value = bank.cuenta || '';
    if (bankAlias) bankAlias.value = bank.alias || '';
    if (bankQr) bankQr.value = bank.qrUrl || '';
    const plantillas = config.whatsappTemplates || {};
    if (tplConfirmacion) tplConfirmacion.value = plantillas.confirmacion || '';
    if (tplRecordatorio) tplRecordatorio.value = plantillas.recordatorio || '';
    if (tplReprogramacion) tplReprogramacion.value = plantillas.reprogramacion || '';
    const metas = config.metasColaborador || {};
    if (metaSemanal) metaSemanal.value = parseInt(metas.semanalComision, 10) || 0;
    if (metaMensual) metaMensual.value = parseInt(metas.mensualComision, 10) || 0;

    const horarios = config.horariosPorDia || {};
    const fallbackA = config.horarioApertura || '09:00';
    const fallbackC = config.horarioCierre || '19:00';
    const lunVie = horarios.lunVie || {};
    const sab = horarios.sab || {};
    const dom = horarios.dom || {};
    const luActivo = document.getElementById('horarioLunVieActivo');
    const saActivo = document.getElementById('horarioSabActivo');
    const doActivo = document.getElementById('horarioDomActivo');
    if (luActivo) luActivo.checked = lunVie.activo !== false;
    if (saActivo) saActivo.checked = sab.activo !== false;
    if (doActivo) doActivo.checked = dom.activo === true;
    const luA = document.getElementById('horarioLunVieApertura');
    const luC = document.getElementById('horarioLunVieCierre');
    const saA = document.getElementById('horarioSabApertura');
    const saC = document.getElementById('horarioSabCierre');
    const doA = document.getElementById('horarioDomApertura');
    const doC = document.getElementById('horarioDomCierre');
    if (luA) luA.value = lunVie.apertura || fallbackA;
    if (luC) luC.value = lunVie.cierre || fallbackC;
    if (saA) saA.value = sab.apertura || fallbackA;
    if (saC) saC.value = sab.cierre || fallbackC;
    if (doA) doA.value = dom.apertura || fallbackA;
    if (doC) doC.value = dom.cierre || fallbackC;

    bloqueosAgendaAdmin = Array.isArray(config.bloqueosAgenda) ? config.bloqueosAgenda : [];
    renderBloqueosAgendaAdmin();

    const alerta = document.getElementById('pendientesAlerta');
    pendientesAlerta = config.pendientesAlerta || 10;
    if (alerta) alerta.value = pendientesAlerta;

    heroMosaicConfig = normalizarHeroMosaicAdmin(config.heroMosaic, heroMosaicConfig.length ? heroMosaicConfig : heroMosaicDefault());
    cargarHeroMosaicFormulario(heroMosaicConfig);
  } catch (error) {
    console.error('Error cargando configuración:', error);
  }
}

function parseHoraMinutos(valor) {
  if (!/^\d{2}:\d{2}$/.test(String(valor || ''))) return null;
  const [h, m] = String(valor).split(':').map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return (h * 60) + m;
}

function obtenerIntervaloTurnos() {
  const raw = document.getElementById('intervaloTurnos')?.value || '30';
  const intervalo = parseInt(raw, 10);
  if (Number.isNaN(intervalo) || intervalo < 5 || intervalo > 120) return null;
  return intervalo;
}

function leerHorarioDia(formPrefix, fallbackApertura, fallbackCierre, activoDefault = true) {
  const activo = document.getElementById(`${formPrefix}Activo`)?.checked ?? activoDefault;
  const apertura = document.getElementById(`${formPrefix}Apertura`)?.value || fallbackApertura;
  const cierre = document.getElementById(`${formPrefix}Cierre`)?.value || fallbackCierre;
  const aperturaMin = parseHoraMinutos(apertura);
  const cierreMin = parseHoraMinutos(cierre);
  if (aperturaMin === null || cierreMin === null || aperturaMin >= cierreMin) return null;
  return { activo, apertura, cierre };
}

function leerHorariosPorDiaFormulario(aperturaFallback, cierreFallback) {
  const lunVie = leerHorarioDia('horarioLunVie', aperturaFallback, cierreFallback, true);
  const sab = leerHorarioDia('horarioSab', aperturaFallback, cierreFallback, true);
  const dom = leerHorarioDia('horarioDom', aperturaFallback, cierreFallback, false);
  if (!lunVie || !sab || !dom) return null;
  return { lunVie, sab, dom };
}

function renderBloqueosAgendaAdmin() {
  const box = document.getElementById('listaBloqueosAgenda');
  if (!box) return;
  if (!bloqueosAgendaAdmin.length) {
    box.innerHTML = '<div class="empty-state">Sin bloqueos cargados.</div>';
    return;
  }
  const lista = [...bloqueosAgendaAdmin].sort((a, b) => {
    const fa = `${a.fecha || ''}T${a.desde || '00:00'}`;
    const fb = `${b.fecha || ''}T${b.desde || '00:00'}`;
    return new Date(fa) - new Date(fb);
  });
  box.innerHTML = lista.map(item => `
    <div class="timeline-item">
      <div><strong>${escapeHtml(item.fecha || '')}</strong> · ${escapeHtml(item.desde || '')} - ${escapeHtml(item.hasta || '')}</div>
      <small>${escapeHtml(item.motivo || 'Sin motivo')}</small>
      <button class="btn btn-secondary" type="button" onclick="eliminarBloqueoAgenda('${escapeHtml(item.id || '')}')">Eliminar</button>
    </div>
  `).join('');
}

function agregarBloqueoAgenda() {
  const fecha = document.getElementById('bloqueoFecha')?.value || '';
  const desde = document.getElementById('bloqueoDesde')?.value || '';
  const hasta = document.getElementById('bloqueoHasta')?.value || '';
  const motivo = document.getElementById('bloqueoMotivo')?.value.trim() || '';
  const desdeMin = parseHoraMinutos(desde);
  const hastaMin = parseHoraMinutos(hasta);
  if (!fecha || desdeMin === null || hastaMin === null || desdeMin >= hastaMin) {
    mostrarNotificacion('Bloqueo inválido. Verifica fecha y rango horario.', 'error');
    return;
  }
  const id = `bloq-${Date.now()}`;
  bloqueosAgendaAdmin.push({ id, fecha, desde, hasta, motivo });
  renderBloqueosAgendaAdmin();
  const motivoInput = document.getElementById('bloqueoMotivo');
  if (motivoInput) motivoInput.value = '';
}

function eliminarBloqueoAgenda(id) {
  bloqueosAgendaAdmin = bloqueosAgendaAdmin.filter(item => item.id !== id);
  renderBloqueosAgendaAdmin();
}

async function guardarConfiguracionAdmin() {
  const apertura = document.getElementById('horaApertura').value;
  const cierre = document.getElementById('horaCierre').value;
  const intervaloTurnos = obtenerIntervaloTurnos();
  const horariosPorDia = leerHorariosPorDiaFormulario(apertura, cierre);
  const numero = document.getElementById('whatsappNumber').value.trim();
  const alerta = document.getElementById('pendientesAlerta')?.value || '10';
  const ciudad = document.getElementById('ubicacionCiudad')?.value.trim() || '';
  const direccion = document.getElementById('ubicacionDireccion')?.value.trim() || '';
  const mapEmbed = document.getElementById('mapEmbedUrl')?.value.trim() || '';
  const mapUrl = document.getElementById('mapUrl')?.value.trim() || '';
  const instagram = document.getElementById('instagramUrl')?.value.trim() || '';
  const facebook = document.getElementById('facebookUrl')?.value.trim() || '';
  const tiktok = document.getElementById('tiktokUrl')?.value.trim() || '';
  const giftMontos = document.getElementById('giftMontosConfig')?.value || '';
  const giftMensaje = document.getElementById('giftMensajeConfig')?.value || '';
  const bankNombre = document.getElementById('bankNombreConfig')?.value || '';
  const bankTitular = document.getElementById('bankTitularConfig')?.value || '';
  const bankCuenta = document.getElementById('bankCuentaConfig')?.value || '';
  const bankAlias = document.getElementById('bankAliasConfig')?.value || '';
  const bankQr = document.getElementById('bankQrConfig')?.value || '';
  const tplConfirmacion = document.getElementById('tplConfirmacion')?.value || '';
  const tplRecordatorio = document.getElementById('tplRecordatorio')?.value || '';
  const tplReprogramacion = document.getElementById('tplReprogramacion')?.value || '';
  const metaComisionSemanal = parseInt(document.getElementById('metaComisionSemanal')?.value || '0', 10) || 0;
  const metaComisionMensual = parseInt(document.getElementById('metaComisionMensual')?.value || '0', 10) || 0;
  const aperturaMin = parseHoraMinutos(apertura);
  const cierreMin = parseHoraMinutos(cierre);

  if (aperturaMin === null || cierreMin === null || aperturaMin >= cierreMin) {
    mostrarNotificacion('Rango horario inválido. Verifica apertura y cierre.', 'error');
    return false;
  }

  if (intervaloTurnos === null) {
    mostrarNotificacion('El intervalo debe estar entre 5 y 120 minutos.', 'error');
    return false;
  }

  if (!horariosPorDia) {
    mostrarNotificacion('Revisa los horarios por día. Hay un rango inválido.', 'error');
    return false;
  }

  if (!numero.match(/^595\d{7,10}$/)) {
    mostrarNotificacion('Formato inválido. Usa 595 + número', 'error');
    return false;
  }

  try {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        horarioApertura: apertura,
        horarioCierre: cierre,
        intervaloTurnos,
        horariosPorDia,
        bloqueosAgenda: bloqueosAgendaAdmin,
        whatsappTemplates: {
          confirmacion: tplConfirmacion,
          recordatorio: tplRecordatorio,
          reprogramacion: tplReprogramacion
        },
        metasColaborador: {
          semanalComision: Math.max(0, metaComisionSemanal),
          mensualComision: Math.max(0, metaComisionMensual)
        },
        whatsappNumber: numero,
        pendientesAlerta: parseInt(alerta, 10) || 10,
        ciudad,
        direccion,
        mapEmbedUrl: mapEmbed,
        mapUrl,
        instagramUrl: instagram,
        facebookUrl: facebook,
        tiktokUrl: tiktok,
        giftcardMontos: giftMontos
          ? giftMontos.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !Number.isNaN(n) && n > 0)
          : [],
        giftcardMensaje: giftMensaje,
        bankInfo: {
          banco: bankNombre,
          titular: bankTitular,
          cuenta: bankCuenta,
          alias: bankAlias,
          qrUrl: bankQr
        }
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Error');
    configAdmin = result.config || configAdmin;
    pendientesAlerta = parseInt(alerta, 10) || 10;
    actualizarDashboard();
    mostrarNotificacion('Configuración guardada', 'success');
    return true;
  } catch (error) {
    mostrarNotificacion('Error al guardar configuración', 'error');
    return false;
  }
}

async function guardarHorario() {
  const apertura = document.getElementById('horaApertura')?.value || '';
  const cierre = document.getElementById('horaCierre')?.value || '';
  const intervaloTurnos = obtenerIntervaloTurnos();
  const horariosPorDia = leerHorariosPorDiaFormulario(apertura, cierre);
  const aperturaMin = parseHoraMinutos(apertura);
  const cierreMin = parseHoraMinutos(cierre);

  if (aperturaMin === null || cierreMin === null || aperturaMin >= cierreMin) {
    mostrarNotificacion('Rango horario inválido. Verifica apertura y cierre.', 'error');
    return false;
  }

  if (intervaloTurnos === null) {
    mostrarNotificacion('El intervalo debe estar entre 5 y 120 minutos.', 'error');
    return false;
  }

  if (!horariosPorDia) {
    mostrarNotificacion('Revisa los horarios por día. Hay un rango inválido.', 'error');
    return false;
  }

  try {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        horarioApertura: apertura,
        horarioCierre: cierre,
        intervaloTurnos,
        horariosPorDia,
        bloqueosAgenda: bloqueosAgendaAdmin
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Error');
    configAdmin = result.config || configAdmin;
    mostrarNotificacion('Horario comercial actualizado', 'success');
    await cargarConfiguracionAdmin();
    return true;
  } catch (error) {
    mostrarNotificacion('Error al guardar horario comercial', 'error');
    return false;
  }
}
function guardarWhatsApp() { guardarConfiguracionAdmin(); }

function descargarRespaldo() {
  const data = { servicios, turnos, lookbook, exportado: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `respaldo-ali-reyes-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  mostrarNotificacion('Respaldo descargado', 'success');
}

async function previsualizarImagenServicio(input) {
  if (!input.files || !input.files.length) return;
  const files = Array.from(input.files);
  for (const file of files) {
    try {
      const url = await subirImagenServicio(file);
      agregarImagenServicio(url, true);
    } catch (error) {
      mostrarNotificacion('Error subiendo imagen', 'error');
    }
  }
  renderImagenesServicio();
  input.value = '';
}

function mostrarNotificacion(mensaje, tipo = 'success') {
  const notificacion = document.createElement('div');
  notificacion.className = `notification ${tipo}`;
  notificacion.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = mensaje;
  notificacion.appendChild(span);
  const region = document.getElementById('notificationRegion') || document.body;
  region.appendChild(notificacion);

  setTimeout(() => notificacion.classList.add('show'), 10);
  setTimeout(() => {
    notificacion.classList.remove('show');
    setTimeout(() => notificacion.remove(), 300);
  }, 4000);
}

async function cerrarSesion() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (error) {
    console.error('Error cerrando sesión:', error);
  } finally {
    window.location.href = '/login.html';
  }
}

// Calendario
function renderizarCalendario() {
  const calendario = document.getElementById('calendario');
  const tituloMes = document.getElementById('mesActual');
  if (!calendario || !tituloMes) return;

  const year = mesActual.getFullYear();
  const month = mesActual.getMonth();

  const formateador = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  tituloMes.textContent = formateador.format(mesActual).replace(/^\w/, c => c.toUpperCase());

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const hoy = new Date().toISOString().split('T')[0];

  const dayNames = ['Lu','Ma','Mi','Ju','Vi','Sa','Do'];
  let html = '<div class="calendar-grid">';
  dayNames.forEach(d => html += `<div class="calendar-day-label">${d}</div>`);

  for (let i = 0; i < startOffset; i++) html += '<div class="calendar-cell empty"></div>';

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const count = turnos.filter(t => t.fecha === dateStr && !['cancelado', 'no_show'].includes(normalizarEstadoTurnoUI(t.estado))).length;
    const isToday = dateStr === hoy;

    html += `
      <div class="calendar-cell${count ? ' has-appointments' : ''}${isToday ? ' today' : ''}" onclick="filtrarPorFecha('${dateStr}')">
        <div class="day-number">${day}</div>
        ${count ? `<div class="day-appointments">${count} turno${count > 1 ? 's' : ''}</div>` : ''}
      </div>
    `;
  }

  html += '</div>';
  calendario.innerHTML = html;
}

function cambiarMes(delta) {
  mesActual.setMonth(mesActual.getMonth() + delta);
  renderizarCalendario();
}

function filtrarPorFecha(fecha) {
  const filtro = document.getElementById('filtroFecha');
  if (filtro) {
    filtro.value = fecha;
    mostrarSeccion('turnos');
    filtrarTurnos();
  }
}

async function inicializarAdmin() {
  const autenticado = await verificarAutenticacion();
  if (!autenticado) return;
  inicializarBuscadorServicios();
  cargarConfiguracionColumnasTurnos();
  await cargarConfiguracionAdmin();
  await cargarBackups();
  await cargarDatosAdmin();
  mostrarSeccion('dashboard');
}

document.addEventListener('DOMContentLoaded', inicializarAdmin);
window.addEventListener('resize', () => {
  clearTimeout(window.__chartsResize);
  window.__chartsResize = setTimeout(() => {
    renderAllCharts();
    const reportes = document.getElementById('reportesSection');
    if (reportes && reportes.style.display !== 'none') {
      renderReporteCharts();
    }
  }, 150);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const buscador = document.getElementById('buscadorServicios');
    if (buscador && document.activeElement === buscador) {
      limpiarResultadosBuscadorServicios();
      buscador.blur();
      return;
    }
    const modal = obtenerModalActivo();
    if (!modal) return;
    if (modal.id === 'modalServicio') cerrarModalServicio();
    else if (modal.id === 'modalLookbook') cerrarModalLookbook();
    else if (modal.id === 'modalContacto') cerrarModalContacto();
    else if (modal.id === 'modalCliente') cerrarModalCliente();
    else if (modal.id === 'modalTurno') cerrarModalTurno();
    else cerrarModal(modal.id);
  }
  trapFocus(event);
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains('modal-overlay') || !target.classList.contains('active')) return;
  if (target.id === 'modalServicio') cerrarModalServicio();
  else if (target.id === 'modalLookbook') cerrarModalLookbook();
  else if (target.id === 'modalContacto') cerrarModalContacto();
  else if (target.id === 'modalCliente') cerrarModalCliente();
  else if (target.id === 'modalTurno') cerrarModalTurno();
  else cerrarModal(target.id);
});


function renderChart() {
  const canvas = document.getElementById('turnosChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parentWidth = canvas.parentElement?.clientWidth || 0;
  if (!parentWidth) return;
  const width = canvas.width = Math.max(120, parentWidth - 10);
  const height = canvas.height = 120;

  const today = new Date();
  const labels = [];
  const counts = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    labels.push(key.slice(5));
    const count = turnos.filter(t => t.fecha === key).length;
    counts.push(count);
  }

  const max = Math.max(1, ...counts);
  const padding = 16;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#e7e4dc';
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  const stepX = (width - padding * 2) / (counts.length - 1 || 1);
  ctx.strokeStyle = '#0f766e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  counts.forEach((value, idx) => {
    const x = padding + idx * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#0f766e';
  counts.forEach((value, idx) => {
    const x = padding + idx * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#667074';
  ctx.font = '10px Manrope';
  labels.forEach((label, idx) => {
    const x = padding + idx * stepX;
    ctx.fillText(label, x - 10, height - 4);
  });
}

function renderAllCharts() {
  renderChart();
  renderIngresosChart();
  renderIngresosServicioChart();
}

function renderReporteLineChart(canvasId, labels, values, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parentWidth = canvas.parentElement?.clientWidth || 0;
  if (!parentWidth) return;
  const width = canvas.width = Math.max(120, parentWidth - 10);
  const height = canvas.height = 160;
  const padding = 20;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#e7e4dc';
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  if (!labels.length) {
    ctx.fillStyle = '#667074';
    ctx.font = '12px Manrope';
    ctx.fillText('Sin datos', padding, 20);
    return;
  }

  const max = Math.max(1, ...values);
  const stepX = (width - padding * 2) / (labels.length - 1 || 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, idx) => {
    const x = padding + idx * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = color;
  values.forEach((value, idx) => {
    const x = padding + idx * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#667074';
  ctx.font = '10px Manrope';
  labels.forEach((label, idx) => {
    const x = padding + idx * stepX;
    if (idx % Math.ceil(labels.length / 8) === 0 || idx === labels.length - 1) {
      ctx.fillText(label, x - 10, height - 4);
    }
  });
}

function renderReporteCharts() {
  if (!reporteActual) return;
  renderReporteLineChart('reporteTurnosChart', reporteActual.labels, reporteActual.counts, '#0f766e');
  renderReporteLineChart('reporteIngresosChart', reporteActual.labels, reporteActual.ingresos, '#c7a36a');
}

function renderReporteColaboradores(resumen) {
  const lista = Array.isArray(resumen) ? resumen : [];
  const topEl = document.getElementById('reporteTopColaboradores');
  if (topEl) {
    const top = lista.slice().sort((a, b) => b.comision - a.comision).slice(0, 5);
    topEl.innerHTML = top.length
      ? top.map(c => `<li>${escapeHtml(c.nombre)} <span>${c.comision.toLocaleString('es-PY')} Gs</span></li>`).join('')
      : '<li>Sin datos</li>';
  }

  const tabla = document.getElementById('reporteTablaColaboradores');
  if (tabla) {
    if (!lista.length) {
      tabla.innerHTML = '<tr><td colspan="5">Sin datos</td></tr>';
      return;
    }
    const ordenados = lista.slice().sort((a, b) => b.ingresos - a.ingresos);
    tabla.innerHTML = ordenados.map(c => `
      <tr>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${c.turnos}</td>
        <td>${c.ingresos.toLocaleString('es-PY')} Gs</td>
        <td>${c.comision.toLocaleString('es-PY')} Gs</td>
        <td>${c.porcentaje}%</td>
      </tr>
    `).join('');
  }
}


async function cargarBackups() {
  const container = document.getElementById('backupList');
  if (!container) return;
  container.innerHTML = 'Cargando...';

  try {
    const response = await fetch('/api/backups');
    if (!response.ok) throw new Error('Error cargando backups');
    const data = await response.json();
    if (!data.backups || !data.backups.length) {
      container.innerHTML = '<div class="proximo-item">Sin backups</div>';
      return;
    }

    container.innerHTML = data.backups.map(b => {
      const date = new Date(b.updatedAt).toLocaleString('es-ES');
      const name = escapeHtml(b.name);
      return `
        <div class="proximo-item" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <div><strong>${name}</strong></div>
            <div style="color: var(--muted); font-size: 0.85rem;">${date} · ${(b.size / 1024).toFixed(1)} KB</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="restaurarBackup('${escapeHtml(b.name)}')">Restaurar</button>
            <a class="btn btn-secondary" href="/api/backups/download?file=${encodeURIComponent(b.name)}">Descargar</a>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    container.innerHTML = '<div class="proximo-item">Error al cargar backups</div>';
  }
}


function renderIngresosChart() {
  const canvas = document.getElementById('ingresosChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parentWidth = canvas.parentElement?.clientWidth || 0;
  if (!parentWidth) return;
  const width = canvas.width = Math.max(120, parentWidth - 10);
  const height = canvas.height = 120;

  const today = new Date();
  const labels = [];
  const values = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    labels.push(key.slice(5));
    const total = turnos
      .filter(t => t.fecha === key)
      .reduce((acc, t) => acc + (parseInt(t.precio) || 0), 0);
    values.push(total);
  }

  const max = Math.max(1, ...values);
  const padding = 16;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#e7e4dc';
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  const stepX = (width - padding * 2) / (values.length - 1 || 1);
  ctx.strokeStyle = '#c7a36a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, idx) => {
    const x = padding + idx * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#c7a36a';
  values.forEach((value, idx) => {
    const x = padding + idx * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#667074';
  ctx.font = '10px Manrope';
  labels.forEach((label, idx) => {
    const x = padding + idx * stepX;
    ctx.fillText(label, x - 10, height - 4);
  });
}


async function restaurarBackup(file) {
  if (!confirm('¿Restaurar este backup? Esto sobrescribirá datos actuales.')) return;
  try {
    const response = await fetch('/api/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Error');
    mostrarNotificacion('Backup restaurado', 'success');
    await cargarDatosAdmin();
  } catch (error) {
    mostrarNotificacion('Error restaurando backup', 'error');
  }
}


function renderIngresosServicioChart() {
  const canvas = document.getElementById('ingresosServicioChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parentWidth = canvas.parentElement?.clientWidth || 0;
  if (!parentWidth) return;
  const width = canvas.width = Math.max(120, parentWidth - 10);
  const height = canvas.height = 140;

  const totals = {};
  turnos.forEach(t => {
    if (t.servicios && t.servicios.length) {
      t.servicios.forEach(s => {
        totals[s.nombre] = (totals[s.nombre] || 0) + (parseInt(s.precio) || 0);
      });
    } else if (t.servicio) {
      totals[t.servicio] = (totals[t.servicio] || 0) + (parseInt(t.precio) || 0);
    }
  });

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...entries.map(e => e[1]));

  ctx.clearRect(0, 0, width, height);
  if (!entries.length) {
    ctx.fillStyle = '#667074';
    ctx.font = '12px Manrope';
    ctx.fillText('Sin datos', 6, 20);
    return;
  }
  ctx.fillStyle = '#667074';
  ctx.font = '11px Manrope';

  const barHeight = 18;
  const gap = 10;
  entries.forEach((entry, idx) => {
    const [name, value] = entry;
    const y = idx * (barHeight + gap) + 10;
    const barWidth = (value / max) * (width - 120);
    ctx.fillStyle = 'rgba(15,118,110,0.18)';
    ctx.fillRect(100, y, barWidth, barHeight);
    ctx.fillStyle = '#0f766e';
    ctx.fillText(name.slice(0, 12), 6, y + 13);
    ctx.fillText(`${(value/1000).toFixed(0)}k`, 100 + barWidth + 6, y + 13);
  });
}

function obtenerRangoReporte() {
  const desdeInput = document.getElementById('reporteDesde');
  const hastaInput = document.getElementById('reporteHasta');
  const hoy = new Date();
  if (desdeInput && hastaInput && (!desdeInput.value || !hastaInput.value)) {
    const inicio = new Date();
    inicio.setDate(hoy.getDate() - 29);
    desdeInput.value = inicio.toISOString().split('T')[0];
    hastaInput.value = hoy.toISOString().split('T')[0];
  }
  const desde = desdeInput && desdeInput.value ? new Date(desdeInput.value + 'T00:00:00') : null;
  const hasta = hastaInput && hastaInput.value ? new Date(hastaInput.value + 'T23:59:59') : null;
  if (desde && hasta && desde > hasta) {
    const tmp = new Date(desde);
    desde.setTime(hasta.getTime());
    hasta.setTime(tmp.getTime());
  }
  return { desde, hasta };
}

function filtrarTurnosPorRango(lista, desde, hasta) {
  if (!desde || !hasta) return [...lista];
  return lista.filter(t => {
    if (!t.fecha) return false;
    const fecha = new Date(t.fecha + 'T00:00:00');
    return fecha >= desde && fecha <= hasta;
  });
}

function construirResumenColaboradores(turnosFuente) {
  const mapa = new Map();
  turnosFuente.forEach(t => {
    if (!t.colaboradorId || ['cancelado', 'no_show'].includes(normalizarEstadoTurnoUI(t.estado))) return;
    const ingreso = parseInt(t.precio) || 0;
    const comision = parseInt(t.colaboradorComision) || 0;
    const clave = t.colaboradorId;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        turnos: 0,
        ingresos: 0,
        comision: 0,
        clientes: new Set()
      });
    }
    const nodo = mapa.get(clave);
    nodo.turnos += 1;
    nodo.ingresos += ingreso;
    nodo.comision += comision;
    nodo.clientes.add(t.telefono || t.ci || t.nombre || '');
  });

  return Array.from(mapa.entries()).map(([id, data]) => {
    const colab = colaboradores.find(c => c.id === id) || {};
    const pct = data.ingresos ? Math.round((data.comision / data.ingresos) * 100) : 0;
    return {
      id,
      nombre: colab.nombre || colab.username || 'Colaborador',
      turnos: data.turnos,
      ingresos: data.ingresos,
      comision: data.comision,
      clientes: data.clientes.size,
      porcentaje: pct
    };
  });
}

function actualizarReporte() {
  const { desde, hasta } = obtenerRangoReporte();
  const turnosReporte = filtrarTurnosPorRango(turnos, desde, hasta);
  reporteActual = null;

  const totalTurnos = turnosReporte.length;
  const totalIngresos = turnosReporte.reduce((acc, t) => acc + (['cancelado', 'no_show'].includes(normalizarEstadoTurnoUI(t.estado)) ? 0 : (parseInt(t.precio) || 0)), 0);
  const promedio = totalTurnos ? Math.round(totalIngresos / totalTurnos) : 0;

  const clientesSet = new Set();
  const serviciosCount = {};
  const serviciosIngresos = {};
  const conteoPorFecha = {};
  const ingresosPorFecha = {};

  turnosReporte.forEach(t => {
    const clave = (t.ci || t.telefono || t.nombre || '').toString().trim().toLowerCase();
    if (clave) clientesSet.add(clave);

    const precio = ['cancelado', 'no_show'].includes(normalizarEstadoTurnoUI(t.estado)) ? 0 : (parseInt(t.precio) || 0);
    const serviciosTurno = t.servicios && t.servicios.length
      ? t.servicios
      : (t.servicio ? [{ nombre: t.servicio, precio }] : []);

    serviciosTurno.forEach(s => {
      const nombre = s.nombre || 'Servicio';
      serviciosCount[nombre] = (serviciosCount[nombre] || 0) + 1;
      serviciosIngresos[nombre] = (serviciosIngresos[nombre] || 0) + (parseInt(s.precio) || 0);
    });

    if (t.fecha) {
      conteoPorFecha[t.fecha] = (conteoPorFecha[t.fecha] || 0) + 1;
      ingresosPorFecha[t.fecha] = (ingresosPorFecha[t.fecha] || 0) + precio;
    }
  });

  const labels = [];
  const counts = [];
  const ingresos = [];
  if (desde && hasta) {
    const cursor = new Date(desde);
    while (cursor <= hasta) {
      const key = cursor.toISOString().split('T')[0];
      labels.push(key.slice(5));
      counts.push(conteoPorFecha[key] || 0);
      ingresos.push(ingresosPorFecha[key] || 0);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  document.getElementById('reporteTotalTurnos').textContent = totalTurnos;
  document.getElementById('reporteTotalIngresos').textContent = totalIngresos.toLocaleString('es-PY') + ' Gs';
  document.getElementById('reporteTotalClientes').textContent = clientesSet.size;
  document.getElementById('reportePromedio').textContent = promedio.toLocaleString('es-PY') + ' Gs';

  const topServicios = Object.entries(serviciosCount)
    .map(([nombre, count]) => ({
      nombre,
      count,
      ingresos: serviciosIngresos[nombre] || 0
    }))
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 5);

  const topServiciosEl = document.getElementById('reporteTopServicios');
  if (topServiciosEl) {
    topServiciosEl.innerHTML = topServicios.length
      ? topServicios.map(s => `<li>${escapeHtml(s.nombre)} <span>${s.count} · ${s.ingresos.toLocaleString('es-PY')} Gs</span></li>`).join('')
      : '<li>Sin datos</li>';
  }

  const clientesResumen = construirClientes(turnosReporte);
  const clientesTop = clientesResumen
    .sort((a, b) => b.totalIngresos - a.totalIngresos)
    .slice(0, 5);

  const topClientesEl = document.getElementById('reporteTopClientes');
  if (topClientesEl) {
    topClientesEl.innerHTML = clientesTop.length
      ? clientesTop.map(c => `<li>${escapeHtml(c.nombre || c.telefono || 'Cliente')} <span>${c.totalIngresos.toLocaleString('es-PY')} Gs</span></li>`).join('')
      : '<li>Sin datos</li>';
  }

  const resumenColabs = construirResumenColaboradores(turnosReporte);
  renderReporteColaboradores(resumenColabs);

  const tabla = document.getElementById('reporteTablaTurnos');
  if (tabla) {
    const turnosOrdenados = [...turnosReporte].sort((a, b) => new Date(b.fecha + 'T' + (b.hora || '00:00')) - new Date(a.fecha + 'T' + (a.hora || '00:00')));
    const vista = turnosOrdenados.slice(0, 12);
    tabla.innerHTML = vista.length
      ? vista.map(t => {
          const serviciosTexto = (t.servicios || []).map(s => s.nombre).join(', ') || t.servicio || '';
          const precio = parseInt(t.precio || 0).toLocaleString('es-PY');
          return `
            <tr>
              <td>${escapeHtml(t.nombre || '')}</td>
              <td>${escapeHtml(serviciosTexto)}</td>
              <td>${escapeHtml(t.fecha || '')}</td>
              <td>${escapeHtml(t.hora || '')}</td>
              <td>${escapeHtml(t.estado || '')}</td>
              <td>${precio} Gs</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="6">Sin datos</td></tr>';
  }

  reporteActual = { labels, counts, ingresos };
  renderReporteCharts();
}


function exportarPDFSemanal() {
  const hoy = new Date();
  const desde = new Date();
  desde.setDate(hoy.getDate() - 6);

  const turnosSemana = turnos.filter(t => {
    const fecha = new Date(t.fecha + 'T00:00:00');
    return fecha >= new Date(desde.toDateString()) && fecha <= hoy;
  });

  const totalIngresos = turnosSemana.reduce((acc, t) => acc + (parseInt(t.precio) || 0), 0);
  const totalTurnos = turnosSemana.length;

  const servicioCount = {};
  turnosSemana.forEach(t => {
    if (t.servicios && t.servicios.length) {
      t.servicios.forEach(s => { servicioCount[s.nombre] = (servicioCount[s.nombre] || 0) + 1; });
    } else if (t.servicio) {
      servicioCount[t.servicio] = (servicioCount[t.servicio] || 0) + 1;
    }
  });

  const topServicios = Object.entries(servicioCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const lines = [
    'ALI REYES MAKEUP',
    'Resumen semanal',
    `Desde: ${desde.toISOString().split('T')[0]}  Hasta: ${hoy.toISOString().split('T')[0]}`,
    '',
    `Turnos: ${totalTurnos}`,
    `Ingresos: ${totalIngresos.toLocaleString('es-PY')} Gs`,
    '',
    'Top servicios:'
  ];

  topServicios.forEach(([name, count]) => lines.push(`- ${name}: ${count}`));

  const pdf = construirPDF(lines);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-semanal-${hoy.toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function descargarArchivo(contenido, mime, nombre) {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(valor) {
  const str = String(valor ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generarCSV(headers, rows) {
  const headerLine = headers.map(csvEscape).join(',');
  const lines = rows.map(row => row.map(csvEscape).join(','));
  return '\ufeff' + [headerLine, ...lines].join('\n');
}

function generarTablaHTML(headers, rows) {
  const thead = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const tbody = rows.map(row => `<tr>${row.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  return `
    <html>
      <head><meta charset="utf-8"></head>
      <body>
        <table border="1">
          <thead><tr>${thead}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </body>
    </html>
  `;
}

function obtenerTurnosParaExportacion() {
  const usarRango = document.getElementById('reporteUsarRango')?.checked;
  if (usarRango) {
    const { desde, hasta } = obtenerRangoReporte();
    return filtrarTurnosPorRango(turnos, desde, hasta);
  }
  return [...turnos];
}

async function asegurarLookbook() {
  if (lookbook.length) return;
  try {
    const response = await fetch('/api/lookbook?admin=1');
    if (response.ok) {
      const data = await response.json();
      lookbook = Array.isArray(data) ? data : [];
    }
  } catch (error) {
    console.error('Error cargando lookbook:', error);
  }
}

function construirDatosExportacion(tipo, turnosExport) {
  if (tipo === 'turnos') {
    const headers = ['ID', 'Cliente', 'CI', 'Teléfono', 'Fecha', 'Hora', 'Estado', 'Servicios', 'Duración', 'Precio', 'Contactos', 'Último contacto', 'Creado'];
    const rows = turnosExport.map(t => {
      const serviciosTexto = (t.servicios || []).map(s => s.nombre).join(', ') || t.servicio || '';
      return [
        t.id || '',
        t.nombre || '',
        t.ci || '',
        t.telefono || '',
        t.fecha || '',
        t.hora || '',
        t.estado || '',
        serviciosTexto,
        t.duracion || '',
        t.precio || '',
        t.contactos || 0,
        t.ultimoContacto || '',
        t.creado || ''
      ];
    });
    return { headers, rows, filename: 'turnos' };
  }
  if (tipo === 'servicios') {
    const headers = ['ID', 'Nombre', 'Descripción', 'Categoría', 'Duración', 'Precio', 'Activo', 'Imagen', 'Imágenes'];
    const rows = servicios.map(s => [
      s.id || '',
      s.nombre || '',
      s.descripcion || '',
      s.categoria || '',
      s.duracion || '',
      s.precio || '',
      s.activo !== false ? 'Activo' : 'Inactivo',
      s.imagen || '',
      Array.isArray(s.imagenes) ? s.imagenes.join(' | ') : ''
    ]);
    return { headers, rows, filename: 'servicios' };
  }
  if (tipo === 'clientes') {
    const usarRango = document.getElementById('reporteUsarRango')?.checked;
    const clientesExport = construirClientes(usarRango ? turnosExport : turnos);
    const headers = ['Cliente', 'CI', 'Teléfono', 'Turnos', 'Contactos', 'Ingresos', 'Último turno', 'Último contacto'];
    const rows = clientesExport.map(c => [
      c.nombre || '',
      c.ci || '',
      c.telefono || '',
      c.totalTurnos || 0,
      c.contactos || 0,
      c.totalIngresos || 0,
      c.ultimoTurno ? c.ultimoTurno.toISOString().split('T')[0] : '',
      c.ultimoContacto ? c.ultimoContacto.toISOString() : ''
    ]);
    return { headers, rows, filename: 'clientes' };
  }
  if (tipo === 'colaboradores') {
    const resumen = construirResumenColaboradores(turnosExport);
    const headers = ['Colaborador', 'Turnos', 'Ingresos', 'Comisión', '% Comisión', 'Clientes atendidos'];
    const rows = resumen.map(c => [
      c.nombre || '',
      c.turnos || 0,
      c.ingresos || 0,
      c.comision || 0,
      c.porcentaje || 0,
      c.clientes || 0
    ]);
    return { headers, rows, filename: 'colaboradores' };
  }
  if (tipo === 'lookbook') {
    const headers = ['ID', 'Título', 'Descripción', 'Orden', 'Activo', 'Imagen'];
    const rows = lookbook.map(item => [
      item.id || '',
      item.titulo || '',
      item.descripcion || '',
      item.orden !== undefined ? item.orden : '',
      item.activo !== false ? 'Activo' : 'Inactivo',
      item.imagen || ''
    ]);
    return { headers, rows, filename: 'lookbook' };
  }
  return { headers: [], rows: [], filename: 'reporte' };
}

async function exportarCSV(tipo) {
  if (tipo === 'lookbook') await asegurarLookbook();
  const turnosExport = obtenerTurnosParaExportacion();
  const { headers, rows, filename } = construirDatosExportacion(tipo, turnosExport);
  const csv = generarCSV(headers, rows);
  descargarArchivo(csv, 'text/csv;charset=utf-8;', `${filename}.csv`);
}

async function exportarExcel(tipo) {
  if (tipo === 'lookbook') await asegurarLookbook();
  const turnosExport = obtenerTurnosParaExportacion();
  const { headers, rows, filename } = construirDatosExportacion(tipo, turnosExport);
  const html = generarTablaHTML(headers, rows);
  descargarArchivo(html, 'application/vnd.ms-excel;charset=utf-8;', `${filename}.xls`);
}

function imprimirReportePDF() {
  actualizarReporte();
  const contenido = document.getElementById('reporteContenido');
  if (!contenido) return;

  const clone = contenido.cloneNode(true);
  const canvases = contenido.querySelectorAll('canvas');
  const cloneCanvases = clone.querySelectorAll('canvas');
  canvases.forEach((canvas, index) => {
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    img.style.maxWidth = '100%';
    const target = cloneCanvases[index];
    if (target) target.replaceWith(img);
  });

  const win = window.open('', '_blank');
  if (!win) return;
  const styles = `
    <style>
      body { font-family: 'Manrope', sans-serif; color: #1e2426; padding: 20px; }
      h1 { font-family: 'Cormorant Garamond', serif; }
      .stat-card, .insight-card, .table-container { border: 1px solid #e7e4dc; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
      .reporte-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .reporte-tabla { grid-column: 1 / -1; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e7e4dc; padding: 8px; text-align: left; font-size: 12px; }
      ul { list-style: none; padding: 0; margin: 0; }
      ul li { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
      @media print { .reporte-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    </style>
  `;
  win.document.write(`
    <html>
      <head>
        <title>Reporte Ali Reyes</title>
        ${styles}
      </head>
      <body>
        <h1>Reporte Ali Reyes MakeUp</h1>
        ${clone.outerHTML}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.onload = () => win.print();
}

function construirPDF(lines) {
  // Generador PDF muy simple (texto plano)
  let content = 'BT\n/F1 12 Tf\n';
  let y = 760;
  lines.forEach(line => {
    content += `1 0 0 1 50 ${y} Tm (${line.replace(/[()]/g, '')}) Tj\n`;
    y -= 18;
  });
  content += 'ET';

  const objects = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
  objects.push('3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj');
  objects.push(`4 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream\nendobj`);
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj');

  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  let offset = 9; // %PDF-1.4\n
  const body = objects.map(obj => {
    const line = obj + '\n';
    const pos = offset.toString().padStart(10, '0');
    xref += `${pos} 00000 n \n`;
    offset += line.length;
    return line;
  }).join('');

  const trailer = `trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;

  return `%PDF-1.4\n${body}${xref}${trailer}`;
}




