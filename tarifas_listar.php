<?php
// Devuelve en JSON el contenido de todos los CSV guardados en tarifas/,
// para que app.js pueda cargarlos automáticamente al abrir la web.

header('Content-Type: application/json; charset=utf-8');

$dir = __DIR__ . '/tarifas';
$tarifas = [];

if (is_dir($dir)) {
    foreach (glob($dir . '/*.csv') as $ruta) {
        $contenido = file_get_contents($ruta);
        if ($contenido !== false) {
            $tarifas[basename($ruta)] = $contenido;
        }
    }
}

echo json_encode($tarifas, JSON_UNESCAPED_UNICODE);
