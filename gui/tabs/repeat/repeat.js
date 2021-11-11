/*global gui SmartTable Html Locale*/
export default {
	init, update, getState, setState, visibilityChange,
	requires: (function () {
		const requires = ['materials', 'map_filters', 'events', 'special_weeks'];
		for (let rid = gui.getMaxRegion(); rid >= 0; rid--) requires.push('locations_' + rid);
		return requires;
	})(),
	events: {
		search: refresh,
		select: refresh
	}
};

let tab, container, inputs, smartTable;
let selected = [];
let repeatables;
let swPostcards;
let refreshTimer = 0;

const ticked = Html.br`<img width="24" src="/img/gui/ticked.png">`;
const unticked = Html.br`<img width="24" src="/img/gui/unticked.png">`;

function init() {
	tab = this;
	({ container, inputs } = tab);

	smartTable = new SmartTable(container.querySelector('.data'));
	smartTable.onSort = refresh;
	smartTable.fixedHeader.parentNode.classList.add('repeat');
	smartTable.fixedFooter.parentNode.classList.add('repeat');
	smartTable.tbody[0].addEventListener('render', gui.getLazyRenderer(updateRow));
	smartTable.table.addEventListener('click', onClickTable, true);

	selected = gui.getArrayOfInt(gui.getPreference('repeatables'));
	// container.addEventListener('tooltip', onTooltip);
}

function update() {
	repeatables = {};

	// Find active events
	const activeEvents = {};
	const events = gui.getFile('events');
	const generator = gui.getGenerator();
	const eventData = generator.events || {};
	const eventsRegion = generator.events_region || {};
	const region = +generator.region;
	const now = gui.getUnixTime();
	for (const event of Object.values(events)) {
		if (!event.name_loc) continue;
		const eid = event.def_id;
		const edata = eventData[eid];
		let end = +event.end || 0;
		end = (edata && +edata.finished) || end;
		if (end > now) activeEvents[eid] = end;
	}

	// This will refresh the background page Repeatables
	const allRepeatables = gui.getRepeatables();

	const filters = Object.values(gui.getFile('map_filters')).filter(f => f.mobile_asset == 'materials').map(o => o.filter);
	for (let rid = region; rid >= 0; rid--) {
		const locations = Object.values(gui.getFile('locations_' + rid));
		for (const loc of locations) {
			const lid = +loc.def_id;
			if (!(lid in allRepeatables)) continue;
			let expire = 0;
			let eid = 0;
			if (rid > 0) {
				if (!filters.includes(loc.filter)) continue;
			} else {
				eid = +loc.event_id;
				expire = activeEvents[eid];
				if (!expire) continue;
			}
			const item = {};
			item.id = lid;
			item.name = gui.getString(loc.name_loc);
			item.rid = rid;
			item.eid = eid;
			item.region = item.rid + ',' + item.eid;
			item.expire = expire;
			item.cooldown = +loc.reset_cd;
			item.reset = +loc.reset_gems;
			item.xp = +loc.reward_exp;
			if (Array.isArray(loc.overrides)) {
				let rid = region;
				if (eid in eventsRegion) rid = +eventsRegion[eid];
				if (rid > region) rid = region;
				for (const ovr of loc.overrides) {
					if (+ovr.region_id == rid) item.xp = +ovr.override_reward_exp;
				}
			}
			item.gr_library = loc.gr_library;
			item.gr_clip = loc.gr_clip;
			item.mobile_asset = loc.mobile_asset;
			item.name_loc = loc.name_loc;
			item.rotation = allRepeatables[lid].rotation;
			repeatables[item.id] = item;
		}
	}
	// Create rows
	let htm = '';
	htm = Object.values(repeatables).map(item => Html`<tr data-id="${item.id}" height="40" data-lazy></tr>`).join('');
	const rows = Html.get(htm);
	rows.forEach(row => repeatables[row.getAttribute('data-id')].row = row);
	const specialWeeks = gui.getSpecialWeeks();
	swPostcards = specialWeeks.active.postcards;
	gui.showSpecialWeeks(container, [specialWeeks.active.refresh_drop, swPostcards]);
	storeSelected();
	refresh();
}

