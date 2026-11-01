/**
 * App Pádel – Lógica pura (Fase 1)
 *
 * Funciones sin DOM, sin red, sin localStorage y sin fecha actual.
 * El mismo archivo se usa en dos sitios:
 *   - En el navegador: index.html y pruebas.html lo cargan con <script src="logica.js">.
 *   - En Apps Script: se pega tal cual como un segundo archivo llamado "logica",
 *     y Codigo.gs usa estas funciones para validar antes de escribir.
 * En Apps Script todos los archivos comparten el ámbito global: las constantes de aquí
 * no se pueden volver a declarar en Codigo.gs.
 *
 * Representación: objetos planos con los nombres de columna de la hoja.
 * Juegos de un set: entero, null si está vacío, NaN si no es un entero.
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADOS = ['programada', 'finalizada', 'cortada', 'cancelada'];
const TIPOS = ['fijo', 'invitado'];
const COLS_SET = ['s1_a', 's1_b', 's2_a', 's2_b', 's3_a', 's3_b'];

// ─── Conversión de tipos ──────────────────────────────────────────────────────

function texto(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Entero si es válido, null si está vacío, NaN si no es un entero. */
function aEnteroSet(v) {
  const t = texto(v);
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : NaN;
}

/** true o false; null si no se puede interpretar. */
function aBooleano(v) {
  if (typeof v === 'boolean') return v;
  const t = texto(v).toUpperCase();
  if (t === 'TRUE' || t === 'VERDADERO') return true;
  if (t === 'FALSE' || t === 'FALSO' || t === '') return false;
  return null;
}

/** Solo acepta aaaa-mm-dd con una fecha que exista. */
function esFechaValida(t) {
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

// ─── Normalización ────────────────────────────────────────────────────────────

function normalizarJugador(fila) {
  const j = {
    id_jugador: texto(fila.id_jugador).toUpperCase(),
    nombre: texto(fila.nombre),
    tipo: texto(fila.tipo).toLowerCase(),
    activo: aBooleano(fila.activo),
    fecha_alta: texto(fila.fecha_alta)
  };
  if (fila._fila !== undefined) j._fila = fila._fila;
  return j;
}

function normalizarPartida(fila) {
  const p = {
    id_partida: texto(fila.id_partida),
    fecha: texto(fila.fecha),
    estado: texto(fila.estado).toLowerCase(),
    a1: texto(fila.a1).toUpperCase(),
    a2: texto(fila.a2).toUpperCase(),
    b1: texto(fila.b1).toUpperCase(),
    b2: texto(fila.b2).toUpperCase()
  };
  COLS_SET.forEach(function (c) { p[c] = aEnteroSet(fila[c]); });
  p.incluye_invitado = aBooleano(fila.incluye_invitado);
  p.origen = texto(fila.origen).toLowerCase();
  p.notas = texto(fila.notas);
  p.actualizado_en = texto(fila.actualizado_en);
  if (fila._fila !== undefined) p._fila = fila._fila;
  return p;
}

// ─── Sets y estado ────────────────────────────────────────────────────────────

/** 6-0 … 6-4, 7-5 o 7-6, en cualquiera de los dos sentidos. */
function esSetCompleto(a, b) {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  return (max === 6 && min >= 0 && min <= 4) || (max === 7 && (min === 5 || min === 6));
}

/**
 * Analiza los 3 sets de una partida normalizada.
 * Devuelve { errores, sets, ganador, setDecisivo, estado }:
 *   sets:        [{ num, a, b, completo, sinDecidir }] solo los jugados, en orden
 *   ganador:     'A', 'B' o null (la primera pareja que gana 2 sets completos)
 *   setDecisivo: 2, 3 o null
 *   estado:      'finalizada', 'cortada' o null si no se ha jugado ningún set
 */
function analizarSets(p) {
  const errores = [];
  const sets = [];
  let hayVacioAntes = false;

  for (let i = 1; i <= 3; i++) {
    const a = p['s' + i + '_a'];
    const b = p['s' + i + '_b'];

    if (a === null && b === null) { hayVacioAntes = true; continue; }
    if (a === null || b === null) {
      errores.push('Set ' + i + ': faltan los juegos de una de las parejas');
      continue;
    }
    if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || b < 0 || a > 7 || b > 7) {
      errores.push('Set ' + i + ': los juegos deben ser números enteros de 0 a 7');
      continue;
    }
    if (hayVacioAntes) errores.push('Set ' + i + ': hay un set jugado detrás de un set vacío');
    if (a === 0 && b === 0) {
      errores.push('Set ' + i + ': un 0-0 no es un set jugado; déjalo vacío');
      continue;
    }
    const completo = esSetCompleto(a, b);
    if (!completo && Math.max(a, b) === 7) {
      errores.push('Set ' + i + ': ' + a + '-' + b + ' no es un resultado posible');
      continue;
    }
    sets.push({ num: i, a: a, b: b, completo: completo, sinDecidir: false });
  }

  sets.forEach(function (s, k) {
    if (!s.completo && k < sets.length - 1) {
      errores.push('Set ' + s.num + ': solo el último set jugado puede quedar incompleto');
    }
  });

  let ganador = null;
  let setDecisivo = null;
  let ganadosA = 0;
  let ganadosB = 0;
  sets.forEach(function (s) {
    if (ganador) { s.sinDecidir = true; return; }
    if (!s.completo) return;
    if (s.a > s.b) ganadosA++; else ganadosB++;
    if (ganadosA === 2) { ganador = 'A'; setDecisivo = s.num; }
    else if (ganadosB === 2) { ganador = 'B'; setDecisivo = s.num; }
  });

  return {
    errores: errores,
    sets: sets,
    ganador: ganador,
    setDecisivo: setDecisivo,
    estado: sets.length === 0 ? null : (ganador ? 'finalizada' : 'cortada')
  };
}

