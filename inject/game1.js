function setupMessaging(src, color, dst) {
	const logPrefix = `%c ${src.toUpperCase()} %c`;
	const logColor = `background-color:${color};color:white`;
	const log = function (...data) {
		if (typeof data[0] === 'string') data[0] = logPrefix + ' ' + data[0];
		else data.unshift(logPrefix);
		data.splice(1, 0, logColor, 'background-color:transparent;color:inherit');
		return console.log.apply(console, data);
	};
	log('started');

	const Prefs = {};
	const handlers = {};
	handlers['@prefs'] = (request) => {
		const values = request.values || {};
		Object.assign(Prefs, values);
		dispatch({ action: 'pref:*', values });
		Object.entries(values).forEach(([key, value]) => dispatch({ action: 'pref:' + key, value }));
	};
	const dispatch = (request, sender) => {
		const action = request?.action;
		try { return action in handlers ? handlers[action](request, sender) : void 0; } catch (e) {}
	};
	const makeRequest = (action, data) => (typeof action === 'string' ? { action, ...data } : action);
	const notSupported = () => { throw 'Not supported'; };
	let [sendPage, send, setPreference] = [notSupported, notSupported, notSupported];
	if (dst) {
		window.addEventListener('message', (event) => event.source === window && event.data?.src === dst && dispatch(event.data.request));
		sendPage = (...args) => window.postMessage({ src, request: makeRequest(...args) }, window.location.href);
	}
	if (src !== 'game0') {
		chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
			const response = dispatch(request, sender);
			if (response instanceof Promise) {
				response.then(sendResponse);
				return true;
			}
			if (response !== undefined) sendResponse(response);
		});
		send = async (...args) => {
			return new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(makeRequest(...args), (response) => {
					if (!chrome.runtime.lastError) resolve(response);
				});
			});
		};
		setPreference = (name, value) => chrome.storage.local.set({ [name]: value });
		chrome.storage.local.get(null, function (values) {
			dispatch({ action: '@prefs', values });
			chrome.storage.local.onChanged.addListener((changes) => {
				const values = {};
				Object.entries(changes).forEach(([key, change]) => (values[key] = change.newValue));
				dispatch({ action: '@prefs', values });
			});
		});
	}

	return { Msg: { send, sendPage, handlers }, Prefs, setPreference, log };
}

const getExtensionUrl = (resource) => chrome.runtime.getURL(resource);
function addStylesheet(href, onLoad) {
	const link = document.createElement('link');
	link.type = 'text/css';
	link.rel = 'stylesheet';
	link.href = href;
	if (onLoad) link.addEventListener('load', onLoad);
	return document.head.appendChild(link);
}

let site, pageType, styleAdded;

if (location.host.startsWith('portal.')) site = 'Portal';
else if (location.host.startsWith('apps.facebook.')) site = 'Facebook';
else throw console.error('Not a valid page');

const { Msg, Prefs, setPreference, log } = setupMessaging('game1', 'green');

Msg.handlers['gameStarted'] = () => {
	checkPage_cleanup();
	log('Detected site "%s"', site);
	Msg.send('gameStarted', { site });
	Msg.handlers['pref:*'] = () => void setFlags();
	Msg.handlers['generator'] = () => {
		if (!styleAdded) addStylesheet(getExtensionUrl('inject/game1.css'));
		styleAdded = true;
		detectPageType();
		setFlags();
	};
	Msg.handlers['enableAutoQueue'] = () => void aq_setup();
	if (site === 'Portal') checkPage_setup();
};

let checkPage_cleanup = () => {};
function checkPage_setup() {
	checkPage_cleanup();
	log('page check started');
	const url = location.href;
	const handler = setInterval(() => location.href !== url && checkPage_cleanup(), 2000);
	checkPage_cleanup = () => {
		checkPage_cleanup = () => {};
		log('page check has detected a change');
		clearInterval(handler);
		pageType = '';
		setFlags();
		aq_cleanup();
	};
}

function setFlags() {
	const root = document.documentElement;
	root.classList.toggle('DAF-fullwindow', pageType && Prefs.fullWindow);
	root.classList.toggle('DAF-fullwindowside', pageType && Prefs.fullWindowSide);
	if (pageType) root.setAttribute('daf-pagetype', pageType);
	else root.removeAttribute('daf-pagetype');
}

function detectPageType() {
	pageType = '';
	if (document.getElementById('pagelet_bluebar')) pageType = 'facebook1';
	else if (document.querySelector('div[role=banner]')) {
		const iframe = document.querySelector('#iframe_canvas iframe');
		if (iframe) pageType = 'facebook2';
	} else if (site === 'Portal') pageType = 'portal';
	log('Detected page "%s"', pageType);
}

let aq_lastKeyCode;
function aq_toggle(event) {
	event?.stopPropagation();
	event?.preventDefault();
	setPreference('hAutoQueue', !Prefs['hAutoQueue']);
}
function aq_onKeyDown(event) {
	if (aq_lastKeyCode == event.code) return;
	aq_lastKeyCode = event.code;
	if (event.code == 'Key' + Prefs.queueHotKey && event.altKey && !event.shiftKey && !event.ctrlKey)
		aq_toggle(event);
}
function aq_onKeyUp(event) {
	aq_lastKeyCode = 0;
}
function aq_onMouseUp(event) {
	if (Prefs.queueMouseGesture == 1 && event.button == 1) aq_toggle(event);
	if (Prefs.queueMouseGesture == 2 && event.button == 0 && event.buttons == 2) aq_toggle(event);
}
function aq_setup() {
	log('enable autoQueue hotkey');
	window.addEventListener('keydown', aq_onKeyDown);
	window.addEventListener('keyup', aq_onKeyUp);
	window.addEventListener('mouseup', aq_onMouseUp, { capture: true });
}
function aq_cleanup() {
	log('disable autoQueue hotkey');
	window.removeEventListener('keydown', aq_onKeyDown);
	window.removeEventListener('keyup', aq_onKeyUp);
	window.removeEventListener('mouseup', aq_onMouseUp, { capture: true });
}

