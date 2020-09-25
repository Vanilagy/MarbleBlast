import { PowerUp } from "./power_up";

export class TimeTravel extends PowerUp {
	dtsPath = "shapes/items/timetravel.dts";
	cooldownDuration = Infinity;

	pickUp() {
		return true;
	}

	use() {}
}