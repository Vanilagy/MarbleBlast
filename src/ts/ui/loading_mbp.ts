import { LoadingScreen } from "./loading";

export class MbpLoadingScreen extends LoadingScreen {
	maxProgressBarWidth = 219;

	initProperties() {
		this.div = document.querySelector('#mbp-loading') as HTMLDivElement;
		this.levelNameElement = document.querySelector('#mbp-loading-level-name') as HTMLParagraphElement;
		this.cancelButton = document.querySelector('#mbp-loading-cancel') as HTMLImageElement;
		this.progressBar = document.querySelector('#mbp-loading-progress') as HTMLDivElement;
	}
}