/*global chrome Dialog Html*/
// eslint-disable-next-line no-unused-vars
const CF = {
	language: 'en',
	method: 'standard',
	unmatched: '',
	autoClose: true,
	forcePartial: false,
	autoConfirm: false,
	keepCollected: false,
	wait: Dialog(Dialog.WAIT),
	dialog: Dialog(),
	MBASIC: 'daf_mbasic',

	process(param) {
		const { language, method: collectMethod, unmatched, autoClose, wait, dialog, forcePartial, autoConfirm, keepCollected, MBASIC } = this;
		const MBASIC_QUERY = '#root[role=main] table[role=presentation] a[href]';

		let retries = 10;
		const hashById = {};
		const friends = [];
		let ulInactiveParent = null;
		let ulInactive = null;
		const liInactive = [];
		let container, unmatchedList, started, captureOneBlock, intervalHandler;
		const lastTitle = document.title;

		const getMessage = Dialog.getMessage;

		function cleanup() {
			document.title = lastTitle;
			if (intervalHandler) clearInterval(intervalHandler);
			intervalHandler = 0;
			wait.hide();
		}

		function addFriend(friend) {
			const old = hashById[friend.id];
			if (old) {
				if (friend.uri) old.uri = friend.uri;
				if (friend.disabled) old.disabled = true;
			} else {
				hashById[friend.id] = friend;
				friends.push(friend);
			}
		}

		function scrollWindow() {
			try {
				document.body.scrollIntoView(true);
				const el = document.getElementById('pagelet_dock');
				if (el) el.scrollIntoView();
				container.scrollIntoView(false);
			} catch (e) { }
		}

		function getContainer() {
			container = document.getElementById('pagelet_timeline_medley_friends');
			captureOneBlock = captureOneBlockOld;
			if (container) return;
			const img = document.querySelector('a > img[width="80"]');
			if (img) {
				container = img.parentElement.parentElement.parentElement.parentElement;
				captureOneBlock = captureOneBlockNew;
				return;
			}
			const i = document.querySelector('a > i.profpic');
			if (i) {
				container = i.parentElement.parentElement.parentElement.parentElement.parentElement;
				// Fix for Firefox
				if (!container.id && container.parentElement.id) container = container.parentElement;
				captureOneBlock = captureOneBlockMobile;
				return;
			}
		}

		function collect() {
			Dialog.language = language;
			wait.show();
			intervalHandler = setInterval(function () {
				getContainer();
				if (container) {
					cleanup();
					started = Date.now();
					if (collectMethod == 'standard' || collectMethod == 'unmatched') collectStandard();
					return;
				} else if (document.querySelector(MBASIC_QUERY)) {
					cleanup();
					collectMBasic({ started: Date.now(), count: 0, forcePartial });
				} else if (retries > 0) {
					retries--;
					wait.setText(retries);
					scrollWindow();
				} else {
					cleanup();
					dialog.show({
						text: getMessage('friendship_collecterror'),
						style: [Dialog.OK, Dialog.CRITICAL]
					});
				}
			}, 1000);
		}

		function formatTime(milliseconds) {
			let val = Math.round(milliseconds / 1000);
			const ss = val % 60;
			val = (val - ss) / 60;
			const mm = val % 60;
			val = (val - mm) / 60;
			const hh = val;
			const n2 = v => v < 10 ? '0' + v : v;
			return `${n2(hh)}:${n2(mm)}:${n2(ss)}`;
		}

		function getStatInfo(count, addTime) {
			return getMessage('friendship_collectstat', count) + (addTime ? '\n(' + formatTime(Date.now() - started) + ')' : '');
		}

		function sendFriends(partial) {
			const viewDisabled = () => { try { ulInactive.firstElementChild.scrollIntoView({ block: 'center' }); } catch (e) { } };
			wait.setText(document.title = getStatInfo(friends.length, true));
			const close = autoClose && !ulInactive;
			chrome.runtime.sendMessage({
				action: 'friendsCaptured',
				data: collectMethod == 'unmatched' ? null : friends,
				close, partial
			});
			Array.from(container.querySelectorAll('.to-be-removed')).forEach(el => el.remove());
			const showDisabled = () => {
				if (ulInactive) {
					if (ulInactive !== container) {
						while (ulInactive.firstChild) ulInactive.firstChild.remove();
						ulInactiveParent.appendChild(ulInactive);
					}
					liInactive.forEach(li => ulInactive.appendChild(li));
					viewDisabled();
					dialog.show({
						text: getMessage(collectMethod == 'unmatched' ? 'friendship_unmatchedaccountsdetected' :
							'friendship_disabledaccountsdetected') + '\n' + getMessage('friendship_unfriendinfo'),
						style: [Dialog.OK]
					}, viewDisabled);
				}
			};
			cleanup();
			if (autoClose) return showDisabled();
			let text = getStatInfo(friends.length);
			text += '\n\n' + getMessage('friendship_manualhelp', getMessage('tab_friendship'), getMessage('friendship_collectfriends'), getMessage('friendship_collectmatch'));
			dialog.show({ text, style: [Dialog.OK] }, showDisabled);
		}

		function getId(d) {
			let i = d.indexOf('?id=');
			if (i < 0) return null;
			d = d.substr(i + 4);
			i = d.indexOf('&');
			return i > 0 ? d.substr(0, i) : d;
		}

		function getFriendUri(uri) {
			let i;
			if ((i = uri.indexOf('profile.php?id=')) >= 0) {
				if ((i = uri.indexOf('&', i)) >= 0) uri = uri.substr(0, i);
			} else if ((i = uri.indexOf('?')) >= 0) uri = uri.substr(0, i);
			return uri.replace(/\/\/m(basic)?\./, '//www.');
		}

		function getFriendIdFromUri(uri) {
			return uri.substring(uri.lastIndexOf('/'));
		}

		function captureOneBlockOld() {
			let count = 0;
			const ul = container && container.getElementsByClassName('uiList')[0];
			if (!ul) return -1;
			for (const li of Array.from(ul.getElementsByTagName('li'))) {
				for (const item of Array.from(li.getElementsByTagName('a'))) {
					const name = item.textContent;
					if (name == '') continue;
					let id, d, uri;
					let add = false, keep = false, disabled = false;
					if ((d = item.getAttribute('data-hovercard')) && d.indexOf('user.php?id=') >= 0 && (id = getId(d))) {
						uri = getFriendUri(item.href);
						add = true;
						keep = unmatchedList.includes(id);
					} else if ((d = item.getAttribute('ajaxify')) && d.indexOf('/inactive/') >= 0 && (id = getId(d))) {
						add = keep = disabled = true;
					}
					if (add) {
						count++;
						const data = { id, name, uri };
						const img = li.querySelector('a img');
						if (img) data.img = img.src;
						if (disabled) data.disabled = true;
						addFriend(data);
					}
					if (keep) {
						if (!ulInactive) {
							ulInactiveParent = ul.parentNode;
							ulInactive = ul;
						}
						liInactive.push(li);
					}
				}
			}
			ul.parentNode.removeChild(ul);
			return count;
		}

		function captureOneBlockNew() {
			let count = 0;
			const items = Array.from(container.querySelectorAll('a > img[width="80"]:not(.collected)'));
			if (items.length == 0) return -1;
			// Detect if a disabled account exists
			if (!ulInactive && container.querySelector('div > img[width="80"]')) ulInactive = container;
			for (const item of items) {
				item.classList.add('collected');
				let keep = false;
				const uri = getFriendUri(item.parentElement.href);
				const name = item.parentElement.parentElement.nextElementSibling.firstElementChild.textContent;
				const id = getFriendIdFromUri(uri);
				const img = item.src;
				count++;
				addFriend({ id, name, uri, img });
				keep = unmatchedList.includes(id);
				const node = item.parentElement.parentElement.parentElement;
				if (keep) ulInactive = container;
				else if (!keepCollected) node.classList.add('to-be-removed');
			}
			return count;
		}

		function captureOneBlockMobile() {
			let count = 0;
			const items = Array.from(container.querySelectorAll('a > i.profpic:not(.collected)'));
			if (items.length == 0) return -1;
			// Detect if a disabled account exists
			// if (!ulInactive && container.querySelector('div > img[width="80"]')) ulInactive = container;
			for (const item of items) {
				item.classList.add('collected');
				let keep = false;
				const uri = getFriendUri(item.parentElement.href);
				const a = item.parentElement.parentElement.nextElementSibling.querySelector('a');
				const name = a && a.href == item.parentElement.href ? a.textContent : '';
				let id = getFriendIdFromUri(uri);
				if (!id && !name) continue;
				id = id || '#' + name;
				const img = item.style.backgroundImage.replace(/url\("([^")]+)"\)/, '$1');
				count++;
				const data = { id, name, uri, img };
				const disabled = !uri;
				if (disabled) data.disabled = true;
				addFriend(data);
				keep = disabled || unmatchedList.includes(id);
				const node = item.parentElement.parentElement.parentElement;
				if (keep) ulInactive = container;
				else if (!forcePartial) node.classList.add('to-be-removed');
			}
			return count;
		}

		function collectMBasic(info) {
			started = info.started;
			wait.setText(document.title = getStatInfo(info.count, true));
			const items = Array.from(document.querySelectorAll(MBASIC_QUERY));
			for (const item of items) {
				const uri = getFriendUri(item.href);
				const name = item.textContent;
				let id = getFriendIdFromUri(uri);
				if (!id && !name) continue;
				id = id || '#' + name;
				const img = item.parentElement.previousElementSibling.querySelector('img').src;
				info.count++;
				const data = { id, name, uri, img };
				const disabled = !uri;
				if (disabled) data.disabled = true;
				addFriend(data);
			}
			wait.setText(document.title = getStatInfo(info.count, true));
			const a = document.querySelector('#m_more_friends a');
			const forceAnalyze = !a && !info.forcePartial;
			if (friends.length) chrome.runtime.sendMessage({ action: 'friendsCaptured', data: friends, close: forceAnalyze, partial: true, forceAnalyze });
			if (a) {
				sessionStorage.setItem(MBASIC, JSON.stringify(info));
				a.click();
			} else {
				sessionStorage.removeItem(MBASIC);
				wait.hide();
				let text = getStatInfo(info.count);
				text += '\n\n' + getMessage('friendship_manualhelp', getMessage('tab_friendship'), getMessage('friendship_collectfriends'), getMessage('friendship_collectmatch'));
				dialog.show({ text, style: [Dialog.OK] });
			}
		}

		function collectStandard() {
			const maxCount = autoConfirm ? 10 : 20;
			let countStop = 0, isConfirming = false;
			unmatchedList = unmatched.split(',');
			intervalHandler = setInterval(capture, 500);
			function capture() {
				wait.setText(getStatInfo(friends.length, true));
				const num = captureOneBlock();
				if (num >= 0) {
					countStop = 0;
					if (isConfirming) {
						isConfirming = false;
						dialog.hide();
					}
					wait.setText(document.title = getStatInfo(friends.length, true));
				} else {
					countStop++;
					// if the connection is slow, we may want to try a bit more
					if (autoConfirm && countStop > 6) {
						cleanup();
						sendFriends(true);
					} else if (countStop > 20 && !isConfirming) {
						isConfirming = true;
						let html = '';
						html += Html.br`<span>${getMessage('friendship_confirmcollect')}</span>`;
						html += Html`<button class="DAF-on-footer" data-method="partial">${getMessage('friendship_partial')}</button>`;
						dialog.show({
							title: getStatInfo(friends.length), html, auto: Dialog.NO, timeout: 30, style: [Dialog.YES, Dialog.NO, !autoClose && Dialog.CANCEL]
						}, function (method) {
							isConfirming = false;
							const partial = method == 'partial';
							if (method == Dialog.YES || partial) {
								cleanup();
								sendFriends(partial);
							} else if (method == Dialog.CANCEL) {
								cleanup();
							} else if (method == Dialog.NO) {
								countStop = 0;
							}
						});
					}
				}
				scrollWindow();
			}
		}

		if (param === MBASIC) {
			const mbasic = sessionStorage.getItem(MBASIC);
			if (mbasic) collectMBasic(JSON.parse(mbasic));
		} else collect();
	}
};