function getState() {
	return {
		show: inputs.show.value,
		ready: inputs.ready.value,
		search: inputs.search.value,
		sort: gui.getSortState(smartTable)
	};
}

function setState(state) {
	state.show = gui.setSelectState(inputs.show, state.show);
	state.ready = gui.setSelectState(inputs.ready, state.ready);
	inputs.search.value = state.search || '';
	if (state.selected) {
		selected = gui.getArrayOfInt(state.selected);
		storeSelected();
	}
	gui.setSortState(state.sort, smartTable, 'name');
}

function refresh() {
	gui.updateTabState(tab);

	const state = getState();
	const show = state.show;
	const not_ready = state.ready ? state.ready == 'no' : NaN;
	const fnSearch = gui.getSearchFilter(state.search);
	const now = gui.getUnixTime();
	calculateItem();

	function isVisible(item) {
		if (fnSearch && !fnSearch(item.name.toUpperCase())) return false;
		if (show == 'selected' && !item.selected) return false;
		if (not_ready == !(item.time > now)) return false;
		return true;
	}

	let items = Object.values(repeatables);
	const total = items.length;
	items = items.filter(isVisible);
	Array.from(container.querySelectorAll('.repeat tfoot td')).forEach(cell => {
		cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(total));
	});

	const sort = gui.getSortFunction(null, smartTable, 'name');
	items = sort(items);

	const tbody = smartTable.tbody[0];
	Html.set(tbody, '');
	items.forEach(item => tbody.appendChild(item.row));
	gui.collectLazyElements(tbody);
	smartTable.syncLater();
	refreshItems();
}

function clearRefreshTimer() {
	if (refreshTimer) { clearTimeout(refreshTimer); }
	refreshTimer = 0;
}

function refreshItems() {
	clearRefreshTimer();
	// Update items only when this is the current tab and the document is visible
	if (gui.getCurrentTab() !== tab || document.visibilityState != 'visible') { return; }
	const changedState = calculateItem(null, true);
	const now = gui.getUnixTime();
	let timeout = 30000;
	for (const item of Object.values(repeatables)) {
		const remaining = item.time - now;
		if (remaining < 0) continue;
		if (remaining <= 90) { timeout = 1000; break; }
		if (remaining <= 120 && timeout > 10000) { timeout = 10000; }
	}
	refreshTimer = setTimeout(refreshItems, timeout - Date.now() % timeout);
	// Refresh table if at least one item changed state and (filter is on Ready? or table is sorted by time)
	if (changedState && (getState().ready != '' || smartTable.sort.name == 'time' || smartTable.sortSub.name == 'time')) refresh();
}

function updateRow(row) {
	const id = +row.getAttribute('data-id');
	const item = repeatables[id];
	let htm = '';
	htm += Html.br`<td><input type="checkbox"${item.selected ? Html(' checked') : ''} title="${gui.getMessage('gui_ctrlclick')}"></td>`;
	htm += Html.br`<td>${gui.getLocationImg(item)}</td>`;
	htm += Html`<td>${item.name}</td>`;
	htm += Html.br`<td>${item.eid ? gui.getObjectImg('event', item.eid, 32, false, 'desc') : gui.getObjectImg('region', item.rid, 32, false, 'desc')}</td>`;
	htm += Html.br`<td>${gui.getDuration(item.cooldown, true)}</td>`;
	htm += Html.br`<td class="reset_gems">${Locale.formatNumber(item.reset)}${gui.getObjectImg('material', 2, 18, true)}</td>`;
	const xp = swPostcards ? item.xp * 10 : item.xp;
	htm += Html.br`<td class="bonus">${Locale.formatNumber(xp)}${gui.getObjectImg('system', 1, 18, true)}</td>`;
	htm += Html.br`<td class="progress add_slash"></td>`;
	htm += Html.br`<td class="total"></td>`;
	htm += Html.br`<td class="postcard"></td>`;
	htm += Html.br`<td class="time"><span class="relative"></span><span class="absolute"></span></td>`;
	row.classList.toggle('selected', item.selected);
	item.row = Html.get('<tr>' + htm + '</tr>')[0];
	item.row.setAttribute('data-id', id);
	item.row.classList.toggle('selected', item.selected);
	row.replaceWith(item.row);
	item._ready = item._readyText = null;
	calculateItem(item, true);
}

