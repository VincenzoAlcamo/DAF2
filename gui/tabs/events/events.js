/*global bgp gui SmartTable Html Locale Tooltip*/
export default {
	init, update, getState, setState,
	requires: ['materials', 'events', 'achievements', 'collections', 'locations_0', 'quests', 'decorations', 'buildings', 'tokens', 'usables', 'artifacts', 'xp', 'special_weeks'],
	events: {
		close() {
			selectedEventId = selectedInfo = null;
			showInfo();
		},
		search: refresh,
		info: refreshRegion,
		select: refresh
	}
};

const MAX_REWARDS_PER_ROW = 6;

const INFOS = ['qst', 'ach', 'tre', 'loc', 'loc1', 'loc2', 'loc3', 'materials'];
const PREFIX_HILIGHT = 'hilight-';
const PREFIX_SET = 'set-';
// TOURMALINE, OPAL, DIAMOND, SAPPHIRE, TOPAZ, RUBY, AMETHYST, GEM
const GEMS = [398, 329, 235, 197, 143, 149, 92, 47, 2];
//
const RINGS_BY_EVENT = {
	0: 32,      // Green ring
	20: 1642,   // Red ring
	86: 5605,   // Christmas 2017
	103: 6844,  // Christmas 2018
	121: 7833,  // Christmas 2019
	138: 8996,  // Christmas 2020
	159: 10085, // Christmas 2021
	182: 10941  // Christmas 2022
};

let tab, container, inputs, smartTable;
let allEvents, trInfo, fixedBody, tbodyInfo, trRegion, swDoubleDrop, swPostcards;
let selectedRegion, selectedInfo, selectedEventId;
let lootChecks, cdn_root, versionParameter;

function init() {
	tab = this;
	({ container, inputs } = tab);

	inputs.show.querySelector('option[value="notcomplete"]').text = `${gui.getMessage('events_incomplete')} + ${gui.getMessage('events_notdone')}`;

	lootChecks = Array.from(container.querySelectorAll('input[type=checkbox][name^=loot_]'));
	lootChecks.forEach(el => el.addEventListener('click', refreshRegion));

	trRegion = container.querySelector('.trRegion');

	smartTable = new SmartTable(container.querySelector('.data'));
	smartTable.onSort = refresh;
	smartTable.fixedHeader.parentNode.classList.add('events');
	smartTable.fixedFooter.parentNode.classList.add('events');
	const tbody = smartTable.tbody[0];
	tbody.addEventListener('render', gui.getLazyRenderer(updateRow));
	tbody.addEventListener('click', onClick);
	['mouseover', 'mouseout', 'mouseleave'].forEach(name => tbody.addEventListener(name, onmousemove));
	smartTable.fixedHeader.parentNode.addEventListener('click', onClick);
	['mouseover', 'mouseout', 'mouseleave'].forEach(name => smartTable.fixedHeader.parentNode.addEventListener(name, onmousemove));

	container.addEventListener('tooltip', onTooltip);
}

function onmousemove(event) {
	let el = event.target;
	let row = null;
	const classNames = {};
	INFOS.forEach(k => classNames[k] = false);
	while (el.tagName != 'TABLE') {
		if (el.tagName == 'TD') Array.from(el.classList).filter(k => k in classNames).forEach(k => classNames[k] = true);
		if (el.tagName == 'TR') row = el;
		el = el.parentNode;
	}
	for (const r of el.querySelectorAll('tr')) {
		const fn = r == row ? k => r.classList.toggle(PREFIX_HILIGHT + k, classNames[k]) : k => r.classList.remove(PREFIX_HILIGHT + k);
		Object.keys(classNames).forEach(fn);
	}
}

function byEvent(list) {
	const hash = {};
	for (const item of list) {
		const eid = +item.event_id;
		if (!eid) continue;
		if (!(eid in hash)) hash[eid] = [];
		hash[eid].push(+item.def_id);
	}
	return hash;
}

