import { AbstractBumper } from "./abstract_bumper";

/** A round bumper. */
export class RoundBumper extends AbstractBumper {
	dtsPath = "shapes/bumpers/pball_round.dts";
	sounds = ["bumperding1.wav"];
}