import { LoadingScreen } from "./loading";

export class MbgLoadingScreen extends LoadingScreen {
	maxProgressBarWidth = 252;

	initProperties() {
		this.div = document.querySelector('#loading') as HTMLDivElement;
		this.levelNameElement = document.querySelector('#loading-level-name') as HTMLParagraphElement;
		this.cancelButton = document.querySelector('#loading-cancel') as HTMLImageElement;
		this.progressBar = document.querySelector('#loading-progress') as HTMLDivElement;
	}
}