self.addEventListener('fetch', event => {
	if (!(event.request.url.endsWith('/') || event.request.url.endsWith('index.html'))) return; // Only file we wanna handle specially rn

	event.respondWith(new Promise(async (resolve) => {
		let errResponse = new Response(noInternetHtml, {
			status: '200', // Technically wrong ig,
			headers: {
				'Content-Type': 'text/html'
			}
		});

		setTimeout(() => resolve(errResponse), 10000);

		try {
			let response = await fetch(event.request);
			resolve(response);
		} catch (error) {
			resolve(errResponse);
		}
	}));
});

// Describes an HTML file that is shown when there's no internet. Reminds the user that internet is required to use the internet. Lol.
const noInternetHtml = `
<!DOCTYPE html>
<html lang="en">
	<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=0">
	<meta charset="utf-8">
	<style>
		body, html {
			background: black;
			color: white;
			font-family: sans-serif;
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			width: 100%;
			text-align: center;
		}

		body {
			margin: 20px;
			overflow: hidden;
			overscroll-behavior: none;
		}
	</style>

	<div>
		Can't seem to establish a connection to the server.<br>
		Marble Blast Web requires an active internet connection to function.<br><br><br>
		<span style="font-size: 18px; opacity: 0.75;" onclick="document.body.style.display = 'none'; location.reload(true);">Try again</span>
	</div>
</html>
`;