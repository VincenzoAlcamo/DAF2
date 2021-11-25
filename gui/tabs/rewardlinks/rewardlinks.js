/*global bgp gui SmartTable Dialog Html Locale*/
export default {
	init, update, getState, setState, onPrefChange,
	actions: {
		'rewards_update': function () {
			update();
			clickNextButton();
		}
	},
	requires: ['materials', 'xp'],
	events: {
		convert: update,
		autoclose: () => gui.setPreference('rewardsClose', inputs.autoclose.checked),
		autoclick: clickNextButton,
		background: saveState,
		add, short, removeselected, removeold, summary, pixel
	}
};

const SECONDS_IN_A_DAY = 86400;
const TAG_CLICKANYWAY = 'clickanyway';

let tab, container, inputs, smartTable, items, clearStatusHandler, numTotal, numToCollect;
const materialImageCache = {};
const clicked = {};
let firstTime = true;
let shorten;
let lastClickedTime, nextClickHandler;

//#region LINK HELPER FUNCTIONS
const LinkData = (function () {
	const reLink1 = /https?:\/\/l\.facebook\.com\/l.php\?u=([^&\s]+)(&|\s|$)/g;
	const reLink2 = /https?:\/\/diggysadventure\.com\/miner\/wallpost_link.php\S*[?&]url=([^&\s]+)(&|\s|$)/g;
	const reFacebook = /https?:\/\/apps\.facebook\.com\/diggysadventure\/wallpost\.php\?wp_id=(\d+)&fb_type=(standard|portal)&wp_sig=([0-9a-z]+)/g;
	const rePortal = /https?:\/\/portal\.pixelfederation\.com\/(([^/]+\/)?gift|wallpost)\/diggysadventure\?params=(([0-9a-zA-Z\-_]|%2B|%2F)+(%3D){0,2})/g;

	function getLinkData(href) {
		const result = [];
		const hash = {};
		let match, data;

		function getObj(id, typ, sig) {
			if (id in hash) return null;
			hash[id] = true;
			return {
				id: id,
				typ: typ,
				sig: sig
			};
		}
		const urls = [href];
		href.replace(reLink1, (a, b) => {
			const url = decodeURIComponent(b);
			urls.push(url);
			url.replace(reLink2, (a, b) => urls.push(decodeURIComponent(b)));
		});
		href.replace(reLink2, (a, b) => urls.push(decodeURIComponent(b)));
		href = urls.join(' ');
		if (href.indexOf('://apps.facebook.com/') > 0) {
			reFacebook.lastIndex = 0;
			while ((match = reFacebook.exec(href))) {
				data = getObj(match[1], match[2], match[3]);
				if (data) result.push(data);
			}
		}
		if (href.indexOf('://portal.pixelfederation.com/') > 0) {
			rePortal.lastIndex = 0;
			while ((match = rePortal.exec(href))) {
				try {
					const params = decodeURIComponent(match[3]).replace(/-/g, '+').replace(/_/g, '/');
					const payload = atob(params);
					const json = JSON.parse(payload);
					if (json.wp_id && json.fb_type && json.wp_sig) {
						data = getObj(json.wp_id, json.fb_type, json.wp_sig);
						if (data) result.push(data);
					}
				} catch (e) { }
			}
		}
		return result;
	}

	function getLink(data, convert = 0) {
		if ((data.typ == 'portal' && convert == 0) || convert == 2) {
			const json = JSON.stringify({
				action: 'wallpost',
				wp_id: data.id,
				fb_type: data.typ,
				wp_sig: data.sig
			});
			return 'https://portal.pixelfederation.com/wallpost/diggysadventure?params=' + encodeURIComponent(btoa(json));
		}
		const url = 'https://apps.facebook.com/diggysadventure/wallpost.php?wp_id=' + encodeURIComponent(data.id) + '&fb_type=' + encodeURIComponent(data.typ) + '&wp_sig=' + encodeURIComponent(data.sig);
		return convert == 1 ? url : 'https://diggysadventure.com/miner/wallpost_link.php?url=' + encodeURIComponent(url);
	}

	const separators = ['.', ')', '-'];
	const prefixes = ['1', '0', 'l', 'u'];
	function optionsToString(options) {
		const obj = options || {}, prefix = +obj.prefix;
		return [
			['k', 'o', '', 'f'][+obj.convert] || '', +obj.sort == 1 ? 'a' : +obj.sort == 2 && 'd', prefix > 0 && prefix <= prefixes.length && prefixes[prefix - 1],
			+obj.newline && 'n', !+obj.addspace && 't', separators.indexOf(obj.separator) >= 0 && obj.separator
		].filter(v => v).join('');
	}

	function stringToOptions(text) {
		text = String(text || '').toLowerCase();
		const has = (c) => text.indexOf(c) >= 0;
		return {
			convert: has('o') ? 1 : (has('f') ? 3 : (has('k') ? 0 : 2)), sort: has('a') ? 1 : (has('d') ? 2 : 0), prefix: prefixes.findIndex(has) + 1,
			separator: separators.find(has) || '', newline: has('n'), addspace: !has('t')
		};
	}

	function format(arr, options) {
		if (typeof options === 'string') options = stringToOptions(options);
		if (options.sort) arr.sort((a, b) => +a.id - +b.id);
		if (options.sort == 2) arr.reverse();
		const suffix = options.newline ? '\n' : '';
		const padLength = options.prefix == 2 ? Math.max(1, Math.floor(Math.log10(arr.length))) + 1 : 1;
		arr = arr.map((item, index) => {
			let prefix = '';
			const text = getLink(item, options.convert);
			if (options.prefix == 3 || options.prefix == 4) {
				let s = '';
				for (; ;) {
					s = String.fromCharCode(65 + index % 26) + s;
					index = Math.floor(index / 26) - 1;
					if (index < 0) break;
				}
				if (options.prefix == 3) s = s.toLowerCase();
				prefix += s;
			} else if (options.prefix) {
				prefix += (index + 1).toString().padStart(padLength, '0');
			}
			if (options.separator) prefix += options.separator;
			if (prefix && (options.addspace || prefix.match(/[a-z]$/i))) prefix += ' ';
			return prefix + text + suffix;
		});
		return arr.join('\n');
	}

	return { getLinkData, getLink, format, optionsToString, stringToOptions };
})();
//#endregion