function update() {
	({ cdn_root, versionParameter } = gui.getGenerator());
	const specialWeeks = gui.getSpecialWeeks();
	swDoubleDrop = specialWeeks.active.refresh_drop;
	swPostcards = specialWeeks.active.postcards;
	gui.showSpecialWeeks(container, [swDoubleDrop, swPostcards]);

	const eventsGifted = (specialWeeks.free_premium_event || []).map(sw => +sw.info);

	const state = getState();
	const achievements = gui.getFile('achievements');
	const achievementsByEvent = byEvent(Object.values(achievements));
	const collections = gui.getFile('collections');
	const collectionsByEvent = byEvent(Object.values(collections));
	const materials = gui.getFile('materials');
	// Patch bug in material
	if (44 in materials) materials[44].event_id = 6;    // RIBBON (#44) should be in CHRISTMAS 2012 (#6)
	const materialsByEvent = byEvent(Object.values(materials));
	const locations0 = gui.getFile('locations_0');
	const generator = gui.getGenerator();
	const eventData = generator.events || {};
	const questsFinished = gui.getArrayOfInt(generator.quests_f);
	const artifacts = gui.getArrayOfInt(generator.artifacts);
	const eventsRegion = generator.events_region || {};
	const events = gui.getFile('events');
	const now = gui.getUnixTime();
	allEvents = {};

	const eventsSorted = Object.values(events).sort((a, b) => +a.def_id - +b.def_id);
	const eventIcons = {};
	for (const event of eventsSorted) {
		if (!event.name_loc) continue;
		const isSpecialWeek = +event.cooking_event_id > 0 || +event.crafting_event_id > 0 || +event.tower_id > 0;
		const eid = event.def_id;
		const item = {};
		item.remaster = (event.name || '').toLowerCase().includes('remaster');
		// if (event.shop_icon_graphics in eventIcons) item.remaster = true;
		item.id = eid;
		item.name = gui.getString(event.name_loc);
		item.gems = (+event.premium > 0 ? +event.gems_price : 0) || NaN;
		const edata = eventData[eid];
		if (!edata && +event.start > now) continue;
		const info = gui.getEventInfo(event);
		item.tutorial = info.tutorial;
		item.start = (edata && +edata.started) || NaN;
		item.end = (edata && +edata.finished) || info.end;
		item.year = info.year;
		item.yeartxt = Locale.formatYear(info.year);
		item.gifted = eventsGifted.includes(+item.id);
		item.maxsegment = 0;

		const quests = getQuests(event);
		if (!quests.length && !isSpecialWeek) continue;
		item.tquest = quests.length;
		item.cquest = 0;
		for (const quest of quests) {
			if (questsFinished.includes(+quest.def_id)) ++item.cquest;
		}
		item.pquest = item.cquest / (item.tquest || 1);

		item.materials = materialsByEvent[eid] || [];
		if (eid in RINGS_BY_EVENT) item.materials.push(-RINGS_BY_EVENT[eid]);

		item.img = gui.getObjectImage('event', item.id);
		if (item.img == '' && item.materials.length == 1) item.img = gui.getObjectImage('material', item.materials[0], true);
		item.img_full = event.mobile_asset;
		item.img_webgl = event.shelf_graphics;
		// this will force the use of img_full instead of img_webgl
		item.img_missing = true;

		const achievs = achievementsByEvent[eid] || [];
		item.tachiev = item.cachiev = 0;
		item.machiev = [];
		for (const aid of achievs) {
			const achievement = achievements[aid];
			if (achievement.type == 'material') {
				const matId = +achievement.object_id;
				item.machiev.push(matId);
				if (!item.materials.includes(matId)) item.materials.push(matId);
			}
			item.tachiev += achievement.levels.length;
			const completed = generator.achievs[aid];
			item.cachiev += (completed ? +completed.confirmed_level : 0);
			(achievement.levels || []).forEach(level => item.maxsegment = (level.reward || []).reduce((max, obj) => Math.max(max, +obj.region_id), item.maxsegment));
		}
		item.pachiev = item.cachiev / (item.tachiev || 1);

		// Add the event if it has at least one achievement
		if (!item.tachiev && !isSpecialWeek) continue;
		allEvents[item.id] = item;
		// eventIcons[event.shop_icon_graphics] = eid;

		const collects = collectionsByEvent[eid] || [];
		item.tcollect = item.ccollect = 0;
		for (const cid of collects) {
			const collection = collections[cid];
			const pieces = gui.getArrayOfInt(collection.pieces);
			item.tcollect += pieces.length;
			for (const pid of pieces)
				if (artifacts.includes(pid)) ++item.ccollect;
		}
		item.pcollect = item.ccollect / (item.tcollect || 1);

		const towerId = +event.tower_id;
		if (towerId) {
			const locations = gui.getFile('locations_0');
			item.loc_qst = Object.values(locations).filter(loc => +loc.tower_id == towerId && +loc.test == 0).map(loc => loc.def_id);
			item.loc_xlo = item.loc_rep = [];
		} else {
			const mapLocations = {};
			gui.getArrayOfInt(event.locations).forEach(id => mapLocations[id] = false);
			gui.getArrayOfInt(event.extended_locations).forEach(id => mapLocations[id] = true);
			const rep = [], xlo = [], qst = [];
			Object.keys(mapLocations).forEach(id => {
				const location = locations0[id];
				// Additional check
				if (!location || +location.req_quest_a == 1) return;
				if (+location.reset_cd > 0) rep.push(id);
				else if (mapLocations[id]) xlo.push(id);
				else qst.push(id);
			});
			item.loc_qst = qst;
			item.loc_xlo = xlo;
			item.loc_rep = rep;
		}
		item.maps = item.loc_qst.length;
		item.challenges = item.loc_xlo.length;
		item.repeatables = item.loc_rep.length;
		item.locations = item.maps + item.challenges + item.repeatables;

		if (item.cquest == 0 && item.cachiev == 0 && item.ccollect == 0) item.status = 'notdone';
		else if (item.tquest == item.cquest && item.tachiev == item.cachiev && item.tcollect == item.ccollect) item.status = 'complete';
		else item.status = 'incomplete';

		// Segmented events: check event's rewards
		item.maxsegment = event.reward.reduce((max, obj) => Math.max(max, +obj.region_id), item.maxsegment);
		// and quests's rewards
		for (const quest of quests) item.maxsegment = quest.reward.reduce((max, obj) => Math.max(max, +obj.region_id), item.maxsegment);

		item.issegmented = item.maxsegment > 1;
		item.segmented = item.issegmented ? eventsRegion[eid] || 0 : -1;
	}

	// Create rows
	let htm = '';
	htm = Object.values(allEvents).map(item => Html`<tr data-eid="${item.id}" height="44" data-lazy></tr>`).join('');
	const rows = Html.get(htm);
	rows.forEach(row => allEvents[row.getAttribute('data-eid')].row = row);

	htm = '';
	htm += Html`<option value=""></option>`;
	let lastYear = null;
	const items = Object.values(allEvents).sort((a, b) => b.year - a.year);
	for (const item of items) {
		if (item.year && item.yeartxt !== lastYear) {
			lastYear = item.yeartxt;
			htm += Html`<option value="${lastYear}">${lastYear}</option>`;
		}
	}
	Html.set(inputs.year, htm);

	setState(state);

	refresh();
}

function getState() {
	return assignLootState({
		show: inputs.show.value,
		type: inputs.type.value,
		year: allEvents ? inputs.year.value : inputs.year.getAttribute('data-value'),
		segmented: inputs.segmented.value,
		shop: inputs.shop.value,
		region: selectedRegion || null,
		event: selectedEventId || null,
		info: selectedInfo,
		search: inputs.search.value,
		loot: '',
		'no-loot': '',
		totals: inputs.totals.checked,
		energy: inputs.energy.checked,
		sort: gui.getSortState(smartTable)
	});
}

function assignLootState(state) {
	const hasLoot = lootChecks.find(el => el.name == 'loot_flag').checked;
	const lootValue = lootChecks.map(el => el.name != 'loot_flag' && el.checked ? el.name.substr(5) : '').filter(s => s).join(',');
	if (hasLoot) {
		delete state['no-loot'];
		state.loot = lootValue || 'yes';
	} else {
		delete state.loot;
		state['no-loot'] = lootValue;
	}
	return state;
}

function setState(state) {
	state.show = gui.setSelectState(inputs.show, state.show);
	state.type = gui.setSelectState(inputs.type, state.type);
	state.segmented = gui.setSelectState(inputs.segmented, state.segmented);
	state.shop = gui.setSelectState(inputs.shop, state.shop);
	if (allEvents) state.year = gui.setSelectState(inputs.year, state.year);
	inputs.year.setAttribute('data-value', state.year);
	selectedRegion = Math.min(gui.getMaxRegion(), Math.max(0, +state.region || 0));
	selectedEventId = parseInt(state.event) || null;
	let info = (state.info || '').toLowerCase();
	if (!INFOS.includes(info)) info = '';
	state.info = selectedInfo = info;
	inputs.totals.checked = !!state.totals;
	inputs.energy.checked = !!state.energy;
	const lootFlags = (state.loot ? 'flag,' + state.loot : '' + state['no-loot']).toLowerCase().split(',');
	lootChecks.forEach(chk => chk.checked = lootFlags.includes(chk.name.substring(5)));
	assignLootState(state);
	inputs.search.value = state.search || '';
	gui.setSortState(state.sort, smartTable, 'name');
}

