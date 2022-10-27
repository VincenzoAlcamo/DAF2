// {
// 	"matches": [
// 		"https://login.pixelfederation.com/*"
// 	],
// 	"all_frames": true,
// 	"run_at": "document_end",
// 	"js": [
// 		"inject/login2.js"
// 	]
// },
chrome.storage.local.get('autoLoginTime', function (data) {
	if (data && +data.autoLoginTime >= Date.now() - 5000) {
		let count = 10;
		const handler = setInterval(function tryLogin() {
			const a = document.querySelector(`.btn--facebook[href="https://login.pixelfederation.com/oauth/connect/facebook"]`);
			if (!a && --count > 0) return;
			clearInterval(handler);
			if (a) {
				const div = document.createElement('div');
				document.body.appendChild(div);
				div.style = 'position:fixed;left:0;top:0;width:100%;height:100%;background-color:#0008;z-index:999';
				setTimeout(() => div.remove(), 3000);
				a.click();
			}
		}, 500);
	}
});