function init() {
	tab = this;
	({ container, inputs } = tab);

	smartTable = new SmartTable(container.querySelector('.rewardlinks_data'));
	smartTable.onSort = update;
	smartTable.table.addEventListener('click', onClickTable, true);
	smartTable.table.addEventListener('error', onErrorImg, true);

	container.addEventListener('paste', onPaste);
	container.addEventListener('copy', onCopy);
	container.addEventListener('cut', onCut);
	document.body.addEventListener('keydown', onKeydown);
}

function onPrefChange(changes) {
	if (changes.rewardsClose) {
		const autoClose = changes.rewardsClose.newValue != false;
		inputs.autoclose.checked = autoClose;
		inputs.autoclick.disabled = !autoClose;
	}
}

const isValidEvent = () => gui.isValidEventForTab('rewardlinks');
function onPaste(event) {
	if (!isValidEvent()) return;
	const clipboard = event.clipboardData || window.clipboardData;
	if (!clipboard) return;
	const pasted = clipboard.getData('text');
	const numAdded = bgp.Data.addRewardLinks(LinkData.getLinkData(pasted));
	gui.toast.show({ text: gui.getMessage(numAdded ? 'linkgrabber_added' : 'rewardlinks_nolinksadded', numAdded) });
	event.preventDefault();
}
function onCopy() {
	if (!isValidEvent()) return;
	const state = getState();
	const conversion = state.convert == 'facebook' ? 1 : (state.convert == 'portal' ? 2 : 0);
	const rewards = Object.values(items).filter(item => item.row.classList.contains('selected')).map(reward => LinkData.getLink(reward, conversion));
	if (rewards.length) copyToClipboard(rewards.join('\n') + '\n');
	Dialog(Dialog.TOAST).show({ text: gui.getMessage('linkgrabber_copied', rewards.length) });
}
function onCut() {
	if (!isValidEvent()) return;
	removeselected();
}
function onKeydown(event) {
	if (!isValidEvent()) return;
	const key = event.which || event.keyCode;
	if (event.ctrlKey && !event.altKey && !event.shiftKey) {
		if (key == 67) onCopy();
		// Paste does not work
		// if (key == 86) onPaste(event);
		if (key == 88) onCut();
	}
	if (!event.ctrlKey && !event.altKey && !event.shiftKey && key == 46) onCut();
}

function copyToClipboard(str, mimeType = 'text/plain') {
	if (copyToClipboard.flag) return;
	function oncopy(event) {
		event.clipboardData.setData(mimeType, str);
		event.preventDefault();
	}
	try {
		copyToClipboard.flag = true;
		document.addEventListener('copy', oncopy);
		document.execCommand('copy', false, null);
		document.removeEventListener('copy', oncopy);
	} finally {
		copyToClipboard.flag = false;
	}
}

function onErrorImg(event) {
	if (event.target && event.target.tagName == 'IMG') {
		event.target.src = '/img/gui/anon.gif';
	}
}

function setShorten(value) {
	gui.setPreference('shorten', shorten = value);
}

function getState() {
	return {
		convert: inputs.convert.value,
		background: inputs.background.checked,
		shorten,
		sort: gui.getSortState(smartTable, 'id')
	};
}

function setState(state) {
	state.convert = gui.setSelectState(inputs.convert, state.convert);
	inputs.background.checked = !!state['background'];
	setShorten(LinkData.optionsToString(LinkData.stringToOptions(state.shorten)));
	gui.setSortState(state.sort, smartTable, 'id');
	smartTable.setSortInfo();
}

function saveState() {
	gui.updateTabState(tab);
}