function refresh() {
	gui.updateTabState(tab);

	const state = getState();
	const show = state.show;
	const year = state.year;
	const not_segmented = state.segmented ? state.segmented == 'no' : NaN;
	const not_shop = state.shop ? state.shop == 'no' : NaN;
	const fnSearch = gui.getSearchFilter(state.search);
	const now = gui.getUnixTime();
	const not_event = state.type == 'event' ? false : (state.type == 'sw' ? true : NaN);

	function isVisible(item) {
		if (fnSearch && !fnSearch(item.name)) return false;
		if (show == 'active' && item.end < now) return false;
		if (show == 'rerelease' && !item.start) return false;
		if ((show == 'complete' || show == 'incomplete' || show == 'notdone') && show != item.status) return false;
		if (show == 'notcomplete' && item.status == 'complete') return false;
		if (not_event == (item.tcollect > 0)) return false;
		if (year && item.yeartxt != year) return false;
		if (not_segmented == item.issegmented) return false;
		const inShop = item.gems > 0;
		if (not_shop == inShop) return false;
		return true;
	}

	let items = Object.values(allEvents);
	const total = items.length;
	items = items.filter(isVisible);
	const num = items.length;

	const sort = gui.getSortFunction(null, smartTable, 'name');
	items = sort(items);

	const tbody = smartTable.tbody[0];
	Html.set(tbody, '');
	const totals = {};
	const keys = ['tquest', 'cquest', 'cachiev', 'tachiev', 'ccollect', 'tcollect', 'locations', 'repeatables', 'challenges', 'maps'];
	keys.forEach(key => totals[key] = 0);
	for (const item of items) {
		keys.forEach(key => totals[key] += item[key]);
		tbody.appendChild(item.row);
	}
	Array.from(container.querySelectorAll('.events tfoot td[data-key]')).forEach(cell => {
		const key = cell.getAttribute('data-key');
		if (key == 'total') cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(num), Locale.formatNumber(total));
		else cell.innerText = Locale.formatNumber(totals[key]);
	});
	gui.collectLazyElements(tbody);

	showInfo();

	smartTable.syncLater();
}

const tutorialInfo = Html`<br><div class="tutorial warning">${gui.getMessage('events_tutorial')}</div>`;
const remasterInfo = Html`<br><div class="remaster warning">Remastered</div>`;

function updateRow(row) {
	const id = row.getAttribute('data-eid');
	const item = allEvents[id];
	let htm = '';
	let img = item.img && Html`<img src="${item.img}" title="${item.name}" style="height:32px" class="tooltip-event">`;
	htm += Html.br`<td>${img}</td>`;
	htm += Html.br`<td>${item.name}${item.tutorial ? tutorialInfo : ''}${item.remaster ? remasterInfo : ''}</td>`;
	htm += Html.br`<td>${item.year ? Locale.formatYear(item.year) : ''}</td>`;
	img = '';
	if (item.issegmented) {
		img = item.segmented == 0 ? Html.br`<img src="/img/gui/check_yes.png" height="24">` : gui.getObjectImg('region', item.segmented, 24);
	}
	// if (img) img = Html.raw(img.toString().replace('>', ' class="outlined">'));
	htm += Html.br`<td>${img}</td>`;
	if (item.gems) {
		htm += Html.br`<td class="cost">${Locale.formatNumber(item.gems)}${gui.getObjectImg('material', 2, 18, true)}</td>`;
	} else {
		htm += Html.br`<td></td>`;
	}
	htm += Html.br`<td class="date">${item.start ? Locale.formatDate(item.start) + '\n' + Locale.formatTime(item.start) : ''}</td>`;
	htm += Html.br`<td class="date">${item.end ? Locale.formatDate(item.end) + '\n' + Locale.formatTime(item.end) : ''}</td>`;

	if (item.tquest) {
		htm += Html.br`<td class="qst add_slash">${Locale.formatNumber(item.cquest)}</td>`;
		htm += Html.br`<td class="qst no_right_border">${Locale.formatNumber(item.tquest)}</td>`;
		htm += Html.br`<td class="qst">${item.locations ? Html.br`<img src="/img/gui/quest_ok.png" class="${item.pquest < 1 ? 'incomplete' : ''}">` : ''}</td>`;
	} else {
		htm += Html.br`<td colspan="3"></td>`;
	}

	if (item.tachiev) {
		htm += Html.br`<td class="ach add_slash">${Locale.formatNumber(item.cachiev)}</td>`;
		htm += Html.br`<td class="ach no_right_border">${Locale.formatNumber(item.tachiev)}</td>`;
		htm += Html.br`<td class="ach"><img src="/img/gui/achiev_ok.png" class="${item.pachiev < 1 ? 'incomplete' : ''}"></td>`;
	} else {
		htm += Html.br`<td colspan="3"></td>`;
	}

	if (item.tcollect) {
		htm += Html.br`<td class="tre add_slash">${Locale.formatNumber(item.ccollect)}</td>`;
		htm += Html.br`<td class="tre no_right_border">${Locale.formatNumber(item.tcollect)}</td>`;
		htm += Html.br`<td class="tre"><img src="/img/gui/treasure_ok.png" class="${item.pcollect < 1 ? 'incomplete' : ''}"></td>`;
	} else {
		htm += Html.br`<td colspan="3"></td>`;
	}

	if (item.locations) {
		const fn = (info, count) => Html.br`<td class="${count ? info : ''}">${Locale.formatNumber(count)}</td>`;
		htm += fn('loc', item.locations);
		htm += fn('loc1', item.maps);
		htm += fn('loc2', item.challenges);
		htm += fn('loc3', item.repeatables);
	} else {
		htm += Html.br`<td colspan="4"></td>`;
	}
	htm += Html.br`<td class="materials" title="${gui.getMessage('gui_shop')}">`;
	const numMaterials = item.materials.length || 1;
	const breakIndex = numMaterials >= 5 ? Math.ceil(numMaterials / 2) : -1;
	const size = Math.max(21, Math.min(32, Math.floor(96 / numMaterials)));
	item.materials.forEach((matId, index) => {
		if (index == breakIndex) htm += `<br>`;
		htm += gui.getObjectImg(matId > 0 ? 'material' : 'token', Math.abs(matId), size, true, 'desc');
	});
	htm += Html.br`</td>`;
	item.row = Html.get('<tr>' + htm + '</tr>')[0];
	item.row.setAttribute('data-eid', id);
	row.replaceWith(item.row);
	return item.row;
}

