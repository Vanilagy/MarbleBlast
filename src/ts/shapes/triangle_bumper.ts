import { AbstractBumper } from "./abstract_bumper";

/** A triangle-shaped bumper. */
export class TriangleBumper extends AbstractBumper {
	dtsPath = "shapes/bumpers/pball_tri.dts";
	sounds = ["bumper1.wav"];
}