import { PowerUp } from "./power_up";

export class TimeTravel extends PowerUp {
	dtsPath = "shapes/items/timetravel.dts";
	isItem = true;

	pickUp() {
		return true;
	}

	use() {}
}