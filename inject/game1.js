function setupMessaging(src, color, dst) {
	const logPrefix = `%c ${src.toUpperCase()} %c`;
	const logColor = `background-color:${color};color:white`;
	const [log, warn, info, error, debug] = ['log', 'warn', 'info', 'error', 'debug'].map((name) => {
        const method = console[name];
		return function (...data) {
			if (typeof data[0] === 'string') data[0] = logPrefix + ' ' + data[0];
			else data.unshift(logPrefix);
			data.splice(1, 0, logColor, 'background-color:transparent;color:inherit');
			return method.apply(console, data);
        };
    });
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
		const resolvers = {};
		let lastId = 0;
		const newCustomEvent = (detail) => new CustomEvent('daf_' + dst, { detail });
		document.addEventListener('daf_' + src, (event) => {
			const responseId = event.detail.responseId;
			if ('value' in event.detail) return void resolvers[responseId]?.(event.detail.value);
			const response = dispatch(event.detail.request);
			const promise = response instanceof Promise ? response : Promise.resolve(response);
			promise.then((value) => document.dispatchEvent(newCustomEvent({ responseId, value })));
		});
		sendPage = (...args) => {
			const responseId = ++lastId;
			return new Promise((resolve) => {
				resolvers[responseId] = resolve;
				document.dispatchEvent(newCustomEvent({ responseId, request: makeRequest(...args) }));
			}).finally(() => delete resolvers[responseId]);
		};
	}
	if (src !== 'game0') {
		Object.assign(console, { log, warn, info, error, debug });
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

	return { Msg: { send, sendPage, handlers }, Prefs, setPreference, log, warn, info, error, debug };
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

(function () {
	let site, pageType;

	if (location.host.startsWith('portal.')) site = 'Portal';
	else if (location.host.startsWith('apps.facebook.')) site = 'Facebook';
	else return;

	const { Msg, Prefs, setPreference, log } = setupMessaging('game1', 'green');

	Msg.handlers['gameStarted'] = () => {
		log('Detected site "%s"', site);
		Msg.send('gameStarted', { site });
		Msg.handlers['pref:*'] = () => void setFlags();
		Msg.handlers['generator'] = () => {
			addStylesheet(getExtensionUrl('inject/game1.css'));
			detectPageType();
			setFlags();
		};
		Msg.handlers['enableAutoQueue'] = () => void setupAutoQueueHotKey();
	};

	function setFlags() {
		const root = document.documentElement;
		root.classList.toggle('DAF-fullwindow', Prefs.fullWindow);
		root.classList.toggle('DAF-fullwindowside', Prefs.fullWindowSide);
		root.setAttribute('daf-pagetype', pageType);
	}

	function detectPageType() {
		pageType = 'unknown';
		if (document.getElementById('pagelet_bluebar')) {
			pageType = 'facebook1';
		} else if (document.querySelector('div[role=banner]')) {
			const iframe = document.querySelector('#iframe_canvas iframe');
			if (iframe) {
				iframe.style.display = 'block';
				pageType = 'facebook2';
			}
		} else if (site === 'Portal') {
			pageType = 'portal';
		}
		log('Detected page "%s"', pageType);
	}

	function setupAutoQueueHotKey() {
		log('enable autoQueue hotkey');
		let lastKeyCode;
		const toggleQueue = (event) => {
			event?.stopPropagation();
			event?.preventDefault();
			setPreference('hAutoQueue', !Prefs['hAutoQueue']);
		};
		const onKeyDown = (event) => {
			if (lastKeyCode == event.code) return;
			lastKeyCode = event.code;
			if (event.code == 'Key' + Prefs.queueHotKey && event.altKey && !event.shiftKey && !event.ctrlKey)
				toggleQueue(event);
		};
		const onMouseUp = (event) => {
			if (Prefs.queueMouseGesture == 1 && event.button == 1) toggleQueue(event);
			if (Prefs.queueMouseGesture == 2 && event.button == 0 && event.buttons == 2) toggleQueue(event);
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', () => void (lastKeyCode = 0));
		window.addEventListener('mouseup', onMouseUp, { capture: true });
	}

})();

