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

// ─── Propuesta de parejas ─────────────────────────────────────────────────────

const PESO_COMPANERO = 10; // w_c: manda no repetir compañero…
const PESO_RIVAL = 1;      // w_r: …y los rivales solo desempatan

/** Clave de una pareja, sin orden: 'J01-J04'. */
function clavePareja(x, y) {
  return x < y ? x + '-' + y : y + '-' + x;
}

/**
 * Cuenta cuántas veces ha jugado cada par de fijos como compañeros y como rivales.
 * Cuentan las partidas programadas, finalizadas y cortadas sin errores (lo que se equilibra
 * es haber jugado, no el resultado). Las canceladas no cuentan. Los pares con un invitado no se cuentan.
 * Devuelve { juntos: { clave: n }, rivales: { clave: n }, ultimaJuntos: { clave: 'aaaa-mm-dd' } }.
 */
function contarEmparejamientos(partidas, jugadoresPorId) {
  const juntos = {};
  const rivales = {};
  const ultimaJuntos = {};
  const esFijo = function (id) { return !!jugadoresPorId[id] && jugadoresPorId[id].tipo === 'fijo'; };
  const sumar = function (mapa, x, y) {
    if (!esFijo(x) || !esFijo(y)) return null;
    const k = clavePareja(x, y);
    mapa[k] = (mapa[k] || 0) + 1;
    return k;
  };

  partidas.forEach(function (p) {
    if (['programada', 'finalizada', 'cortada'].indexOf(p.estado) === -1) return;
    if (p.errores && p.errores.length) return;
    [[p.a1, p.a2], [p.b1, p.b2]].forEach(function (par) {
      const k = sumar(juntos, par[0], par[1]);
      if (k && (!ultimaJuntos[k] || p.fecha > ultimaJuntos[k])) ultimaJuntos[k] = p.fecha;
    });
    [p.a1, p.a2].forEach(function (x) {
      [p.b1, p.b2].forEach(function (y) { sumar(rivales, x, y); });
    });
  });
  return { juntos: juntos, rivales: rivales, ultimaJuntos: ultimaJuntos };
}

/**
 * Coste de un reparto { a: [x, y], b: [z, w] }:
 *   coste = w_c · (J(a1,a2) + J(b1,b2)) + w_r · Σ R(x, y) para x en A, y en B
 * Los pares con un invitado cuestan 0 y no salen en el desglose.
 * Devuelve { coste, companeros: [{ x, y, veces }], rivales: [{ x, y, veces }] }.
 */
function costeReparto(reparto, conteo, jugadoresPorId, pesos) {
  const wc = pesos && pesos.companero !== undefined ? pesos.companero : PESO_COMPANERO;
  const wr = pesos && pesos.rival !== undefined ? pesos.rival : PESO_RIVAL;
  const esFijo = function (id) { return !!jugadoresPorId[id] && jugadoresPorId[id].tipo === 'fijo'; };

  const companeros = [reparto.a, reparto.b]
    .filter(function (par) { return esFijo(par[0]) && esFijo(par[1]); })
    .map(function (par) { return { x: par[0], y: par[1], veces: conteo.juntos[clavePareja(par[0], par[1])] || 0 }; });

  const rivales = [];
  reparto.a.forEach(function (x) {
    reparto.b.forEach(function (y) {
      if (esFijo(x) && esFijo(y)) rivales.push({ x: x, y: y, veces: conteo.rivales[clavePareja(x, y)] || 0 });
    });
  });

  const suma = function (lista) { return lista.reduce(function (s, e) { return s + e.veces; }, 0); };
  return { coste: wc * suma(companeros) + wr * suma(rivales), companeros: companeros, rivales: rivales };
}

/**
 * Los 3 repartos de 4 jugadores, ordenados de menor a mayor coste.
 * Desempate 1: va antes el reparto cuyas parejas llevan más tiempo sin jugar juntas
 *   (se compara la fecha más reciente en que jugó junta alguna de sus dos parejas; nunca = la más antigua).
 * Desempate 2: al azar. `aleatorio` es una función que devuelve un número en [0, 1); por defecto Math.random.
 * Devuelve [{ reparto, indice, coste, companeros, rivales, ultimaJuntos }], donde indice es la posición en generarRepartos.
 */
