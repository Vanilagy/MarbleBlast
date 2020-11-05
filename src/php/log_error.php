<?php

date_default_timezone_set('UTC');

$cwd = getcwd();

$input = json_decode(file_get_contents("php://input"), true);
if (!isset($input)) exit();

function createPath($path) {
    if (is_dir($path)) return true;
    $prev_path = substr($path, 0, strrpos($path, '/', -2) + 1 );
    $return = createPath($prev_path);
    return ($return && is_writable($prev_path)) ? @mkdir($path) : false;
}
createPath($cwd . "/../storage/logs"); // Create the log folder

// Create the data to append to the error log:

$str = "";

$str .= date("c") . " | " . $input["userAgent"] . "\n";
for ($i = 0; $i < count($input["errors"]); $i++) {
	$obj = $input["errors"][$i];
	$str .= $obj["filename"] . ":" . $obj["line"] . ":" . $obj["column"] . " " . $obj["message"] . "\n";
}

$str .= "\n";

// Append to end of file
file_put_contents($cwd . "/../storage/logs/user_errors.log", $str, FILE_APPEND | LOCK_EX);