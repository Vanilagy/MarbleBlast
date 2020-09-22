<?php

header("Content-Type: text/plain");

function scan_directory($path) {
	$files = scandir($path);
	$files = array_slice($files, 2);

	$result = array();

	for ($i = 0; $i < count($files); $i++) {
		$new_path = $path . "/" . $files[$i];
		if (is_dir($new_path)) $result[$files[$i]] = scan_directory($new_path);
		else $result[$files[$i]] = null;
	}

	return $result;
}

$cwd = getcwd();
echo json_encode(scan_directory($cwd . "/../assets/data"));