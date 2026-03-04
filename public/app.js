let CONFIG = {
  whatsappNumber: '595981234567',
  horarioApertura: 9,
  horarioCierre: 19,
  horarioAperturaLabel: '09:00',
  horarioCierreLabel: '19:00',
  ciudad: 'Asunción, Paraguay',
  direccion: 'Dirección a confirmar',
  mapEmbedUrl: 'https://www.openstreetmap.org/export/embed.html?bbox=-57.674%2C-25.314%2C-57.510%2C-25.252&layer=mapnik&marker=-25.283%2C-57.594',
  mapUrl: 'https://www.openstreetmap.org/?mlat=-25.283&mlon=-57.594#map=13/-25.283/-57.594',
  instagramUrl: 'https://instagram.com/',
  facebookUrl: 'https://facebook.com/',
  tiktokUrl: 'https://tiktok.com/',
  heroMosaic: [
    { titulo: 'Promo destacada', descripcion: 'Descubre nuestras promociones de temporada.', imagen: '', imagenes: [], url: '', activo: false },
    { titulo: 'Novedades', descripcion: 'Nuevos servicios y combinaciones para ti.', imagen: '', imagenes: [], url: '', activo: false },
    { titulo: 'Reserva express', descripcion: 'Agenda en minutos y recibe confirmacion.', imagen: '', imagenes: [], url: '', activo: false }
  ],
  giftcardMontos: [100000, 200000, 300000],
  giftcardMensaje: 'Regalá una experiencia Ali Reyes.',
  bankInfo: {
    banco: '',
    titular: '',
    cuenta: '',
    alias: '',
    qrUrl: ''
  }
};

const currencyFormatter = new Intl.NumberFormat('es-PY');
const dateFormatter = new Intl.DateTimeFormat('es-PY', { dateStyle: 'long' });

let servicios = [];
let serviciosSeleccionados = [];
let carouselState = {};
let cargandoServicios = true;
let agendaCargando = false;
let lookbookItems = [];
let banners = [];
let colaboradoresDisponibles = [];
let colaboradorSeleccionado = '';
let giftMontoSeleccionado = null;
let giftServiciosSeleccionados = [];
let promoIndex = 0;
let promoTimer = null;
let mosaicMainIndex = 0;
let mosaicMainTimer = null;
let mosaicMainKey = '';
let mosaicImageStatus = new Map();
let filtrosServiciosPrincipal = { texto: '', categoria: '' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E');
}

function validarDocumento(ci) {
  const digits = normalizarTelefono(ci);
  return digits.length >= 5 && digits.length <= 20;
}

function validarTelefonoCliente(telefono) {
  const digits = normalizarTelefono(telefono);
  return digits.length >= 7 && digits.length <= 20;
}