function onTooltip(event) {
	const element = event.target;
	element.removeAttribute('title');
	const eid = parseInt(element.parentNode.parentNode.getAttribute('data-eid'));
	const description = gui.getString(gui.getObject('event', eid).desc);
	const item = allEvents[eid];
	const img1 = cdn_root + 'mobile/graphics/map/webgl_events/' + item.img_webgl + '.png' + versionParameter;
	const img2 = item.img_full == 'default' ? '' : cdn_root + 'mobile/graphics/all/' + item.img_full + '.png' + versionParameter;
	const img = item.img_missing ? img2 : img1;
	const imgFull = img && Html`<img src="${img}" class="full">`;
	let htm = '';
	htm += Html.br`<div class="events-tooltip"><img src="${item.img}" class="outlined"/>${imgFull}<span>${item.name}</span>`;
	if (description != '#') htm += Html.br`<span class="desc">${description}</span>`;
	htm += Html.br`</div>`;
	Tooltip.show(element, htm, 'e');
	if (img == img1) Tooltip.tip.querySelector('img.full').addEventListener('error', function () {
		if (img2) this.src = img2;
		else this.style.display = 'none';
		item.img_missing = true;
	});
}

function refreshRegion() {
	selectedRegion = inputs.region.value;
	showInfo();
}

async function onClick(e) {
	let row;
	for (let el = e.target; !row && el.tagName != 'TABLE'; el = el.parentNode)
		if (el.tagName == 'TR') row = el;
	if (!row) return;
	const info = INFOS.find(info => row.classList.contains(PREFIX_HILIGHT + info));
	if (!info) return;
	const eid = parseInt(row.getAttribute('data-eid'));
	if (info == 'materials') {
		await gui.setCurrentTab('equipment');
		const tab = gui.getCurrentTab();
		tab.setState(Object.assign(tab.getState(), { show: 'shop', shop_from: 'event', event: eid }));
		tab.refresh();
		return;
	}
	selectedInfo = info;
	selectedEventId = eid;
	showInfo();
}

function ensureSmartTableExtra() {
	fixedBody = smartTable.fixedHeader.parentNode.querySelector('tbody');
	if (!fixedBody) {
		fixedBody = document.createElement('tbody');
		smartTable.fixedHeader.parentNode.appendChild(fixedBody);
	}
	tbodyInfo = smartTable.tbody[1];
	if (!tbodyInfo) {
		tbodyInfo = document.createElement('tbody');
		smartTable.tbody[0].parentNode.appendChild(tbodyInfo);
		smartTable.tbody.push(tbodyInfo);
	}
	if (!trInfo) {
		trInfo = tbodyInfo.insertRow();
		trInfo.className = 'inforow';
	}
	fixedBody.style.display = tbodyInfo.style.display = 'none';
}