function proponerRepartos(ids, conteo, jugadoresPorId, pesos, aleatorio) {
  const azar = aleatorio || Math.random;
  const esFijo = function (id) { return !!jugadoresPorId[id] && jugadoresPorId[id].tipo === 'fijo'; };

  const opciones = generarRepartos(ids).map(function (reparto, indice) {
    const c = costeReparto(reparto, conteo, jugadoresPorId, pesos);
    let ultima = '';
    [reparto.a, reparto.b].forEach(function (par) {
      if (!esFijo(par[0]) || !esFijo(par[1])) return;
      const f = conteo.ultimaJuntos[clavePareja(par[0], par[1])] || '';
      if (f > ultima) ultima = f;
    });
    return {
      reparto: reparto, indice: indice, coste: c.coste, companeros: c.companeros, rivales: c.rivales,
      ultimaJuntos: ultima, _azar: azar()
    };
  });

  opciones.sort(function (x, y) {
    if (x.coste !== y.coste) return x.coste - y.coste;
    if (x.ultimaJuntos !== y.ultimaJuntos) return x.ultimaJuntos < y.ultimaJuntos ? -1 : 1;
    return x._azar - y._azar;
  });
  opciones.forEach(function (o) { delete o._azar; });
  return opciones;
}

// ─── ELO ──────────────────────────────────────────────────────────────────────

const ELO_INICIAL = 1000;
const ELO_K = 32;

/**
 * Calcula el ELO individual desde cero, en orden cronológico.
 * Solo entran las partidas finalizadas y sin errores. Las cortadas no cuentan.
 * Los fijos empiezan en `inicial`. Un invitado juega con un rating igual a la media
 * de los fijos justo antes de la partida, y su rating no se guarda ni se actualiza.
 *
 * Devuelve {
 *   ratings:  { id: rating }               solo fijos
 *   partidas: { id: n.º de partidas que han contado para su ELO }
 *   ultimo:   { id: Δ de su última partida }  (sin entrada si no ha jugado)
 *   historial: [{ id_partida, fecha, EA, SA, cambios: { id: { antes, despues, delta } } }]
 * }
 * EA es la probabilidad esperada de que gane la pareja A; la usará la sinergia de parejas.
 */
function calcularElo(partidas, jugadoresPorId, opciones) {
  const inicial = opciones && opciones.inicial !== undefined ? opciones.inicial : ELO_INICIAL;
  const K = opciones && opciones.K !== undefined ? opciones.K : ELO_K;

  const ratings = {};
  const jugadas = {};
  const ultimo = {};
  Object.keys(jugadoresPorId).forEach(function (id) {
    if (jugadoresPorId[id].tipo === 'fijo') { ratings[id] = inicial; jugadas[id] = 0; }
  });

  const validas = partidas
    .filter(function (p) { return p.estado === 'finalizada' && (!p.errores || p.errores.length === 0); })
    .slice()
    .sort(compararPartidas);

  const historial = [];
  validas.forEach(function (p) {
    const r = analizarSets(p);
    if (r.errores.length || !r.ganador) return;

    const fijos = Object.keys(ratings);
    const media = fijos.length
      ? fijos.reduce(function (s, id) { return s + ratings[id]; }, 0) / fijos.length
      : inicial;
    const rating = function (id) { return ratings[id] !== undefined ? ratings[id] : media; };

    const RA = (rating(p.a1) + rating(p.a2)) / 2;
    const RB = (rating(p.b1) + rating(p.b2)) / 2;
    const EA = 1 / (1 + Math.pow(10, (RB - RA) / 400));
    const SA = r.ganador === 'A' ? 1 : 0;
    const delta = K * (SA - EA);

    const cambios = {};
    [[p.a1, delta], [p.a2, delta], [p.b1, -delta], [p.b2, -delta]].forEach(function (par) {
      const id = par[0];
      if (ratings[id] === undefined) return; // invitado
      const antes = ratings[id];
      ratings[id] = antes + par[1];
      jugadas[id]++;
      ultimo[id] = par[1];
      cambios[id] = { antes: antes, despues: ratings[id], delta: par[1] };
    });
    historial.push({ id_partida: p.id_partida, fecha: p.fecha, EA: EA, SA: SA, cambios: cambios });
  });

  return { ratings: ratings, partidas: jugadas, ultimo: ultimo, historial: historial };
}

/**
 * Ranking ELO de los fijos activos.
 * Los que tienen al menos `minimo` partidas van primero, ordenados por ELO y con posición.
 * Los demás van al final, también por ELO, con posicion = null y `faltan` partidas.
 * Devuelve [{ id, nombre, elo, partidas, ultimo, posicion, faltan }], con elo y ultimo sin redondear.
 */