function add() {
	gui.dialog.show({
		title: gui.getMessage('rewardlinks_addlinks'),
		html: Html.br`${gui.getMessage('rewardlinks_pasteadd', gui.getMessage('dialog_confirm'))}<br/><textarea cols="60" rows="8" data-name="links"></textarea>`,
		defaultButton: 'links',
		style: [Dialog.CONFIRM, Dialog.CANCEL]
	}, function (method, params) {
		if (method == Dialog.CONFIRM) {
			const numAdded = bgp.Data.addRewardLinks(LinkData.getLinkData(params.links));
			if (numAdded == 0) gui.toast.show({ text: gui.getMessage('rewardlinks_nolinksadded') });
		}
	});
}

function short() {
	gui.dialog.show({
		title: gui.getMessage('rewardlinks_shortenlinks'),
		html: Html.br`
<table class="daf-table rewardlinks_options">
<thead><tr><th colspan="4">${gui.getMessage('tab_options')}</th></tr></thead>
<tbody class="row-coloring">
<tr><td class="no_right_border label">${gui.getMessage('rewardlinks_convert')}</td><td><select data-method="input" name="convert">
<option value="0">${gui.getMessage('rewardlinks_noconversion')}</option>
<option value="2">Portal</option>
<option value="3">Facebook</option>
</select></td><td class="no_right_border label">${gui.getMessage('options_linkgrabsort')}</td><td><select data-method="input" name="sort">
<option value="0">${gui.getMessage('options_sort_none')}</option>
<option value="1">${gui.getMessage('options_sort_ascending')}</option>
<option value="2">${gui.getMessage('options_sort_descending')}</option>
</select></td></tr>
<tr><td class="no_right_border label">${gui.getMessage('rewardlinks_prefix')}</td><td><select data-method="input" data-name="prefix">
<option value="0"></option>
<option value="1">1</option>
<option value="2">01</option>
<option value="3">a</option>
<option value="4">A</option>
</select><select data-method="input" name="separator">
<option value=""></option>
<option value=".">.</option>
<option value=")">)</option>
<option value="-">-</option>
</select> <label>${gui.getMessage('rewardlinks_addspace')} <input type="checkbox" name="addspace" data-method="input"></label></td>
<td class="no_right_border label"><label for="rl_newline">${gui.getMessage('rewardlinks_newline')}</label></td><td><input type="checkbox" name="newline" id="rl_newline" data-method="input"></td></tr>
</tbody></table>
<table class="daf-table" style="margin-top:2px">
<thead><tr><th>${gui.getMessage('rewardlinks_shortenlinks_info1')}</th></tr></thead>
<tbody class="row-coloring"><tr><td style="text-align:center">
<textarea data-method="input" cols="60" rows="5" data-name="links" style="padding:2px"></textarea>
</td></tr></tbody>
<thead><tr><th>${gui.getMessage('rewardlinks_shortenlinks_info2')}</th></tr></thead>
<tbody class="row-coloring"><tr><td style="text-align:center">
<textarea readonly cols="60" rows="6" name="result" style="padding:2px"></textarea>
</td></tr></tbody>
</table>
`,
		defaultButton: 'links',
		style: [Dialog.CLOSE, Dialog.WIDEST, Dialog.AUTORUN]
	}, function (method, params) {
		if (method == Dialog.AUTORUN) {
			params = LinkData.stringToOptions(shorten);
			gui.dialog.element.querySelector('[name=convert]').value = params.convert;
			gui.dialog.element.querySelector('[name=sort]').value = params.sort;
			gui.dialog.element.querySelector('[data-name=prefix]').value = params.prefix;
			gui.dialog.element.querySelector('[name=addspace]').checked = params.addspace;
			gui.dialog.element.querySelector('[name=separator]').value = params.separator;
			gui.dialog.element.querySelector('[name=newline]').checked = params.newline;
		}
		if (method == 'input') {
			params.newline = params.newline == 'on';
			params.addspace = params.addspace == 'on';
			const newShorten = LinkData.optionsToString(params);
			if (newShorten != shorten) {
				setShorten(newShorten);
				gui.updateTabState(tab);
			}
			gui.dialog.element.querySelector('[name=result]').value = LinkData.format(LinkData.getLinkData(params.links), shorten);
		}
	});
}

function removeselected() {
	const rewards = Object.values(items).filter(item => item.row.classList.contains('selected'));
	removeLinks(gui.getMessage('rewardlinks_removeselected'), rewards);
}

