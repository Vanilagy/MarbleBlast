import { PowerUp } from "./power_up";

export class TimeTravel extends PowerUp {
	dtsPath = "shapes/items/timetravel.dts";
	cooldownDuration = Infinity;
	pickUpName = "5 second Time Travel bonus"; // TODO

	pickUp() {
		return true;
	}

	use() {}
}