function rankingElo(elo, jugadores, minimo) {
  const min = minimo === undefined ? 5 : minimo;
  const filas = jugadores
    .filter(function (j) { return j.tipo === 'fijo' && j.activo === true && elo.ratings[j.id_jugador] !== undefined; })
    .map(function (j) {
      const n = elo.partidas[j.id_jugador] || 0;
      return {
        id: j.id_jugador,
        nombre: j.nombre,
        elo: elo.ratings[j.id_jugador],
        partidas: n,
        ultimo: elo.ultimo[j.id_jugador] === undefined ? null : elo.ultimo[j.id_jugador],
        posicion: null,
        faltan: Math.max(0, min - n)
      };
    });
  const porElo = function (x, y) { return y.elo - x.elo || (x.nombre < y.nombre ? -1 : 1); };
  const dentro = filas.filter(function (f) { return f.faltan === 0; }).sort(porElo);
  const fuera = filas.filter(function (f) { return f.faltan > 0; }).sort(porElo);
  dentro.forEach(function (f, i) { f.posicion = i + 1; });
  return dentro.concat(fuera);
}

// ─── Periodos ─────────────────────────────────────────────────────────────────

/**
 * Filtra partidas por periodo. `hoy` es 'aaaa-mm-dd' (se pasa como parámetro para que sea una función pura).
 * periodo: { tipo: 'todo' } | { tipo: 'temporada', valor: '2026-27' } | { tipo: 'meses', valor: 3 }
 * 'meses' incluye desde la misma fecha de hace N meses en adelante.
 */
function filtrarPeriodo(partidas, periodo, hoy) {
  if (!periodo || periodo.tipo === 'todo') return partidas.slice();
  if (periodo.tipo === 'temporada') {
    return partidas.filter(function (p) { return esFechaValida(p.fecha) && temporadaDe(p.fecha) === periodo.valor; });
  }
  if (periodo.tipo === 'meses') {
    const a = parseInt(hoy.slice(0, 4), 10);
    const m = parseInt(hoy.slice(5, 7), 10);
    const d = parseInt(hoy.slice(8, 10), 10);
    const desde = new Date(Date.UTC(a, m - 1 - periodo.valor, d)).toISOString().slice(0, 10);
    return partidas.filter(function (p) { return esFechaValida(p.fecha) && p.fecha >= desde; });
  }
  throw new Error('Periodo desconocido: ' + periodo.tipo);
}

// ─── Estadísticas individuales ────────────────────────────────────────────────

const MINIMO_CRUCE = 3; // partidas para mejor/peor compañero y bestia negra/víctima favorita

function porcentaje(a, total) { return total > 0 ? a / total : null; }

/**
 * Estadísticas de un jugador sobre las partidas dadas (ya filtradas por periodo).
 * Usa las partidas finalizadas y cortadas sin errores. Ver la tabla de métricas del documento de contexto.
 * Los porcentajes van de 0 a 1, o null si no hay datos.
 */
