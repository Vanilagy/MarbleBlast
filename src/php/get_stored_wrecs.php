<?php

header("Content-Type: text/plain");

$cwd = getcwd();

function createPath($path) {
    if (is_dir($path)) return true;
    $prev_path = substr($path, 0, strrpos($path, '/', -2) + 1 );
    $return = createPath($prev_path);
    return ($return && is_writable($prev_path)) ? @mkdir($path) : false;
}
createPath($cwd . "/../storage/wrecs"); // Create the wrecs folder

$path = $cwd . "/../storage/wrecs/wrecs.json";

if (!file_exists($path)) file_put_contents($path, "{}");

echo file_get_contents($path); // Simply echo it