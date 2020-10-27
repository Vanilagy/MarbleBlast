<?php

date_default_timezone_set('UTC');
header("Content-Type: text/plain");

function createPath($path) {
    if (is_dir($path)) return true;
    $prev_path = substr($path, 0, strrpos($path, '/', -2) + 1 );
    $return = createPath($prev_path);
    return ($return && is_writable($prev_path)) ? mkdir($path) : false;
}

$cwd = getcwd();
createPath($cwd . "/../storage/leaderboard"); // Create the leaderboard folder

$leaderboardPath = $cwd . "/../storage/leaderboard/leaderboard.json";

if (is_file($cwd . "/leaderboard.json")) {
	// Copy the legacy location into the new one, then delete the legacy leaderboard
	file_put_contents($leaderboardPath, file_get_contents($cwd . "/leaderboard.json"));
	unlink($cwd . "/leaderboard.json");
}
if (!is_file($leaderboardPath)) file_put_contents($leaderboardPath, "{}"); // Create an empty leaderboard if none exists yet

$leaderboardString = file_get_contents($leaderboardPath);
if (empty($leaderboardString)) exit(); // We didn't manage to correctly read in the leaderboard, go and stop the script to prevent any further damage

// Handle the hourly backup
$date = date("YmdH");
$backupPath = $cwd . "/../storage/leaderboard/leaderboard_backup" . $date . ".json";
if (!is_file($backupPath)) file_put_contents($backupPath, file_get_contents($leaderboardPath));

// Get and decode the input
$rawInput = file_get_contents("php://input");
$decodedInput = zlib_decode($rawInput);
if (!$decodedInput) exit();

$input = json_decode($decodedInput, true);
$leaderboard = json_decode(file_get_contents($leaderboardPath), true);
if (!isset($leaderboard)) exit(); // Just to be sure
$version = isset($input["version"])? intval($input["version"]) : 0;

// Handle insertion of best times
foreach ($input["bestTimes"] as $key => $value) {
	$toInsert = array($value[0], $value[1], $input["randomId"]);
	$time = (float) $value[1];

	if (!isset($leaderboard[$key])) {
		$leaderboard[$key] = array($toInsert);
	} else {
		$needsInsert = true;

		for ($i = 0; $i < count($leaderboard[$key]); $i++) {
			$val = $leaderboard[$key][$i];
			if ($val[2] === $toInsert[2] || $val[0] === $toInsert[0]) {
				if (((float) $val[1]) <= $time) $needsInsert = false;
				else {
					array_splice($leaderboard[$key], $i, 1);
					$i--;
				}
			}
		}

		if ($needsInsert) {
			$i = 0;
			for ($i = 0; $i < count($leaderboard[$key]); $i++) {
				if (((float) $leaderboard[$key][$i][1]) > $time) break;
			}
	
			array_splice($leaderboard[$key], $i, 0, array($toInsert));
			$leaderboard[$key] = array_slice($leaderboard[$key], 0, 50);
		}
	}
}

// Save it
file_put_contents($leaderboardPath, json_encode($leaderboard));

$response = array();

// Build the response
foreach ($leaderboard as $key => $value) {
	$arr = array();

	for ($i = 0; $i < count($value); $i++) {
		$secondValue = ($version >= 1)? strval($value[$i][1]) : ((float) $value[$i][1]);
		$arr[] = array($value[$i][0], $secondValue);
	}

	$response[$key] = $arr;
}

echo json_encode($response);