function statsJugador(id, partidas, jugadoresPorId, opciones) {
  const minimo = opciones && opciones.minimo !== undefined ? opciones.minimo : MINIMO_CRUCE;
  const esFijo = function (x) { return !!jugadoresPorId[x] && jugadoresPorId[x].tipo === 'fijo'; };

  const jugadasGrupo = partidas
    .filter(function (p) { return (p.estado === 'finalizada' || p.estado === 'cortada') && (!p.errores || !p.errores.length); })
    .slice()
    .sort(compararPartidas);
  const suyas = jugadasGrupo.filter(function (p) { return [p.a1, p.a2, p.b1, p.b2].indexOf(id) !== -1; });

  const s = {
    id: id,
    partidas: suyas.length, finalizadas: 0, cortadas: 0,
    asistencia: { partidas: suyas.length, totalGrupo: jugadasGrupo.length, pct: porcentaje(suyas.length, jugadasGrupo.length) },
    victorias: 0, derrotas: 0, pctVictorias: null,
    setsGanados: 0, setsPerdidos: 0,
    juegosGanados: 0, juegosPerdidos: 0, pctJuegos: null, difJuegosPorPartida: null,
    tiebreaksGanados: 0, tiebreaksPerdidos: 0,
    a3Sets: { jugadas: 0, ganadas: 0, pct: null },
    remontadas: 0,
    roscosDados: 0, roscosRecibidos: 0,
    rachaActual: null, rachaMaxVictorias: 0, rachaMaxDerrotas: 0,
    forma: [],
    companeros: [], mejorCompanero: null, peorCompanero: null,
    rivales: [], bestiaNegra: null, victimaFavorita: null
  };

  const comp = {};
  const riv = {};
  let racha = null;

  suyas.forEach(function (p) {
    const r = analizarSets(p);
    const enA = p.a1 === id || p.a2 === id;
    const companero = enA ? (p.a1 === id ? p.a2 : p.a1) : (p.b1 === id ? p.b2 : p.b1);
    const contrarios = enA ? [p.b1, p.b2] : [p.a1, p.a2];

    // Sets y juegos: todos los sets jugados, también el set sin decidir
    r.sets.forEach(function (set) {
      const mios = enA ? set.a : set.b;
      const suyos = enA ? set.b : set.a;
      s.juegosGanados += mios;
      s.juegosPerdidos += suyos;
      if (!set.completo) return;
      if (mios > suyos) s.setsGanados++; else s.setsPerdidos++;
      if (Math.max(mios, suyos) === 7 && Math.min(mios, suyos) === 6) {
        if (mios > suyos) s.tiebreaksGanados++; else s.tiebreaksPerdidos++;
      }
      if (mios === 6 && suyos === 0) s.roscosDados++;
      if (mios === 0 && suyos === 6) s.roscosRecibidos++;
    });

    if (p.estado === 'cortada') {
      s.cortadas++;
      s.forma.push('C');
      return; // las cortadas no cuentan para victorias, rachas, cruces ni partidas a 3 sets
    }

    s.finalizadas++;
    const gano = r.ganador === (enA ? 'A' : 'B');
    if (gano) s.victorias++; else s.derrotas++;
    s.forma.push(gano ? 'V' : 'D');

    if (r.setDecisivo === 3) {
      s.a3Sets.jugadas++;
      if (gano) s.a3Sets.ganadas++;
    }
    const primero = r.sets[0];
    if (gano && primero && primero.num === 1 && (enA ? primero.a < primero.b : primero.b < primero.a)) s.remontadas++;

    const tipo = gano ? 'V' : 'D';
    racha = racha && racha.tipo === tipo ? { tipo: tipo, n: racha.n + 1 } : { tipo: tipo, n: 1 };
    if (tipo === 'V') s.rachaMaxVictorias = Math.max(s.rachaMaxVictorias, racha.n);
    else s.rachaMaxDerrotas = Math.max(s.rachaMaxDerrotas, racha.n);

    if (esFijo(companero)) {
      comp[companero] = comp[companero] || { id: companero, partidas: 0, victorias: 0 };
      comp[companero].partidas++;
      if (gano) comp[companero].victorias++;
    }
    contrarios.forEach(function (x) {
      if (!esFijo(x)) return;
      riv[x] = riv[x] || { id: x, partidas: 0, victorias: 0 };
      riv[x].partidas++;
      if (gano) riv[x].victorias++;
    });
  });

  s.pctVictorias = porcentaje(s.victorias, s.victorias + s.derrotas);
  s.pctJuegos = porcentaje(s.juegosGanados, s.juegosGanados + s.juegosPerdidos);
  s.difJuegosPorPartida = s.partidas ? (s.juegosGanados - s.juegosPerdidos) / s.partidas : null;
  s.a3Sets.pct = porcentaje(s.a3Sets.ganadas, s.a3Sets.jugadas);
  s.rachaActual = racha;
  s.forma = s.forma.slice(-5);

  const nombre = function (x) { return jugadoresPorId[x] ? jugadoresPorId[x].nombre : x; };
  const cerrar = function (mapa) {
    return Object.keys(mapa).map(function (k) {
      const e = mapa[k];
      e.pct = porcentaje(e.victorias, e.partidas);
      return e;
    }).sort(function (x, y) {
      return y.pct - x.pct || y.partidas - x.partidas || (nombre(x.id) < nombre(y.id) ? -1 : 1);
    });
  };
  s.companeros = cerrar(comp);
  s.rivales = cerrar(riv);

  const validos = function (lista) { return lista.filter(function (e) { return e.partidas >= minimo; }); };
  const compValidos = validos(s.companeros);
  if (compValidos.length) s.mejorCompanero = compValidos[0];
  if (compValidos.length >= 2) s.peorCompanero = compValidos[compValidos.length - 1];

  const rivValidos = validos(s.rivales);
  const victima = rivValidos.filter(function (e) { return e.pct > 0.5; });
  const bestia = rivValidos.filter(function (e) { return e.pct < 0.5; });
  if (victima.length) s.victimaFavorita = victima[0];
  if (bestia.length) {
    // la bestia negra es contra quien peor le va; con empate, contra quien más ha jugado
    s.bestiaNegra = bestia.slice().sort(function (x, y) {
      return x.pct - y.pct || y.partidas - x.partidas || (nombre(x.id) < nombre(y.id) ? -1 : 1);
    })[0];
  }
  return s;
}