function removeold() {
	const title = gui.getMessage('rewardlinks_removelinks');
	let days = parseInt(gui.getPreference('rewardsRemoveDays'));
	days = Math.max(0, Math.min(bgp.Data.REWARDLINKS_REMOVE_DAYS - 1, isFinite(days) ? days : bgp.Data.REWARDLINKS_VALIDITY_DAYS));
	let htm = '';
	htm += Html.br`<select name="days">`;
	for (let i = 0; i <= bgp.Data.REWARDLINKS_REMOVE_DAYS - 1; i++) {
		htm += Html.br`<option value="${i}" ${i == days ? ' selected' : ''}>${Locale.formatNumber(i)}</option>`;
	}
	htm += Html.br`</select>`;
	htm = String(Html.br`${gui.getMessage('rewardlinks_removelinksdays', bgp.Data.REWARDLINKS_REMOVE_DAYS)}`).replace('@DAYS@', htm);
	gui.dialog.show({
		title: title,
		html: htm,
		style: [Dialog.CONFIRM, Dialog.CANCEL]
	}, function (method, params) {
		if (method != Dialog.CONFIRM) return;
		const days = parseInt(params.days);
		if (days >= 0) {
			gui.setPreference('rewardsRemoveDays', days);
			const now = gui.getUnixTime();
			const expiryThreshold = now - bgp.Data.REWARDLINKS_VALIDITY_DAYS * SECONDS_IN_A_DAY;
			const checkThreshold = now - days * SECONDS_IN_A_DAY;
			let rewards = Object.values(items);
			rewards = rewards.filter(reward => Math.max(reward.adt, reward.cdt || 0) <= checkThreshold && (reward.adt <= expiryThreshold || (reward.cmt || 0) != 0));
			removeLinks(title, rewards);
		}
	});
}

function removeLinks(title, rewards) {
	if (rewards.length == 0) {
		gui.dialog.show({
			title: title,
			text: gui.getMessage('rewardlinks_removenone'),
			style: [Dialog.OK, Dialog.CRITICAL]
		});
	} else {
		gui.dialog.show({
			title: title,
			text: gui.getMessage('rewardlinks_removeconfirm', [rewards.length]),
			style: [Dialog.CONFIRM, Dialog.CANCEL]
		}, function (method) {
			if (method != Dialog.CONFIRM) return;
			// Sends only the id
			rewards = rewards.map(reward => {
				return {
					id: reward.id
				};
			});
			bgp.Data.removeRewardLink(rewards);
			update();
		});
	}
}

let lastClickedRow = null;
function onClickTable(event) {
	const target = event.target;
	if (!target) return true;

	if (target.tagName == 'INPUT') {
		const flag = target.checked;
		const row = target.parentNode.parentNode;
		let rows = [row];
		if (event.ctrlKey || event.altKey) {
			rows = Array.from(smartTable.table.querySelectorAll('tr[data-id]'));
			if (event.altKey) {
				const html = row.cells[5].innerHTML;
				rows = rows.filter(row => row.cells[5].innerHTML == html);
			}
		}
		if (event.shiftKey) {
			if (!event.ctrlKey && !event.altKey && lastClickedRow && lastClickedRow.parentNode === row.parentNode) {
				const baseIndex = row.parentNode.rows[0].rowIndex;
				const [startIndex, endIndex] = [lastClickedRow.rowIndex, row.rowIndex].sort(gui.sortNumberAscending);
				rows = Array.from(row.parentNode.rows).slice(startIndex - baseIndex, endIndex - baseIndex + 1);
			}
		} else {
			lastClickedRow = row;
		}
		for (const row of rows) setInputChecked(row.querySelector('input'), flag);
		return;
	}
	if (!target.classList.contains('reward')) return true;

	const reasons = [];

	function pushReason(title, text, action, critical = false) {
		reasons.push({ title, text, critical, action });
	}

	function showNextReason() {
		const reason = reasons.shift();
		if (!reason) {
			target.setAttribute(TAG_CLICKANYWAY, '1');
			target.click();
			return;
		}
		let htm = Html.br(reason.text + '\n\n' + gui.getMessage('rewardlinks_collectanyway'));
		if (reason.action) {
			htm += Html.br`<br><table style="margin-top:16px"><tr><td><button value="reset">${gui.getMessage('rewardlinks_reset')}</button></td><td>`;
			htm += Html.br`${gui.getMessage('rewardlinks_' + reason.action)}`;
			htm += Html.br`</td></tr></table>`;
		}
		gui.dialog.show({
			title: reason.title,
			html: htm,
			defaultButton: Dialog.CANCEL,
			style: [Dialog.CRITICAL, Dialog.CONFIRM, Dialog.CANCEL, 'RESET']
		}, function (method, _params) {
			if (method == 'reset') {
				const rewardLinksData = bgp.Data.rewardLinksData;
				if (reason.action == 'resetcount') rewardLinksData.count = rewardLinksData.next = 0;
				if (reason.action == 'resetexpired') rewardLinksData.expired = 0;
				bgp.Data.saveRewardLink(rewardLinksData);
				update();
			}
			if (method == Dialog.CONFIRM || method == 'reset') showNextReason();
			else inputs.autoclick.checked = false;
		});
	}

	const row = target.parentNode.parentNode;
	const rewardId = row.getAttribute('data-id');
	const reward = items[rewardId];
	if (!reward) return;
	const now = gui.getUnixTime();
	let countClicked;
	if (event.ctrlKey) inputs.autoclick.checked = true;
	const clickAnyway = target.hasAttribute(TAG_CLICKANYWAY);
	target.removeAttribute(TAG_CLICKANYWAY);
	if (!clickAnyway) {
		if (reward.cmt == -2 || reward.cmt > 0) {
			pushReason(gui.getMessage('rewardlinks_collected'), gui.getMessage('rewardlinks_infocollected'));
		} else if (reward.cmt == -3) {
			pushReason(gui.getMessage('rewardlinks_maxreached'), gui.getMessage('rewardlinks_infomaxreached', bgp.Data.REWARDLINKS_DAILY_LIMIT), true);
		} else if (reward.cmt == -1) {
			pushReason(gui.getMessage('rewardlinks_expired'), gui.getMessage('rewardlinks_infoexpired', bgp.Data.REWARDLINKS_VALIDITY_DAYS));
		} else if (reward.cmt == -4) {
			pushReason(gui.getMessage('rewardlinks_noself'), gui.getMessage('rewardlinks_infonoself'));
		} else if (reward.cmt == -5) {
			pushReason(gui.getMessage('rewardlinks_broken'), gui.getMessage('rewardlinks_infobroken'));
		}
		if (bgp.Data.rewardLinksData.next > now) {
			pushReason(gui.getMessage('rewardlinks_maxreached'), gui.getMessage('rewardlinks_allcollected') + '\n' + gui.getMessage('rewardlinks_nexttime', Locale.formatDateTime(bgp.Data.rewardLinksData.next)), 'resetcount', true);
		}
		if (+reward.id <= bgp.Data.rewardLinksData.expired) {
			pushReason(gui.getMessage('rewardlinks_probablyexpired'), gui.getMessage('rewardlinks_infoprobablyexpired'), 'resetexpired');
		}
		if ((countClicked = Object.keys(clicked).length) > 0 && countClicked + bgp.Data.rewardLinksData.count >= bgp.Data.REWARDLINKS_DAILY_LIMIT) {
			pushReason(gui.getMessage('rewardlinks_maxreached'), gui.getMessage('rewardlinks_infomayexceedlimit'), null, true);
		}
		if (reasons.length) {
			event.preventDefault();
			// Sort by critical descending
			reasons.sort((a, b) => (a.critical ? 1 : 0) - (b.critical ? 1 : 0)).reverse();
			if (inputs.autoclick.checked && !inputs.autoclick.disabled && !reasons[0].critical) {
				// Clear checkbox and proceed with next link
				setInputChecked(target.parentNode.parentNode.querySelector('input'), false);
				setTimeout(clickNextButton, 0);
				return false;
			}
			showNextReason();
			return false;
		}
	}
	reward.status = 1;
	delete reward.time;
	reward.row.setAttribute('data-status', reward.status);
	lastClickedTime = target.href.indexOf('.facebook.') >= 0 ? now : 0;
	clicked[reward.id] = now;
	// Open link in background?
	if (getState().background) {
		event.preventDefault();
		bgp.Tab.open(target.href, true);
		return false;
	}
	return true;
}

