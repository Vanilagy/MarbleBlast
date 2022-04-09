import { Bumper } from "./bumper";

/** A triangle-shaped bumper. */
export class TriangleBumper extends Bumper {
	dtsPath = "shapes/bumpers/pball_tri.dts";
	sounds = ["bumper1.wav"];
}