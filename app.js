"use strict";

/* =========================================================
   Comparador de Financiación — lógica de la aplicación
   Sin dependencias: HTML + CSS + JS puro, datos en localStorage
   ========================================================= */

const STORAGE_KEY = "comparador-financiacion:planes";
const STORAGE_KEY_SELECCION_PLAN = "comparador-financiacion:seleccionPlan";
const STORAGE_KEY_BANCOS_OCULTOS = "comparador-financiacion:bancosOcultos";

const COLUMNAS = [
  "banco", "plan", "meses_min", "meses_max", "tin", "tae",
  "comision_apertura", "comision_apertura_min",
  "importe_min", "importe_max", "comision_comercial", "coeficiente", "notas",
];

/* ---------- Estado ---------- */

let planes = cargarPlanes();
let criterio = "cuota";      // campo con el que se elige y ordena la mejor oferta
let seleccionPlan = cargarSeleccionPlan(); // banco -> claveOferta del plan elegido a mano en su columna
let seleccionCliente = new Map(); // claveCliente -> oferta congelada para la comparativa al cliente
let bancosOcultos = new Set(cargarBancosOcultos()); // bancos ocultados de la comparativa

/* ---------- Utilidades de formato ---------- */

const fmtEur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtEur2 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) => v == null ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- Persistencia ---------- */

function cargarPlanes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function guardarPlanes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(planes));
  } catch {
    // localStorage bloqueado o lleno: la sesión funciona, pero los datos no persistirán
    toast("Aviso: no se pueden guardar los datos en este navegador; al cerrar la pestaña se perderán");
  }
}

function cargarSeleccionPlan() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SELECCION_PLAN);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function guardarSeleccionPlan() {
  try {
    localStorage.setItem(STORAGE_KEY_SELECCION_PLAN, JSON.stringify(seleccionPlan));
  } catch {
    // localStorage bloqueado o lleno: la selección no persistirá, pero la sesión funciona
  }
}

function cargarBancosOcultos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BANCOS_OCULTOS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function guardarBancosOcultos() {
  try {
    localStorage.setItem(STORAGE_KEY_BANCOS_OCULTOS, JSON.stringify([...bancosOcultos]));
  } catch {
    // localStorage bloqueado o lleno: la selección no persistirá, pero la sesión funciona
  }
}

/* ---------- Parseo de números en formato español ---------- */

function numES(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/[€%\s]/g, "");
  if (s === "" || s === "-") return null;
  // "1.234,56" -> "1234.56" ; "1234.56" se respeta ; "7,95" -> "7.95"
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------- Parser CSV (soporta ; o , y campos entrecomillados) ---------- */

function parseCSV(texto) {
  texto = texto.replace(/^﻿/, "");
  const primeraLinea = texto.split(/\r?\n/, 1)[0] || "";
  const sep = (primeraLinea.match(/;/g) || []).length >= (primeraLinea.match(/,/g) || []).length ? ";" : ",";

  const filas = [];
  let fila = [], campo = "", enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === sep) {
      fila.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some(f => f.trim() !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some(f => f.trim() !== "")) filas.push(fila);
  return filas;
}

/* ---------- Validación e importación de planes ---------- */