function materialHTML(materialId) {
	if (!(materialId in materialImageCache)) {
		if (materialId > 0) {
			const url = gui.getObjectImage('material', materialId, true);
			return materialImageCache[materialId] = Html.br`<img src="${url}" width="32" height="32" class="outlined">${gui.getObjectName('material', materialId)}`;
		}
		let text;
		if (materialId == -1) text = gui.getMessage('rewardlinks_expired');
		else if (materialId == -2) text = gui.getMessage('rewardlinks_collected');
		else if (materialId == -3) text = gui.getMessage('rewardlinks_maxreached');
		else if (materialId == -4) text = gui.getMessage('rewardlinks_noself');
		else if (materialId == -5) text = gui.getMessage('rewardlinks_broken');
		else if (materialId == -6) text = gui.getMessage('rewardlinks_probablyexpired');
		else return materialImageCache[materialId] = '';
		return materialImageCache[materialId] = Html.br`<img src="/img/gui/q-hard.png"/><span class="alert">${text}</span>`;
	}
	return materialImageCache[materialId];
}

function setInputChecked(input, checked) {
	input.checked = checked;
	input.parentNode.parentNode.classList.toggle('selected', checked);
}

function clickNextButton() {
	if (!inputs.autoclick.checked || inputs.autoclick.disabled || smartTable.table.querySelector('tr[data-status="1"]')) return;
	let button = null;
	while (!button) {
		const input = smartTable.table.querySelector('input[type=checkbox]:checked');
		if (!input) break;
		const rewardId = input.parentNode.parentNode.getAttribute('data-id');
		const reward = items[rewardId];
		if (!reward || reward.cdt) setInputChecked(input, false);
		else button = input.parentNode.nextElementSibling.firstElementChild;
	}
	if (button) {
		const DELAY = 2;
		if (nextClickHandler) clearTimeout(nextClickHandler);
		const offset = gui.getUnixTime() - (lastClickedTime || 0);
		const timeout = (offset >= 0 && offset <= DELAY ? DELAY - offset : 0) * 1000;
		nextClickHandler = setTimeout(() => {
			nextClickHandler = 0;
			button.click();
		}, timeout);
	} else {
		inputs.autoclick.checked = false;
		gui.toast.show({ text: gui.getMessage('rewardlinks_autoclick_end'), style: [Dialog.CLOSE] });
	}
}

