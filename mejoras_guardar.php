<?php
// Añade una nota nueva a mejoras.json desde la sección "Mejoras de la web",
// para que el informático la vea al revisar la aplicación.

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$texto = trim((string) ($_POST['texto'] ?? ''));

if ($texto === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Falta el texto de la nota']);
    exit;
}
if (mb_strlen($texto) > 2000) {
    $texto = mb_substr($texto, 0, 2000);
}

$archivo = __DIR__ . '/mejoras.json';
$mejoras = [];
if (is_file($archivo)) {
    $datos = json_decode((string) file_get_contents($archivo), true);
    if (is_array($datos)) {
        $mejoras = $datos;
    }
}

$mejoras[] = [
    'id' => uniqid('m', true),
    'texto' => $texto,
    'fecha' => date('d/m/Y H:i'),
];

if (file_put_contents($archivo, json_encode($mejoras, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'No se ha podido guardar la nota']);
    exit;
}

echo json_encode(['ok' => true, 'mejoras' => $mejoras]);