function validarFechaReserva(fechaStr) {
  if (!fechaStr) return false;
  const fecha = new Date(`${fechaStr}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return fecha.getTime() >= hoy.getTime();
}

function actualizarEstadoCampo(input, invalido) {
  if (!input) return;
  input.classList.toggle('is-invalid', invalido);
  input.setAttribute('aria-invalid', invalido ? 'true' : 'false');
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

function normalizarHeroMosaicCliente(value, fallback = CONFIG.heroMosaic) {
  const base = Array.isArray(fallback) ? fallback : [];
  const source = Array.isArray(value) ? value : [];

  return Array.from({ length: 3 }, (_, index) => {
    const baseItem = base[index] && typeof base[index] === 'object' ? base[index] : {};
    const sourceItem = source[index] && typeof source[index] === 'object' ? source[index] : {};
    const titulo = String(sourceItem.titulo ?? baseItem.titulo ?? '').trim().slice(0, 80);
    const descripcion = String(sourceItem.descripcion ?? baseItem.descripcion ?? '').trim().slice(0, 160);
    const imagenesRaw = sourceItem.imagenes !== undefined ? sourceItem.imagenes : baseItem.imagenes;
    const imagenes = Array.isArray(imagenesRaw)
      ? Array.from(new Set(imagenesRaw.map(item => sanitizeUrl(item)).filter(Boolean))).slice(0, 12)
      : [];
    let imagen = sanitizeUrl(sourceItem.imagen ?? baseItem.imagen) || '';
    let imagenesFinal = imagenes;
    if (!imagenesFinal.length && imagen) imagenesFinal = [imagen];
    if (!imagen && imagenesFinal.length) imagen = imagenesFinal[0];
    const url = sanitizeUrl(sourceItem.url ?? baseItem.url) || '';
    const activo = sourceItem.activo !== undefined ? sourceItem.activo !== false : baseItem.activo !== false;

    return { titulo, descripcion, imagen, imagenes: imagenesFinal, url, activo };
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  configurarEventos();
  activarRevelado();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPromoCarousel();
      stopMainMosaicCarousel();
      return;
    }
    startPromoCarousel();
    startMainMosaicCarousel();
  });
  window.addEventListener('beforeunload', () => {
    stopPromoCarousel();
    stopMainMosaicCarousel();
  });
  await inicializarApp();
});

async function inicializarApp() {
  try {
    await cargarConfiguracion();
    await cargarServicios();
    await cargarLookbook();
    await cargarBanners();
    configurarFechaMinima();
    actualizarEstadoBotonReserva();
  } catch (error) {
    console.error('Error inicializando aplicación:', error);
    mostrarAlerta('Error al cargar los servicios. Por favor, recarga la página.', 'error');
  }
}

async function cargarConfiguracion() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('Error al cargar configuración');
    const config = await response.json();

    const apertura = config.horarioApertura || CONFIG.horarioAperturaLabel;
    const cierre = config.horarioCierre || CONFIG.horarioCierreLabel;

    CONFIG = {
      whatsappNumber: config.whatsappNumber || CONFIG.whatsappNumber,
      horarioApertura: parseInt(apertura.split(':')[0], 10),
      horarioCierre: parseInt(cierre.split(':')[0], 10),
      horarioAperturaLabel: apertura,
      horarioCierreLabel: cierre,
      ciudad: config.ciudad || CONFIG.ciudad,
      direccion: config.direccion || CONFIG.direccion,
      mapEmbedUrl: config.mapEmbedUrl || CONFIG.mapEmbedUrl,
      mapUrl: config.mapUrl || CONFIG.mapUrl,
      instagramUrl: config.instagramUrl || CONFIG.instagramUrl,
      facebookUrl: config.facebookUrl || CONFIG.facebookUrl,
      tiktokUrl: config.tiktokUrl || CONFIG.tiktokUrl,
      heroMosaic: normalizarHeroMosaicCliente(config.heroMosaic, CONFIG.heroMosaic),
      giftcardMontos: Array.isArray(config.giftcardMontos) && config.giftcardMontos.length
        ? config.giftcardMontos
        : CONFIG.giftcardMontos,
      giftcardMensaje: config.giftcardMensaje || CONFIG.giftcardMensaje,
      bankInfo: {
        ...CONFIG.bankInfo,
        ...(config.bankInfo || {})
      }
    };
  } catch {
    console.warn('No se pudo cargar configuración, usando valores por defecto.');
  } finally {
    actualizarHorarioUI();
    actualizarWhatsAppCTA();
    actualizarContactoUI();
    renderHeroMosaic();
    renderGiftMontos();
    renderBankInfo();
  }
}

function actualizarHorarioUI() {
  const label = `${CONFIG.horarioAperturaLabel} - ${CONFIG.horarioCierreLabel}`;
  document.querySelectorAll('[data-horario]').forEach(el => {
    el.textContent = label;
  });
}

function actualizarWhatsAppCTA() {
  const mensaje = 'Hola, me gustaría reservar un turno.';
  const link = construirLinkWhatsApp(mensaje);
  const floating = document.getElementById('whatsappFloating');
  const contacto = document.getElementById('whatsappContacto');
  if (floating) floating.href = link;
  if (contacto) contacto.href = link;
}

function actualizarContactoUI() {
  const ciudad = document.getElementById('ubicacionCiudad');
  const direccion = document.getElementById('ubicacionDireccion');
  if (ciudad) ciudad.textContent = CONFIG.ciudad;
  if (direccion) direccion.textContent = CONFIG.direccion;

  const mapEmbed = document.getElementById('mapEmbed');
  const mapLink = document.getElementById('mapLink');
  if (mapEmbed) mapEmbed.src = sanitizeUrl(CONFIG.mapEmbedUrl);
  if (mapLink) {
    const safeMapUrl = sanitizeUrl(CONFIG.mapUrl);
    if (!safeMapUrl) {
      mapLink.style.display = 'none';
    } else {
      mapLink.href = safeMapUrl;
      mapLink.style.display = 'inline-flex';
    }
  }

  actualizarSocialLink('instagramLink', CONFIG.instagramUrl);
  actualizarSocialLink('facebookLink', CONFIG.facebookUrl);
  actualizarSocialLink('tiktokLink', CONFIG.tiktokUrl);
}

function actualizarSocialLink(id, url) {
  const link = document.getElementById(id);
  if (!link) return;
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) {
    link.style.display = 'none';
    return;
  }
  link.href = safeUrl;
  link.style.display = 'inline-flex';
}

function renderHeroMosaic() {
  const tiles = Array.from(document.querySelectorAll('.hero-mosaic .mosaic-tile'));
  if (!tiles.length) {
    stopMainMosaicCarousel();
    return;
  }

  const mosaicos = normalizarHeroMosaicCliente(CONFIG.heroMosaic, CONFIG.heroMosaic);
  const principal = mosaicos[0];
  const principalImagenes = obtenerImagenesMosaicoListas(principal);

  tiles.forEach((tile, index) => {
    const data = mosaicos[index];
    const imagenes = obtenerImagenesMosaicoListas(data);
    if (!data || data.activo === false || !imagenes.length) {
      limpiarTileMosaico(tile);
      return;
    }

    if (index === 0 && imagenes.length > 1) {
      renderMainMosaicTileCarousel(tile, data, imagenes);
      return;
    }

    aplicarPromoMosaicoTile(tile, { ...data, imagen: imagenes[0] });
  });

  if (!principal || principal.activo === false || principalImagenes.length <= 1) {
    mosaicMainIndex = 0;
    mosaicMainKey = '';
    stopMainMosaicCarousel();
  }
}

function obtenerImagenesMosaicoItem(item) {
  if (!item || typeof item !== 'object') return [];
  const lista = Array.isArray(item.imagenes) ? item.imagenes : [];
  const sanitizadas = lista.map(url => sanitizeUrl(url)).filter(Boolean);
  if (sanitizadas.length) return Array.from(new Set(sanitizadas)).slice(0, 12);
  const imagen = sanitizeUrl(item.imagen);
  return imagen ? [imagen] : [];
}

function validarEstadoImagenMosaico(url) {
  if (!url) return 'error';
  const estado = mosaicImageStatus.get(url);
  if (estado === 'ok' || estado === 'error' || estado === 'loading') return estado;

  mosaicImageStatus.set(url, 'loading');
  const img = new Image();
  img.onload = () => {
    mosaicImageStatus.set(url, 'ok');
    renderHeroMosaic();
  };
  img.onerror = () => {
    mosaicImageStatus.set(url, 'error');
    renderHeroMosaic();
  };
  img.src = url;
  return 'loading';
}

function obtenerImagenesMosaicoListas(item) {
  const imagenes = obtenerImagenesMosaicoItem(item);
  if (!imagenes.length) return [];
  return imagenes.filter(url => validarEstadoImagenMosaico(url) === 'ok');
}

function renderMainMosaicTileCarousel(tile, data, imagenes) {
  const key = `${data.titulo || ''}|${data.descripcion || ''}|${imagenes.join('|')}`;
  if (mosaicMainKey !== key) {
    mosaicMainKey = key;
    mosaicMainIndex = 0;
  }
  if (mosaicMainIndex >= imagenes.length) mosaicMainIndex = 0;

  aplicarPromoMosaicoTile(tile, { ...data, imagen: imagenes[mosaicMainIndex] });

  const dots = document.createElement('div');
  dots.className = 'mosaic-main-dots';
  dots.setAttribute('aria-label', 'Selector de imagen del mosaico principal');
  imagenes.forEach((_, idx) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `mosaic-main-dot ${idx === mosaicMainIndex ? 'active' : ''}`;
    dot.setAttribute('aria-label', `Ver imagen ${idx + 1}`);
    dot.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      irMosaicPrincipal(idx);
    });
    dots.appendChild(dot);
  });
  tile.appendChild(dots);

  if (!tile.dataset.mainCarouselBound) {
    tile.dataset.mainCarouselBound = '1';
    tile.addEventListener('mouseenter', () => stopMainMosaicCarousel());
    tile.addEventListener('mouseleave', () => {
      if (obtenerImagenesMosaicoPrincipal().length > 1) startMainMosaicCarousel();
    });
  }

  startMainMosaicCarousel();
}

function obtenerImagenesMosaicoPrincipal() {
  const mosaicos = normalizarHeroMosaicCliente(CONFIG.heroMosaic, CONFIG.heroMosaic);
  return obtenerImagenesMosaicoListas(mosaicos[0]).filter(Boolean);
}

function limpiarTileMosaico(tile) {
  tile.classList.remove('has-promo', 'is-entering');
  tile.style.backgroundImage = '';
  tile.innerHTML = '';
}

function aplicarPromoMosaicoTile(tile, data) {
  limpiarTileMosaico(tile);
  if (!data || !data.imagen) return;

  const tituloTexto = String(data.titulo || 'Promo').trim().slice(0, 80);
  const descripcionTexto = String(data.descripcion || '').trim().slice(0, 160);
  const titulo = escapeHtml(tituloTexto);
  const descripcion = escapeHtml(descripcionTexto);

  tile.classList.add('has-promo');
  tile.style.backgroundImage = `url("${data.imagen.replace(/"/g, '%22')}")`;
  tile.innerHTML = `
    <div class="mosaic-promo-content">
      <strong>${titulo || 'Promo'}</strong>
      ${descripcion ? `<span>${descripcion}</span>` : ''}
    </div>
  `;

  tile.classList.remove('is-entering');
  void tile.offsetWidth;
  tile.classList.add('is-entering');
}

function startMainMosaicCarousel() {
  stopMainMosaicCarousel();
  const imagenes = obtenerImagenesMosaicoPrincipal();
  if (imagenes.length <= 1) return;
  mosaicMainTimer = setInterval(() => moverMosaicPrincipal(1), 5000);
}

function stopMainMosaicCarousel() {
  if (!mosaicMainTimer) return;
  clearInterval(mosaicMainTimer);
  mosaicMainTimer = null;
}

function moverMosaicPrincipal(delta = 1) {
  const imagenes = obtenerImagenesMosaicoPrincipal();
  if (imagenes.length <= 1) return;
  mosaicMainIndex = (mosaicMainIndex + delta + imagenes.length) % imagenes.length;
  const tile = document.querySelector('.hero-mosaic .tile-main');
  const mosaicos = normalizarHeroMosaicCliente(CONFIG.heroMosaic, CONFIG.heroMosaic);
  if (!tile || !mosaicos[0] || mosaicos[0].activo === false) return;
  renderMainMosaicTileCarousel(tile, mosaicos[0], imagenes);
}