/** 'finalizada', 'cortada' o null (sin sets o con errores en el marcador). */
function calcularEstado(p) {
  const r = analizarSets(p);
  return r.errores.length ? null : r.estado;
}

function hayJuegos(p) {
  return COLS_SET.some(function (c) { return p[c] !== null; });
}

// ─── Validación ───────────────────────────────────────────────────────────────

function contarInvitados(p, jugadoresPorId) {
  return [p.a1, p.a2, p.b1, p.b2].filter(function (id) {
    const j = jugadoresPorId[id];
    return !!j && j.tipo === 'invitado';
  }).length;
}

/** Lista de errores de una partida normalizada; vacía si es válida. */
function validarPartida(p, jugadoresPorId) {
  const errores = [];

  if (!esFechaValida(p.fecha)) errores.push('Fecha no válida (formato aaaa-mm-dd)');
  if (ESTADOS.indexOf(p.estado) === -1) errores.push('Estado no válido: "' + p.estado + '"');

  const ids = [p.a1, p.a2, p.b1, p.b2];
  if (ids.some(function (id) { return !id; })) {
    errores.push('Hacen falta 4 jugadores');
  } else {
    if (new Set(ids).size !== 4) {
      errores.push('Un jugador no puede aparecer dos veces en la misma partida');
    }
    const desconocidos = ids.filter(function (id) { return !jugadoresPorId[id]; });
    if (desconocidos.length) {
      errores.push('Jugadores desconocidos: ' + desconocidos.join(', '));
    } else if (contarInvitados(p, jugadoresPorId) > 1) {
      errores.push('Como máximo puede haber 1 invitado por partida');
    }
  }

  if (p.estado === 'programada' || p.estado === 'cancelada') {
    if (hayJuegos(p)) errores.push('Una partida ' + p.estado + ' no puede tener juegos');
  } else if (p.estado === 'finalizada' || p.estado === 'cortada') {
    if (!hayJuegos(p)) {
      errores.push('Una partida ' + p.estado + ' necesita al menos un set');
    } else {
      const r = analizarSets(p);
      if (r.errores.length) {
        Array.prototype.push.apply(errores, r.errores);
      } else if (r.estado !== p.estado) {
        errores.push('El marcador corresponde a una partida ' + r.estado + ', no ' + p.estado);
      }
    }
  }
  return errores;
}

/** Lista de errores de un jugador normalizado; idPropio permite editarlo sin chocar consigo mismo. */
function validarJugador(j, jugadores, idPropio) {
  const errores = [];
  if (!j.nombre) errores.push('Falta el nombre');
  if (TIPOS.indexOf(j.tipo) === -1) errores.push('Tipo no válido: "' + j.tipo + '"');
  if (typeof j.activo !== 'boolean') errores.push('"activo" debe ser verdadero o falso');
  if (!esFechaValida(j.fecha_alta)) errores.push('Fecha de alta no válida (formato aaaa-mm-dd)');
  if (j.nombre) {
    const nombre = j.nombre.toLowerCase();
    const repetido = jugadores.some(function (x) {
      return x.id_jugador !== idPropio && texto(x.nombre).toLowerCase() === nombre;
    });
    if (repetido) errores.push('Ya existe un jugador llamado ' + j.nombre);
  }
  return errores;
}

