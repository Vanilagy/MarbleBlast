<?php

date_default_timezone_set('UTC');
header("Content-Type: text/plain");
require_once('./level_name_map.php');

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
// We didn't manage to correctly read in the leaderboard, go and stop the script to prevent any further damage
if (empty($leaderboardString)) {
	exit();
}

// Handle the hourly backup
$date = date("YmdH");
$backupPath = $cwd . "/../storage/leaderboard/leaderboard_backup" . $date . ".json";
if (!is_file($backupPath)) file_put_contents($backupPath, $leaderboardString);

// Get and decode the input
$rawInput = file_get_contents("php://input");
$decodedInput = zlib_decode($rawInput);
if (!$decodedInput) {
	exit();
}

$input = json_decode($decodedInput, true);
$leaderboard = json_decode($leaderboardString, true);
if (!isset($leaderboard)) exit(); // Just to be sure
$version = isset($input["version"])? intval($input["version"]) : 0;

function sendPost($url, $data) {
	try {
		$options = array(
			'http' => array(
				'header'  => "Content-type: application/json\n",
				'method'  => 'POST',
				'content' => $data
			)
		);
		$context  = stream_context_create($options);
		@$result = file_get_contents($url, false, $context);
	} catch (Exception $e) {
		// Don't do anything I guess
	}
}

function escapeDiscord($message) {
	$message = str_replace("\\", "\\\\", $message);
	$message = str_replace("*", "\\*", $message);
	$message = str_replace("_", "\\_", $message);
	$message = str_replace("~", "\\~", $message);
	$message = str_replace("-", "\\-", $message);
	$message = str_replace("`", "\\`", $message);
	$message = str_replace(":", "\\:", $message);

	//To prevent people from @everyone and causing a problem
	$message = str_replace("@", "@﻿", $message);
	//To prevent people from <@&> as well
	$message = str_replace("<", "<﻿", $message);

	return $message;
}

$webhookScoreCountThreshold = 10; // Require at least this many scores on a level before the announcement is made
function sendToWebhook($toInsert, $path) {
	global $cwd;
	global $level_names;

	if (is_file($cwd . "/../storage/discord_webhook.txt")) {
		$webhookUrl = file_get_contents($cwd . "/../storage/discord_webhook.txt");

		$levelName;
		$category;
		if (strpos($path, 'custom') === 0) {
			$claList = json_decode(file_get_contents($cwd . "/../assets/cla_list.json"), true);
			$searchedId = intval(substr($path, 7));
			$entry;
			for ($i = 0; $i < count($claList); $i++) {
				if ($claList[$i]["id"] === $searchedId) {
					$entry = $claList[$i];
					break;
				}
			}
			if (!$entry) return;

			$levelName = trim($entry["name"]);
			$category = "Custom";
		} else {
			$levelName = $level_names[$path];
			$category = ucfirst(substr($path, 0, strpos($path, "/")));
		}
		if (!isset($levelName)) return;
		$levelName = escapeDiscord($levelName);
		
		$timeStr = strval($toInsert[1]);
		$intPart = (strpos($timeStr, ".") !== false)? substr($timeStr, 0, strpos($timeStr, ".")) : $timeStr;
		$timeRaw = (float) $intPart;
		$neg = $timeRaw < 0;
		$timeRaw = abs($timeRaw);
		$minutes = floor($timeRaw / (1000 * 60));
		$seconds = floor($timeRaw / 1000 % 60);
		$milliseconds = floor($timeRaw % 1000);
		$time = str_pad(strval($minutes), 2, "0", STR_PAD_LEFT) . ":" . str_pad(strval($seconds), 2, "0", STR_PAD_LEFT) . "." . str_pad(strval($milliseconds), 3, "0", STR_PAD_LEFT);
		if ($neg) $time = "-" . $time; // Prepend the sign
		$sanitizedName = escapeDiscord($toInsert[0]);
		$message = $sanitizedName . " has just achieved a world record on \"" . $levelName . "\" (Web " . $category . ") of " . $time;
		
		sendPost(
			$webhookUrl,
			json_encode(array("content" => $message))
		);
	}
}

// Handle insertion of best times
foreach ($input["bestTimes"] as $key => $value) {
	$toInsert = array($value[0], $value[1], $input["randomId"]);
	$time = (float) $value[1];

	$webhookOverride = strpos($key, "custom") !== 0; // Always show non-custom records

	if (!isset($leaderboard[$key])) {
		$leaderboard[$key] = array($toInsert);
		if ($webhookOverride || $webhookScoreCountThreshold <= 1) sendToWebhook($toInsert, $key);
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

			if (($webhookOverride || $webhookScoreCountThreshold <= count($leaderboard[$key])) && $i === 0) sendToWebhook($toInsert, $key);
		}
	}
}

// Save it
file_put_contents($leaderboardPath, json_encode($leaderboard), LOCK_EX);

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