function irMosaicPrincipal(index) {
  const imagenes = obtenerImagenesMosaicoPrincipal();
  if (!imagenes.length) return;
  const maxIndex = imagenes.length - 1;
  const safeIndex = Math.max(0, Math.min(index, maxIndex));
  mosaicMainIndex = safeIndex;
  const tile = document.querySelector('.hero-mosaic .tile-main');
  const mosaicos = normalizarHeroMosaicCliente(CONFIG.heroMosaic, CONFIG.heroMosaic);
  if (!tile || !mosaicos[0] || mosaicos[0].activo === false) return;
  renderMainMosaicTileCarousel(tile, mosaicos[0], imagenes);
}

function construirLinkWhatsApp(mensaje) {
  const telefono = normalizarTelefono(CONFIG.whatsappNumber);
  return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
}

function normalizarTelefono(valor) {
  return String(valor || '').replace(/\D/g, '');
}

async function cargarServicios() {
  cargandoServicios = true;
  mostrarServicios();

  try {
    const response = await fetch('/api/servicios');
    if (!response.ok) throw new Error('Error en la respuesta del servidor');
    const data = await response.json();

    servicios = (data || []).filter(servicio => servicio.activo !== false);
  } finally {
    cargandoServicios = false;
    renderFiltroCategoriasServiciosPrincipal();
    aplicarFiltrosServiciosPrincipal();
    renderServicePicker();
    actualizarResumen();
    renderGiftServicios();
    if (document.getElementById('buscadorServiciosPrincipal')?.value.trim()) {
      buscarServiciosPrincipal();
    }
  }
}

async function cargarLookbook() {
  try {
    const response = await fetch('/api/lookbook');
    if (!response.ok) throw new Error('Error al cargar lookbook');
    const data = await response.json();
    lookbookItems = Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('No se pudo cargar lookbook:', error);
    lookbookItems = [];
  } finally {
    renderLookbook();
  }
}

function renderLookbook() {
  const container = document.getElementById('lookbookGrid');
  if (!container) return;

  if (!lookbookItems.length) {
    container.innerHTML = '<div class="alert alert-info">Pronto compartiremos nuevos looks.</div>';
    return;
  }

  container.innerHTML = lookbookItems.map(item => {
    const titulo = escapeHtml(item.titulo || 'Lookbook');
    const descripcion = escapeHtml(item.descripcion || item.titulo || 'Lookbook');
    const imagen = sanitizeUrl(item.imagen) || '';
    if (!imagen) return '';
    return `
      <figure class="lookbook-card">
        <img src="${escapeHtml(imagen)}" alt="${descripcion}" loading="lazy" />
        <figcaption>${titulo}</figcaption>
      </figure>
    `;
  }).join('');
}

async function cargarBanners() {
  try {
    const response = await fetch('/api/banners');
    if (!response.ok) throw new Error('Error al cargar banners');
    banners = await response.json();
  } catch (error) {
    console.warn('No se pudieron cargar banners:', error);
    banners = [];
  } finally {
    renderBanners();
  }
}

function renderBanners() {
  const container = document.getElementById('promoCarousel');
  if (!container) return;
  if (!banners.length) {
    container.style.display = 'none';
    stopPromoCarousel();
    renderHeroMosaic();
    return;
  }
  promoIndex = 0;
  container.style.display = 'block';

  const slides = banners.map((banner, index) => {
    const titulo = escapeHtml(banner.titulo || 'Promo');
    const descripcion = escapeHtml(banner.descripcion || '');
    const imagen = sanitizeUrl(banner.imagen);
    const url = sanitizeUrl(banner.url);
    return `
      <article class="promo-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
        <div class="promo-copy">
          <p class="eyebrow">${titulo}</p>
          ${descripcion ? `<h3>${descripcion}</h3>` : ''}
          ${url ? `<a class="btn btn-primary btn-small" href="${escapeHtml(url)}" target="_blank" rel="noopener">Ver más</a>` : ''}
        </div>
        ${imagen ? `<div class="promo-image"><img src="${escapeHtml(imagen)}" alt="${titulo}" loading="lazy"></div>` : ''}
      </article>
    `;
  }).join('');

  const dots = banners.length > 1
    ? `<div class="promo-dots">
        ${banners.map((_, idx) => `<button class="${idx === 0 ? 'active' : ''}" onclick="irPromo(${idx})" aria-label="Ir a banner ${idx + 1}"></button>`).join('')}
      </div>`
    : '';

  const nav = banners.length > 1
    ? `<div class="promo-nav">
        <button type="button" onclick="moverPromo(-1)" aria-label="Banner anterior"><i class="fas fa-chevron-left"></i></button>
        <button type="button" onclick="moverPromo(1)" aria-label="Siguiente banner"><i class="fas fa-chevron-right"></i></button>
      </div>`
    : '';

  container.innerHTML = `
    <div class="promo-track" id="promoTrack">
      ${slides}
    </div>
    ${nav}
    ${dots}
  `;

  startPromoCarousel();
  renderHeroMosaic();
}

function startPromoCarousel() {
  stopPromoCarousel();
  if (banners.length <= 1) return;
  promoTimer = setInterval(() => moverPromo(1), 5000);
}

function stopPromoCarousel() {
  if (promoTimer) clearInterval(promoTimer);
  promoTimer = null;
}

function moverPromo(delta) {
  if (!banners.length) return;
  promoIndex = (promoIndex + delta + banners.length) % banners.length;
  irPromo(promoIndex);
}

function irPromo(index) {
  const slides = document.querySelectorAll('.promo-slide');
  if (!slides.length) return;
  slides.forEach((slide, idx) => slide.classList.toggle('active', idx === index));
  document.querySelectorAll('.promo-dots button').forEach((dot, idx) => dot.classList.toggle('active', idx === index));
  promoIndex = index;
  startPromoCarousel();
}

