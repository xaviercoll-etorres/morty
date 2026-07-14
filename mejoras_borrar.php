<?php
// Elimina una nota de mejoras.json a partir de su id.

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$id = trim((string) ($_POST['id'] ?? ''));
if ($id === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Falta el id de la nota']);
    exit;
}

$archivo = __DIR__ . '/mejoras.json';
$mejoras = [];
if (is_file($archivo)) {
    $datos = json_decode((string) file_get_contents($archivo), true);
    if (is_array($datos)) {
        $mejoras = $datos;
    }
}

$mejoras = array_values(array_filter($mejoras, fn($m) => ($m['id'] ?? null) !== $id));

if (file_put_contents($archivo, json_encode($mejoras, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'No se ha podido borrar la nota']);
    exit;
}

echo json_encode(['ok' => true, 'mejoras' => $mejoras]);
