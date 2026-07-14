<?php
// Devuelve en JSON las notas de mejora guardadas en mejoras.json,
// para que app.js las muestre en la sección "Mejoras de la web".

header('Content-Type: application/json; charset=utf-8');

$archivo = __DIR__ . '/mejoras.json';
$mejoras = [];

if (is_file($archivo)) {
    $contenido = file_get_contents($archivo);
    $datos = json_decode((string) $contenido, true);
    if (is_array($datos)) {
        $mejoras = $datos;
    }
}

echo json_encode($mejoras, JSON_UNESCAPED_UNICODE);