function update() {
	gui.updateTabState(tab);
	onPrefChange({ rewardsClose: { newValue: gui.getPreference('rewardsClose') } });

	const tbody = smartTable.tbody[0];
	const now = gui.getUnixTime();
	const state = getState();
	const conversion = state.convert == 'facebook' ? 1 : (state.convert == 'portal' ? 2 : 0);
	let numInserted = 0;
	let numUpdated = 0;
	const rewardLinksRecent = bgp.Data.rewardLinksRecent;

	numTotal = numToCollect = 0;

	if (!items) items = {};
	const oldItems = items;
	items = {};
	const expiredId = bgp.Data.rewardLinksData.expired || 0;
	for (const rewardLink of Object.values(bgp.Data.getRewardLinks())) {
		if (!rewardLink.cmt && rewardLink.id <= expiredId) rewardLink.cmt = -6;
		if (rewardLink.id in rewardLinksRecent) {
			delete clicked[rewardLink.id];
			delete rewardLinksRecent[rewardLink.id];
		}
		let item = oldItems[rewardLink.id];
		let status = 0;
		if (item) {
			let flagUpdated = false;
			delete oldItems[item.id];
			if (item.conversion != conversion) {
				item.conversion = conversion;
				item.row.cells[1].firstChild.href = LinkData.getLink(rewardLink, conversion);
			}
			if (item.cdt != rewardLink.cdt) {
				flagUpdated = true;
				item.cdt = rewardLink.cdt;
				item.row.cells[3].innerText = item.cdt ? Locale.formatDateTime(item.cdt) : '';
			}
			if (item.cmt != rewardLink.cmt) {
				flagUpdated = true;
				item.cmt = rewardLink.cmt;
				Html.set(item.row.cells[4], materialHTML(item.cmt));
				item.mtx = item.row.cells[4].textContent;
				if (item.cmt && item.cmt != -6) item.row.classList.add('collected');
			}
			const cnm = rewardLink.cnm || '';
			if (item.cid != rewardLink.cid || item.cnm != cnm || (item.cpi != rewardLink.cpi && rewardLink.cpi)) {
				flagUpdated = true;
				item.cid = rewardLink.cid;
				item.cpi = rewardLink.cpi;
				item.cnm = cnm;
				Html.set(item.row.cells[5], (item.cid || item.cpi) ? Html.br`<img src="${item.cpi || gui.getFBFriendAvatarUrl(item.cid)}"/>${item.cnm}` : '');
			}
			if (flagUpdated) status = 3;
		} else {
			item = Object.assign({}, rewardLink);
			item.cnm = item.cnm || '';
			item.conversion = conversion;
			let htm = '';
			htm += Html.br`<td><input type="checkbox" title="${gui.getMessage('gui_ctrlclick')}"></td><td><a class="reward" data-target="_blank" href="${LinkData.getLink(rewardLink, conversion)}">${item.id}</a></td><td>${Locale.formatDateTime(item.adt)}</td>`;
			htm += Html.br`<td>${item.cdt ? Locale.formatDateTime(item.cdt) : ''}</td>`;
			htm += Html.br`<td>${materialHTML(item.cmt)}</td>`;
			htm += Html.br`<td translate="no">`;
			if (item.cid || item.cpi) htm += Html.br`<img data-lazy="${item.cpi || gui.getFBFriendAvatarUrl(item.cid)}"/>${item.cnm}`;
			htm += `</td>`;
			item.row = Html.get('<tr>' + htm + '</tr>')[0];
			item.row.setAttribute('data-id', item.id);
			if (item.cmt && item.cmt != -6) item.row.classList.add('collected');
			item.mtx = item.row.cells[4].textContent;
			if (!firstTime) status = 2;
			// Ctrl-C, Ctrl-X do not get triggered on the container when a checkbox has focus so we have to add a listener for `keydown`
			// Ctrl-V never get triggered and we cannot simulate it since the clipboard is not accessible in that case
			// item.row.querySelector('input').addEventListener('keydown', keydown);
		}
		if (status && status != item.status) {
			item.status = status;
			item.time = item.time || now;
			item.row.setAttribute('data-status', item.status);
		}
		if (item.status == 2) numInserted++;
		if (item.status == 3) numUpdated++;
		items[item.id] = item;
		numTotal++;
		if (!item.cmt && !item.cdt) numToCollect++;
	}
	for (const item of Object.values(oldItems)) item.row.parentNode.removeChild(item.row);

	const getSortValueFunctions = {
		'owner': a => a.cnm || a.cid || '',
		'insert': a => a.adt,
		'collect': a => a.cdt || 0,
		'reward': a => a.mtx || '',
		'select': a => +a.row.classList.contains('selected'),
		'id': a => a.id
	};
	const sort = gui.getSortFunction(getSortValueFunctions, smartTable, 'id');
	const values = sort(Object.values(items));
	for (const item of values) {
		tbody.appendChild(item.row);
	}

	showStats();
	gui.collectLazyElements(smartTable.container);
	smartTable.syncLater();
	firstTime = false;

	const text = [];
	if (numInserted) text.push(gui.getMessage('rewardlinks_linksadded', numInserted));
	if (numUpdated) text.push(gui.getMessage('rewardlinks_linksupdated', numUpdated));
	if (text.length) {
		if (!clearStatusHandler) clearStatusHandler = setInterval(clearStatus, 1000);
		gui.toast.show({
			text: text.join('\n')
		});
	}
}