function importarCSV(texto, nombreArchivo, reemplazar) {
  const filas = parseCSV(texto);
  if (!filas.length) return { ok: 0, errores: [`${nombreArchivo}: el archivo está vacío.`] };

  const cabecera = filas[0].map(c => c.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = {};
  COLUMNAS.forEach(col => { idx[col] = cabecera.indexOf(col); });

  const faltan = ["banco", "plan", "meses_min", "meses_max", "tin", "comision_apertura"]
    .filter(col => idx[col] === -1);
  if (faltan.length) {
    return { ok: 0, errores: [`${nombreArchivo}: faltan las columnas obligatorias: ${faltan.join(", ")}. Revisa que la primera fila sea la cabecera del formato indicado en «Cómo subir datos».`] };
  }

  const nuevos = [], errores = [];
  const celda = (f, col) => idx[col] === -1 ? "" : (f[idx[col]] ?? "").trim();

  for (let n = 1; n < filas.length; n++) {
    const f = filas[n];
    const linea = n + 1;
    const banco = celda(f, "banco");
    const plan = celda(f, "plan");
    const mesesMin = numES(celda(f, "meses_min"));
    const mesesMax = numES(celda(f, "meses_max"));
    const tin = numES(celda(f, "tin"));
    const comApertura = numES(celda(f, "comision_apertura"));

    const errs = [];
    if (!banco) errs.push("falta banco");
    if (!plan) errs.push("falta plan");
    if (mesesMin == null || mesesMin <= 0) errs.push("meses_min no válido");
    if (mesesMax == null || mesesMax <= 0) errs.push("meses_max no válido");
    if (mesesMin != null && mesesMax != null && mesesMin > mesesMax) errs.push("meses_min > meses_max");
    if (tin == null || tin < 0) errs.push("tin no válido");
    if (comApertura == null || comApertura < 0) errs.push("comision_apertura no válida");
    if (errs.length) { errores.push(`Fila ${linea}: ${errs.join(", ")} — fila descartada.`); continue; }

    let coeficiente = numES(celda(f, "coeficiente"));
    if (coeficiente != null && (coeficiente <= 0 || coeficiente >= 1)) {
      errores.push(`Fila ${linea}: coeficiente fuera de rango (debe ser un decimal entre 0 y 1, ej. 0,024408) — se ignora y se calculará la cuota con el TIN.`);
      coeficiente = null;
    }

    nuevos.push({
      banco, plan,
      mesesMin: Math.round(mesesMin),
      mesesMax: Math.round(mesesMax),
      tin,
      tae: numES(celda(f, "tae")),
      comApertura,
      comAperturaMin: numES(celda(f, "comision_apertura_min")),
      importeMin: numES(celda(f, "importe_min")),
      importeMax: numES(celda(f, "importe_max")),
      comComercial: numES(celda(f, "comision_comercial")),
      coeficiente,
      notas: celda(f, "notas"),
    });
  }

  if (nuevos.length) {
    if (reemplazar) {
      const bancosNuevos = new Set(nuevos.map(p => p.banco.toLowerCase()));
      planes = planes.filter(p => !bancosNuevos.has(p.banco.toLowerCase()));
    }
    planes = planes.concat(nuevos);
    guardarPlanes();
  }
  return { ok: nuevos.length, errores };
}

function exportarCSV() {
  const esc = (v) => {
    const s = v == null ? "" : String(v).replace(".", ",");
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lineas = [COLUMNAS.join(";")];
  for (const p of planes) {
    lineas.push([
      p.banco, p.plan, p.mesesMin, p.mesesMax, esc(p.tin), esc(p.tae),
      esc(p.comApertura), esc(p.comAperturaMin), esc(p.importeMin),
      esc(p.importeMax), esc(p.comComercial), esc(p.coeficiente), esc(p.notas),
    ].map(v => v == null ? "" : v).join(";"));
  }
  descargar("planes-financiacion.csv", lineas.join("\r\n"));
}

function descargar(nombre, contenido) {
  const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Matemática financiera ---------- */

// Cuota mensual (sistema francés)
function cuotaMensual(capital, tinPct, meses) {
  const i = tinPct / 100 / 12;
  if (i === 0) return capital / meses;
  return capital * i / (1 - Math.pow(1 + i, -meses));
}

// TAE real incluyendo comisión de apertura, por bisección sobre el tipo mensual:
// el cliente recibe (capital - comision) y paga `cuota` durante `meses`.
function taeReal(capital, comision, cuota, meses) {
  const neto = capital - comision;
  if (neto <= 0 || cuota <= 0) return null;
  const van = (im) => {
    let v = -neto;
    for (let k = 1; k <= meses; k++) v += cuota / Math.pow(1 + im, k);
    return v;
  };
  let lo = 0, hi = 1; // 0 % – 1200 % nominal mensual: rango de sobra
  if (van(lo) < 0) return 0;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (van(mid) > 0) lo = mid; else hi = mid;
  }
  const im = (lo + hi) / 2;
  return (Math.pow(1 + im, 12) - 1) * 100;
}

function calcularOferta(plan, capital, meses) {
  // Con coeficiente (tarifas tipo BBVA/Grupo 1): cuota = coeficiente × capital,
  // y la comisión de apertura va financiada dentro de la cuota (no se paga aparte).
  const usaCoef = plan.coeficiente != null;
  const cuota = usaCoef ? capital * plan.coeficiente : cuotaMensual(capital, plan.tin, meses);
  let comAperturaEur = capital * plan.comApertura / 100;
  if (plan.comAperturaMin != null) comAperturaEur = Math.max(comAperturaEur, plan.comAperturaMin);
  const pagoInicial = usaCoef ? 0 : comAperturaEur;
  const totalPagado = cuota * meses + pagoInicial;
  const comComercialEur = plan.comComercial != null ? capital * plan.comComercial / 100 : null;
  return {
    ...plan,
    meses,
    cuota,
    comAperturaEur,
    aperturaFinanciada: usaCoef,
    intereses: cuota * meses - capital,
    totalCuotas: cuota * meses,
    costeTotal: totalPagado,          // lo que paga el cliente por la financiación
    sobrecoste: totalPagado - capital, // intereses + apertura (+ seguros incluidos en el coef.)
    taeReal: taeReal(capital, pagoInicial, cuota, meses),
    comComercialEur,
  };
}

/* ---------- Vista: comparador ---------- */

function leerFormulario() {
  const pvp = numES(document.getElementById("inp-pvp").value) ?? 0;
  const entrada = numES(document.getElementById("inp-entrada").value) ?? 0;
  const meses = Math.max(1, Math.round(numES(document.getElementById("inp-meses").value) ?? 48));
  const banco = document.getElementById("sel-banco").value;
  return { pvp, entrada, capital: Math.max(0, pvp - entrada), meses, banco };
}

function renderComparador() {
  const { capital, meses, banco } = leerFormulario();
  document.getElementById("importe-financiar").textContent = fmtEur.format(capital);

  const sinDatos = document.getElementById("sin-datos");
  const wrap = document.getElementById("resultados-wrap");
  const destacados = document.getElementById("destacados");

  if (!planes.length) {
    sinDatos.hidden = false;
    wrap.hidden = true;
    destacados.innerHTML = "";
    return;
  }
  sinDatos.hidden = true;
  wrap.hidden = false;

  const candidatos = planes.filter(p => !banco || p.banco === banco);
  const aplicables = [], descartados = [];
  for (const p of candidatos) {
    const plazoOk = meses >= p.mesesMin && meses <= p.mesesMax;
    const importeOk = (p.importeMin == null || capital >= p.importeMin) &&
                      (p.importeMax == null || capital <= p.importeMax);
    if (plazoOk && importeOk && capital > 0) aplicables.push(calcularOferta(p, capital, meses));
    else descartados.push({ p, plazoOk, importeOk });
  }

  renderDestacados(aplicables);
  renderMatriz(aplicables);

  const nd = document.getElementById("no-disponibles");
  if (descartados.length && capital > 0) {
    const motivos = [];
    const porPlazo = descartados.filter(d => !d.plazoOk).length;
    const porImporte = descartados.filter(d => d.plazoOk && !d.importeOk).length;
    if (porPlazo) motivos.push(`${porPlazo} por plazo`);
    if (porImporte) motivos.push(`${porImporte} por importe`);
    nd.textContent = `${descartados.length} plan(es) no aplican a esta operación (${motivos.join(", ")}).`;
  } else nd.textContent = "";
}

function renderDestacados(ofertas) {
  const cont = document.getElementById("destacados");
  if (!ofertas.length) {
    cont.innerHTML = `<div class="destacado"><div class="d-titulo">Sin resultados</div>
      <div class="d-detalle">Ningún plan admite este importe y plazo. Prueba otro plazo o revisa el importe.</div></div>`;
    return;
  }
  const min = (campo) => ofertas.reduce((a, b) => (b[campo] ?? Infinity) < (a[campo] ?? Infinity) ? b : a);
  const mejorCuota = min("cuota");
  const mejorCoste = min("sobrecoste");
  const conCom = ofertas.filter(o => o.comComercialEur != null);
  const mejorCom = conCom.length ? conCom.reduce((a, b) => b.comComercialEur > a.comComercialEur ? b : a) : null;

  let html = `
    <div class="destacado d-cuota">
      <div class="d-titulo">Cuota más baja</div>
      <div class="d-valor">${fmtEur2.format(mejorCuota.cuota)} <small>/ mes</small></div>
      <div class="d-detalle"><strong>${esc(mejorCuota.banco)}</strong> · ${esc(mejorCuota.plan)}</div>
    </div>
    <div class="destacado d-coste">
      <div class="d-titulo">Menor coste para el cliente</div>
      <div class="d-valor">+${fmtEur.format(mejorCoste.sobrecoste)}</div>
      <div class="d-detalle"><strong>${esc(mejorCoste.banco)}</strong> · ${esc(mejorCoste.plan)} · intereses + apertura</div>
    </div>`;
  if (mejorCom) {
    html += `
    <div class="destacado d-com">
      <div class="d-titulo">Mayor comisión comercial</div>
      <div class="d-valor">${fmtEur.format(mejorCom.comComercialEur)}</div>
      <div class="d-detalle"><strong>${esc(mejorCom.banco)}</strong> · ${esc(mejorCom.plan)} · ${fmtPct(mejorCom.comComercial)}</div>
    </div>`;
  }
  cont.innerHTML = html;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function claveOferta(o) { return o.banco + "|" + o.plan + "|" + o.tin + "|" + o.mesesMin + "|" + o.mesesMax; }

/* Matriz comparativa: una columna por banco, métricas en filas.
   Si un banco tiene varios planes aplicables, la columna muestra el mejor
   según el criterio elegido y un selector para cambiar de plan. */
function renderMatriz(ofertas) {
  const wrap = document.getElementById("matriz-wrap");

  if (!ofertas.length) {
    wrap.innerHTML = `<div class="matriz-vacia">Sin planes aplicables para este importe y plazo.</div>`;
    renderBancosOcultos([]);
    sincronizarScrollSuperior();
    return;
  }

  const mayorMejor = criterio === "comComercialEur";
  const valor = (o) => o[criterio] == null ? (mayorMejor ? -Infinity : Infinity) : o[criterio];
  const esMejorQue = (a, b) => mayorMejor ? valor(a) > valor(b) : valor(a) < valor(b);

  // Agrupar por banco, separando los que se han ocultado de la comparativa
  const porBanco = new Map();
  for (const o of ofertas) {
    if (!porBanco.has(o.banco)) porBanco.set(o.banco, []);
    porBanco.get(o.banco).push(o);
  }
  const entradas = [...porBanco.entries()];
  const entradasVisibles = entradas.filter(([banco]) => !bancosOcultos.has(banco));
  const entradasOcultas = entradas.filter(([banco]) => bancosOcultos.has(banco));

  renderBancosOcultos(entradasOcultas.map(([banco]) => banco));

  if (!entradasVisibles.length) {
    wrap.innerHTML = `<div class="matriz-vacia">Todos los bancos de esta operación están ocultos. Púlsalos a la derecha para volver a mostrarlos.</div>`;
    sincronizarScrollSuperior();
    return;
  }

  const columnas = entradasVisibles.map(([banco, lista]) => {
    const porDefecto = lista.reduce((a, b) => esMejorQue(b, a) ? b : a);
    const elegida = lista.find(o => claveOferta(o) === seleccionPlan[banco]) || porDefecto;
    return { banco, lista, oferta: elegida };
  });
  columnas.sort((a, b) => (valor(a.oferta) - valor(b.oferta)) * (mayorMejor ? -1 : 1));
  const bancoMejor = Number.isFinite(valor(columnas[0].oferta)) ? columnas[0].banco : null;

  // Definición de filas de la matriz
  const filas = [
    { rotulo: "Cuota mensual", clase: "fila-cuota", campo: "cuota",
      celda: o => `${fmtEur2.format(o.cuota)} <small>/mes</small>` },
    { rotulo: "TIN", campo: "tin", celda: o => fmtPct(o.tin) },
    { rotulo: "TAE real", campo: "taeReal", celda: o => fmtPct(o.taeReal) },
    { rotulo: "Comisión apertura", campo: "comAperturaEur",
      celda: o => `${fmtEur2.format(o.comAperturaEur)} (${fmtPct(o.comApertura)})${o.aperturaFinanciada ? " fin." : ""}` },
    { rotulo: "Intereses", campo: "intereses", celda: o => fmtEur.format(o.intereses) },
    { rotulo: "Total cuotas", campo: "totalCuotas", celda: o => fmtEur.format(o.totalCuotas), clase: "fila-secundaria" },
    { rotulo: "Coste total", campo: "costeTotal", celda: o => fmtEur.format(o.costeTotal) },
    { rotulo: "Comisión comercial", campo: "comComercialEur", mayorMejor: true,
      celda: o => o.comComercialEur == null ? "—" : `${fmtEur.format(o.comComercialEur)} (${fmtPct(o.comComercial)})` },
    { rotulo: "TAE anunciada", campo: "tae", celda: o => fmtPct(o.tae), clase: "fila-secundaria" },
    { rotulo: "Plazo admitido", celda: o => `${o.mesesMin}–${o.mesesMax} meses`, clase: "fila-secundaria" },
    { rotulo: "Importe admitido", clase: "fila-secundaria",
      celda: o => `${o.importeMin != null ? fmtEur.format(o.importeMin) : "0 €"} – ${o.importeMax != null ? fmtEur.format(o.importeMax) : "sin límite"}` },
    { rotulo: "Notas", clase: "fila-notas", celda: o => o.notas ? esc(o.notas) : "—" },
  ];

  const eps = 0.005;
  const colClase = (banco) => banco === bancoMejor ? "col-mejor" : "";
  const todosMarcados = columnas.every(c => seleccionCliente.has(claveCliente(c.oferta)));

  const thead = `<thead><tr>
    <th class="rlabel rlabel-comparativa">
      <div id="comparativa-flotante" class="comparativa-flotante" ${seleccionCliente.size === 0 ? "hidden" : ""}>
        <button id="btn-comparativa" class="btn-comparativa">Mostrar comparativa al cliente (${seleccionCliente.size})</button>
      </div>
      <label class="chk-todos" title="Añadir todos los bancos a la comparativa para el cliente">
        <input type="checkbox" id="chk-seleccionar-todos" ${todosMarcados ? "checked" : ""}>
        Todos
      </label>
    </th>
    ${columnas.map(c => `
      <th class="mcol ${colClase(c.banco)}">
        <div class="mcol-banco">${esc(c.banco)}</div>
        ${c.lista.length > 1
          ? `<select class="sel-plan" data-banco="${esc(c.banco)}">
               ${c.lista.map(o => `<option value="${esc(claveOferta(o))}" ${claveOferta(o) === claveOferta(c.oferta) ? "selected" : ""}>${esc(o.plan)}</option>`).join("")}
             </select>`
          : `<div class="mcol-plan">${esc(c.oferta.plan)}</div>`}
        <div class="mcol-cliente">
          <button class="btn-vista-cliente" data-banco="${esc(c.banco)}">Abrir vista cliente</button>
          <label class="chk-cliente" title="Añadir a la comparativa para el cliente">
            <input type="checkbox" data-banco="${esc(c.banco)}" ${seleccionCliente.has(claveCliente(c.oferta)) ? "checked" : ""}>
          </label>
          <button type="button" class="btn-ocultar-banco" data-banco="${esc(c.banco)}" title="Ocultar este banco de la comparativa">Ocultar</button>
        </div>
      </th>`).join("")}
  </tr></thead>`;

  const tbody = `<tbody>${filas.map(f => {
    const valores = columnas.map(c => f.campo ? c.oferta[f.campo] : null);
    let mejor = null;
    if (f.campo) {
      const validos = valores.filter(v => v != null);
      if (validos.length) mejor = f.mayorMejor ? Math.max(...validos) : Math.min(...validos);
    }
    const activa = f.campo && f.campo === criterio;
    return `<tr class="${f.clase || ""}">
      <th class="rlabel ${f.campo ? "rlabel-sort" : ""} ${activa ? "sort-activa" : ""}"
          ${f.campo ? `data-campo="${f.campo}" title="Ordenar los bancos por ${f.rotulo.toLowerCase()}"` : ""}>
        ${f.rotulo}${activa ? '<span class="sort-flecha">▾</span>' : ""}
      </th>
      ${columnas.map((c, i) => {
        const esMejor = mejor != null && valores[i] != null && Math.abs(valores[i] - mejor) < eps && columnas.length > 1;
        return `<td class="${colClase(c.banco)} ${esMejor ? "celda-mejor" : ""}">${f.celda(c.oferta)}</td>`;
      }).join("")}
    </tr>`;
  }).join("")}</tbody>`;

  wrap.innerHTML = `<table class="matriz">${thead}${tbody}</table>`;

  wrap.querySelectorAll(".sel-plan").forEach(sel => {
    sel.addEventListener("change", () => {
      seleccionPlan[sel.dataset.banco] = sel.value;
      guardarSeleccionPlan();
      renderComparador();
    });
  });

  wrap.querySelectorAll(".rlabel-sort").forEach(th => {
    th.addEventListener("click", () => {
      criterio = th.dataset.campo;
      seleccionPlan = {}; // cada columna vuelve a su mejor plan según el nuevo criterio
      guardarSeleccionPlan();
      const selOrden = document.getElementById("sel-orden");
      selOrden.selectedIndex = [...selOrden.options].findIndex(op => op.value === criterio); // -1 si no está en el desplegable
      renderComparador();
    });
  });

  const columnaDe = (banco) => columnas.find(c => c.banco === banco);

  wrap.querySelectorAll(".btn-vista-cliente").forEach(btn => {
    btn.addEventListener("click", () => {
      const col = columnaDe(btn.dataset.banco);
      if (col) abrirVistaCliente([snapshotOferta(col.oferta)]);
    });
  });

  wrap.querySelectorAll(".btn-ocultar-banco").forEach(btn => {
    btn.addEventListener("click", () => {
      bancosOcultos.add(btn.dataset.banco);
      guardarBancosOcultos();
      renderComparador();
    });
  });

  const chkTodos = wrap.querySelector("#chk-seleccionar-todos");
  const chksIndividuales = wrap.querySelectorAll(".chk-cliente input");

  chksIndividuales.forEach(chk => {
    chk.addEventListener("change", () => {
      const col = columnaDe(chk.dataset.banco);
      if (!col) return;
      const clave = claveCliente(col.oferta);
      if (chk.checked) seleccionCliente.set(clave, snapshotOferta(col.oferta));
      else {
        seleccionCliente.delete(clave);
        if (chkTodos) chkTodos.checked = false; // se desmarca solo al desmarcar uno de los checkbox
      }
      actualizarBotonComparativa();
    });
  });

  if (chkTodos) {
    chkTodos.addEventListener("change", () => {
      chksIndividuales.forEach(chk => {
        if (chk.checked === chkTodos.checked) return;
        chk.checked = chkTodos.checked;
        const col = columnaDe(chk.dataset.banco);
        if (!col) return;
        const clave = claveCliente(col.oferta);
        if (chkTodos.checked) seleccionCliente.set(clave, snapshotOferta(col.oferta));
        else seleccionCliente.delete(clave);
      });
      actualizarBotonComparativa();
    });
  }

  actualizarBotonComparativa();
  sincronizarScrollSuperior();
}

// Columna a la derecha de la tabla con los bancos ocultados de la comparativa,
// como rectángulos pequeños que al pulsarlos los vuelven a mostrar.
function renderBancosOcultos(nombres) {
  const cont = document.getElementById("bancos-ocultos");
  if (!nombres.length) {
    cont.hidden = true;
    cont.innerHTML = "";
    return;
  }
  cont.hidden = false;
  cont.innerHTML = nombres.map(banco => `
    <button type="button" class="banco-oculto" data-banco="${esc(banco)}" title="Mostrar de nuevo «${esc(banco)}»">
      <span class="banco-oculto-nombre">${esc(banco)}</span>
      <span class="banco-oculto-icono">↺</span>
    </button>`).join("");
  cont.querySelectorAll("[data-banco]").forEach(btn => {
    btn.addEventListener("click", () => {
      bancosOcultos.delete(btn.dataset.banco);
      guardarBancosOcultos();
      renderComparador();
    });
  });
}

// Clon de la barra de scroll horizontal encima de la tabla: mismo ancho de
// contenido que #matriz-wrap, y se oculta si la tabla ya cabe en pantalla.
function sincronizarScrollSuperior() {
  const wrap = document.getElementById("matriz-wrap");
  const top = document.getElementById("matriz-scroll-top");
  const inner = document.getElementById("matriz-scroll-top-inner");
  if (!wrap || !top || !inner) return;
  inner.style.width = wrap.scrollWidth + "px";
  top.hidden = wrap.scrollWidth <= wrap.clientWidth;
}

/* ---------- Vista cliente (pestaña nueva, sin datos internos) ---------- */

function claveCliente(o) { return claveOferta(o) + "|" + o.meses; }

function snapshotOferta(o) {
  const { pvp, entrada, capital } = leerFormulario();
  return { ...o, pvp, entrada, capital };
}

function actualizarBotonComparativa() {
  const cont = document.getElementById("comparativa-flotante");
  const btn = document.getElementById("btn-comparativa");
  if (!cont || !btn) return;
  cont.hidden = seleccionCliente.size === 0;
  btn.textContent = `Mostrar comparativa al cliente (${seleccionCliente.size})`;
}

// Genera una página limpia para enseñar al cliente: sin comisión comercial,
// sin notas internas y sin coeficientes. Solo condiciones de su financiación.
function abrirVistaCliente(ofertas) {
  if (!ofertas.length) return;
  const op = ofertas[0];
  const mejorCuota = Math.min(...ofertas.map(o => o.cuota));
  const varias = ofertas.length > 1;
  const fecha = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  const tarjetas = ofertas.map(o => `
    <article class="oferta ${varias && Math.abs(o.cuota - mejorCuota) < 0.005 ? "mejor" : ""}">
      ${varias && Math.abs(o.cuota - mejorCuota) < 0.005 ? '<span class="etiqueta">Cuota más baja</span>' : ""}
      <h2>${esc(o.banco)}</h2>
      <p class="plan">${esc(o.plan)}</p>
      <div class="cuota">${fmtEur2.format(o.cuota)}<span> /mes</span></div>
      <table>
        <tr><td>Importe financiado</td><td>${fmtEur.format(o.capital)}</td></tr>
        <tr><td>Plazo</td><td>${o.meses} meses</td></tr>
        <tr><td>TIN</td><td>${fmtPct(o.tin)}</td></tr>
        <tr><td>TAE</td><td>${fmtPct(o.tae != null ? o.tae : o.taeReal)}</td></tr>
        <tr><td>Comisión de apertura</td><td>${o.aperturaFinanciada ? "Incluida en la cuota" : fmtEur2.format(o.comAperturaEur)}</td></tr>
        <tr><td>Total financiación (${o.meses} cuotas)</td><td>${fmtEur2.format(o.costeTotal)}</td></tr>
        <tr class="total"><td>Precio total a plazos</td><td>${fmtEur2.format(o.entrada + o.costeTotal)}</td></tr>
      </table>
    </article>`).join("");

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Propuesta de financiación</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Inter", "Segoe UI", sans-serif; background: #f6f7f8; color: #101214; }
  .cabecera { background: linear-gradient(150deg, #050607, #15181b 75%, #1d2226); color: #fff;
    border-bottom: 3px solid #06b6d4; padding: 26px 8vw; display: flex; justify-content: space-between; align-items: center; }
  .cabecera h1 { font-family: "Fraunces", Georgia, serif; font-size: 22px; margin: 0; }
  .cabecera .fecha { font-size: 13px; color: rgba(255,255,255,.6); margin-top: 4px; }
  .marca { font-family: "Fraunces", Georgia, serif; font-size: 34px; font-weight: 700; }
  .marca b { color: #06b6d4; }
  main { max-width: 960px; margin: 0 auto; padding: 30px 22px 60px; }
  .operacion { display: flex; flex-wrap: wrap; gap: 10px 34px; background: #fff; border: 1px solid #e4e7ea;
    border-radius: 14px; padding: 16px 22px; font-size: 14px; color: #66707a; margin-bottom: 24px; }
  .operacion b { color: #101214; font-size: 16px; }
  .ofertas { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .oferta { position: relative; background: #fff; border: 1px solid #e4e7ea; border-radius: 16px;
    padding: 24px 26px; box-shadow: 0 10px 30px -12px rgba(16,18,20,.12); }
  .oferta.mejor { border: 2px solid #06b6d4; }
  .etiqueta { position: absolute; top: -11px; left: 22px; background: #06b6d4; color: #fff;
    font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    padding: 3px 12px; border-radius: 999px; }
  .oferta h2 { font-family: "Fraunces", Georgia, serif; margin: 0; font-size: 21px; }
  .plan { color: #66707a; font-size: 13.5px; margin: 3px 0 12px; }
  .cuota { font-family: "Fraunces", Georgia, serif; font-size: 38px; font-weight: 700; color: #0891b2; margin-bottom: 14px; }
  .cuota span { font-family: "Inter", sans-serif; font-size: 15px; font-weight: 500; color: #66707a; }
  .oferta table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .oferta td { padding: 8px 0; border-top: 1px solid #eef0f2; }
  .oferta td:first-child { color: #66707a; }
  .oferta td:last-child { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .oferta tr.total td { font-weight: 700; border-top: 2px solid #e4e7ea; }
  .nota-legal { color: #9aa2ab; font-size: 11.5px; margin-top: 26px; }
  .imprimir { position: fixed; bottom: 22px; right: 22px; border: none; border-radius: 999px;
    padding: 11px 22px; background: #101214; color: #fff; font: 600 13.5px "Inter", sans-serif; cursor: pointer; }
  @media print { .imprimir { display: none; } body { background: #fff; } .oferta { box-shadow: none; } }
</style></head><body>
<header class="cabecera">
  <div>
    <h1>Propuesta de financiación</h1>
    <div class="fecha">${fecha}</div>
  </div>
  <div class="marca">Morty<b>.</b></div>
</header>
<main>
  <div class="operacion">
    <div>Precio al contado<br><b>${fmtEur.format(op.pvp)}</b></div>
    <div>Entrada<br><b>${fmtEur.format(op.entrada)}</b></div>
    <div>Importe a financiar<br><b>${fmtEur.format(op.capital)}</b></div>
  </div>
  <div class="ofertas">${tarjetas}</div>
  <p class="nota-legal">Oferta orientativa, sujeta a la aprobación de la entidad financiera y a la firma del contrato.
  TAE calculada con las condiciones indicadas. Condiciones válidas salvo error u omisión.</p>
</main>
<button class="imprimir" onclick="window.print()">Imprimir / guardar PDF</button>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return toast("El navegador ha bloqueado la pestaña emergente");
  w.document.write(html);
  w.document.close();
}

/* ---------- Vista: planes ---------- */

function renderPlanes() {
  const cont = document.getElementById("lista-bancos");
  const porBanco = new Map();
  for (const p of planes) {
    if (!porBanco.has(p.banco)) porBanco.set(p.banco, []);
    porBanco.get(p.banco).push(p);
  }

  if (!porBanco.size) {
    cont.innerHTML = `<div class="vacio"><p>Todavía no hay ningún banco cargado.</p></div>`;
    return;
  }

  cont.innerHTML = [...porBanco.entries()].map(([banco, lista]) => `
    <details class="banco-card">
      <summary>
        <span class="banco-inicial">${esc(banco.trim().charAt(0).toUpperCase())}</span>
        <span class="banco-nombre">${esc(banco)}</span>
        <span class="contador">${lista.length} plan${lista.length !== 1 ? "es" : ""}</span>
        <button class="btn btn-ghost-danger" data-borrar-banco="${esc(banco)}">Eliminar</button>
      </summary>
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr>
            <th>Plan</th><th class="num">Meses</th><th class="num">TIN</th><th class="num">TAE</th>
            <th class="num">Apertura</th><th class="num">Importe</th><th class="num">Com. comercial</th><th>Notas</th>
          </tr></thead>
          <tbody>${lista.map(p => `
            <tr>
              <td>${esc(p.plan)}</td>
              <td class="num">${p.mesesMin === p.mesesMax ? p.mesesMin : p.mesesMin + "–" + p.mesesMax}</td>
              <td class="num">${fmtPct(p.tin)}</td>
              <td class="num">${fmtPct(p.tae)}</td>
              <td class="num">${fmtPct(p.comApertura)}${p.comAperturaMin != null ? " (mín. " + fmtEur.format(p.comAperturaMin) + ")" : ""}</td>
              <td class="num">${p.importeMin != null ? fmtEur.format(p.importeMin) : "—"} – ${p.importeMax != null ? fmtEur.format(p.importeMax) : "∞"}</td>
              <td class="num">${fmtPct(p.comComercial)}</td>
              <td>${esc(p.notas)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </details>`).join("");

  cont.querySelectorAll("[data-borrar-banco]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const banco = btn.dataset.borrarBanco;
      if (!confirm(`¿Eliminar todos los planes de «${banco}»?`)) return;
      planes = planes.filter(p => p.banco !== banco);
      guardarPlanes();
      refrescarTodo();
      toast(`Planes de ${banco} eliminados`);
    });
  });
}

function renderSelectorBancos() {
  const sel = document.getElementById("sel-banco");
  const actual = sel.value;
  const bancos = [...new Set(planes.map(p => p.banco))].sort((a, b) => a.localeCompare(b, "es"));
  sel.innerHTML = `<option value="">Todos los bancos</option>` +
    bancos.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join("");
  if (bancos.includes(actual)) sel.value = actual;
}

function refrescarTodo() {
  renderSelectorBancos();
  renderComparador();
  renderPlanes();
}

/* ---------- Subida de archivos ---------- */

function procesarArchivos(files) {
  const reemplazar = document.getElementById("chk-reemplazar").checked;
  const log = document.getElementById("upload-log");
  const resultados = [];
  let pendientes = files.length;

  for (const file of files) {
    const reader = new FileReader();
    reader.onload = () => {
      const r = importarCSV(reader.result, file.name, reemplazar);
      resultados.push({ nombre: file.name, ...r });
      if (r.ok) guardarTarifaEnServidor(file.name, reader.result);
      if (--pendientes === 0) {
        log.hidden = false;
        log.innerHTML = resultados.map(r => `
          <p class="${r.ok ? "ok" : "err"}">
            ${r.ok ? "✓" : "✕"} <strong>${esc(r.nombre)}</strong>:
            ${r.ok} plan(es) importado(s)${r.errores.length ? `, ${r.errores.length} aviso(s):` : "."}
          </p>
          ${r.errores.length ? `<ul>${r.errores.map(e => `<li class="err">${esc(e)}</li>`).join("")}</ul>` : ""}
        `).join("");
        refrescarTodo();
        const total = resultados.reduce((s, r) => s + r.ok, 0);
        if (total) toast(`${total} plan(es) importado(s) correctamente`);
      }
    };
    reader.readAsText(file, "UTF-8");
  }
}

/* ---------- Plantilla vacía ---------- */

const CSV_PLANTILLA = COLUMNAS.join(";") + "\r\n" +
  "Nombre del banco;Nombre del plan;12;96;7,95;9,10;2,5;90;3000;60000;1,5;;Notas opcionales";

/* ---------- Tarifas reales ---------- */
/* Se leen del servidor (tarifas/, vía tarifas_listar.php) para incluir también
   los CSV que suban los comerciales. Si no hay servidor (p. ej. la web abierta
   como archivo local), se usa como respaldo el bundle incrustado en tarifas.js. */

async function cargarTarifasReales() {
  let fuentes = null;
  try {
    const resp = await fetch("tarifas_listar.php", { cache: "no-store" });
    if (resp.ok) fuentes = await resp.json();
  } catch {
    // sin servidor disponible: se usa el respaldo incrustado
  }
  if ((!fuentes || !Object.keys(fuentes).length) && typeof TARIFAS_REALES !== "undefined") {
    fuentes = TARIFAS_REALES;
  }
  if (!fuentes) return null;

  let total = 0;
  for (const [nombre, csv] of Object.entries(fuentes)) {
    total += importarCSV(csv, nombre, true).ok;
  }
  guardarPlanes();
  return total;
}

// Guarda en el servidor (tarifas/) el CSV que un comercial acaba de subir,
// para que quede disponible automáticamente la próxima vez que se abra la web.
function guardarTarifaEnServidor(nombre, contenido) {
  const datos = new URLSearchParams({ nombre, contenido });
  fetch("tarifas_subir.php", { method: "POST", body: datos }).catch(() => {
    // sin servidor disponible (p. ej. la web abierta como archivo): el CSV solo queda en este navegador
  });
}

/* ---------- Mejoras de la web ---------- */
/* Notas libres para el informático, guardadas en el servidor (mejoras.json,
   vía mejoras_listar.php / mejoras_guardar.php / mejoras_borrar.php). */

function renderMejoras(lista) {
  const cont = document.getElementById("lista-mejoras");
  if (!lista || !lista.length) {
    cont.innerHTML = `<li class="mejoras-vacio">Todavía no hay notas.</li>`;
    return;
  }
  cont.innerHTML = [...lista].reverse().map(m => `
    <li class="nota-mejora">
      <span class="nota-texto">${esc(m.texto)}</span>
      <span class="nota-fecha">${esc(m.fecha)}</span>
      <button type="button" class="btn-borrar-nota" data-id="${esc(m.id)}" title="Borrar nota">×</button>
    </li>`).join("");
}

async function cargarMejoras() {
  try {
    const resp = await fetch("mejoras_listar.php", { cache: "no-store" });
    if (resp.ok) renderMejoras(await resp.json());
  } catch {
    // sin servidor disponible: la sección queda vacía
  }
}

/* ---------- Navegación e interacción ---------- */

function activarVista(nombre) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === nombre));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + nombre));
}

async function init() {
  // Tabs
  document.getElementById("tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) activarVista(tab.dataset.view);
  });

  // Formulario: recalcular en vivo
  ["inp-pvp", "inp-entrada"].forEach(id =>
    document.getElementById(id).addEventListener("input", renderComparador));
  document.getElementById("sel-banco").addEventListener("change", renderComparador);

  document.getElementById("sel-orden").addEventListener("change", (e) => {
    criterio = e.target.value;
    seleccionPlan = {}; // al cambiar el criterio, cada columna vuelve a su mejor plan
    guardarSeleccionPlan();
    renderComparador();
  });

  // Meses: number, slider y chips sincronizados
  const inpMeses = document.getElementById("inp-meses");
  const rngMeses = document.getElementById("rng-meses");
  const chips = document.getElementById("meses-chips");
  const setMeses = (m) => {
    inpMeses.value = m;
    rngMeses.value = Math.min(120, Math.max(12, m));
    chips.querySelectorAll("button").forEach(b => b.classList.toggle("on", Number(b.dataset.m) === m));
    renderComparador();
  };
  inpMeses.addEventListener("input", () => setMeses(Math.max(1, Math.round(numES(inpMeses.value) ?? 48))));
  rngMeses.addEventListener("input", () => setMeses(Number(rngMeses.value)));
  chips.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]");
    if (b) setMeses(Number(b.dataset.m));
  });

  // Subida de CSV
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-csv");
  document.getElementById("btn-elegir").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) procesarArchivos([...fileInput.files]);
    fileInput.value = "";
  });
  ["dragover", "dragenter"].forEach(ev =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("over"); }));
  dropzone.addEventListener("drop", (e) => {
    const files = [...e.dataTransfer.files].filter(f => /\.csv$/i.test(f.name) || f.type.includes("csv") || f.type === "text/plain");
    if (files.length) procesarArchivos(files);
    else toast("Solo se admiten archivos .csv");
  });

  // Botones de gestión
  const recargarTarifasReales = async () => {
    const total = await cargarTarifasReales();
    if (total === null) return toast("No se han encontrado tarifas reales (falta tarifas/ o tarifas.js)");
    refrescarTodo();
    toast(`${total} planes reales cargados`);
  };
  document.getElementById("btn-reales").addEventListener("click", recargarTarifasReales);
  document.getElementById("btn-reales-vacio").addEventListener("click", recargarTarifasReales);

  document.getElementById("btn-exportar").addEventListener("click", () => {
    if (!planes.length) return toast("No hay planes que exportar");
    exportarCSV();
  });

  document.getElementById("btn-borrar-todo").addEventListener("click", () => {
    if (!planes.length) return toast("No hay nada que borrar");
    if (!confirm("¿Borrar TODOS los planes cargados? Esta acción no se puede deshacer.")) return;
    planes = [];
    guardarPlanes();
    refrescarTodo();
    toast("Todos los planes han sido borrados");
  });

  // Instrucciones
  document.getElementById("btn-copy-prompt").addEventListener("click", async () => {
    const texto = document.getElementById("prompt-ia").textContent;
    try {
      await navigator.clipboard.writeText(texto);
      toast("Prompt copiado al portapapeles");
    } catch {
      // Fallback para contextos sin Clipboard API
      const ta = document.createElement("textarea");
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Prompt copiado al portapapeles");
    }
  });
  document.getElementById("btn-plantilla").addEventListener("click", () =>
    descargar("plantilla-financiacion.csv", CSV_PLANTILLA));

  // Comparativa para el cliente (botón dentro de la cabecera de la tabla, se redibuja con ella)
  document.getElementById("matriz-wrap").addEventListener("click", (e) => {
    if (e.target.closest("#btn-comparativa")) {
      abrirVistaCliente([...seleccionCliente.values()]);
    }
  });

  // Mejoras de la web
  document.getElementById("form-mejora").addEventListener("submit", async (e) => {
    e.preventDefault();
    const txt = document.getElementById("txt-mejora");
    const texto = txt.value.trim();
    if (!texto) return;
    try {
      const resp = await fetch("mejoras_guardar.php", { method: "POST", body: new URLSearchParams({ texto }) });
      const datos = await resp.json();
      if (!resp.ok || !datos.ok) throw new Error(datos.error || "error");
      txt.value = "";
      renderMejoras(datos.mejoras);
      toast("Nota guardada");
    } catch {
      toast("No se ha podido guardar la nota (¿hay servidor PHP?)");
    }
  });
  document.getElementById("lista-mejoras").addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-borrar-nota");
    if (!btn) return;
    try {
      const resp = await fetch("mejoras_borrar.php", { method: "POST", body: new URLSearchParams({ id: btn.dataset.id }) });
      const datos = await resp.json();
      if (!resp.ok || !datos.ok) throw new Error(datos.error || "error");
      renderMejoras(datos.mejoras);
    } catch {
      toast("No se ha podido borrar la nota");
    }
  });
  cargarMejoras();

  // Clon de la barra de scroll horizontal arriba de la tabla, sincronizado con la de abajo
  const matrizWrap = document.getElementById("matriz-wrap");
  const matrizScrollTop = document.getElementById("matriz-scroll-top");
  let sincronizandoScroll = false;
  matrizScrollTop.addEventListener("scroll", () => {
    if (sincronizandoScroll) return;
    sincronizandoScroll = true;
    matrizWrap.scrollLeft = matrizScrollTop.scrollLeft;
    sincronizandoScroll = false;
  });
  matrizWrap.addEventListener("scroll", () => {
    if (sincronizandoScroll) return;
    sincronizandoScroll = true;
    matrizScrollTop.scrollLeft = matrizWrap.scrollLeft;
    sincronizandoScroll = false;
  });
  window.addEventListener("resize", sincronizarScrollSuperior);

  // Carga automática de tarifas reales si todavía no hay ningún plan guardado
  if (!planes.length) await cargarTarifasReales();

  refrescarTodo();
}

document.addEventListener("DOMContentLoaded", init);