function showInfo() {
	const setRowsState = (display, visibility) => {
		for (const tr of smartTable.tbody[0].querySelectorAll('tr')) {
			tr.style.display = display;
			tr.style.visibility = visibility;
		}
	};

	const event = selectedEventId ? gui.getFile('events')[selectedEventId] : null;
	let row = selectedEventId && event ? smartTable.tbody[0].querySelector('tr[data-eid="' + selectedEventId + '"]') : null;

	ensureSmartTableExtra();
	if (trRegion.parentNode) trRegion.parentNode.removeChild(trRegion);
	for (const tr of smartTable.tbody[0].querySelectorAll('.trRegion')) tr.parentNode.removeChild(tr);

	if (!row) {
		fixedBody.style.display = tbodyInfo.style.display = 'none';
		smartTable.fixedFooter.style.display = smartTable.footer.style.display = '';
		setRowsState('', '');
		if (selectedEventId) selectedEventId = null;
	}

	gui.updateTabState(tab);
	if (!row) return;

	const state = getState();
	const showLoot = state.loot;
	const showTotalLoot = !!state.totals;
	const showEnergy = !!state.energy;

	if (row.getAttribute('data-lazy') !== null) {
		row.removeAttribute('data-lazy');
		row = updateRow(row);
	}
	Html.set(fixedBody, '');
	const clone = row.cloneNode(true);
	for (const info of INFOS) clone.classList.remove(PREFIX_HILIGHT + info);
	clone.classList.add(PREFIX_SET + selectedInfo);
	fixedBody.appendChild(clone);
	fixedBody.appendChild(trRegion);
	fixedBody.style.display = tbodyInfo.style.display = '';
	smartTable.fixedFooter.style.display = smartTable.footer.style.display = 'none';
	setRowsState('none', 'hidden');
	row.style.display = '';
	row.style.visibility = '';
	row.parentNode.insertBefore(trRegion.cloneNode(true), row.nextSibling);

	const ticked = Html.br`<img width="24" src="/img/gui/ticked.png">`;
	const unticked = Html.br`<img width="24" src="/img/gui/unticked.png">`;

	let htm = '';
	htm += Html.br`<td colspan="21">`;

	const generator = gui.getGenerator();
	const item = allEvents[selectedEventId];
	const isSegmented = item.issegmented;
	let region = selectedRegion || 0;
	const showProgress = region == 0;
	const sw = gui.getSpecialWeeks().active.free_premium_event;
	const giftedEventId = (sw && +sw.info) || 0;
	const flagClearBonus10X = item.start > 0 || item.gems > 0 || item.gifted || selectedEventId == giftedEventId || item.remaster || selectedEventId === 113;

	const isLoc = selectedInfo && selectedInfo.substr(0, 3) == 'loc';
	container.querySelector('[name=loot_flag]').parentNode.parentNode.style.visibility = isLoc ? '' : 'hidden';
	inputs.totals.parentNode.style.visibility = isLoc && selectedInfo != 'loc3' ? '' : 'hidden';
	inputs.energy.parentNode.style.visibility = isLoc && selectedInfo != 'loc3' && showProgress ? '' : 'hidden';

	htm = '';
	// Your progress
	let yourRegion = 1;
	if (isSegmented) yourRegion = item.status == 'notdone' ? Math.min(+generator.region, item.maxsegment) : item.segmented || 1;
	let text = isSegmented ? gui.getMessageAndValue('events_yourprogress', gui.getObjectName('region', yourRegion)) : gui.getMessage('events_yourprogress');
	if (item.status == 'notdone') text += ' (' + gui.getMessage('events_notdone') + ')';
	htm += Html`<option value="">${text}</option>`;
	// List regions
	if (isSegmented) {
		region = Math.min(region, item.maxsegment);
		for (let rid = 1; rid <= item.maxsegment; rid++) htm += Html`<option value="${rid}">${gui.getObjectName('region', rid)}</option>`;
	} else {
		region = Math.min(region, 1);
		htm += Html`<option value="${Math.max(selectedRegion, 1)}">${gui.getMessage('events_notsegmented')}</option>`;
	}
	Html.set(inputs.region, htm);
	inputs.region.value = selectedRegion || '';
	region = region || yourRegion;

	htm = '';
	htm += Html.br`<td colspan="21">`;

	const augmentTotalRewards = (totals, rewards) => {
		for (const reward of rewards) {
			reward.amount = +reward.amount || 0;
			const { type, object_id, amount } = reward;
			const key = type + '\t' + object_id;
			const total = totals[key];
			if (total) total.amount += amount; else totals[key] = { type, object_id, amount };
		}
	};
	const getTotalRewards = (...arrRewards) => {
		const result = { max: 0 };
		const totals = {};
		for (const rewards of arrRewards) {
			result.max = Math.max(result.max, rewards.length);
			augmentTotalRewards(totals, rewards);
		}
		result.rewards = Object.values(totals);
		// A maximum of 5 rewards per row
		result.max = Math.min(MAX_REWARDS_PER_ROW, Math.max(result.max, result.rewards.length));
		return result;
	};

	const classesByType = {};
	['ACHIEV', 'RING', 'GEMSTONE', 'artifact', 'material', 'token', 'usable', 'decoration', 'COIN', 'system', 'XP', 'eventpass_xp'].forEach((v, i) => classesByType[v] = i);
	const RINGS = Object.values(RINGS_BY_EVENT);
	const showRewards = (rewards, maxNumRewards, options) => {
		const { rows = 1, className = '', raw = false, filter = false } = options || {};
		let htm = '';
		for (const reward of rewards) {
			const type = reward.type;
			const id = +reward.object_id;
			const xp = gui.getXp(type, id);
			reward._i = xp > 0 ? -xp : id;
			reward._c = classesByType[type];
			if (type == 'material') {
				if (item.machiev.includes(id)) reward._c = 0;
				if (id == 1) { reward._c = classesByType.COIN; }
				const gemIndex = GEMS.indexOf(id);
				if (gemIndex >= 0) { reward._c = classesByType.GEMSTONE; reward._i = gemIndex; }
			} else if (type == 'token') {
				const ringIndex = RINGS.indexOf(id);
				if (ringIndex >= 0) { reward._c = classesByType.RING; reward._i = ringIndex; }
			} else if (type == 'system' && id == 1) {
				reward._c = classesByType.XP;
			}
		}
		if (filter && showLoot != 'yes') {
			const types = [];
			if (showLoot.includes('gems')) types.push(classesByType.GEMSTONE);
			if (showLoot.includes('achiev')) types.push(classesByType.ACHIEV);
			if (showLoot.includes('xp')) types.push(classesByType.XP);
			rewards = rewards.filter(r => types.includes(r._c));
		}
		rewards.sort((a, b) => (a._c - b._c) || (a._i - b._i));
		const cells = [];
		for (let i = 1; i <= maxNumRewards; i++) {
			htm += Html.br`<td rowspan="${rows}" class="rewards ${i < maxNumRewards ? 'no_right_border' : ''} ${className}">`;
			let cell = '';
			for (let j = i, prefix = ''; j <= rewards.length; j += maxNumRewards) {
				const reward = rewards[j - 1];
				const title = gui.getObjectName(reward.type, reward.object_id, 'info+desc');
				cell += prefix + `<span title="${title}">${Locale.formatNumber(+reward.amount)}<i>${gui.getObjectImg(reward.type, reward.object_id, null, true, 'none')}</i></span>`;
				prefix = '<br>';
			}
			htm += cell;
			cells.push(cell);
			htm += Html.br`</td>`;
		}
		return raw ? cells : htm;
	};
	const showRewardsInCell = (cell, rewards) => {
		rewards = rewards.filter(reward => {
			reward.amount = reward.amount >= 100 ? Math.floor(reward.amount) : Math.floor(reward.amount * 10) / 10;
			return reward.amount > 0;
		});
		const cells = showRewards(rewards, MAX_REWARDS_PER_ROW, { raw: true, filter: true });
		for (let i = 0; i < cells.length && cell; i++, cell = cell.nextSibling) Html.set(cell, cells[i]);
	};

	let lootPlaceholder = '';
	if (showLoot) {
		for (let i = 1; i < MAX_REWARDS_PER_ROW; i++) lootPlaceholder += `<td class="loot no_right_border"></td>`;
		lootPlaceholder += `<td class="loot"></td>`;
	}

	const showTotalRewards = ({ totalRewards, maxNumRewards, colSpan, className, addLoot, showProgress, progress, total, totalEnergy }) => {
		const showTotal = total !== undefined;
		colSpan -= (showProgress ? 2 : 0) + (showTotal ? 1 : 0);
		let htm = '';
		htm += Html.br`<tfoot>`;
		htm += Html.br`<tr><td colspan="${colSpan}" class="final">${gui.getMessage('events_total')}</td>`;
		if (showProgress) htm += Html.br`<td class="reached add_slash">${Locale.formatNumber(progress)}</td>`;
		if (showTotal) htm += Html.br`<td class="${showProgress ? 'target no_right_border' : 'goal'}">${Locale.formatNumber(total)}</td>`;
		if (showProgress) htm += Html.br`<td>${progress >= total ? ticked : unticked}</td>`;
		if (isFinite(totalEnergy) && showEnergy) htm += Html.br`<td class="energy">${Locale.formatNumber(totalEnergy)}</td>`;
		htm += showRewards(totalRewards, maxNumRewards, { className });
		if (addLoot) { htm += lootPlaceholder; }
		htm += Html.br`</tr>`;
		htm += Html.br`</tfoot>`;
		return htm;
	};

	// Quests
	if (selectedInfo == 'qst') {
		const questsFinished = gui.getArrayOfInt(generator.quests_f);
		const quests = getQuests(event).map(quest => {
			const copy = Object.assign({}, quest);
			copy.completed = questsFinished.includes(+quest.def_id);
			copy.rewards = gui.getArray(quest.reward).filter(reward => {
				const rid = +reward.region_id;
				return rid == 0 || rid == region;
			});
			return copy;
		});
		if (quests.length) {
			const rewards = gui.getArray(event.reward).filter(reward => {
				const rid = +reward.region_id;
				return rid == 0 || rid == region;
			});
			const { max: maxNumRewards, rewards: totalRewards } = getTotalRewards(rewards, ...quests.map(q => q.rewards));
			htm += Html.br`<table class="event-subtable event-quests">`;
			htm += Html.br`<thead><tr><th><img width="24" src="/img/gui/list.png"></th><th colspan="${showProgress ? 2 : 1}">${gui.getMessage('gui_quest')}</th>`;
			htm += Html.br`<th colspan="${maxNumRewards}">${gui.getMessage('events_rewards')}</th></tr></thead><tbody class="row-coloring">`;
			let found = 0;
			quests.forEach((quest, index) => {
				htm += Html.br`<tr>`;
				htm += Html.br`<td class="level">${Locale.formatNumber(index + 1)}</td>`;
				htm += Html.br`<td class="${showProgress ? 'no_right_border' : ''}">${bgp.Data.getString(quest.heading_text)}</td>`;
				if (quest.completed) found++;
				if (showProgress) htm += Html.br`<td>${quest.completed ? ticked : unticked}</td>`;
				htm += showRewards(quest.rewards, maxNumRewards);
				htm += Html.br`</tr>`;
			});
			htm += Html.br`<tr><td colspan="2" class="final ${showProgress ? 'no_right_border' : ''}">${gui.getMessage('events_finalreward')}</td>`;
			if (showProgress) htm += Html.br`<td>${found == quests.length ? ticked : unticked}</td>`;
			htm += showRewards(rewards, maxNumRewards);
			htm += Html.br`</tr>`;
			htm += Html.br`</tbody>`;
			htm += showTotalRewards({ totalRewards, maxNumRewards, colSpan: 2 + (showProgress ? 1 : 0) });
			htm += Html.br`</table>`;
		}
	}

	// Achievements
	if (selectedInfo == 'ach') {
		const achievements = Object.values(gui.getFile('achievements')).filter(achievement => +achievement.event_id == selectedEventId);
		for (const achievement of achievements) {
			const levels = achievement.levels.map(level => {
				const copy = {};
				copy.level_id = +level.level_id;
				copy.amount = +level.amount;
				copy.rewards = gui.getArray(level.reward).filter(reward => {
					const rid = +reward.region_id;
					return rid == 0 || rid == region;
				});
				return copy;
			}).sort((a, b) => a.level_id - b.level_id);
			const achiev = generator.achievs[achievement.def_id];
			const a_level = achiev ? +achiev.level : 0;
			const c_level = achiev ? +achiev.confirmed_level : 0;
			const a_progress = achiev ? +achiev.progress : 0;
			// eslint-disable-next-line no-unused-vars
			const { max: maxNumRewards, rewards: totalRewards } = getTotalRewards(...levels.map(l => l.rewards));
			const hasIcon = achievement.type == 'material' || achievement.type == 'token' || achievement.type == 'usable';
			htm += Html.br`<table class="event-subtable event-achievement">`;
			htm += Html.br`<thead><tr><th colspan="${maxNumRewards + 2 + (showProgress ? 2 : 0) + (hasIcon ? 1 : 0)}">${gui.getString(achievement.name_loc)}</th></tr>`;
			htm += Html.br`<tr>`;
			if (hasIcon) htm += Html.br`<th></th>`;
			htm += Html.br`<th><img width="24" src="/img/gui/list.png"></th><th colspan="${showProgress ? 3 : 1}">${gui.getMessage('progress_goal')}</th>`;
			htm += Html.br`<th colspan="${maxNumRewards}">${gui.getMessage('events_rewards')}</th></tr></thead><tbody class="row-coloring">`;
			let totalAchieved = 0;
			let totalRequired = 0;
			for (const level of levels) {
				htm += Html.br`<tr>`;
				if (hasIcon && level.level_id == 1) {
					htm += Html.br`<th class="icon" rowspan="${levels.length}">${gui.getObjectImg(achievement.type, achievement.object_id, null, false, 'info+desc')}</th>`;
				}
				htm += Html.br`<td class="level">${Locale.formatNumber(level.level_id)}</td>`;
				const progress = (a_level > level.level_id || c_level >= level.level_id) ? level.amount : (a_level == level.level_id ? a_progress : 0);
				const completed = progress >= level.amount;
				totalAchieved += progress;
				totalRequired += level.amount;
				if (showProgress) htm += Html.br`<td class="reached add_slash">${Locale.formatNumber(progress)}</td>`;
				htm += Html.br`<td class="${showProgress ? 'target no_right_border' : 'goal'}">${Locale.formatNumber(level.amount)}</td>`;
				if (showProgress) htm += Html.br`<td>${completed ? ticked : unticked}</td>`;
				htm += showRewards(level.rewards, maxNumRewards);
				htm += Html.br`</tr>`;
			}
			htm += Html.br`</tbody>`;
			htm += showTotalRewards({ totalRewards, maxNumRewards, colSpan: 3 + (showProgress ? 2 : 0), showProgress, progress: totalAchieved, total: totalRequired });
			htm += Html.br`</table>`;
		}
	}

	// Treasure pieces
	if (selectedInfo == 'tre') {
		const collections = Object.values(gui.getFile('collections')).filter(col => +col.event_id == selectedEventId);
		const artifacts = gui.getFile('artifacts');
		const piecesFound = gui.getArrayOfInt(generator.artifacts);
		const locations = gui.getFile('locations_0');
		for (const col of collections) {
			const pieces = gui.getArrayOfInt(col.pieces).map((piece, index) => {
				const artifact = artifacts[piece];
				const rewards = [{ type: 'artifact', object_id: piece, amount: 1 }];
				const amount = +artifact.eventpass_xp;
				if (amount) rewards.push({ type: 'eventpass_xp', object_id: 1, amount });
				return Object.assign({}, artifact, { index: index + 1, rewards });
			});
			const rewards = gui.getArray(col.reward).filter(reward => {
				const rid = +reward.region_id;
				return rid == 0 || rid == region;
			}).sort((a, b) => a.type == 'decoration' ? -1 : (b.type == 'decoration' ? 1 : 0));
			const maxNumRewards = Math.max(2, rewards.length);
			htm += Html.br`<table class="event-subtable event-treasure">`;
			htm += Html.br`<thead><tr><th colspan="${maxNumRewards + 2 + (showProgress ? 1 : 0) + 1}">${gui.getString(col.name_loc)}</th></tr>`;
			htm += Html.br`<tr>`;
			htm += Html.br`<th></th>`;
			htm += Html.br`<th><img width="24" src="/img/gui/list.png"></th><th colspan="${showProgress ? 2 : 1}">${gui.getMessage('gui_location')}</th>`;
			htm += Html.br`<th colspan="${maxNumRewards}">${gui.getMessage('events_rewards')}</th></tr></thead><tbody class="row-coloring">`;
			let found = 0;
			for (const piece of pieces) {
				htm += Html.br`<tr>`;
				if (piece.index == 1) {
					htm += Html.br`<th class="icon" rowspan="${pieces.length + 1}">${gui.getObjectImg('collection', col.def_id, null, false, 'desc')}</th>`;
				}
				htm += Html.br`<td class="level">${Locale.formatNumber(piece.index)}</td>`;
				const loc = locations[piece.found_in];
				htm += Html.br`<td class="${showProgress ? 'no_right_border' : ''}">${loc ? gui.getString(loc.name_loc) : '???'}</td>`;
				const completed = piecesFound.includes(+piece.def_id);
				if (completed) found++;
				if (showProgress) htm += Html.br`<td>${completed ? ticked : unticked}</td>`;
				htm += showRewards(piece.rewards, maxNumRewards);
				htm += Html.br`</tr>`;
			}
			htm += Html.br`<tr><td colspan="2" class="final ${showProgress ? 'no_right_border' : ''}">${gui.getMessage('events_finalreward')}</td>`;
			if (showProgress) htm += Html.br`<td>${found == pieces.length ? ticked : unticked}</td>`;
			htm += showRewards(rewards, maxNumRewards);
			htm += Html.br`</tr>`;
			htm += Html.br`</tbody></table>`;
		}
	}

	// Locations
	if (selectedInfo.substr(0, 3) == 'loc') {
		const locations = gui.getFile('locations_0');
		const showLocations = (locs, key) => {
			if (!locs.length) return;
			const title = gui.getMessage('events_' + key);
			const isRepeatables = key == 'repeatables';
			locs = locs.map(lid => {
				const location = locations[lid];
				const ovr = location.overrides && location.overrides.find(ovr => +ovr.region_id == region);
				const clearXp = ovr ? +ovr.override_reward_exp : +location.reward_exp;
				const eventpassXp = +location.eventpass_xp;
				const rewards = [{ type: 'system', object_id: 1, amount: clearXp * (swPostcards && isRepeatables ? 10 : 1) }];
				if (eventpassXp) rewards.push({ type: 'eventpass_xp', object_id: 1, amount: eventpassXp });
				const loc = Object.assign({}, location);
				loc.rewards = rewards;
				loc.clearXp = clearXp;
				return loc;
			});
			const { max, rewards: totalRewards } = getTotalRewards(...locs.map(l => l.rewards));
			const maxNumRewards = showLoot ? 1 : max;
			htm += Html.br`<table class="event-subtable event-locations" data-key="${key}">`;
			htm += Html.br`<thead><tr><th>${title}</th>`;
			htm += Html.br`<th colspan="${showProgress ? 3 : 1}">${gui.getMessage('events_tiles')}</th>`;
			if (showProgress && !isRepeatables && showEnergy) htm += Html.br`<th title="${Html(gui.getMessage('progress_energyinfo'))}">${gui.getMessage('gui_energy')}</th>`;
			if (isRepeatables) htm += Html.br`<th>${gui.getMessage('events_chance')}</th><th>${gui.getMessage('repeat_cooldown')}</th>`;
			htm += Html.br`<th colspan="${maxNumRewards}">${gui.getMessage('events_clearbonus')}</th>`;
			if (showLoot) htm += Html.br`<th colspan="${MAX_REWARDS_PER_ROW}">${gui.getMessage('gui_loot')}</th>`;
			htm += Html.br`</tr></thead>`;
			htm += Html.br`<tbody class="${isRepeatables ? '' : 'row-coloring'}">`;
			let isOdd = false;
			const totalLoot = {};
			let numLootLoaded = 0;
			let totalEnergy = isRepeatables ? NaN : 0;
			for (const loc of locs) {
				const lid = loc.def_id;
				const tiles = +loc.progress;
				const prog = gui.getLocProg(lid);
				const mined = (prog && +prog.prog) || 0;
				const lastFloorLevel = (prog && +prog.lvl) || 0;
				let completed = mined >= tiles;

				let floors = isRepeatables ? Object.values(loc.rotation) : [];
				let chance = floors.reduce((sum, floor) => sum + +floor.chance, 0);
				floors = floors.map(floor => {
					floor = Object.assign({}, floor);
					floor.chance = +floor.chance;
					return floor;
				});
				if (chance == 0) {
					chance = floors.length;
					for (const floor of floors) floor.chance = 1;
				}
				floors = floors.filter(floor => floor.chance > 0);
				// Compute chance
				let remainingChances = 1000;
				for (const floor of floors) {
					const p = floor.chance * 1000 / chance;
					floor.chance = Math.floor(p);
					floor.chanceRest = p - floor.chance;
					remainingChances -= floor.chance;
				}
				const fCopy = [].concat(floors).sort((a, b) => b.chanceRest - a.chanceRest);
				// Add remaining chances to the floors with the highest rest
				for (let i = Math.min(fCopy.length, remainingChances); i-- > 0;) fCopy[i].chance++;
				for (const floor of floors) floor.chance /= 10;

				floors = floors.map(floor => {
					let htm = '';
					const isCurrentFloor = +floor.level == lastFloorLevel;
					const tiles = +floor.progress;
					const isCompleted = mined >= tiles;
					if (isCurrentFloor) completed = isCompleted;
					if (showProgress) htm += Html.br`<td class="reached${isCurrentFloor ? ' add_slash' : ' no_right_border'}">${isCurrentFloor ? Locale.formatNumber(mined) : ''}</td>`;
					htm += Html.br`<td class="${showProgress ? 'target no_right_border' : 'goal'}">${Locale.formatNumber(tiles)}</td>`;
					if (showProgress) htm += Html.br`<td>${isCurrentFloor ? (isCompleted ? ticked : unticked) : ''}</td>`;
					htm += Html.br`<td class="chance">${Locale.formatNumber(floor.chance, 1)} %</td>`;
					floor.htm = htm;
					return floor;
				});
				const rows = isRepeatables ? floors.length : 1;
				const floorLevels = floors.map(floor => +floor.level);

				isOdd = !isOdd;
				htm += Html.br`<tr class="${isRepeatables ? (isOdd ? 'odd' : 'even') : ''} ${isRepeatables && lid != locs[0] ? 'separator' : ''}" data-loc="${lid}" data-floor="${isRepeatables ? floors[0].level : 0}">`;
				let name, img;
				if (+loc.tower_id) {
					name = `${gui.getMessage('map_floor')} ${Locale.formatNumber(+loc.tower_floor)}`;
					img = '';
				} else {
					name = gui.getString(loc.name_loc)
					img = gui.getLocationImg(loc);
				}
				htm += Html.br`<td rowspan="${rows}" class="${showProgress ? (completed ? 'completed' : 'not-completed') : ''}">${img}<div class="location_name">${Html(name)}</div></td>`;
				if (isRepeatables) {
					// Fix chance
					htm += floors.shift().htm;
					htm += Html.br`<td rowspan="${rows}" class="reset">`;
					htm += `<span>${gui.getDuration(+loc.reset_cd)}<i><img src="/img/gui/time.png"></i></span><br>`;
					htm += `<span>${Locale.formatNumber(+loc.reset_gems)}<i>${gui.getObjectImg('material', 2, null, true, 'none')}</i></span>`;
					htm += Html.br`</td>`;
				} else {
					if (showProgress) htm += Html.br`<td class="reached add_slash">${Locale.formatNumber(mined)}</td>`;
					htm += Html.br`<td class="${showProgress ? 'target no_right_border' : 'goal'}">${Locale.formatNumber(tiles)}</td>`;
					if (showProgress) htm += Html.br`<td>${completed ? ticked : unticked}</td>`;
					if (showProgress && showEnergy) {
						const tileCost = tiles > 0 ? loc.clearXp * (flagClearBonus10X ? 1 : 10) / tiles : 0;
						const energy = Math.floor(tileCost * Math.max(0, tiles - mined));
						const title = tileCost ? gui.getMessageAndValue('progress_averagetilecost', Locale.formatNumber(Math.round(tileCost))) : '';
						htm += Html.br`<td class="energy"${title ? Html.br` title="${title}"` : ''}>${Locale.formatNumber(energy)}</td>`;
						totalEnergy += energy;
					}
				}
				htm += showRewards(loc.rewards, maxNumRewards, { rows, className: 'clear' });
				htm += lootPlaceholder;
				htm += Html.br`</tr>`;
				htm += floors.map(floor => Html.br`<tr class="${isRepeatables ? (isOdd ? 'odd' : 'even') : ''}" data-loc="${lid}" data-floor="${floor.level}">${Html.raw(floor.htm + lootPlaceholder)}</tr>`).join('');
				if (showLoot) bgp.Data.getFile('floors_' + lid).then(data => {
					const level = +generator.level;
					data = Object.assign({}, data);
					data.floor = data.floor.map(floor => Object.assign({}, floor));
					const levels = isRepeatables ? floorLevels : [0];
					const locLoot = {};
					for (const floor of data.floor) {
						const lootAreas = gui.getLootAreas(floor);
						const rewards = {};
						for (const lootArea of lootAreas) {
							const rid = +lootArea.region_id || region;
							if (isSegmented && rid != region) continue;
							const type = lootArea.type;
							let object_id = +lootArea.object_id;
							if (type == 'artifact' || type == 'decoration') continue;
							if (type == 'token' && ![32, 1642, 5605, 6844, 7833].includes(object_id)) continue;
							const count = typeof lootArea.tiles == 'string' ? lootArea.tiles.split(';').length : 0;
							const random = +lootArea.random;
							const num = random > 0 && random < count ? random : count;
							const loot = gui.calculateLoot(lootArea, showProgress ? level : 0, isRepeatables ? swDoubleDrop : null);
							let amount = num * loot.avg;
							// PARRY HOTTER: hack for SORTING BOOTS' CEREMONY count for SILVER SNITCH
							if (lid == 2211 && object_id == 254 && type == 'material') amount = Math.floor(amount / 2);
							if (amount > 0) {
								if (type === 'photo') object_id = 1;
								const key = type + '\t' + object_id;
								const reward = rewards[key];
								if (reward) reward.amount += amount; else rewards[key] = { type, object_id, amount };
							}
						}
						floor.loot = Object.values(rewards);
						augmentTotalRewards(locLoot, floor.loot);
					}
					const locationLoot = Object.values(locLoot);
					for (const level of levels) {
						const rewards = level == 0 ? locationLoot : data.floor.find(floor => +floor.def_id == level).loot;
						showRewardsInCell(container.querySelector(`tr[data-loc="${lid}"][data-floor="${level}"] td.loot`), rewards);
					}
					augmentTotalRewards(totalLoot, locationLoot);
					numLootLoaded++;
					if (numLootLoaded == locs.length && showTotalLoot) {
						showRewardsInCell(container.querySelector(`table[data-key="${key}"] tfoot td.loot`), Object.values(totalLoot));
					}
				});
			}
			htm += Html.br`</tbody>`;
			if (!isRepeatables) htm += showTotalRewards({ totalRewards, maxNumRewards, colSpan: 2 + (showProgress ? 2 : 0), className: 'clear', addLoot: true, totalEnergy: showProgress ? totalEnergy : NaN });
			htm += Html.br`</table>`;
		};
		if (selectedInfo == 'loc' || selectedInfo == 'loc1') showLocations(item.loc_qst, 'story_maps');
		if (selectedInfo == 'loc' || selectedInfo == 'loc2') showLocations(item.loc_xlo, 'challenges');
		if (selectedInfo == 'loc' || selectedInfo == 'loc3') showLocations(item.loc_rep, 'repeatables');
	}

	htm += Html.br`</td>`;
	const row2 = Html.get('<tr class="infoRow">' + htm + '</tr>')[0];
	trInfo.replaceWith(row2);
	trInfo = row2;
}

function getQuests(event) {
	const quests = gui.getFile('quests');
	return gui.getArrayOfInt(event.quests).sort().map(qid => {
		const quest = quests[qid];
		// Quest must have the heading
		return quest && quest.heading_text ? quest : null;
	}).filter(quest => !!quest);
}