function clearStatus() {
	let count = 0;
	const threshold = gui.getUnixTime() - 10;
	for (const item of Object.values(items)) {
		if (item.time) {
			if (item.time <= threshold) {
				delete item.status;
				delete item.time;
				item.row.removeAttribute('data-status');
			} else {
				count++;
			}
		}
	}
	if (!count) {
		clearInterval(clearStatusHandler);
		clearStatusHandler = 0;
	}
}

function getLinksInLastDay() {
	let links = Object.values(bgp.Data.getRewardLinks()).filter(link => link.cdt && link.cmt > 0).sort((a, b) => b.cdt - a.cdt);
	const lastDay = links.length ? links[0].cdt - bgp.Data.REWARDLINKS_REFRESH_HOURS * 3600 : 0;
	links = links.filter(link => link.cdt > lastDay);
	const limit = bgp.Data.REWARDLINKS_DAILY_LIMIT;
	if (links.length > limit) links.length = limit;
	return links;
}

function summary() {
	const hash = {};
	getLinksInLastDay().forEach(link => {
		const arr = hash[link.cmt];
		if (arr) arr.push(link); else hash[link.cmt] = [link];
	});
	const NUMCOLUMNS = 2;
	let htm = Html`<table class="daf-table rewardlinks_summary">`;
	htm += Html`<thead><tr><th colspan="${NUMCOLUMNS * 2}">${gui.getMessage('rewardlinks_summaryinfo', Locale.formatNumber(bgp.Data.REWARDLINKS_REFRESH_HOURS))}</th></tr></thead>`;
	htm += Html`<tbody class="row-coloring">`;
	const naturalComparer = gui.getNaturalComparer();
	const xp = {};
	Object.keys(hash).forEach(id => xp[id] = gui.getXp('material', id));
	xp[1] = -Infinity;
	xp[2] = Infinity;
	let column = 0;
	Object.keys(hash).sort((a, b) => xp[b] - xp[a]).forEach((matId, index, keys) => {
		const arr = hash[matId];
		const nextMatId = keys[index + 1];
		const isLastInRow = nextMatId == 1 || nextMatId === undefined;
		const title = gui.getObjectName('material', matId);
		htm += Html`<td class="material"><img src="${gui.getObjectImage('material', matId, true)}" title="${title}" class="outlined">`;
		htm += Html`<span class="qty">${'\xd7 ' + Locale.formatNumber(arr.length)}</span>`;
		htm += Html`</td><td class="player"${isLastInRow && (NUMCOLUMNS - column) > 1 ? Html` colspan="${(NUMCOLUMNS - column) * 2 - 1}"` : ''}>`;
		arr.map(link => {
			const title = [];
			if (link.cnm) title.push(link.cnm);
			title.push(gui.getMessageAndValue('rewardlinks_id', link.id));
			const src = link.cpi || (link.cid ? gui.getFBFriendAvatarUrl(link.cid) : '') || '/img/gui/anon.gif';
			return {
				id: link.cnm + '\t' + src,
				src,
				title: title.join('\n')
			};
		}).sort((a, b) => naturalComparer(a.id, b.id)).forEach(item => {
			htm += Html`\n<img title="${item.title}" src="${item.src}">`;
		});
		htm += Html`</td>`;
		column = (column + 1) % NUMCOLUMNS;
		if (!column || isLastInRow) {
			htm += Html`</tr>`;
			column = 0;
		}
	});
	htm += Html`</tbody>`;
	htm += Html`</table>`;
	gui.dialog.show({ title: gui.getMessage('gui_summary'), html: htm, style: [Dialog.CLOSE, Dialog.WIDEST, Dialog.AUTORUN] }, method => {
		if (method == Dialog.AUTORUN) {
			const element = gui.dialog.element.querySelector('.DAF-md-content');
			const shot = Html.get(Html`<span class="screenshot"></span>`)[0];
			shot.style.marginLeft = '8px';
			element.querySelector('.DAF-md-title div').appendChild(shot);
			gui.setupScreenshot(element, 'summary_<date>');
			element.querySelector('.rewardlinks_summary').addEventListener('error', onErrorImg, true);
		}
	});
}

