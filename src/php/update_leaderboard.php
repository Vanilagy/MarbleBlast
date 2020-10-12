<?php

header("Content-Type: text/plain");

$cwd = getcwd();
if (!is_file($cwd . "/leaderboard.json")) file_put_contents($cwd . "/leaderboard.json", "{}");

$input = json_decode(file_get_contents("php://input"), true);
$leaderboard = json_decode(file_get_contents($cwd . "/leaderboard.json"), true);
$version = isset($input["version"])? intval($input["version"]) : 0;

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

file_put_contents($cwd . "/leaderboard.json", json_encode($leaderboard));

$response = array();

foreach ($leaderboard as $key => $value) {
	$arr = array();

	for ($i = 0; $i < count($value); $i++) {
		$secondValue = ($version >= 1)? strval($value[$i][1]) : ((float) $value[$i][1]);
		$arr[] = array($value[$i][0], $secondValue);
	}

	$response[$key] = $arr;
}

echo json_encode($response);