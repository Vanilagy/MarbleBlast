<?php

header('Content-Type: application/zip');
header('Access-Control-Allow-Origin: *');

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
$filePath = $cwd . "/../storage/customs/zip" . $id . ".zip";
if (file_exists($filePath)) {
	// If the zip has already been requested before, serve the cached version.
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

// Get the level zip from the CLA server
$result = getSslPage("https://cla.higuy.me/api/v1/missions/" . $id . "/zip?official=true");
file_put_contents($filePath, $result);

// Now we clean up the archive...
$zip = new ZipArchive();
$zip->open($filePath);
$zipFilenames = []; // Get a list of all filenames first
for ($i = 0; $i < $zip->numFiles; $i++) {
	$filename = $zip->getNameIndex($i);
	$zipFilenames[] = $filename;
}

for ($i = 0; $i < count($zipFilenames); $i++) {
	$filename = $zipFilenames[$i];
	if (strpos($filename, "interiors_mbg/") !== false) {
		// Clean up interior name inconsistency
		$oldFilename = $filename;
		$filename = str_replace("interiors_mbg/", "interiors/", $filename);
		$zip->renameName($oldFilename, $filename);
	}
	$path = strtolower($cwd . "/../assets/" . $filename);
	
	// If the regular assets folder already contains this file, omit it from the zip, because we only wanna serve necessary stuff.
	if (file_exists($cwd . "/../assets/" . $filename)) {
		$zip->deleteName($filename);
	}
}

$zip->close(); // Write it to a file

echo file_get_contents($filePath);