function showStats() {
	const now = gui.getUnixTime();
	let next = bgp.Data.rewardLinksData.next;
	const flagNext = next > now;
	let text;
	if (flagNext) {
		text = gui.getMessage('rewardlinks_allcollected') + ' ';
	} else {
		text = gui.getMessage('rewardlinks_countremaining', bgp.Data.REWARDLINKS_DAILY_LIMIT - bgp.Data.rewardLinksData.count);
		next = bgp.Data.rewardLinksData.first;
		if (next) next += bgp.Data.REWARDLINKS_REFRESH_HOURS * 3600;
	}
	const textNext = next > now ? gui.getMessage('rewardlinks_nexttime', Locale.formatDateTime(next)) : '';
	const element = container.querySelector('.stats');
	Html.set(element, Html(text + (flagNext ? textNext : '')));
	element.classList.toggle('wait', flagNext);
	Html.set(container.querySelector('.info'), Html.br(flagNext ? '' : textNext));

	text = gui.getMessage('rewardlinks_stats', Locale.formatNumber(numToCollect), Locale.formatNumber(numTotal));
	Array.from(smartTable.container.querySelectorAll('tfoot td')).forEach(cell => {
		cell.innerText = text;
	});
}

function getReward(reward) {
	if (!reward) return '';
	const type = reward.type;
	const oid = reward.object_id;
	const qty = +reward.amount;
	const url = gui.getObjectImage(type, oid, true);
	let title = gui.getObjectName(type, oid, 'event+building');
	const xp = gui.getXp(type, oid);
	if (xp) {
		const totXp = qty * xp;
		const textXp = ((xp == 1 || qty == 1) ? '' : Locale.formatNumber(qty) + ' \xd7 ' + Locale.formatNumber(xp) + ' = ') + Locale.formatNumber(totXp);
		title += '\n' + gui.getMessageAndValue(type == 'usable' ? 'gui_energy' : 'gui_xp', textXp);
	}
	const desc = bgp.Data.getObjectDesc(type, oid);
	if (desc) title += '\n' + gui.getWrappedText(desc);
	return Html`<div class="reward"><img src="${url}" class="outlined" title="${title}"></div>
        <div class="qty">${'\xd7 ' + Locale.formatNumber(+reward.amount)}</div>`;
}

async function pixel() {
	await bgp.Data.getFile('usables');
	await bgp.Data.getFile('tokens');
	await bgp.Data.getFile('events');
	const data = await bgp.Data.getFile('links');
	const now = Date.now();
	const items = Object.values(data)
		.map(item => {
			const end = new Date(item.end).getTime();
			const start = end - 30 * 86400000;
			return Object.assign({}, item, { start, end });
		})
		.filter(item => item.end > now)
		.sort((a, b) => a.end - b.end);
	let htm = '';
	htm += Html`<label class="with-margin">${gui.getMessage('gui_show')} <select name="show" data-method="show">`;
	htm += Html`<option value="0">Links not yet expired</option>`;
	htm += Html`<option value="1">Upcoming links</option>`;
	htm += Html`</select></label><div class="rewardlinks_pixel"></div>`;
	const getKey = reward => reward ? `${reward.type}_${reward.object_id}_${+reward.amount}` : '';
	gui.dialog.show({ html: htm, style: [Dialog.CLOSE, Dialog.WIDEST, Dialog.AUTORUN] }, (method, params) => {
		if (method == Dialog.AUTORUN || method == 'show') {
			let htm = '';
			htm += Html`<table class="daf-table">`;
			htm += Html`<thead><tr><th>${gui.getMessage('gui_date')}</th>`;
			const maxRid = gui.getMaxRegion();
			for (let rid = 1; rid <= maxRid; rid++) htm += Html`<th>${gui.getObjectName('region', rid)}</th>`;
			htm += Html`</tr></thead>`;
			htm += Html`<tbody class="row-coloring">`;
			htm += items.filter(item => params.show == 0 || item.start > now).map(item => {
				let s = Html`<tr><td><span class="from">${Locale.formatDate(item.start)}</span><span class="expires">(${Locale.formatDate(item.end)})</span></td>`;
				const rewardByRegion = [];
				let isSingle = true;
				const firstReward = item.reward[0], firstKey = getKey(firstReward);
				for (let rid = 1; rid <= maxRid; rid++) {
					const found = rewardByRegion[rid - 1] = item.reward.find(r => +r.region_id == rid);
					if (getKey(found) != firstKey) isSingle = false;
				}
				if (isSingle || (item.reward.length == 1 && +item.reward[0].region_id == 0)) {
					s += Html`<td colspan="${maxRid}">${getReward(firstReward)}</td>`;
				} else {
					s += rewardByRegion.map(reward => Html`<td>${getReward(reward)}</td>`).join('');
				}
				s += Html`</tr>`;
				return s;
			}).join('');
			htm += Html`<tbody>`;
			htm += Html`</table>`;
			Html.set(gui.dialog.element.querySelector('.rewardlinks_pixel'), htm);
		}
	});
}
