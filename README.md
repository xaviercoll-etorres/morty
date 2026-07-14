# Comparador de Financiación

Web para que un comercial compare planes de financiación entre bancos: introduce PVP, entrada y plazo, y ve al instante la cuota mensual, TAE real, comisión de apertura, coste total y comisión comercial de cada plan, con los mejores destacados.

## Tecnología

HTML + CSS + JavaScript puro en el navegador, con un par de endpoints PHP mínimos para persistir las tarifas en el servidor. **Sin frameworks, sin dependencias, sin entorno virtual ni instalación.** Los datos de la operación en curso se guardan en el `localStorage` del navegador; las tarifas reales se guardan en `tarifas/` en el servidor.

## Cómo usarla

- **Como servidor** (recomendado, para que las tarifas subidas por un comercial las vea todo el equipo): sírvela con PHP, p. ej.:
  ```
  php -S localhost:8123 .
  ```
  y abre `http://localhost:8123`. Al abrirla, las tarifas de `tarifas/` se cargan automáticamente.
- **Opción sin servidor:** abre `index.html` directamente en el navegador (doble clic). En ese modo no hay PHP disponible, así que la carga automática usa como respaldo el bundle incrustado en `tarifas.js` y los CSV que subas solo quedan en ese navegador (no se guardan en `tarifas/`).

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Las tres vistas: Comparador, Planes de bancos, Cómo subir datos |
| `styles.css` | Estilos |
| `app.js` | Parser CSV, cálculo financiero (cuota francesa o por coeficiente, TAE real por bisección), renderizado y persistencia |
| `tarifas_listar.php` | Devuelve en JSON el contenido de todos los CSV de `tarifas/`, para la carga automática al abrir la web |
| `tarifas_subir.php` | Guarda en `tarifas/` el CSV que un comercial sube desde «Planes de bancos», para que quede disponible para todos |
| `tarifas.js` | Respaldo para cuando la web se abre como archivo local, sin servidor PHP. Vacío a propósito (no lleva tarifas reales hardcodeadas, para poder publicar el repo); en ese modo hay que subir los CSV a mano |

## Datos

Los planes se suben en CSV con esta cabecera (separador `;`, decimales con coma):

```
banco;plan;meses_min;meses_max;tin;tae;comision_apertura;comision_apertura_min;importe_min;importe_max;comision_comercial;coeficiente;notas
```

La columna `coeficiente` es opcional y sirve para tarifas tipo BBVA/Grupo 1 que definen la cuota
como *coeficiente × importe financiado* (con la comisión de apertura financiada dentro y, según la
variante, seguros incluidos). Si está vacía, la cuota se calcula con el TIN (sistema francés) y la
apertura se suma como pago inicial.

La pestaña **Cómo subir datos** de la propia web contiene las instrucciones completas para el comercial, incluido un prompt listo para copiar que transforma el Excel original del banco a este formato usando una IA, y una plantilla CSV descargable. Cada CSV que se sube (arrastrado o elegido) se guarda automáticamente en `tarifas/` en el servidor mediante `tarifas_subir.php`, así queda disponible para todos la próxima vez que se abra la web.

## Tarifas reales

Las tarifas reales de cada banco viven solo en `tarifas/` en el servidor (no se versionan en git: ver `.gitignore`), listas para arrastrar a la pestaña *Planes de bancos*. Se suben o actualizan igual que cualquier otro CSV, según el formato descrito arriba.
