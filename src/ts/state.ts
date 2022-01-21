import { Game } from "./game/game";
import { Menu } from "./ui/menu";

export const state = {
	modification: null as 'gold' | 'platinum',
	game: null as Game,
	menu: null as Menu
};