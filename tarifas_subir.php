<?php
// Guarda en tarifas/ el CSV que un comercial acaba de subir desde la pestaña
// "Planes de bancos", para que quede disponible automáticamente para todos
// la próxima vez que se abra la web (ver tarifas_listar.php).

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$nombre = trim((string) ($_POST['nombre'] ?? ''));
$contenido = (string) ($_POST['contenido'] ?? '');

if ($nombre === '' || $contenido === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Faltan datos (nombre o contenido)']);
    exit;
}

if (strlen($contenido) > 5 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['error' => 'El archivo es demasiado grande']);
    exit;
}

// Nombre de archivo seguro: solo el nombre base, sin rutas, forzando extensión .csv
$base = preg_replace('/[^A-Za-z0-9._-]+/', '_', basename($nombre));
$base = preg_replace('/\.csv$/i', '', $base);
if ($base === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Nombre de archivo inválido']);
    exit;
}
$archivo = $base . '.csv';

$dir = __DIR__ . '/tarifas';
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    http_response_code(500);
    echo json_encode(['error' => 'No se ha podido crear el directorio de tarifas']);
    exit;
}

$destino = $dir . '/' . $archivo;

if (file_put_contents($destino, $contenido) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'No se ha podido guardar el archivo']);
    exit;
}
chmod($destino, 0644);

echo json_encode(['ok' => true, 'archivo' => $archivo]);
