import { Bumper } from "./bumper";

/** A round bumper. */
export class RoundBumper extends Bumper {
	dtsPath = "shapes/bumpers/pball_round.dts";
	sounds = ["bumperding1.wav"];
}