// ─── Temporadas y repartos ────────────────────────────────────────────────────

/** 'aaaa-mm-dd' → etiqueta de temporada. Va del 1 de agosto al 31 de julio: '2026-08-31' → '2026-27'. */
function temporadaDe(fecha) {
  const anio = parseInt(fecha.slice(0, 4), 10);
  const mes = parseInt(fecha.slice(5, 7), 10);
  const inicio = mes >= 8 ? anio : anio - 1;
  return inicio + '-' + String((inicio + 1) % 100).padStart(2, '0');
}

/**
 * Los 3 repartos posibles de 4 jugadores: AB-CD, AC-BD y AD-BC.
 * Devuelve [{ a: [id, id], b: [id, id] }, ...]. Lanza un error si no son 4 ids distintos.
 */
function generarRepartos(ids) {
  if (!Array.isArray(ids) || ids.length !== 4 || new Set(ids).size !== 4) {
    throw new Error('Hacen falta 4 jugadores distintos');
  }
  const p = ids[0], q = ids[1], r = ids[2], s = ids[3];
  return [
    { a: [p, q], b: [r, s] },
    { a: [p, r], b: [q, s] },
    { a: [p, s], b: [q, r] }
  ];
}

// ─── Orden y carga ────────────────────────────────────────────────────────────

function secuenciaPartida(id) {
  const n = parseInt(String(id).split('-')[1], 10);
  return isNaN(n) ? 0 : n;
}

/** Por fecha y, dentro del mismo día, por secuencia numérica del id. */
function compararPartidas(x, y) {
  if (x.fecha !== y.fecha) return x.fecha < y.fecha ? -1 : 1;
  const d = secuenciaPartida(x.id_partida) - secuenciaPartida(y.id_partida);
  if (d !== 0) return d;
  return x.id_partida < y.id_partida ? -1 : (x.id_partida > y.id_partida ? 1 : 0);
}

/**
 * Convierte la respuesta de doGet en datos listos para usar.
 * Nunca falla por una fila mala: la marca con su lista de errores.
 * Devuelve { jugadores, jugadoresPorId, partidas, filasConError }.
 */
function parsearDatos(respuesta) {
  if (!respuesta || respuesta.ok !== true) {
    throw new Error('El servidor no devolvió datos: ' + texto(respuesta && respuesta.error));
  }
  if (!Array.isArray(respuesta.jugadores) || !Array.isArray(respuesta.partidas)) {
    throw new Error('Respuesta incompleta: faltan jugadores o partidas');
  }

  const jugadores = respuesta.jugadores.map(normalizarJugador);
  const jugadoresPorId = {};
  jugadores.forEach(function (j) {
    j.errores = validarJugador(j, jugadores, j.id_jugador);
    if (jugadoresPorId[j.id_jugador]) {
      const msg = 'El id ' + j.id_jugador + ' está repetido';
      j.errores.push(msg);
      if (jugadoresPorId[j.id_jugador].errores.indexOf(msg) === -1) jugadoresPorId[j.id_jugador].errores.push(msg);
    } else {
      jugadoresPorId[j.id_jugador] = j;
    }
  });

  const partidas = respuesta.partidas.map(normalizarPartida);
  const vecesId = {};
  partidas.forEach(function (p) { vecesId[p.id_partida] = (vecesId[p.id_partida] || 0) + 1; });
  partidas.forEach(function (p) {
    p.errores = validarPartida(p, jugadoresPorId);
    if (vecesId[p.id_partida] > 1) p.errores.push('El id ' + p.id_partida + ' está repetido');
    p.incluye_invitado = contarInvitados(p, jugadoresPorId) === 1;
  });
  partidas.sort(compararPartidas);

  const filasConError = [];
  jugadores.forEach(function (j) {
    if (j.errores.length) filasConError.push({ pestana: 'Jugadores', fila: j._fila, id: j.id_jugador, errores: j.errores });
  });
  partidas.forEach(function (p) {
    if (p.errores.length) filasConError.push({ pestana: 'Partidas', fila: p._fila, id: p.id_partida, errores: p.errores });
  });

  return { jugadores: jugadores, jugadoresPorId: jugadoresPorId, partidas: partidas, filasConError: filasConError };
}
