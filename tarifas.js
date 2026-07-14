// Respaldo estático para cuando la web se abre sin servidor (ver README).
// Vacío a propósito: las tarifas reales solo viven en tarifas/ en el servidor
// (vía tarifas_listar.php) para no exponerlas si este archivo se publica.
// En modo "sin servidor" (index.html abierto como archivo), "Cargar tarifas
// reales" no encontrará nada; sube los CSV a mano desde "Planes de bancos".
const TARIFAS_REALES = {};
