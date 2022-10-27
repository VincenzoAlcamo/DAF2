// {
// 	"matches": [
// 		"https://portal.pixelfederation.com/*"
// 	],
// 	"all_frames": true,
// 	"run_at": "document_end",
// 	"js": [
// 		"inject/login1.js"
// 	]
// },
chrome.storage.local.get('autoLogin', function (data) {
	if (data && data.autoLogin) {
		// Privacy policy
		const el = document.querySelector('.alert__action[data-announcement="privacy_policy"]');
		if (el) el.click();
		const loginButton = sessionStorage.getItem('DAF-login') ? null : document.querySelector('#login-click');
		if (loginButton) {
			sessionStorage.setItem('DAF-login', '1');
			chrome.storage.local.set({ autoLoginTime: Date.now() });
			loginButton.click();
		}
	}
});