function normalizarBusqueda(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function renderFiltroCategoriasServiciosPrincipal() {
  const select = document.getElementById('filtroCategoriaServiciosPrincipal');
  if (!select) return;

  const categoriaActual = select.value || filtrosServiciosPrincipal.categoria || '';
  const categorias = Array.from(new Set(
    servicios
      .map(servicio => (servicio.categoria || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  select.innerHTML = `
    <option value="">Todas las categorias</option>
    ${categorias.map(categoria => `<option value="${escapeHtml(categoria)}">${escapeHtml(categoria)}</option>`).join('')}
  `;

  if (categoriaActual && categorias.includes(categoriaActual)) {
    select.value = categoriaActual;
    filtrosServiciosPrincipal.categoria = categoriaActual;
  } else {
    filtrosServiciosPrincipal.categoria = '';
  }
}

function obtenerServiciosFiltradosPrincipal() {
  const texto = normalizarBusqueda(filtrosServiciosPrincipal.texto);
  const categoria = normalizarBusqueda(filtrosServiciosPrincipal.categoria);
  if (!texto && !categoria) return [...servicios];

  return servicios.filter(servicio => {
    const nombre = normalizarBusqueda(servicio.nombre);
    const descripcion = normalizarBusqueda(servicio.descripcion);
    const categoriaServicio = normalizarBusqueda(servicio.categoria);
    const coincideTexto = !texto || nombre.includes(texto) || descripcion.includes(texto) || categoriaServicio.includes(texto);
    const coincideCategoria = !categoria || categoriaServicio === categoria;
    return coincideTexto && coincideCategoria;
  });
}

function aplicarFiltrosServiciosPrincipal() {
  const select = document.getElementById('filtroCategoriaServiciosPrincipal');
  const buscador = document.getElementById('buscadorServiciosPrincipal');

  filtrosServiciosPrincipal.texto = buscador ? buscador.value.trim() : '';
  filtrosServiciosPrincipal.categoria = select ? select.value : '';
  mostrarServicios();
}

function limpiarFiltrosServiciosPrincipal() {
  const select = document.getElementById('filtroCategoriaServiciosPrincipal');
  const buscador = document.getElementById('buscadorServiciosPrincipal');

  if (select) select.value = '';
  if (buscador) buscador.value = '';

  filtrosServiciosPrincipal = { texto: '', categoria: '' };
  limpiarResultadosBuscadorServiciosPrincipal();
  mostrarServicios();
}

function limpiarResultadosBuscadorServiciosPrincipal() {
  const resultados = document.getElementById('buscadorServiciosPrincipalResultados');
  if (resultados) resultados.innerHTML = '';
}

function buscarServiciosPrincipal() {
  const input = document.getElementById('buscadorServiciosPrincipal');
  const resultados = document.getElementById('buscadorServiciosPrincipalResultados');
  if (!input || !resultados) return;
  filtrosServiciosPrincipal.texto = input.value.trim();
  mostrarServicios();

  const texto = normalizarBusqueda(input.value);
  if (!texto) {
    limpiarResultadosBuscadorServiciosPrincipal();
    return;
  }

  const coincidencias = servicios.filter(servicio => {
    const nombre = normalizarBusqueda(servicio.nombre);
    const descripcion = normalizarBusqueda(servicio.descripcion);
    const categoria = normalizarBusqueda(servicio.categoria);
    return nombre.includes(texto) || descripcion.includes(texto) || categoria.includes(texto);
  }).slice(0, 8);

  if (!coincidencias.length) {
    resultados.innerHTML = '<div class="search-result-main-empty">No encontramos servicios con ese termino.</div>';
    return;
  }

  resultados.innerHTML = coincidencias.map(servicio => {
    const nombre = escapeHtml(servicio.nombre || 'Servicio');
    const categoria = escapeHtml(servicio.categoria || 'Sin categoria');
    const precio = currencyFormatter.format(parseInt(servicio.precio, 10) || 0);
    return `
      <button type="button" class="search-result-main-item" data-servicio-id="${escapeHtml(servicio.id)}" role="option">
        <strong>${nombre}</strong>
        <span>${categoria} · ${precio} Gs</span>
      </button>
    `;
  }).join('');
}

function seleccionarServicioBuscadoPrincipal(servicioId) {
  const servicio = servicios.find(item => String(item.id) === String(servicioId));
  if (!servicio) return;

  const buscador = document.getElementById('buscadorServiciosPrincipal');
  const categoria = document.getElementById('filtroCategoriaServiciosPrincipal');

  if (buscador) buscador.value = servicio.nombre || '';
  if (categoria) categoria.value = servicio.categoria || '';

  aplicarFiltrosServiciosPrincipal();
  limpiarResultadosBuscadorServiciosPrincipal();

  const seccionServicios = document.getElementById('servicios');
  if (seccionServicios) {
    seccionServicios.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      let cardObjetivo = null;
      document.querySelectorAll('.servicio-card[data-servicio-id]').forEach(card => {
        if (card.getAttribute('data-servicio-id') === String(servicioId)) cardObjetivo = card;
      });
      if (!cardObjetivo) return;
      cardObjetivo.classList.remove('focus-highlight');
      // Reinicia la animacion para permitir resaltado repetido.
      void cardObjetivo.offsetWidth;
      cardObjetivo.classList.add('focus-highlight');
      cardObjetivo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 380);
  }
}

function mostrarServicios() {
  const container = document.getElementById('serviciosContainer');
  if (!container) return;

  if (cargandoServicios) {
    container.innerHTML = Array.from({ length: 3 }).map(() => `
      <div class="servicio-card">
        <div class="servicio-image skeleton"></div>
        <div class="servicio-content">
          <div>
            <div class="servicio-title skeleton" style="height:18px; width:60%;"></div>
            <div class="servicio-desc skeleton" style="height:14px; width:80%;"></div>
          </div>
          <div class="servicio-meta">
            <div class="meta-item">
              <span class="meta-label">Duración</span>
              <span class="meta-value skeleton" style="height:14px; width:50px;"></span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Precio</span>
              <span class="meta-value skeleton" style="height:14px; width:70px;"></span>
            </div>
          </div>
          <div class="servicio-actions">
            <button class="btn btn-secondary service-toggle" disabled>Cargando...</button>
          </div>
        </div>
      </div>
    `).join('');
    return;
  }

  if (!servicios || servicios.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No hay servicios disponibles en este momento</div>';
    return;
  }

  const serviciosFiltrados = obtenerServiciosFiltradosPrincipal();
  if (!serviciosFiltrados.length) {
    container.innerHTML = '<div class="alert alert-info">No hay servicios que coincidan con los filtros aplicados.</div>';
    return;
  }

  container.innerHTML = serviciosFiltrados.map(servicio => {
    const seleccionado = serviciosSeleccionados.some(s => s.id === servicio.id);
    const precio = parseInt(servicio.precio, 10) || 0;
    const duracion = parseInt(servicio.duracion, 10) || 0;
    const nombre = escapeHtml(servicio.nombre);
    const descripcion = escapeHtml(servicio.descripcion || '');
    const carousel = renderServicioCarousel(servicio);

    return `
      <div class="servicio-card ${seleccionado ? 'selected' : ''}" data-servicio-id="${escapeHtml(servicio.id)}">
        ${carousel}
        <div class="servicio-content">
          <div>
            <div class="servicio-title">${nombre}</div>
            <div class="servicio-desc">${descripcion}</div>
          </div>
          <div class="servicio-meta">
            <div class="meta-item">
              <span class="meta-label">Duración</span>
              <span class="meta-value">${duracion} min</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Precio</span>
              <span class="meta-value price">${currencyFormatter.format(precio)} Gs</span>
            </div>
          </div>
          <div class="servicio-actions">
            <button class="btn ${seleccionado ? 'btn-primary' : 'btn-secondary'} service-toggle" onclick="toggleServicio('${escapeJsString(servicio.id)}')">
              <i class="fas ${seleccionado ? 'fa-check' : 'fa-plus'}"></i> ${seleccionado ? 'Quitar' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  initServiciosCarousel();
}

function getServicioImagenes(servicio) {
  const lista = Array.isArray(servicio.imagenes) ? servicio.imagenes : [];
  const filtradas = lista.map(item => sanitizeUrl(item)).filter(Boolean);
  if (filtradas.length) return filtradas;
  const imagen = sanitizeUrl(servicio.imagen);
  return imagen ? [imagen] : ['https://via.placeholder.com/400x250/111111/ffffff?text=Servicio'];
}

function renderServicioCarousel(servicio) {
  const imagenes = getServicioImagenes(servicio);
  const nombre = escapeHtml(servicio.nombre || 'Servicio');
  const carouselId = `carousel-${encodeURIComponent(String(servicio.id || ''))}`;
  const slides = imagenes.map((img, index) => `
      <img class="servicio-image carousel-slide" src="${escapeHtml(img)}" alt="${nombre} ${index + 1}" loading="lazy" />
    `).join('');

  const dots = imagenes.length > 1
    ? `<div class="carousel-dots">
        ${imagenes.map((_, index) => `<button class="carousel-dot ${index === 0 ? 'active' : ''}" type="button" onclick="irCarousel('${escapeJsString(carouselId)}', ${index})" aria-label="Ir a imagen ${index + 1}"></button>`).join('')}
      </div>`
    : '';

  const nav = imagenes.length > 1
    ? `<button class="carousel-btn prev" type="button" onclick="moverCarousel('${escapeJsString(carouselId)}', -1)" aria-label="Imagen anterior"><i class="fas fa-chevron-left"></i></button>
       <button class="carousel-btn next" type="button" onclick="moverCarousel('${escapeJsString(carouselId)}', 1)" aria-label="Siguiente imagen"><i class="fas fa-chevron-right"></i></button>`
    : '';

  return `
    <div class="servicio-carousel" id="${carouselId}" data-count="${imagenes.length}">
      <div class="carousel-track" id="${carouselId}-track">
        ${slides}
      </div>
      ${nav}
      ${dots}
    </div>
  `;
}

function initServiciosCarousel() {
  carouselState = {};
  document.querySelectorAll('.servicio-carousel').forEach(carousel => {
    const id = carousel.id;
    const track = carousel.querySelector('.carousel-track');
    if (!track) return;
    carouselState[id] = 0;
    track.addEventListener('scroll', () => {
      const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      updateCarouselDots(id, index);
    }, { passive: true });
  });
}

function moverCarousel(id, delta) {
  const carousel = document.getElementById(id);
  if (!carousel) return;
  const track = carousel.querySelector('.carousel-track');
  if (!track) return;
  const count = parseInt(carousel.dataset.count || '1', 10);
  const actual = carouselState[id] || 0;
  const nuevo = (actual + delta + count) % count;
  irCarousel(id, nuevo);
}

function irCarousel(id, index) {
  const carousel = document.getElementById(id);
  if (!carousel) return;
  const track = carousel.querySelector('.carousel-track');
  if (!track) return;
  carouselState[id] = index;
  track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' });
  updateCarouselDots(id, index);
}

function updateCarouselDots(id, index) {
  const carousel = document.getElementById(id);
  if (!carousel) return;
  const dots = carousel.querySelectorAll('.carousel-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === index);
  });
  carouselState[id] = index;
}

function renderServicePicker() {
  const picker = document.getElementById('servicePicker');
  if (!picker) return;

  if (!servicios || servicios.length === 0) {
    picker.innerHTML = '<div class="alert alert-info">No hay servicios disponibles.</div>';
    return;
  }

  picker.innerHTML = servicios.map(servicio => {
    const isChecked = serviciosSeleccionados.some(s => s.id === servicio.id);
    const precio = parseInt(servicio.precio, 10) || 0;
    const duracion = parseInt(servicio.duracion, 10) || 0;
    const servicioId = String(servicio.id || '');
    const inputId = `servicio-${encodeURIComponent(servicioId)}`;
    const nombre = escapeHtml(servicio.nombre);

    return `
      <label class="service-option ${isChecked ? 'active' : ''}">
        <input id="${inputId}" type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleServicio('${escapeJsString(servicioId)}')" />
        <span>${nombre} • ${duracion} min • ${currencyFormatter.format(precio)} Gs</span>
      </label>
    `;
  }).join('');
}

function toggleServicio(id) {
  const servicio = servicios.find(s => s.id === id);
  if (!servicio) return;

  const existe = serviciosSeleccionados.some(s => s.id === id);
  if (existe) {
    serviciosSeleccionados = serviciosSeleccionados.filter(s => s.id !== id);
  } else {
    serviciosSeleccionados.push(servicio);
  }

  renderServicePicker();
  actualizarResumen();
  mostrarServicios();
  limpiarSeleccionHora();

  const fecha = document.getElementById('fechaReserva').value;
  if (fecha && serviciosSeleccionados.length) {
    generarAgenda(fecha);
  } else {
    ocultarAgenda();
  }

  actualizarEstadoBotonReserva();
}

function actualizarResumen() {
  const lista = document.getElementById('resumenLista');
  const duracion = document.getElementById('resumenDuracion');
  const precio = document.getElementById('resumenPrecio');
  const cantidad = document.getElementById('resumenCantidad');

  if (!serviciosSeleccionados.length) {
    lista.textContent = 'Ningún servicio seleccionado.';
    duracion.textContent = '0 min';
    precio.textContent = '0 Gs';
    if (cantidad) cantidad.textContent = '0 servicios';
    return;
  }

  const nombres = serviciosSeleccionados.map(s => s.nombre).join(', ');
  const totalDuracion = serviciosSeleccionados.reduce((acc, s) => acc + (parseInt(s.duracion, 10) || 0), 0);
  const totalPrecio = serviciosSeleccionados.reduce((acc, s) => acc + (parseInt(s.precio, 10) || 0), 0);

  lista.textContent = nombres;
  duracion.textContent = `${totalDuracion} min`;
  precio.textContent = `${currencyFormatter.format(totalPrecio)} Gs`;
  if (cantidad) {
    cantidad.textContent = `${serviciosSeleccionados.length} servicio${serviciosSeleccionados.length !== 1 ? 's' : ''}`;
  }
}

function configurarFechaMinima() {
  const hoy = new Date().toISOString().split('T')[0];
  const fechaInput = document.getElementById('fechaReserva');
  if (!fechaInput) return;
  fechaInput.min = hoy;
  if (!fechaInput.value) fechaInput.value = hoy;
}

function configurarEventos() {
  const toggle = document.getElementById('toggleReserva');
  const cta = document.getElementById('ctaAgendar');
  const navAgendar = document.getElementById('navAgendar');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const serviciosAgendar = document.getElementById('serviciosAgendarRapido');
  const form = document.getElementById('bookingForm');
  const nombreInput = document.getElementById('nombreCliente');
  const ciInput = document.getElementById('ciCliente');
  const telefonoInput = document.getElementById('telefonoCliente');
  const fechaInput = document.getElementById('fechaReserva');
  const buscadorWrapper = document.getElementById('buscadorServiciosPrincipalWrapper');
  const buscadorInput = document.getElementById('buscadorServiciosPrincipal');
  const buscadorResultados = document.getElementById('buscadorServiciosPrincipalResultados');

  if (toggle) toggle.addEventListener('click', () => togglePanelReserva());
  if (navToggle) navToggle.addEventListener('click', () => toggleMobileNav());
  if (navLinks) {
    navLinks.querySelectorAll('a, button').forEach(item => {
      item.addEventListener('click', () => toggleMobileNav(false));
    });
  }
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) toggleMobileNav(false);
  });

  [cta, navAgendar, serviciosAgendar].forEach(button => {
    if (!button) return;
    button.addEventListener('click', () => {
      toggleMobileNav(false);
      togglePanelReserva(true);
      const section = document.getElementById('reservaSection');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    });
  });

  if (fechaInput) {
    fechaInput.addEventListener('change', (e) => {
      const fecha = e.target.value;
      actualizarEstadoCampo(fechaInput, Boolean(fecha) && !validarFechaReserva(fecha));
      limpiarSeleccionHora();
      if (fecha && serviciosSeleccionados.length) {
        generarAgenda(fecha);
      } else {
        ocultarAgenda();
      }
      actualizarEstadoBotonReserva();
    });
  }

  if (nombreInput) {
    nombreInput.addEventListener('input', () => {
      actualizarEstadoCampo(nombreInput, !nombreInput.value.trim());
      actualizarEstadoBotonReserva();
    });
  }

  if (ciInput) {
    ciInput.addEventListener('input', () => {
      ciInput.value = ciInput.value.replace(/\D/g, '').slice(0, 20);
      actualizarEstadoCampo(ciInput, Boolean(ciInput.value) && !validarDocumento(ciInput.value));
      actualizarEstadoBotonReserva();
    });
  }

  if (telefonoInput) {
    telefonoInput.addEventListener('input', () => {
      telefonoInput.value = telefonoInput.value.replace(/[^\d+\-\s()]/g, '').slice(0, 30);
      actualizarEstadoCampo(telefonoInput, Boolean(telefonoInput.value) && !validarTelefonoCliente(telefonoInput.value));
      actualizarEstadoBotonReserva();
    });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      reservarTurno();
    });
  }

  const giftMontoInput = document.getElementById('giftMontoCustom');
  if (giftMontoInput) {
    giftMontoInput.addEventListener('input', () => {
      giftMontoSeleccionado = null;
      actualizarGiftChips();
    });
  }

  if (buscadorResultados) {
    buscadorResultados.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest('[data-servicio-id]');
      if (!item) return;
      seleccionarServicioBuscadoPrincipal(item.getAttribute('data-servicio-id'));
    });
  }

  if (buscadorInput) {
    buscadorInput.addEventListener('focus', () => {
      if (buscadorInput.value.trim()) buscarServiciosPrincipal();
    });
  }

  if (buscadorWrapper) {
    document.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buscadorWrapper.contains(target)) return;
      limpiarResultadosBuscadorServiciosPrincipal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (navLinks && navLinks.classList.contains('is-open')) {
        toggleMobileNav(false);
        return;
      }
      if (buscadorInput && document.activeElement === buscadorInput) {
        limpiarResultadosBuscadorServiciosPrincipal();
        buscadorInput.blur();
        return;
      }
      cerrarModal();
    }
  });

  toggleMobileNav(false);
}

function toggleMobileNav(forceOpen = null) {
  const navLinks = document.getElementById('navLinks');
  const navToggle = document.getElementById('navToggle');
  if (!navLinks || !navToggle) return;

  const open = typeof forceOpen === 'boolean'
    ? forceOpen
    : !navLinks.classList.contains('is-open');

  navLinks.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  navToggle.innerHTML = open
    ? '<i class="fas fa-xmark" aria-hidden="true"></i><span>Cerrar</span>'
    : '<i class="fas fa-bars" aria-hidden="true"></i><span>Menú</span>';
  document.body.classList.toggle('menu-open', open);
}

function activarRevelado() {
  const elementos = document.querySelectorAll('.reveal');
  if (!elementos.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  elementos.forEach(el => observer.observe(el));
}

function togglePanelReserva(forceOpen = false) {
  const panel = document.getElementById('bookingPanel');
  const toggle = document.getElementById('toggleReserva');
  if (!panel || !toggle) return;

  if (forceOpen) {
    panel.hidden = false;
  } else {
    panel.hidden = !panel.hidden;
  }

  const abierto = !panel.hidden;
  toggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  toggle.innerHTML = abierto
    ? '<i class="fas fa-xmark"></i> Cerrar agenda'
    : '<i class="fas fa-calendar-check"></i> Agendar turno';
}

async function generarAgenda(fecha) {
  if (!serviciosSeleccionados.length) {
    mostrarAlerta('Selecciona al menos un servicio', 'error');
    return;
  }

  const agendaContainer = document.getElementById('agendaContainer');
  const timeSlots = document.getElementById('timeSlots');

  agendaCargando = true;
  actualizarEstadoBotonReserva();

  if (agendaContainer) agendaContainer.style.display = 'block';
  if (timeSlots) timeSlots.innerHTML = '<div class="alert alert-info">Cargando horarios disponibles...</div>';
  ocultarSugerencias();

  try {
    const ids = serviciosSeleccionados.map(s => encodeURIComponent(s.id)).join(',');
    const response = await fetch(`/api/disponibilidad?fecha=${encodeURIComponent(fecha)}&servicios=${ids}`);
    if (!response.ok) throw new Error('Error al cargar horarios');
    const data = await response.json();
    mostrarHorariosDisponibles(data.horariosDisponibles);
  } catch (error) {
    console.error('Error generando agenda:', error);
    agendaCargando = false;
    actualizarEstadoBotonReserva();
    mostrarAlerta('Error al cargar horarios disponibles', 'error');
  }
}

function mostrarHorariosDisponibles(horarios) {
  const container = document.getElementById('timeSlots');
  const agendaContainer = document.getElementById('agendaContainer');

  agendaCargando = false;
  actualizarEstadoBotonReserva();
  ocultarColaboradores();

  if (!container || !agendaContainer) return;

  if (!horarios || horarios.length === 0) {
    container.innerHTML = '<p class="tagline">No hay horarios disponibles para esta fecha</p>';
    agendaContainer.style.display = 'block';
    return;
  }

  container.innerHTML = horarios.map(hora => `
    <div class="time-slot" onclick="seleccionarHora('${escapeJsString(hora)}')">${escapeHtml(hora)}</div>
  `).join('');

  agendaContainer.style.display = 'block';
}

function seleccionarHora(hora) {
  document.getElementById('horaSeleccionada').value = hora;
  document.querySelectorAll('.time-slot').forEach(slot => {
    slot.classList.remove('seleccionado');
    if (slot.textContent === hora) slot.classList.add('seleccionado');
  });
  ocultarSugerencias();
   cargarColaboradoresDisponibles();
  actualizarEstadoBotonReserva();
}

async function reservarTurno() {
  const nombreInput = document.getElementById('nombreCliente');
  const ciInput = document.getElementById('ciCliente');
  const telefonoInput = document.getElementById('telefonoCliente');
  const fechaInput = document.getElementById('fechaReserva');

  const nombre = nombreInput?.value.trim() || '';
  const ci = ciInput?.value.trim() || '';
  const telefono = telefonoInput?.value.trim() || '';
  const fecha = fechaInput?.value || '';
  const hora = document.getElementById('horaSeleccionada').value;
  const ciNormalizado = normalizarTelefono(ci);
  const telefonoNormalizado = normalizarTelefono(telefono);

  actualizarEstadoCampo(nombreInput, !nombre);
  actualizarEstadoCampo(ciInput, Boolean(ci) && !validarDocumento(ci));
  actualizarEstadoCampo(telefonoInput, Boolean(telefono) && !validarTelefonoCliente(telefono));
  actualizarEstadoCampo(fechaInput, Boolean(fecha) && !validarFechaReserva(fecha));

  if (!serviciosSeleccionados.length) {
    mostrarAlerta('Selecciona al menos un servicio', 'error');
    return;
  }
  if (!nombre || !ci || !telefono || !fecha || !hora) {
    mostrarAlerta('Completa todos los campos y selecciona un horario', 'error');
    return;
  }
  if (document.getElementById('colaboradorSelector')?.style.display !== 'none' && colaboradoresDisponibles.length && !colaboradorSeleccionado) {
    mostrarAlerta('Selecciona un colaborador disponible para continuar', 'error');
    return;
  }
  if (!validarDocumento(ci)) {
    mostrarAlerta('La cédula debe contener solo números (mínimo 5 dígitos).', 'error');
    return;
  }
  if (!validarTelefonoCliente(telefono)) {
    mostrarAlerta('Ingresa un teléfono válido (mínimo 7 dígitos).', 'error');
    return;
  }
  if (!validarFechaReserva(fecha)) {
    mostrarAlerta('La fecha seleccionada no es válida.', 'error');
    return;
  }

  const reserva = {
    nombre,
    ci: ciNormalizado,
    telefono: telefonoNormalizado,
    servicios: serviciosSeleccionados.map(s => s.id),
    fecha,
    hora,
    colaboradorId: colaboradorSeleccionado || undefined
  };

  setBotonCargando(true);

  try {
    const response = await fetch('/api/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reserva)
    });

    const resultado = await response.json().catch(() => ({}));
    if (!response.ok || !resultado.success) {
      if (resultado.sugerencias && resultado.sugerencias.length > 0) {
        mostrarSugerencias(resultado.sugerencias);
        throw new Error('Horario no disponible. Te sugerimos los horarios mostrados arriba.');
      }
      throw new Error(resultado.error || 'Error al procesar la reserva');
    }

    mostrarConfirmacion({
      ...reserva,
      serviciosDetalle: serviciosSeleccionados
    });
  } catch (error) {
    console.error('Error reservando turno:', error);
    mostrarAlerta(error.message || 'Error al reservar. Intenta nuevamente.', 'error');
  } finally {
    setBotonCargando(false);
    actualizarEstadoBotonReserva();
  }
}

function setBotonCargando(cargando) {
  const btn = document.getElementById('confirmarBtn');
  if (!btn) return;

  if (cargando) {
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    btn.disabled = true;
  } else {
    if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
  }
}

function mostrarSugerencias(sugerencias) {
  const container = document.getElementById('sugerenciasContainer');
  const grid = document.getElementById('sugerenciasGrid');
  if (!container || !grid) return;

  grid.innerHTML = sugerencias.map(hora => `
    <div class="sugerencia-hora" onclick="seleccionarHoraSugerida('${escapeJsString(hora)}')">${escapeHtml(hora)}</div>
  `).join('');
  container.style.display = 'block';
}

function seleccionarHoraSugerida(hora) {
  seleccionarHora(hora);
  ocultarSugerencias();
  const btn = document.getElementById('confirmarBtn');
  if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function ocultarSugerencias() {
  const container = document.getElementById('sugerenciasContainer');
  if (container) container.style.display = 'none';
}

async function cargarColaboradoresDisponibles() {
  const fecha = document.getElementById('fechaReserva')?.value;
  const hora = document.getElementById('horaSeleccionada')?.value;
  if (!fecha || !hora || !serviciosSeleccionados.length) {
    ocultarColaboradores();
    return;
  }
  try {
    const ids = serviciosSeleccionados.map(s => encodeURIComponent(s.id)).join(',');
    const response = await fetch(`/api/disponibilidad?fecha=${encodeURIComponent(fecha)}&servicios=${ids}&hora=${encodeURIComponent(hora)}`);
    const data = await response.json().catch(() => ({}));
    colaboradoresDisponibles = Array.isArray(data.colaboradoresDisponibles) ? data.colaboradoresDisponibles : [];
    renderColaboradoresDisponibles();
  } catch (error) {
    colaboradoresDisponibles = [];
    renderColaboradoresDisponibles(true);
  }
}

function renderColaboradoresDisponibles(error = false) {
  const wrapper = document.getElementById('colaboradorSelector');
  const chips = document.getElementById('colaboradorChips');
  const help = document.getElementById('colaboradorHelp');
  if (!wrapper || !chips) return;

  if (error) {
    wrapper.style.display = 'block';
    chips.innerHTML = '<span class="form-help">No pudimos cargar colaboradores, intenta nuevamente.</span>';
    help.textContent = '';
    colaboradorSeleccionado = '';
    actualizarEstadoBotonReserva();
    return;
  }

  if (!colaboradoresDisponibles.length) {
    wrapper.style.display = 'block';
    chips.innerHTML = '<span class="form-help">No hay colaboradores disponibles para ese horario.</span>';
    if (help) help.textContent = '';
    colaboradorSeleccionado = '';
    actualizarEstadoBotonReserva();
    return;
  }

  if (!colaboradorSeleccionado || !colaboradoresDisponibles.some(c => c.id === colaboradorSeleccionado)) {
    colaboradorSeleccionado = colaboradoresDisponibles[0]?.id || '';
  }
  const hidden = document.getElementById('colaboradorSeleccionado');
  if (hidden) hidden.value = colaboradorSeleccionado || '';

  wrapper.style.display = 'block';
  chips.innerHTML = colaboradoresDisponibles.map(colab => `
    <button type="button" class="chip ${colab.id === colaboradorSeleccionado ? 'active' : ''}" onclick="seleccionarColaborador('${escapeJsString(colab.id)}')">
      ${escapeHtml(colab.nombre || 'Colaborador')}
    </button>
  `).join('');

  if (help) {
    help.textContent = 'Si no eliges, asignaremos automáticamente a quien esté libre.';
  }
  actualizarEstadoBotonReserva();
}

function seleccionarColaborador(id) {
  colaboradorSeleccionado = id;
  const hidden = document.getElementById('colaboradorSeleccionado');
  if (hidden) hidden.value = id || '';
  renderColaboradoresDisponibles();
}

function ocultarColaboradores() {
  const wrapper = document.getElementById('colaboradorSelector');
  const chips = document.getElementById('colaboradorChips');
  const hidden = document.getElementById('colaboradorSeleccionado');
  if (wrapper) wrapper.style.display = 'none';
  if (chips) chips.innerHTML = '';
  if (hidden) hidden.value = '';
  colaboradorSeleccionado = '';
  colaboradoresDisponibles = [];
  actualizarEstadoBotonReserva();
}

function limpiarSeleccionHora() {
  const horaInput = document.getElementById('horaSeleccionada');
  if (horaInput) horaInput.value = '';
  document.querySelectorAll('.time-slot').forEach(slot => slot.classList.remove('seleccionado'));
  ocultarSugerencias();
  ocultarColaboradores();
}

function ocultarAgenda() {
  const agenda = document.getElementById('agendaContainer');
  const slots = document.getElementById('timeSlots');
  if (agenda) agenda.style.display = 'none';
  if (slots) slots.innerHTML = '';
  ocultarColaboradores();
}

function mostrarConfirmacion(reserva) {
  const detalles = document.getElementById('reservaDetalles');
  const totalDuracion = serviciosSeleccionados.reduce((acc, s) => acc + (parseInt(s.duracion, 10) || 0), 0);
  const totalPrecio = serviciosSeleccionados.reduce((acc, s) => acc + (parseInt(s.precio, 10) || 0), 0);
  const fechaTexto = formatearFecha(reserva.fecha);
  const colab = colaboradoresDisponibles.find(c => c.id === colaboradorSeleccionado);
  const listaServicios = reserva.serviciosDetalle.map(s => `${s.nombre} (${s.duracion} min)`).join(', ');

  detalles.innerHTML = `
    <p><strong>Servicios:</strong> ${escapeHtml(listaServicios)}</p>
    <p><strong>Duración total:</strong> ${totalDuracion} min</p>
    <p><strong>Total:</strong> ${currencyFormatter.format(totalPrecio)} Gs</p>
    <p><strong>Fecha:</strong> ${escapeHtml(fechaTexto)}</p>
    <p><strong>Hora:</strong> ${escapeHtml(reserva.hora)}</p>
    <p><strong>Cliente:</strong> ${escapeHtml(reserva.nombre)} · ${escapeHtml(reserva.telefono)}</p>
    ${colab ? `<p><strong>Colaborador:</strong> ${escapeHtml(colab.nombre)}</p>` : ''}
    <p class="form-help"><strong>Importante:</strong> Un colaborador se contactara contigo para confirmar tu turno.</p>
  `;

  document.getElementById('confirmModal').classList.add('active');
}

function formatearFecha(fechaStr) {
  try {
    const date = new Date(`${fechaStr}T00:00:00`);
    return dateFormatter.format(date);
  } catch {
    return fechaStr;
  }
}

function cerrarModal() {
  document.getElementById('confirmModal').classList.remove('active');
  ['nombreCliente', 'ciCliente', 'telefonoCliente', 'horaSeleccionada'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['nombreCliente', 'ciCliente', 'telefonoCliente', 'fechaReserva'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.classList.remove('is-invalid');
    input.setAttribute('aria-invalid', 'false');
  });
  serviciosSeleccionados = [];
  renderServicePicker();
  actualizarResumen();
  mostrarServicios();
  ocultarAgenda();
  actualizarEstadoBotonReserva();
}

function renderGiftMontos() {
  const contenedor = document.getElementById('giftMontos');
  const mensaje = document.getElementById('giftcardMensaje');
  if (mensaje) mensaje.textContent = CONFIG.giftcardMensaje || 'Regalá belleza con nosotros.';
  if (!contenedor) return;
  const montos = Array.isArray(CONFIG.giftcardMontos) ? CONFIG.giftcardMontos : [];
  if (!montos.length) {
    contenedor.innerHTML = '<small class="form-help">Ingresa un monto personalizado.</small>';
    return;
  }
  contenedor.innerHTML = montos.map(monto => {
    const activo = giftMontoSeleccionado === monto;
    return `<button type="button" class="chip ${activo ? 'active' : ''}" data-monto="${monto}" onclick="seleccionarMontoGift(${monto})">${currencyFormatter.format(monto)} Gs</button>`;
  }).join('');
  if (giftMontoSeleccionado === null && montos.length) {
    giftMontoSeleccionado = montos[0];
    actualizarGiftChips();
  }
}

function actualizarGiftChips() {
  document.querySelectorAll('#giftMontos .chip').forEach(chip => {
    const valor = parseInt(chip.dataset.monto || '0', 10);
    chip.classList.toggle('active', valor === giftMontoSeleccionado);
  });
}

function seleccionarMontoGift(monto) {
  giftMontoSeleccionado = monto;
  const custom = document.getElementById('giftMontoCustom');
  if (custom) custom.value = '';
  actualizarGiftChips();
}

function renderGiftServicios() {
  const container = document.getElementById('giftServiciosPicker');
  if (!container) return;
  if (!servicios.length) {
    container.innerHTML = '<div class="alert alert-info">Cargaremos los servicios en segundos.</div>';
    return;
  }
  container.innerHTML = servicios.map(servicio => {
    const checked = giftServiciosSeleccionados.includes(servicio.id);
    const nombre = escapeHtml(servicio.nombre);
    const precio = parseInt(servicio.precio, 10) || 0;
    return `
      <label class="service-option ${checked ? 'active' : ''}">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleGiftServicio('${escapeJsString(servicio.id)}')" />
        <span>${nombre} • ${currencyFormatter.format(precio)} Gs</span>
      </label>
    `;
  }).join('');
}

function toggleGiftServicio(id) {
  if (giftServiciosSeleccionados.includes(id)) {
    giftServiciosSeleccionados = giftServiciosSeleccionados.filter(s => s !== id);
  } else {
    giftServiciosSeleccionados.push(id);
  }
  renderGiftServicios();
}

function renderBankInfo() {
  const info = CONFIG.bankInfo || {};
  const nombre = document.getElementById('bankNombre');
  const titular = document.getElementById('bankTitular');
  const cuenta = document.getElementById('bankCuenta');
  if (nombre) nombre.textContent = info.banco || '—';
  if (titular) titular.textContent = info.titular || '—';
  if (cuenta) cuenta.textContent = [info.cuenta, info.alias].filter(Boolean).join(' · ') || '—';

  const qrBox = document.getElementById('qrBox');
  const qr = document.getElementById('bankQr');
  const qrUrl = sanitizeUrl(info.qrUrl);
  if (qr && qrUrl) {
    qr.src = qrUrl;
    if (qrBox) qrBox.style.display = 'block';
  } else if (qrBox) {
    qrBox.style.display = 'none';
  }
}

async function enviarGiftcard() {
  const nombre = document.getElementById('giftNombre')?.value.trim();
  const telefono = document.getElementById('giftTelefono')?.value.trim();
  const destinatario = document.getElementById('giftDestinatario')?.value.trim();
  const mensaje = document.getElementById('giftMensaje')?.value.trim();
  const montoCustom = parseInt(document.getElementById('giftMontoCustom')?.value || '0', 10);
  const monto = (!Number.isNaN(montoCustom) && montoCustom > 0) ? montoCustom : giftMontoSeleccionado;
  const telefonoNormalizado = normalizarTelefono(telefono);

  if (!nombre || !telefono || !destinatario || !monto) {
    setGiftFeedback('Completa nombre, teléfono, destinatario y monto.', 'error');
    return;
  }
  if (!validarTelefonoCliente(telefono)) {
    setGiftFeedback('Ingresa un teléfono válido para continuar.', 'error');
    return;
  }

  const payload = {
    clienteNombre: nombre,
    telefono: telefonoNormalizado,
    destinatario,
    monto,
    montoCustom: (!Number.isNaN(montoCustom) && montoCustom > 0) ? montoCustom : null,
    servicios: giftServiciosSeleccionados,
    mensaje
  };

  setGiftFeedback('Enviando solicitud...', 'info');

  try {
    const response = await fetch('/api/giftcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo registrar la giftcard');
    const codigo = data.giftcard?.id ? ` (#${data.giftcard.id})` : '';
    setGiftFeedback(`¡Listo! Solicitud enviada${codigo}. Te contactaremos para confirmar el pago y entrega.`, 'success');
    limpiarGiftForm();
  } catch (error) {
    setGiftFeedback(error.message || 'Error al enviar la giftcard.', 'error');
  }
}

function limpiarGiftForm() {
  ['giftNombre', 'giftTelefono', 'giftDestinatario', 'giftMensaje', 'giftMontoCustom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  giftMontoSeleccionado = CONFIG.giftcardMontos?.[0] || null;
  giftServiciosSeleccionados = [];
  renderGiftMontos();
  renderGiftServicios();
}

function setGiftFeedback(mensaje, tipo = 'info') {
  const box = document.getElementById('giftFeedback');
  if (!box) return;
  box.textContent = mensaje;
  box.className = `form-help gift-${tipo}`;
}

function mostrarAlerta(mensaje, tipo = 'info') {
  const container = document.getElementById('alertContainer') || document.querySelector('.booking-shell') || document.body;
  const alerta = document.createElement('div');
  alerta.className = `alert alert-${tipo}`;
  alerta.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = mensaje;
  alerta.appendChild(span);

  if (container) {
    if (container.id === 'alertContainer') container.innerHTML = '';
    container.insertBefore(alerta, container.firstChild);
  }

  setTimeout(() => {
    alerta.style.opacity = '0';
    setTimeout(() => alerta.remove(), 300);
  }, 4000);
}

function actualizarEstadoBotonReserva() {
  const btn = document.getElementById('confirmarBtn');
  if (!btn) return;

  const nombreInput = document.getElementById('nombreCliente');
  const ciInput = document.getElementById('ciCliente');
  const telefonoInput = document.getElementById('telefonoCliente');
  const fechaInput = document.getElementById('fechaReserva');

  const nombre = nombreInput?.value.trim() || '';
  const ci = ciInput?.value.trim() || '';
  const telefono = telefonoInput?.value.trim() || '';
  const fecha = fechaInput?.value || '';
  const hora = document.getElementById('horaSeleccionada')?.value;
  const selector = document.getElementById('colaboradorSelector');
  const requiereColaborador = selector && selector.style.display !== 'none';
  const hayColaborador = !requiereColaborador || (colaboradoresDisponibles.length > 0 && colaboradorSeleccionado);
  const ciValido = validarDocumento(ci);
  const telefonoValido = validarTelefonoCliente(telefono);
  const fechaValida = validarFechaReserva(fecha);

  actualizarEstadoCampo(ciInput, Boolean(ci) && !ciValido);
  actualizarEstadoCampo(telefonoInput, Boolean(telefono) && !telefonoValido);
  actualizarEstadoCampo(fechaInput, Boolean(fecha) && !fechaValida);

  const listo = serviciosSeleccionados.length
    && Boolean(nombre)
    && Boolean(ci)
    && Boolean(telefono)
    && Boolean(fecha)
    && Boolean(hora)
    && ciValido
    && telefonoValido
    && fechaValida
    && !agendaCargando
    && hayColaborador;
  btn.disabled = !listo;
}

