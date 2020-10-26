<?php

header("Content-Type: text/plain");

if (!isset($_GET["mission"]) || !isset($_GET["time"])) exit();
$body = file_get_contents("php://input");
if (empty($body)) exit();

$cwd = getcwd();

function createPath($path) {
    if (is_dir($path)) return true;
    $prev_path = substr($path, 0, strrpos($path, '/', -2) + 1 );
    $return = createPath($prev_path);
    return ($return && is_writable($prev_path)) ? mkdir($path) : false;
}
createPath($cwd . "/../storage/wrecs"); // Create the wrecs folder

$path = $cwd . "/../storage/wrecs/wrecs.json";

if (!file_exists($path)) file_put_contents($path, "{}");
$wrecs = json_decode(file_get_contents($path), true);

$valid = false;
if (!isset($wrecs[$_GET["mission"]])) {
	// There is no .wrec for this mission yet
	$valid = true;
} else {
	// Check if the new time is faster
	$score = $wrecs[$_GET["mission"]];
	if (((float) $_GET["time"]) < ((float) $score[1])) $valid = true;
}

if (!$valid) exit();

// Modify the JSON and write the .wrec to a file
$wrecs[$_GET["mission"]] = array($_GET["name"], $_GET["time"], time());
file_put_contents($path, json_encode($wrecs));
file_put_contents($cwd . "/../storage/wrecs/" . str_replace('/', '_', $_GET["mission"]) . ".wrec", $body); // Save the .wrec