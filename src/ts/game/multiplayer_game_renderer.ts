import { GAME_UPDATE_RATE } from "../../../shared/constants";
import { G } from "../global";
import { GameRenderer } from "./game_renderer";
import { MultiplayerGame } from "./multiplayer_game";

export class MultiplayerGameRenderer extends GameRenderer {
	networkStatTimeout = 0;
	game: MultiplayerGame;

	renderHud() {
		super.renderHud();

		G.menu.hud.displayScoreboard();

		if (--this.networkStatTimeout <= 0) {
			this.displayNetworkStats();
			this.networkStatTimeout = 3;
		}
	}

	displayNetworkStats() {
		let { game } = this;

		if (!game.started) return;

		let now = performance.now();
		while (game.recentRtts.length > 0 && now - game.recentRtts[0].timestamp > 2000) game.recentRtts.shift();
		while (game.incomingTimes.length > 0 && now - game.incomingTimes[0][0] > 1000) game.incomingTimes.shift();
		while (game.outgoingTimes.length > 0 && now - game.outgoingTimes[0][0] > 1000) game.outgoingTimes.shift();

		while (game.tickDurations.length > 0 && now - game.tickDurations[0].start > 1000) game.tickDurations.shift();
		while (game.simulator.advanceTimes.length > 0 && now - game.simulator.advanceTimes[0] > 1000) game.simulator.advanceTimes.shift();
		while (game.simulator.reconciliationDurations.length > 0 && now - game.simulator.reconciliationDurations[0].start > 1000) game.simulator.reconciliationDurations.shift();

		//let medianRtt = Util.computeMedian(game.recentRtts.map(x => x.value));
		let averageRtt = game.recentRtts.map(x => x.value).reduce((a, b) => a + b, 0) / game.recentRtts.length;
		let jitter = game.recentRtts.map(x => Math.abs(x.value - averageRtt)).reduce((a, b) => a + b, 0) / game.recentRtts.length;
		let averageTickDuration = game.tickDurations.map(x => x.duration).reduce((a, b) => a + b, 0) / game.tickDurations.length;
		let averageReconciliationDuration = game.simulator.reconciliationDurations.map(x => x.duration).reduce((a, b) => a + b, 0) / game.simulator.reconciliationDurations.length;

		G.menu.hud.networkStats.textContent = `
			Ping: ${isNaN(averageRtt)? 'N/A' : averageRtt.toFixed(1) + ' ms'}
			Jitter: ${isNaN(jitter)? 'N/A' : jitter.toFixed(1) + ' ms'}
			Incoming packets/s: ${game.incomingTimes.length}
			Outgoing packets/s: ${game.outgoingTimes.length}
			Downstream: ${(game.incomingTimes.map(x => x[1]).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} kB/s
			Upstream: ${(game.outgoingTimes.map(x => x[1]).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} kB/s
			Server frame: ${game.state.serverFrame}
			Client frame: ${game.state.frame}
			Target frame: ${game.state.targetFrame}
			Frames ahead server: ${game.state.frame - game.state.serverFrame}
			Frames ahead target: ${game.state.frame - game.state.targetFrame}
			Server update rate: ${GAME_UPDATE_RATE} Hz
			Client update rate: ${game.lastUpdateRate | 0} Hz
			Advancements/s: ${game.simulator.advanceTimes.length}
			Tick duration: ${averageTickDuration.toFixed(2)} ms
			Reconciliation duration: ${isNaN(averageReconciliationDuration)? 'N/A' : averageReconciliationDuration.toFixed(2) + ' ms'}
			Reconciliation frames: ${game.simulator.lastReconciliationFrames}
			Send timeout: idk
		`;

		//document.body.style.filter = sendTimeout <= 0 ? '' : 'saturate(0.25)';
	}
}