// ─── Estadísticas de parejas ──────────────────────────────────────────────────

const MINIMO_PAREJA = 3; // partidas finalizadas juntos para tener posición en el ranking de parejas

/**
 * Estadísticas de todas las parejas de fijos activos sobre las partidas dadas (ya filtradas por periodo).
 * Solo cuentan las parejas de dos fijos: con un invitado no hay pareja. Usa finalizadas y cortadas sin errores.
 * La sinergia es victorias reales − victorias esperadas, con la E de cada partida sacada de `elo.historial`
 * (el ELO de sus miembros justo antes de esa partida).
 * Devuelve la lista ordenada: primero las que llegan al mínimo (por % de victorias, luego sinergia, luego partidas),
 * con `posicion`; después el resto, con `posicion = null` y `faltan`.
 * Cada elemento: { clave, x, y, partidas, finalizadas, victorias, derrotas, pct, juegosGanados, juegosPerdidos,
 *   pctJuegos, esperadas, sinergia, posicion, faltan }.
 */
function statsParejas(partidas, jugadoresPorId, elo, opciones) {
  const minimo = opciones && opciones.minimo !== undefined ? opciones.minimo : MINIMO_PAREJA;
  const fijos = Object.keys(jugadoresPorId)
    .filter(function (id) { return jugadoresPorId[id].tipo === 'fijo' && jugadoresPorId[id].activo === true; })
    .sort();

  const mapa = {};
  for (let i = 0; i < fijos.length; i++) {
    for (let j = i + 1; j < fijos.length; j++) {
      mapa[clavePareja(fijos[i], fijos[j])] = {
        clave: clavePareja(fijos[i], fijos[j]), x: fijos[i], y: fijos[j],
        partidas: 0, finalizadas: 0, victorias: 0, derrotas: 0, pct: null,
        juegosGanados: 0, juegosPerdidos: 0, pctJuegos: null,
        esperadas: 0, sinergia: null, posicion: null, faltan: 0
      };
    }
  }

  const esperada = {};
  ((elo && elo.historial) || []).forEach(function (h) { esperada[h.id_partida] = h.EA; });

  partidas.forEach(function (p) {
    if (p.estado !== 'finalizada' && p.estado !== 'cortada') return;
    if (p.errores && p.errores.length) return;
    const r = analizarSets(p);
    ['a', 'b'].forEach(function (lado) {
      const e = mapa[clavePareja(p[lado + '1'], p[lado + '2'])];
      if (!e) return;
      e.partidas++;
      r.sets.forEach(function (s) {
        e.juegosGanados += lado === 'a' ? s.a : s.b;
        e.juegosPerdidos += lado === 'a' ? s.b : s.a;
      });
      if (p.estado !== 'finalizada') return;
      e.finalizadas++;
      if (r.ganador === lado.toUpperCase()) e.victorias++; else e.derrotas++;
      if (esperada[p.id_partida] !== undefined) {
        e.esperadas += lado === 'a' ? esperada[p.id_partida] : 1 - esperada[p.id_partida];
      }
    });
  });

  const lista = Object.keys(mapa).map(function (k) {
    const e = mapa[k];
    e.pct = porcentaje(e.victorias, e.finalizadas);
    e.pctJuegos = porcentaje(e.juegosGanados, e.juegosGanados + e.juegosPerdidos);
    e.sinergia = e.finalizadas ? e.victorias - e.esperadas : null;
    e.faltan = Math.max(0, minimo - e.finalizadas);
    return e;
  });

  const dentro = lista.filter(function (e) { return e.faltan === 0; }).sort(function (x, y) {
    return y.pct - x.pct || y.sinergia - x.sinergia || y.finalizadas - x.finalizadas || (x.clave < y.clave ? -1 : 1);
  });
  const fuera = lista.filter(function (e) { return e.faltan > 0; }).sort(function (x, y) {
    return y.finalizadas - x.finalizadas || (y.pct || 0) - (x.pct || 0) || (x.clave < y.clave ? -1 : 1);
  });
  dentro.forEach(function (e, i) { e.posicion = i + 1; });
  return dentro.concat(fuera);
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