function calculateItem(item, flagRefreshRow) {
	const items = item ? [item] : Object.values(repeatables);
	const now = gui.getUnixTime();
	const offset = gui.getSyncOffset();
	let changedState = false;
	for (const item of items) {
		const id = item.id;
		const prog = gui.getLocProg(id) || {};
		const level = +prog.lvl;
		const rotation = item.rotation[level];
		item.progress = +prog.prog || 0;
		item.total = rotation ? rotation.progress : 0;
		const cmpl = +prog.cmpl || 0;
		const end = cmpl > 0 ? cmpl + item.cooldown - offset : 0;
		item.time = end <= now ? 0 : end;
		item.ready = item.time <= now;
		const readyHasChanged = item.ready !== item._ready;
		if (readyHasChanged) {
			item._ready = item.ready;
			changedState = true;
		}
		item.postcard = item.progress == item.total - 1 ? 1 : 0;
		if (flagRefreshRow && item.row && item.row.firstChild) {
			const row = item.row;
			if (item._progress !== item.progress) {
				item._progress = item.progress;
				row.querySelector('td.progress').innerText = Locale.formatNumber(item.progress);
			}
			if (item._total !== item.total) {
				item._total = item.total;
				row.querySelector('td.total').innerText = Locale.formatNumber(item.total);
			}
			if (item._postcard !== item.postcard) {
				item._postcard = item.postcard;
				Html.set(row.querySelector('td.postcard'), item.postcard ? ticked : unticked);
			}
			if (readyHasChanged || !item.ready) {
				if (readyHasChanged) row.classList.toggle('ready', item.ready);
				const text = item.ready ? gui.getMessage('repeat_ready') : gui.getDuration(item.time - now, true);
				if (item._readyText !== text) {
					row.querySelector('td.time .relative').innerText = item._readyText = text;
				}
			}
			if (item.time !== item._time) {
				item._time = item.time;
				changedState = true;
				const text = item.ready ? '' : '(' + Locale.formatTimeFull(item.time) + ')';
				row.querySelector('td.time .absolute').innerText = text;
			}
		}
	}
	return changedState;
}

function toggleSelected(id, flag) {
	const item = repeatables[id];
	flag = flag === undefined ? !item.selected : !!flag;
	item.selected = flag;
	if (item.row) {
		item.row.classList.toggle('selected', flag);
		const input = item.row.querySelector('input');
		if (input) input.checked = flag;
	}
	const index = selected.indexOf(id);
	if (!flag && index >= 0) {
		selected.splice(index, 1);
	} else if (flag && index < 0) {
		selected.push(id);
		selected.sort(gui.sortNumberAscending);
	}
}

let lastClickedRow = null;
function onClickTable(event) {
	const target = event.target;
	if (!target) return true;
	if (target.tagName == 'INPUT') {
		const row = target.parentNode.parentNode;
		let rows = [row];
		const flag = target.checked;
		if (event.ctrlKey) {
			// apply to all
			for (const row of smartTable.table.querySelectorAll('tr[data-id]')) {
				toggleSelected(+row.getAttribute('data-id'), flag);
			}
			rows = Array.from(smartTable.table.querySelectorAll('tr[data-id]'));
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
		for (const row of rows) toggleSelected(+row.getAttribute('data-id'), flag);

		storeSelected();
		return;
	}
}

function storeSelected() {
	if (repeatables) {
		for (const item of Object.values(repeatables)) item.selected = selected.includes(item.id);
		selected = selected.filter(id => id in repeatables);
	}
	selected.sort(gui.sortNumberAscending);
	const value = selected.join(',');
	if (value != gui.getPreference('repeatables')) gui.setPreference('repeatables', value);
}

function visibilityChange(visible) {
	if (visible) {
		refreshItems();
	} else {
		clearRefreshTimer();
	}
}