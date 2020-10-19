<?php

header('Content-Type: image/jpeg');

$id = $_GET["id"];
if (!isset($id)) exit();

function createPath($path) {
    if (is_dir($path)) return true;
    $prev_path = substr($path, 0, strrpos($path, '/', -2) + 1 );
    $return = createPath($prev_path);
    return ($return && is_writable($prev_path)) ? mkdir($path) : false;
}

$cwd = getcwd();
createPath($cwd . "/../storage/customs"); // Create the custom level directory if it doesn't exist yet
$filePath = $cwd . "/../storage/customs/bitmap" . $id . ".jpg";
if (file_exists($filePath)) {
	// If the bitmap has already been requested once, serve the cached version.
	echo file_get_contents($filePath);
	exit();
}

function getSslPage($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);
    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_REFERER, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
    $result = curl_exec($ch);
    curl_close($ch);
    return $result;
}

// Hit the CLA server to get the bitmap
$result = getSslPage("https://cla.higuy.me/api/v1/missions/" . $id . "/bitmap?width=258&height=194");
file_put_contents($filePath, $result);

echo $result;