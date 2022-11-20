/*global bgp gui SmartTable Html Locale Tooltip Dialog*/
import packHelper from '../../packHelper.js';

export default {
	init, update, refresh, getState, setState,
	requires: ['materials', 'buildings', 'sales', 'events', 'offers', 'packs', 'tiered_offers', 'decorations', 'usables', 'tokens', 'diggy_skins', 'xp'],
	events: {
		show() {
			setState(getState());
			refresh();
		},
		select: refresh,
		search: refresh,
		advanced: onClickAdvanced,
		pack: () => showOffer('pack', lastPack),
		offer: () => showOffer('offer', lastOffer),
		tieredoffer: () => showOffer('tier', lastTieredOffer),
		showany: showAny
	}
};

let tab, container, inputs, smartTable;
let allItems, currentItems, allEvents;
let minRegen, minCapacity, updateTime, packsViewed;
let currency, lastPack, lastOffer, lastTieredOffer;
let listRegion, listSkin, listMaterial;
let filterSkin, filterMaterial, filterLevelComparison, filterLevelType, filterLevel, filterHideMax, showAsGrid;
let campReg, campCap;
let allOptions;

function init() {
	tab = this;
	({ container, inputs } = tab);

	smartTable = new SmartTable(container.querySelector('.data'));
	smartTable.onSort = refresh;
	smartTable.fixedHeader.parentNode.classList.add('equipment');
	smartTable.fixedFooter.parentNode.classList.add('equipment');
	smartTable.tbody[0].addEventListener('render', gui.getLazyRenderer(updateItem));

	container.addEventListener('tooltip', onTooltip);
}

function getItemFromBuilding(building, owned, active) {
	if (!building) return null;
	const item = {};
	item.oid = building.def_id;
	item.id = 'b' + item.oid;
	item.owned = (owned && owned[item.oid]) || 0;
	item.placed = (active && active[item.oid]) || 0;
	// This marks the building is not on-sale
	item.sale_id = item.level = item.event = item.erid = item.skin = item.locked = 0;
	item.name = gui.getString(building.name_loc);
	item.limit = +building.limit;
	item.brid = +building.region;
	if (item.limit == 0) item.limit = +Infinity;
	item.width = Math.max(+building.columns || 0, 1);
	item.height = Math.max(+building.rows || 0, 1);
	item.sell = +building.sell_price || 0;
	const cap = +building.max_stamina || 0;
	const reg = +building.stamina_reg || 0;
	if (cap > 0) {
		item.type = 'capacity';
		item.value = cap;
		item.slotvalue = Math.floor(item.value / item.width);
	} else if (reg > 0) {
		item.type = 'regen';
		item.value = reg;
		item.slotvalue = Math.floor(item.value / item.width);
	} else {
		item.type = 'building';
	}
	return item;
}

function getBoughtSkins() {
	const skins = {};
	for (const skin of gui.getArrayOfInt(gui.getGenerator().skins)) skins[skin] = true;
	return skins;
}

function computeItemGain(item) {
	const title = [];
	const getGain = (camp) => {
		const list = item.type == 'capacity' ? camp.capList : camp.regList;
		let campValue = 0;
		for (let num = 0; num < item.width; num++) campValue += (list[num] || 0);
		const gain = Math.max(0, item.value - campValue);
		const numInferior = list.filter(v => v < item.slotvalue).length;
		const percInferior = Math.round((list.length ? numInferior / list.length : 0) * 100);
		return [gain, list.slice(0, item.width).map(n => item.slotvalue - n), numInferior, percInferior];
	};
	const [gainD, gainsD, numLessD, percLessD] = getGain(campReg);
	const [gainN, gainsN, numLessN, percLessN] = getGain(campCap);
	if (gainD == 0 && gainN == 0) return '';
	const getGainText = (campName, gain, gains) =>
		gui.getMessage('equipment_gain') + (campName ? ' (' + campName + ')' : '') + ': ' + gain + (gains.length > 1 && gain > 0 ? ' (' + gains.join(' + ') + ')' : '');
	title.push(getGainText(campReg !== campCap ? gui.getMessage('camp_day_mode') : '', gainD, gainsD));
	title.push(gui.getMessageAndValue('equipment_slotslower', numLessD + ` (${percLessD}%)`));
	if (campReg !== campCap) {
		title.push('\n' + getGainText(gui.getMessage('camp_night_mode'), gainN, gainsN));
		title.push(gui.getMessageAndValue('equipment_slotslower', numLessN + ` (${percLessN}%)`));
	}
	return title.join('\n');
}

function computeItem(item, level, skins) {
	item.event = item.event || NaN;
	if (item.level > level) item.locked |= 1;
	if (item.rskin && !skins[item.rskin]) item.locked |= 2;
	if (item.owned >= item.limit) item.locked |= 4;
	item.gain = 0;
	if (item.type == 'capacity') item.gain = Math.max(0, item.value - Math.min(campReg.capCum[item.width], campCap.capCum[item.width]));
	if (item.type == 'regen') item.gain = Math.max(0, item.value - Math.min(campReg.regCum[item.width], campCap.regCum[item.width]));
}

function setItem(item, hide, sale, saleType, eid, erid, level, reqs, backpack) {
	item.hide = hide;
	item.sale_id = sale.def_id;
	item.sale = saleType;
	item.event = eid;
	item.erid = erid;
	item.level = level;
	item.skin = sale.req_type == 'camp_skin' ? +sale.req_object : 0;
	item.reqs = packHelper.getRequirements(reqs || sale.requirements, backpack);
	const affordable = !(item.reqs ? item.reqs.find(r => r.amount > r.stored) : null);
	if (!affordable) item.locked |= 8;
}

function update() {
	const state = getState();
	const generator = gui.getGenerator();
	const backpack = generator.materials || {};
	const region = +generator.region;
	const level = +generator.level;
	currency = generator.currency;
	updateTime = gui.getUnixTime();
	packHelper.onUpdate();

	const camps = [getCampInfo(generator.camp.buildings), getCampInfo(generator.camp.inactive_b)];
	camps.sort((a, b) => b.regTot - a.regTot);
	campReg = camps[0];
	campCap = camps[1].regTot == 0 ? campReg : camps[1];
	minRegen = Math.min(campReg.regMin, campCap.regMin);
	minCapacity = Math.min(campReg.capMin, campCap.capMin);

	const packs = {};
	packsViewed = {};
	lastPack = 0;
	let lastPackDate = 0;
	for (const pack of gui.getArrayOfInt(generator.packs_b)) {
		if (pack) packs[pack] = true;
	}
	for (const pack of gui.getArray(generator.packs_v)) {
		if (pack) {
			const dt = +pack.viewed;
			packs[pack.def_id] = true;
			packsViewed[pack.def_id] = dt;
			if (dt > lastPackDate) {
				lastPackDate = dt;
				lastPack = pack.def_id;
			}
		}
	}

	const now = gui.getUnixTime();
	const currentOffer = Object.values(gui.getFile('offers')).find(offer => +offer.start <= now && +offer.end > now && gui.getArrayOfInt(offer.regions).includes(region));
	lastOffer = currentOffer ? currentOffer.def_id : 0;

	const { owned, active } = gui.getOwnedActive('building');

	// Determine events
	const events = {};
	for (const event of Object.values(generator.events)) {
		const finished = +event.finished;
		// Shop is open for 7 days after the event ends
		const shopLimit = finished + 86400 * 7;
		const eid = event.def_id;
		if (shopLimit > updateTime) {
			events[eid] = generator.events_region[eid] || 0;
		}
	}
	allEvents = {};
	for (const event of Object.values(gui.getFile('events'))) {
		const finished = +event.end;
		// Shop is open for 7 days after the event ends
		const shopLimit = finished + 86400 * 7;
		const eid = event.def_id;
		if (shopLimit > updateTime && !(eid in events)) {
			events[eid] = region;
		}
		const info = gui.getEventInfo(event);
		allEvents[eid] = { id: eid, year: info.year };
	}

	allItems = {};
	for (const building of Object.values(gui.getFile('buildings'))) {
		const item = getItemFromBuilding(building, owned, active);
		if (item) allItems[item.id] = item;
	}

	// SALES
	let sales = Object.values(gui.getFile('sales')).filter(sale => sale.type == 'building');
	sales.forEach(sale => sale.def_id = +sale.def_id);
	sales = sales.sort((a, b) => a.def_id - b.def_id).reverse();
	const allSkins = {};
	for (const sale of sales) {
		const eid = +sale.event_id || 0;
		const erid = +sale.event_region_id || 0;
		let hide = +sale.hide;
		if (!hide) {
			if (eid) {
				const data = allEvents[eid];
				if (data) {
					data.sale = true;
					if (erid > 1) data.segmented = true;
				}
			}
			const skin = sale.req_type == 'camp_skin' ? +sale.req_object : 0;
			if (skin) {
				allSkins[skin] = skin;
			}
		}
		const item = allItems['b' + sale.object_id];
		if (!item) continue;
		if (eid && (!(eid in events) || (erid != events[eid] && erid != 0))) hide = 1;
		if (hide && (item.sale_id || !item.owned)) continue;
		setItem(item, hide, sale, 'sale', eid, erid, +sale.level, null, backpack);
	}

	const arrEvents = Object.values(allEvents).filter(event => event.sale).sort((a, b) => b.year - a.year);
	let lastYearText = '';
	let htm = Html`<option value="">${gui.getMessage('gui_all')}</option>`;
	for (const event of arrEvents) {
		const yearText = Locale.formatYear(event.year);
		if (lastYearText != yearText) {
			if (lastYearText) htm += '</optgroup>';
			lastYearText = yearText;
			htm += Html`<optgroup label="${gui.getMessageAndValue('events_year', yearText)}">`;
		}
		htm += Html`<option value="${event.id}">${gui.getObjectName('event', event.id)}</option>`;
	}
	if (lastYearText) htm += '</optgroup>';
	Html.set(inputs.event, htm);

	htm = '';
	for (let rid = 1, maxRid = gui.getMaxRegion(); rid <= maxRid; rid++) htm += Html`<option value="${rid}">${gui.getObjectName('region', rid)}</option>`;
	Html.set(inputs.region, htm);

	htm = '';
	for (const skin of Object.values(allSkins).filter(skin => gui.getRegionFromSkin(skin) == 0).sort(gui.sortNumberAscending))
		htm += Html`<option value="${skin}">${gui.getObjectName('skin', skin)}</option>`;
	Html.set(inputs.theme, htm);

	setState(state);

	// OFFERS
	sales = Object.values(gui.getFile('offers')).filter(sale => sale.type == 'building');
	sales = sales.sort((a, b) => +a.def_id - +b.def_id).reverse();
	for (const sale of sales) {
		const item = allItems['b' + sale.object_id];
		if (!item || item.sale_id) continue;
		// Offers are not specified for events
		const eid = +sale.event || 0;
		let erid = +sale.event_region_id || 0;
		for (let region of sale.regions.split(',')) {
			region = +region;
			if (region > 0 && (erid == 0 || region < erid)) erid = region;
		}
		let hide = +sale.hide;
		if (+sale.end <= updateTime) hide = 1;
		if (!eid && erid != region) hide = 1;
		if (eid && (!(eid in events) || erid > events[eid])) hide = 1;
		if (hide && (item.sale_id || !item.owned)) continue;
		setItem(item, hide, sale, 'offer', eid, erid, +sale.level, null, backpack);
	}

	// PACKS
	sales = Object.values(gui.getFile('packs'));
	for (const sale of sales) {
		if (!(sale.def_id in packs)) continue;
		const eid = +sale.event_id || 0;
		const erid = +sale.region_id || 0;
		let hide = +sale.hide;
		const start = packsViewed[sale.def_id] || 0;
		const end = start ? start + (+sale.duration) : 0;
		if (end <= updateTime) hide = 1;
		if (lastPack && sale.def_id == lastPack && hide) lastPack = 0;
		if (eid && (!(eid in events) || erid != events[eid])) hide = 1;
		const items = gui.getArray(sale.items);
		for (let item of items) {
			if (item.type != 'building') continue;
			item = allItems['b' + item.object_id];
			if (!item || item.sale_id) continue;
			if (hide && (item.sale_id || !item.owned)) continue;
			setItem(item, hide, sale, 'pack', eid, erid, +sale.req_level, null, backpack);
		}
	}

	// TIERED OFFERS
	sales = Object.values(gui.getFile('tiered_offers'));
	const possibleOffers = [];
	for (const sale of sales) {
		const start = +sale.start || 0;
		const end = +sale.end || 0;
		const erid = +sale.region_id;
		const hide = (end <= updateTime || start > updateTime || erid > region || +sale.req_level > level) ? 1 : 0;
		if (!hide) possibleOffers.push(sale);
	}
	const viewedOffers = gui.getArrayOfInt(generator.viewed_tiers);
	const boughtTiers = gui.getArrayOfInt(generator.bought_tiers);
	// Only one offer at a time, get the first that is viewed / bought (default is the one for the current region)
	let activeOffer = possibleOffers.find(offer => viewedOffers.includes(+offer.def_id));
	activeOffer = activeOffer || possibleOffers.find(offer => gui.getArray(offer.tiers).find(tier => boughtTiers.includes(+tier.def_id)));
	activeOffer = activeOffer || possibleOffers.find(offer => +offer.region_id == region);
	lastTieredOffer = activeOffer ? activeOffer.def_id : 0;
	for (const sale of sales) {
		const hide = sale != activeOffer;
		const eid = 0;
		const erid = +sale.region_id;
		const tiers = gui.getArray(sale.tiers);
		for (const tier of tiers) {
			const gem = +tier.gem_price;
			const reqs = [{
				material_id: 2,
				amount: gem
			}];
			const items = gui.getArray(tier.items);
			for (let item of items) {
				if (item.type != 'building') continue;
				item = allItems['b' + item.object_id];
				if (!item || item.sale_id) continue;
				if (hide && (item.sale_id || !item.owned)) continue;
				setItem(item, hide, sale, 'tier', eid, erid, +sale.req_level, reqs, backpack);
				item.tname = tier.name_loc;
			}
		}
	}

	// Remove non-owned and not-on-sale; compute other values
	listSkin = {};
	listRegion = {};
	listMaterial = {};
	let coins = 0;
	const skins = getBoughtSkins();
	for (const id of Object.keys(allItems)) {
		const item = allItems[id];
		if (!item.owned && !item.sale_id) {
			delete allItems[id];
			continue;
		}
		if (item.skin) {
			item.rskin = item.skin;
			item.region = gui.getRegionFromSkin(item.skin);
			if (item.region) {
				listRegion[item.region] = true;
			} else {
				item.region = item.skin / 100;
				listSkin[item.skin] = true;
			}
		} else {
			item.region = item.erid || item.region || 1;
			item.rskin = gui.getSkinFromRegion(item.region);
			listRegion[item.region] = true;
		}
		for (const req of item.reqs || []) listMaterial[req.material_id] = true;
		if (item.placed < item.owned && item.sell) coins += item.sell * (item.owned - item.placed);
		computeItem(item, level, skins);
	}
	listSkin = Object.keys(listSkin).map(n => +n).sort(gui.sortNumberAscending);
	listRegion = Object.keys(listRegion).map(n => +n).sort(gui.sortNumberAscending);
	listMaterial = Object.keys(listMaterial).map(n => +n).sort(gui.sortNumberAscending);

	let coins_deco = 0;
	const decorations = gui.getFile('decorations');
	const stored = generator.stored_decorations || {};
	for (const did in stored) {
		const qty = +stored[did];
		const decoration = decorations[did];
		if (decoration && qty) coins_deco += qty * +decoration.sell_price;
	}

	inputs.pack.style.display = lastPack ? '' : 'none';
	inputs.offer.style.display = lastOffer ? '' : 'none';
	inputs.tieredoffer.style.display = lastTieredOffer ? '' : 'none';

	container.querySelector('.stats').innerText = gui.getMessage('equipment_sellout', Locale.formatNumber(coins + coins_deco), Locale.formatNumber(coins), Locale.formatNumber(coins_deco));

	let title = gui.getMessage('equipment_gain') + '\n' + gui.getMessage('equipment_gain_info') + ':';
	title += '\n' + gui.getMessage('camp_capacity') + ' = ' + Locale.formatNumber(minCapacity);
	title += '\n' + gui.getMessage('camp_regen') + ' = ' + Locale.formatNumber(minRegen);
	Array.from(container.querySelectorAll('thead [data-sort-name=gain] img')).forEach(el => {
		el.title = title;
	});
	refresh();
}

function getCampInfo(placed) {
	const buildings = gui.getFile('buildings');
	const quantities = {};
	if (Array.isArray(placed)) placed.forEach(item => quantities[item.def_id] = (quantities[item.def_id] || 0) + 1);
	const regList = [], capList = [], regCum = [0], capCum = [0];
	for (const [id, qty] of Object.entries(quantities)) {
		const building = buildings[id];
		if (building) {
			const cols = +building.columns;
			const reg = +building.stamina_reg;
			const cap = +building.max_stamina;
			const value = (reg > 0 ? reg : cap) / cols;
			const list = reg > 0 ? regList : capList;
			for (let num = +building.columns * qty; num > 0; num--) list.push(value);
		}
	}
	regList.sort(gui.sortNumberAscending);
	capList.sort(gui.sortNumberAscending);
	regList.forEach((v, i) => regCum[i + 1] = regCum[i] + v);
	capList.forEach((v, i) => capCum[i + 1] = capCum[i] + v);
	const info = {
		regList, capList, regCum, capCum,
		regTot: regList.reduce((prev, curr) => prev + curr, 0),
		capTot: capList.reduce((prev, curr) => prev + curr, 0),
		regMin: regList.length ? regList[0] : 0,
		regMax: regList.length ? regList[regList.length - 1] : 0,
		capMin: capList.length ? capList[0] : 0,
		capMax: capList.length ? capList[capList.length - 1] : 0,
	};
	info.regAvg = info.regList.length ? info.regTot / info.regList.length : 0;
	info.capAvg = info.capList.length ? info.capTot / info.regList.length : 0;
	return info;
}

function getState() {
	return {
		show: inputs.show.value,
		from: inputs.from.value,
		shop_from: inputs.shopfrom.value,
		event: allEvents ? inputs.event.value : inputs.event.getAttribute('data-value'),
		region: allEvents ? inputs.region.value : inputs.region.getAttribute('data-value'),
		theme: allEvents ? inputs.theme.value : inputs.theme.getAttribute('data-value'),
		owned: inputs.owned.value,
		shop: inputs.shop.value,
		affordable: inputs.affordable.value,
		useful: inputs.useful.value,
		hidemax: !!filterHideMax,
		grid: !!showAsGrid,
		type: inputs.type.value,
		level: filterLevelComparison + filterLevelType + (filterLevel > 0 ? filterLevel : ''),
		skin: filterSkin,
		material: filterMaterial,
		search: inputs.search.value,
		sort: gui.getSortState(smartTable)
	};
}

function setState(state) {
	state.show = gui.setSelectState(inputs.show, state.show);
	state.from = gui.setSelectState(inputs.from, state.from);
	state.shop_from = gui.setSelectState(inputs.shopfrom, state.shop_from);
	for (const option of inputs.type.querySelectorAll('option:not([value=""]):not([value="regen"]):not([value="capacity"])')) option.disabled = state.show == '';
	if (allEvents) {
		state.event = gui.setSelectState(inputs.event, state.event);
		state.region = gui.setSelectState(inputs.region, state.region);
		state.theme = gui.setSelectState(inputs.theme, state.theme);
	}
	inputs.event.setAttribute('data-value', state.event);
	inputs.region.setAttribute('data-value', state.region);
	inputs.theme.setAttribute('data-value', state.theme);
	state.owned = gui.setSelectState(inputs.owned, state.owned);
	state.shop = gui.setSelectState(inputs.shop, state.shop);
	state.affordable = gui.setSelectState(inputs.affordable, state.affordable);
	state.useful = gui.setSelectState(inputs.useful, state.useful);
	filterHideMax = !!state.hidemax;
	showAsGrid = !!state.grid;
	state.type = gui.setSelectState(inputs.type, state.type);
	const level = String(state.level || '').toUpperCase();
	let match = level.match(/[EGL]/);
	filterLevelComparison = match ? match[0] : '';
	match = level.match(/C/);
	filterLevelType = match ? match[0] : '';
	match = level.match(/\d+/);
	filterLevel = Math.min(999, Math.max(1, (match && parseInt(match[0])) || 0));
	filterSkin = state.skin;
	filterMaterial = state.material;
	inputs.search.value = state.search || '';
	gui.setSortState(state.sort, smartTable, 'name');
	updateButton();
}

function updateButton() {
	const flag = !!(filterSkin || filterMaterial || filterLevelComparison || filterHideMax);
	Html.set(inputs.advanced, Html(gui.getMessage(flag ? 'menu_on' : 'menu_off')));
	inputs.advanced.classList.toggle('activated', flag);

	const setDisplay = (el, flag) => el.style.display = flag ? '' : 'none';
	const isShop = inputs.show.value == 'shop';
	const eventId = inputs.event.value;
	const isSegmented = allEvents && allEvents[eventId] && allEvents[eventId].segmented;
	setDisplay(inputs.from.parentNode, !isShop);
	setDisplay(inputs.shopfrom.parentNode, isShop);
	setDisplay(inputs.event.parentNode, isShop && inputs.shopfrom.value == 'event');
	setDisplay(inputs.region.parentNode, isShop && (inputs.shopfrom.value == 'region' || (inputs.shopfrom.value == 'event' && isSegmented)));
	setDisplay(inputs.theme.parentNode, isShop && inputs.shopfrom.value == 'theme');
}

function onClickAdvanced() {
	const getValueSelected = (value, flag) => Html`value="${value}"${flag ? ' selected' : ''}`;
	const getValueCurrent = (value, current) => getValueSelected(value, value == current);
	let htm = '';
	htm += Html`<label for="d_grid"><b data-lbl="grid">${gui.getMessage('pillars_grid')}</b> <input id="d_grid" name="grid" type="checkbox" style="vertical-align:middle" ${showAsGrid ? 'checked' : ''} data-method="grid"></label>`;
	htm += Html`<br><br>`;
	htm += Html`<b data-lbl="level">${gui.getMessage('gui_level')}</b>: `;
	htm += Html`<select name="levelcomparison" data-method="level">`;
	htm += Html`<option ${getValueCurrent('', filterLevelComparison)}>${gui.getMessage('equipment_level_none')}</option>`;
	htm += Html`<option ${getValueCurrent('E', filterLevelComparison)}>${gui.getMessage('equipment_level_eq')}</option>`;
	htm += Html`<option ${getValueCurrent('L', filterLevelComparison)}>${gui.getMessage('equipment_level_le')}</option>`;
	htm += Html`<option ${getValueCurrent('G', filterLevelComparison)}>${gui.getMessage('equipment_level_ge')}</option>`;
	htm += Html`</select>&#32;`;
	htm += Html`<select name="leveltype" data-method="level">`;
	htm += Html`<option ${getValueCurrent('', filterLevelType)}>${gui.getMessage('equipment_level_your')} (${Locale.formatNumber(+gui.getGenerator().level)})</option>`;
	htm += Html`<option ${getValueCurrent('C', filterLevelType)}>${gui.getMessage('equipment_level_this')}</option>`;
	htm += Html`</select>&#32;`;
	htm += Html`<input type="number" name="level" min="1" max="999" maxlength="3" value=${filterLevel ? filterLevel : ''}>`;
	htm += Html`<br><br>`;
	htm += Html`<label for="d_hidemax"><b data-lbl="hidemax">${gui.getMessage('equipment_hidemax')}</b> <input id="d_hidemax" name="hidemax" type="checkbox" style="vertical-align:middle" ${filterHideMax ? 'checked' : ''} data-method="hidemax"></label>`;
	htm += Html`<br><br>`;
	htm += Html`<table class="equipment-advanced-table"><tr>`;
	htm += Html`<td><b data-lbl="skin">${gui.getMessage('gui_theme_required')}</b></td>`;
	htm += Html`<td><b data-lbl="material1">${gui.getMessage('equipment_include_material')}</b></td>`;
	htm += Html`<td><b data-lbl="material0">${gui.getMessage('equipment_exclude_material')}</b></td>`;
	htm += Html`</tr><tr>`;
	htm += Html`<td><select name="skin" multiple data-method="skin">`;
	htm += Html`<optgroup label="${gui.getMessage('gui_region').toUpperCase()}">`;
	const list = gui.getArrayOfInt(filterSkin);
	for (const rid of listRegion) {
		const id = gui.getSkinFromRegion(rid);
		htm += `<option ${getValueSelected(id, list.includes(id))}>${gui.getObjectName('region', rid)}</option>`;
	}
	htm += Html`</optgroup>`;
	htm += Html`<optgroup label="${gui.getMessage('gui_theme').toUpperCase()}">`;
	for (const item of listSkin.map(id => [id, gui.getObjectName('skin', id)]).sort((a, b) => a[1].localeCompare(b[1]))) {
		htm += `<option ${getValueSelected(item[0], list.includes(item[0]))}>${item[1]}</option>`;
	}
	htm += Html`</optgroup>`;
	htm += Html`</select></td>`;
	const materials = gui.getFile('materials');
	const items = listMaterial.map(id => {
		let name = gui.getObjectName('material', id);
		name = name.substr(0, 1) + name.substr(1).toLowerCase();
		return [id, name, +materials[id].event_id];
	}).sort((a, b) => a[1].localeCompare(b[1]));
	const addMaterialList = (isInclude) => {
		const list = gui.getArrayOfInt(filterMaterial).map(isInclude ? n => n : n => -n).filter(n => n > 0);
		const name = 'material' + (isInclude ? 1 : 0);
		htm += Html`<td><select name="${name}" multiple data-method="${name}">`;
		htm += Html`<optgroup label="${gui.getMessage('gui_from_regions').toUpperCase()}">`;
		for (const item of items.filter(item => item[2] == 0)) {
			htm += `<option ${getValueSelected(item[0], list.includes(item[0]))}>${item[1]}</option>`;
		}
		htm += Html`</optgroup>`;
		htm += Html`<optgroup label="${gui.getMessage('gui_from_events').toUpperCase()}">`;
		for (const item of items.filter(item => item[2] > 0)) {
			htm += `<option ${getValueSelected(item[0], list.includes(item[0]))}>${item[1]}</option>`;
		}
		htm += Html`</optgroup>`;
		htm += Html`</select></td>`;
	};
	addMaterialList(true);
	addMaterialList(false);
	htm += Html`</tr></tr>`;
	const addClrInvButtons = (suffix) => {
		htm += Html`<td><input data-method="clr-${suffix}" type="button" class="small" value="${gui.getMessage('gui_filter_clear')}"/>`;
		htm += Html`&#32;<input data-method="inv-${suffix}" type="button" class="small" value="${gui.getMessage('gui_filter_invert')}"/></td>`;
	};
	addClrInvButtons('skin');
	addClrInvButtons('material1');
	addClrInvButtons('material0');
	htm += Html`</tr></table>`;
	gui.dialog.show({
		title: gui.getMessage('gui_advancedfilter'),
		html: htm,
		style: [Dialog.CONFIRM, Dialog.CANCEL, Dialog.WIDEST, Dialog.AUTORUN]
	}, function (method, params) {
		if (method == Dialog.CANCEL) return;
		if (method == 'level' || method == Dialog.AUTORUN) {
			gui.dialog.element.querySelector('[name=leveltype]').style.display = params.levelcomparison ? '' : 'none';
			gui.dialog.element.querySelector('[name=level]').style.display = params.levelcomparison && params.leveltype == 'C' ? '' : 'none';
		}
		let shouldRefresh = method == 'grid' || method == 'hidemax' || method == 'skin' || method == 'material0' || method == 'material1' || method == 'level' || method == Dialog.AUTORUN;
		if (method.startsWith('clr-') || method.startsWith('inv-')) {
			shouldRefresh = true;
			const fn = method.startsWith('clr-') ? o => o.selected = false : o => o.selected = !o.selected;
			method = method.substr(4);
			const select = gui.dialog.element.querySelector(`[name=${method}`);
			for (const option of select.options) fn(option);
			params[select.name] = select.selectedOptions.length > 0;
		}
		if (method == 'material0' || method == 'material1') {
			const index = method == 'material0' ? 0 : 1;
			const select0 = gui.dialog.element.querySelector(`[name=material${index}`);
			const select1 = gui.dialog.element.querySelector(`[name=material${1 - index}`);
			const hash = {};
			for (const option of select0.selectedOptions) hash[option.value] = true;
			for (const option of select1.options) {
				if (option.value in hash) option.selected = false;
			}
			params[select0.name] = select0.selectedOptions.length > 0;
			params[select1.name] = select1.selectedOptions.length > 0;
		}
		if (shouldRefresh) {
			const setActivated = (lbl, flag) => gui.dialog.element.querySelector('[data-lbl=' + lbl + ']').classList.toggle('equipment-activated', !!flag);
			setActivated('grid', params.grid);
			setActivated('level', params.levelcomparison);
			setActivated('hidemax', params.hidemax);
			setActivated('skin', params.skin);
			setActivated('material1', params.material1);
			setActivated('material0', params.material0);
			return;
		}
		filterLevelComparison = params.levelcomparison;
		filterLevelType = params.leveltype;
		filterLevel = params.level || 0;
		filterHideMax = params.hidemax;
		showAsGrid = params.grid;
		const hash = {};
		for (const option of gui.dialog.element.querySelector('[name=material1').selectedOptions) hash[option.value] = option.value;
		for (const option of gui.dialog.element.querySelector('[name=material0').selectedOptions) hash[option.value] = -option.value;
		const keys = Object.keys(hash).map(n => parseInt(n)).sort(gui.sortNumberAscending);
		filterSkin = gui.getArrayOfInt(params.skin).sort(gui.sortNumberAscending).join(',');
		filterMaterial = keys.map(n => hash[n]).join(',');
		refresh();
	});
}

function getCurrentItems(state) {
	currentItems = {};
	if (state.show != 'shop') {
		currentItems = allItems;
	} else {
		const validSale = {
			building: true,
			decoration: true,
			material: true,
			token: true,
			usable: true
		};
		const generator = gui.getGenerator();
		const sales = Object.values(gui.getFile('sales')).filter(sale => {
			if (!(sale.type in validSale)) return false;
			const shopId = +sale.shop_id || 0;
			return shopId == 0 || shopId == 2 || shopId == 3;
		});
		const buildings = gui.getFile('buildings');
		const decorations = gui.getFile('decorations');
		const usables = gui.getFile('usables');
		const materials = gui.getFile('materials');
		const tokens = gui.getFile('tokens');
		const level = +generator.level;
		const skins = getBoughtSkins();
		const backpack = generator.materials || {};
		const { owned, active } = gui.getOwnedActive('building');
		const { owned: decoOwned, active: decoActive } = gui.getOwnedActive('decoration');
		const usaOwned = generator.usables;
		const tokOwned = generator.tokens;
		const matOwned = generator.materials;

		const addSale = (sale) => {
			if (+sale.hide) return null;
			let item = sale.type == 'building' ? allItems['b' + sale.object_id] : null;
			if (item == null) {
				if (sale.type == 'building') {
					const building = buildings[sale.object_id];
					item = getItemFromBuilding(building, owned, active);
				} else {
					item = {};
					item.type = sale.type;
					item.oid = sale.object_id;
					item.amount = +sale.amount || 1;
					item.id = item.type.substr(0, 1) + item.oid + (item.amount == 1 ? '' : 'x' + item.amount);
					item.owned = item.placed = 0;
					item.sale_id = sale.def_id;
					item.name = gui.getObjectName(item.type, item.oid);
					item.limit = +Infinity;
					item.sell = 0;
					item.locked = 0;
					if (sale.type == 'decoration') {
						item.owned = decoOwned[item.oid] || 0;
						item.placed = decoActive[item.oid] || 0;
						const decoration = decorations[item.oid];
						if (!decoration) return;
						item.sell = +decoration.sell_price;
						item.value = +sale.exp;
					} else if (sale.type == 'usable') {
						const usable = usables[item.oid];
						if (!usable) return;
						item.owned = usaOwned[item.oid] || 0;
						item.sell = +usable.sell_price;
						item.value = usable.action == 'add_stamina' ? +usable.value : 0;
					} else if (sale.type == 'material') {
						const material = materials[item.oid];
						if (!material) return;
						item.owned = matOwned[item.oid] || 0;
						item.sell = +material.sell_price;
					} else if (sale.type == 'token') {
						const token = tokens[item.oid];
						if (!token) return;
						item.owned = tokOwned[item.oid] || 0;
						item.sell = +token.sell_price;
					}
				}
				setItem(item, +sale.hide, sale, 'sale', +sale.event_id || 0, +sale.event_region_id || 0, +sale.level, null, backpack);
				if (item.skin) {
					item.rskin = item.skin;
					item.region = gui.getRegionFromSkin(item.skin);
					if (!item.region) {
						item.region = item.skin / 100;
					}
				} else {
					item.region = item.erid || item.region || 1;
					item.rskin = gui.getSkinFromRegion(item.region);
				}
				computeItem(item, level, skins);
			}
			if (item) {
				if (!(item.id in currentItems) || item.reqs.length) currentItems[item.id] = item;
			}
		};
		if (state.shop_from == 'theme' || (state.shop_from == 'region' && state.region > 1)) {
			const skin = state.shop_from == 'theme' ? state.theme : gui.getSkinFromRegion(state.region);
			for (const sale of sales) {
				if (!+sale.event_id && sale.req_type == 'camp_skin' && +sale.req_object == skin) addSale(sale);
			}
		} else if (state.shop_from == 'region') {
			// Egypt
			for (const sale of sales) {
				if (!+sale.event_id && +sale.req_object == 0) addSale(sale);
			}
		} else if (state.shop_from == 'event') {
			for (const sale of sales) {
				if (+sale.event_id == state.event && (+sale.event_region_id == state.region || +sale.event_region_id == 0)) addSale(sale);
			}
		}
	}
}

function refresh() {
	gui.updateTabState(tab);
	const state = getState();
	updateButton(state);

	const fnSearch = gui.getSearchFilter(state.search);
	const type = (state.type || '').toLowerCase();
	// We use a negative here and NaN in case no comparison must be checked
	// This works because NaN is never equal to any value, so the "if" is always false.
	const not_owned = state.owned ? state.owned == 'no' : NaN;
	const not_shop = state.shop ? state.shop == 'no' : NaN;
	const from = state.show == '' ? state.from : '';
	const not_affordable = state.affordable ? state.affordable == 'no' : NaN;
	const not_useful = state.useful ? state.useful == 'no' : NaN;
	const hideMax = state.hidemax;

	let listSkin = gui.getArrayOfInt(filterSkin);
	if (listSkin.length == 0) listSkin = null;
	let listMaterialInclude = gui.getArrayOfInt(filterMaterial).filter(n => n > 0);
	let listMaterialExclude = gui.getArrayOfInt(filterMaterial).filter(n => n < 0).map(n => -n);
	if (listMaterialInclude.length == 0) listMaterialInclude = null;
	if (listMaterialExclude.length == 0) listMaterialExclude = null;

	const level = filterLevelType ? filterLevel : +gui.getGenerator().level;
	let fnLevel = null;
	if (filterLevelComparison == 'E') fnLevel = value => value != level;
	if (filterLevelComparison == 'L') fnLevel = value => value > level;
	if (filterLevelComparison == 'G') fnLevel = value => value < level;

	function isVisible(item) {
		if (fnSearch && !fnSearch(item.name.toUpperCase())) return false;
		if (type) {
			const skip = type == 'equipment' ? item.type != 'regen' && item.type != 'capacity' : item.type != type;
			if (skip) return false;
		}
		// NaN is never equal to true/false, so this will not trigger
		if (not_owned == (item.owned > 0)) return false;
		const inShop = item.sale_id > 0 && !item.hide;
		if (not_shop == inShop) return false;
		if (from == 'offer' && item.sale != 'offer') return false;
		if (from == 'pack' && item.sale != 'pack') return false;
		if (from == 'tier' && item.sale != 'tier') return false;
		if (from == 'event' && isNaN(item.event)) return false;
		if (from == 'theme' && (item.event > 0 || item.region >= 1)) return false;
		if (from == 'region' && (item.event > 0 || item.region < 1 || item.sale != 'sale')) return false;
		if (not_affordable == (item.locked == 0)) return false;
		if (not_useful == (item.gain > 0)) return false;
		if (hideMax && item.owned >= item.limit) return false;
		if (listSkin && !listSkin.includes(item.rskin)) return false;
		if (listMaterialExclude) {
			for (const req of item.reqs || []) {
				if (listMaterialExclude.includes(req.material_id)) return false;
			}
		}
		if (listMaterialInclude) {
			const found = (item.reqs || []).find(req => listMaterialInclude.includes(req.material_id));
			if (!found) return false;
		}
		if (fnLevel && fnLevel(item.level)) return false;
		return true;
	}

	getCurrentItems(state);
	let items = Object.values(currentItems);
	const total = items.length;
	items = items.filter(isVisible);
	Array.from(container.querySelectorAll('.equipment tfoot td')).forEach(cell => {
		cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(total));
	});

	const sort = gui.getSortFunction(null, smartTable, 'name');
	items = sort(items);

	const tbody = smartTable.tbody[0];
	if (showAsGrid) {
		Html.set(tbody, Html`<tr><td colspan="16" class="grid-container"><div style="display:none"></div></td></tr>`);
		const parent = tbody.querySelector('div');
		for (const item of items) {
			if (!item.div) item.div = Html.get(Html`<div data-id="${item.id}" class="pack-item-placeholder" data-lazy></div>`)[0];
			parent.appendChild(item.div);
		}
		setTimeout(() => parent.style.display = '', 50);
	} else {
		Html.set(tbody, '');
		for (const item of items) {
			if (!item.row) item.row = Html.get(Html`<tr data-id="${item.id}" height="65" data-lazy></tr>`)[0];
			tbody.appendChild(item.row);
		}
	}
	gui.collectLazyElements(tbody);
	smartTable.syncLater();
}

const lockedClass = Html` class="locked"`;

function updateItem(div) {
	const id = div.getAttribute('data-id');
	const item = currentItems[id];
	let start = 0;
	let end = 0;
	let price, saleMessageId, saleExtras;
	if (item.sale == 'offer') {
		const offer = bgp.Data.files.offers[item.sale_id];
		saleMessageId = 'gui_offer';
		start = +offer.start;
		end = +offer.end;
	} else if (item.sale == 'tier') {
		const offer = bgp.Data.files.tiered_offers[item.sale_id];
		saleMessageId = 'gui_tieredoffer';
		saleExtras = gui.getString(item.tname);
		start = +offer.start;
		end = +offer.end;
	} else if (item.sale == 'pack') {
		const pack = bgp.Data.files.packs[item.sale_id];
		saleMessageId = 'gui_pack';
		saleExtras = gui.getString(pack.name_loc);
		start = packsViewed[pack.def_id] || 0;
		end = start ? start + (+pack.duration) : 0;
		price = pack.prices.find(p => p.currency == currency) || pack.prices.find(p => p.currency == 'EUR') || pack.prices[0];
	}
	let badgeHtml = '';
	if (saleMessageId) {
		badgeHtml = Html`<div class="offer" data-type="${item.sale}" data-id="${item.sale_id}" title="${gui.getMessageAndValue(saleMessageId, item.sale_id)}">${gui.getMessage(saleMessageId)}</div>`;
	}
	let costClass = 'cost';
	let costTitle = [];
	if (item.hide && item.sale_id) {
		costTitle.push(gui.getMessage('equipment_notonsale'));
		costClass += ' dot';
	}
	if (item.sale == 'pack' || item.sale == 'tier') {
		costTitle.push(gui.getMessage('equipment_price_info'));
		costClass += ' dot2';
	}
	costTitle = costTitle.join('\n');
	const type = item.type == 'capacity' || item.type == 'regen' ? 'building' : item.type;
	if (type == 'building' && item.gainTitle === undefined) item.gainTitle = computeItemGain(item);
	if (div.tagName == 'TR') {
		let htm = '';
		htm += Html.br`<td><img class="building tooltip-event" src="${gui.getObjectImage(type, item.oid)}"></td>`;
		htm += Html.br`<td>${item.name}`;
		if (saleMessageId) {
			htm += Html.br`<br>${badgeHtml}${saleExtras}`;
		}
		if (start || end) {
			if (end < start) end = start;
			htm += Html.br`<div class="offer-dates">`;
			if (start) htm += Html.br`<span${start > updateTime || end <= updateTime ? lockedClass : ''}>${Locale.formatDateTime(start)}</span> - `;
			htm += Html.br`<span${end <= updateTime ? lockedClass : ''}>${Locale.formatDateTime(end)}</span>`;
			htm += Html.br`</div>`;
		}
		htm += Html.br`</td>`;
		htm += Html.br`<td${(item.locked & 1) ? lockedClass : ''}>${item.level ? Locale.formatNumber(item.level) : ''}</td>`;
		htm += Html.br`<td${(item.locked & 2) ? lockedClass : ''}>${gui.getObjectImg('skin', item.rskin, 32, false, 'desc')}</td>`;
		htm += Html.br`<td>${item.event ? gui.getObjectImg('event', item.event, 32, false, 'desc') : ''}</td>`;
		htm += Html.br`<td>${item.sell ? Locale.formatNumber(item.sell) : ''}</td>`;
		htm += Html.br`<td class="${(isFinite(item.limit) ? 'add_slash' : 'align_right no_right_border') + (item.locked & 4 ? ' locked' : '')}">${Locale.formatNumber(item.owned)}</td>`;
		htm += Html.br`<td${(item.locked & 4) ? lockedClass : ''}>${Locale.formatNumber(item.limit)}</td>`;
		if (type == 'building') {
			if (item.gainTitle === undefined) item.gainTitle = computeItemGain(item);
			htm += Html.br`<td class="no_right_border"><img src="/img/gui/${item.type}.png" title="${gui.getMessage(item.type == 'capacity' ? 'camp_capacity' : 'camp_regen')}"></td>`;
			htm += Html.br`<td>${Locale.formatNumber(item.value)}</td>`;
			htm += Html.br`<td colspan="2" class="wh"><div>${Locale.formatNumber(item.width)} &#215; ${Locale.formatNumber(item.height)}<div><div class="equipment_mask" style="--w:${item.width};--h:${item.height}"></div></td>`;
			htm += Html.br`<td>${Locale.formatNumber(item.slotvalue)}</td>`;
			htm += item.gainTitle ? Html.br`<td class="help dot2" title="${Html(item.gainTitle)}">` : Html.br`<td>`;
			htm += Html.br`${item.gain ? '+' + Locale.formatNumber(item.gain) : ''}</td>`;
		} else if (type == 'decoration') {
			htm += Html.br`<td class="no_right_border"><img src="/img/gui/deco.png" title="${gui.getMessage('gui_decoration')}"></td>`;
			htm += Html.br`<td class="bonus" colspan="5">${Locale.formatNumber(item.value)}${gui.getObjectImg('system', 1, undefined, true)}</td>`;
		} else if (type == 'usable') {
			htm += Html.br`<td class="no_right_border"><img src="/img/gui/usable.png" title="${gui.getMessage('gui_usable')}"></td>`;
			if (item.value) {
				htm += Html.br`<td class="bonus" colspan="5">${Locale.formatNumber(item.value)}${gui.getObjectImg('system', 2, undefined, true)}</td>`;
			} else {
				htm += Html.br`<td class="bonus" colspan="5">${item.name}</td>`;
			}
		} else {
			htm += Html.br`<td colspan="6"></td>`;
		}
		htm += Html.br`<td class="${costClass}"${costTitle ? Html` title="${costTitle}"` : ''}>`;
		const reqs = gui.getArray(item.reqs);
		if (price) {
			htm += Html.br(price.currency + ' ' + Locale.formatNumber(+price.amount, 2));
		} else if (reqs.length == 1 && reqs[0].amount == 0) {
			htm += Html.br(gui.getMessage('equipment_free'));
		} else {
			let first = true;
			for (const req of reqs) {
				if (!first) htm += `<br>`;
				first = false;
				htm += packHelper.getMaterialImg(req);
			}
		}
		htm += Html.br`</td>`;
		item.row = Html.get('<tr>' + htm + '</tr>')[0];
		item.row.setAttribute('data-id', id);
		div.replaceWith(item.row);
	} else {
		const obj = {};
		obj.object_id = item.oid;
		obj.type = item.type == 'regen' || item.type == 'capacity' ? 'building' : item.type;
		obj.amount = item.amount || 1;
		obj.owned = obj.type == 'building' || obj.type == 'decoration' ? item.owned : undefined;
		obj.limit = isFinite(item.limit) ? item.limit : 0;
		obj.requirements = item.reqs || [];
		const packItem = packHelper.getItem(obj);
		packItem.title = gui.getObjectName(obj.type, obj.object_id);
		const html = packHelper.getHtml(packItem);
		Html.set(div, html);
		const costEl = div.querySelector('.cost');
		costEl.className = costClass;
		if (saleMessageId) {
			if (price) badgeHtml += Html`<span>${price.currency + ' ' + Locale.formatNumber(+price.amount, 2)}</span>`;
			const badge = Html.get(badgeHtml)[0];
			if (badge.nextElementSibling) costEl.appendChild(badge.nextElementSibling);
			let title = badge.title;
			badge.removeAttribute('title');
			costEl.insertBefore(badge, costEl.firstChild);
			if (saleExtras) title += '\n' + saleExtras;
			if (start || end) {
				if (end < start) end = start;
				title += '\n' + Locale.formatDateTime(start) + ' - ' + Locale.formatDateTime(end);
			}
			costTitle = title + (costTitle ? '\n' + costTitle : '');
		}
		costEl.title = costTitle;
		if (item.sale_id > 0 && item.hide) div.classList.add('notinshop');
		if (item.locked) div.classList.add('locked');
		div.classList.add('tooltip-event');
		let title = div.firstElementChild.title;
		if (item.event) title += '\n' + gui.getMessageAndValue('gui_event', gui.getObjectName('event', item.event));
		if (item.level) title += '\n' + gui.getMessageAndValue('gui_level_required', Locale.formatNumber(item.level)).replace(/\n+/g, ' ');
		if (item.rskin && item.rskin != 1) title += '\n' + gui.getMessageAndValue('gui_theme_required', gui.getObjectName('skin', item.rskin)).replace(/\n+/g, ' ');
		if (item.gainTitle) title += '\n\n' + item.gainTitle;
		div.firstElementChild.title = title;
	}
	const badge = div.querySelector('.offer[data-type]');
	if (badge) {
		badge.style.cursor = 'zoom-in';
		badge.addEventListener('click', (event) => showOffer(event.target.getAttribute('data-type'), +event.target.getAttribute('data-id')));
	}
}

function onTooltip(event) {
	const element = event.target;
	let src;
	if (element.tagName == 'IMG') {
		src = element.src;
	} else {
		const img = element.querySelector('.image img');
		src = img.src;
	}
	if (src) {
		const htm = Html.br`<div class="equipment-tooltip"><img src="${src}"/></div>`;
		Tooltip.show(element, htm);
	}
}

function showOffer(type, id, options) {
	options = options || {};
	let blocks = [];
	let title = '';
	if (type == 'pack') {
		blocks = getPacks(id);
		title = gui.getString(blocks[0].name_loc);
		const pack = gui.getFile('packs')[id];
		const eid = pack && +pack.event_id;
		const event = gui.getObject('event', eid);
		if (event) title += `\v${gui.getMessageAndValue('gui_event', gui.getObjectName('event', eid))}`;
	} else if (type == 'tier') {
		blocks = getTieredOffers(id);
		title = gui.getMessage('gui_tieredoffer');
	} else if (type == 'offer') {
		blocks = getOffers(id);
		title = gui.getMessage('gui_offer');
	}

	let block = blocks.find(block => block.id == id);
	if (options.rid !== undefined || options.price !== undefined) {
		const blocks2 = blocks.filter(block => !block.limited);
		const getWeight = v => v === null ? 0 : (v ? 50 - v : 100);
		blocks2.forEach(block => {
			block.rw = getWeight(options.rid ? block.rid - options.rid : null);
			block.pw = getWeight(options.price ? (block.price - options.price) / 100 : null);
		});
		blocks2.sort((a, b) => (b.rw - a.rw) || (b.pw - a.pw));
		block = blocks2[0] || block;
	}
	const current = { rid: block.rid, price: block.price, date: block.date };
	let showInRow = false;
	let subTitle;

	const html = getDetails();
	gui.dialog.show({
		title: title + subTitle,
		html,
		style: [Dialog.CLOSE, Dialog.WIDEST]
	}, function (method, params) {
		if (method == 'row' || method == 'rid' || method == 'price' || method == 'date') {
			if (method == 'rid' || method == 'price' || method == 'date') {
				current[method] = options[method] = +params[method];
			} else if (method == 'row') {
				showInRow = params.row == 'on';
			}
			gui.dialog.setHtml(getDetails());
			const div = gui.dialog.element.querySelector('.equipment_pack');
			div.parentNode.style.overflow = 'hidden';
			gui.dialog.setTitle(title + subTitle);
			try { gui.dialog.element.querySelector(`[data-method="${method}"`).focus(); } catch (e) { }
		}
		if (options.callback && (method == Dialog.CLOSE || method == Dialog.CANCEL)) options.callback();
	});

	function getSelection(current) {
		return blocks.filter(block => (current.rid == -1 || block.rid == current.rid) &&
			(current.price == -1 || block.price == current.price) &&
			(current.date == -1 || block.date == current.date)
		).sort((a, b) => (a.date || 0) - (b.date || 0) || (a.rid || 0) - (b.rid || 0) || (a.price || 0) - (b.price || 0));
	}

	function optionHtml(value, text, current) {
		return Html.br`<option value="${value}"${Html(value == current ? ' selected' : '')}>${text}</option>`;
	}

	function getDetails() {
		let htm = '';

		htm += Html.br`<table><tr>`;
		if (type == 'offer') {
			const dates = getDistincts(getSelection(Object.assign({}, current, { date: -1 })).map(block => block.date));
			htm += Html.br`<td>${gui.getMessage('gui_offer')} <select name="date" data-method="date" style="margin-bottom:2px">`;
			if (dates.length > 1) htm += optionHtml(-1, '[ ' + gui.getMessage('gui_all').toUpperCase() + ' ]', current.date);
			for (const date of dates) htm += optionHtml(date, Locale.formatDateTime(date), current.date);
			htm += Html.br`</select></td>`;
		}
		const regions = getDistincts(getSelection(Object.assign({}, current, { rid: -1 })).map(block => block.rid));
		if (regions.length > 1) {
			htm += Html.br`<td>${gui.getMessage('gui_region')} <select name="rid" data-method="rid" style="margin-bottom:2px">`;
			if (type != 'tier') htm += optionHtml(-1, '[ ' + gui.getMessage('gui_all').toUpperCase() + ' ]', current.rid);
			for (const rid of regions) htm += optionHtml(rid, gui.getObjectName('region', rid), current.rid);
			htm += Html.br`</select></td>`;
		}
		const prices = getDistincts(getSelection(Object.assign({}, current, { price: -1 })).map(block => block.price));
		if (prices.length > 1 || (prices.length == 1 && prices[0] > 0)) {
			htm += Html.br`<td>${gui.getMessage(type == 'tier' ? 'gui_type' : 'gui_cost')} <select name="price" data-method="price" style="margin-bottom:2px">`;
			if (prices.length > 1) htm += optionHtml(-1, '[ ' + gui.getMessage('gui_all').toUpperCase() + ' ]', current.price);
			for (const price of prices) htm += optionHtml(price, blocks.find(block => block.price == price).priceText, current.price);
			htm += Html.br`</select></td>`;
		}
		if (type == 'tier' && current.price == -1) {
			htm += Html.br`<td><label>Row&nbsp;<input type="checkbox" name="row" style="vertical-align: bottom" data-method="row"${showInRow ? ' checked' : ''}>`;
			htm += Html.br`</label></td>`;
		}
		htm += Html.br`</tr></table>`;

		const selection = getSelection(current);
		const result = [];
		const prev = {};
		const allLimited = selection.length == selection.filter(p => p.limited).length;

		subTitle = type == 'pack' && selection.length == 1 ? `\v${gui.getMessageAndValue('gui_pack', selection[0].id)}` : '';
		for (const block of selection) {
			let htm = '';
			let pre = '';
			const hasSection = current.date == -1 || current.rid == -1 || current.price == -1 || type == 'tier';
			if (type == 'tier') {
				pre += Html.br`<span class="outlined-text" title="${gui.getMessage('gui_type')} ${block.priceText}\n${gui.getString(block.name_loc)}">${block.priceText + block.tier}</span>`;
				pre += Html.br`<span class="tier_cost" title="${gui.getObjectName('material', 2)}">${Locale.formatNumber(block.gems)}${gui.getObjectImg('material', 2, 28, false)}</span>`;
			}
			if (pre) {
				pre = `<td class="td-section"><div class="pack-item-container"><div class="pack-item section">${pre}</div></div></td>`;
			}
			block.items.forEach((item, index) => {
				htm += Html.br`<td class="td-item"><div class="pack-item-container">${packHelper.getHtml(item)}</div></td>`;
				if (!(pre || hasSection) && index == 2 && block.items.length >= 5) htm += `</tr><tr>`;
			});
			if (htm in prev) continue;
			prev[htm] = true;
			if (current.date == -1 || current.rid == -1 || (current.price == -1 && type != 'tier')) {
				const items = [];
				if (current.date == -1) items.push(Html.br`${Locale.formatDate(block.date)}`);
				if (current.rid == -1) items.push(Html.br`${items.length ? ' ' : ''}${gui.getObjectImg('region', block.rid, 0, false, 'desc')} ${gui.getObjectName('region', block.rid)}`);
				if (current.price == -1) {
					let t = Html.br`${items.length ? ' \u2014 ' : ''}${block.priceText}`;
					if (!allLimited && block.limited) t += Html.br` <img src="/img/gui/q-hard.png" title="${Html(gui.getWrappedText(gui.getMessage('equipment_pfdisclaimer')))}">`;
					items.push(t);
				}
				pre = Html.br`<td colspan="${block.items.length}" class="pack-title">` + items.join('') + Html.br`</td></tr><tr>` + pre;
			}
			if (type == 'tier' && block.tier == 1) {
				pre = Html.br`<td></td><td colspan="${block.items.length}" class="pack-title">${gui.getMessage('gui_type')} ${block.priceText} &mdash; ${Locale.formatNumber(block.tgems)} ${gui.getObjectImg('material', 2)}</td></tr><tr>` + pre;
			}
			result.push(`<table ${hasSection ? ' style="margin-top:2px"' : ''}><tr>${pre + htm}</tr></table>`);
		}
		const len = result.length;
		let rows = len || 1;
		let columns = 1;
		let isTier5 = false;
		if (type == 'tier' && showInRow && len % 5 == 0) {
			columns = len / 5;
			rows = 5;
		} else if (len > 5 && type == 'tier') {
			columns = len >= 15 ? 3 : 2;
			isTier5 = len % 5 == 0;
			rows = isTier5 ? Math.floor((len + columns * 5 - 1) / (columns * 5)) * 5 : Math.ceil(rows / columns);
		} else if (len > 6 || (len > 5 && type == 'offer')) {
			columns = 2;
			rows = Math.ceil(rows / 2);
		}
		htm += `<div class="equipment_pack ${columns > 1 || len > 3 ? 'zoomed compact' : ''} ${isTier5 ? 'tier5' : ''}" data-type="${type}">`;
		if (allLimited) htm += Html.br`<div class="equipment_limited">${gui.getMessage('equipment_pfdisclaimer')}</div>`;
		htm += `<table>`;
		const getIndex = (row, col) => isTier5 ? Math.floor(row / 5) * 5 * columns + col * 5 + row % 5 : col * rows + row;
		for (let row = 0; row < rows; row++) {
			htm += `<tr>`;
			for (let col = 0; col < columns; col++) {
				const index = getIndex(row, col);
				htm += `<td${col > 0 ? ' class="additional"' : ''}>${index >= len ? '' : result[index]}</td>`;
			}
			htm += `</tr>`;
		}
		htm += `</table></div>`;
		return htm;
	}
}

function getDistincts(values) {
	const hash = {};
	for (const value of values) {
		hash[value] = value;
	}
	return Object.values(hash).sort(gui.sortNumberAscending);
}

function getPacks(id) {
	const packs = gui.getFile('packs');
	const buildings = gui.getFile('buildings');

	// Get related packs
	const pack = packs[id];
	let related = [];
	if (pack) {
		const packId = +pack.def_id;
		related = gui.getArrayOfInt(pack.deny_list).map(id => packs[id]).filter(pack => pack && gui.getArrayOfInt(pack.deny_list).includes(packId));
		related.push(pack);
	}

	const blocks = [];
	for (const pack of related) {
		let rid = +pack.region_id;
		if (rid == 0) {
			const item = pack.items.find(item => item.type == 'building');
			if (item) {
				const building = buildings[item.object_id];
				if (building && building.region_id) rid = building.region_id;
			}
		}
		const price = pack.prices.find(p => p.currency == currency) || pack.prices.find(p => p.currency == 'EUR') || pack.prices[0];
		const limited = !!pack.prices.find(p => +p.amount < 4 && (p.currency == 'EUR' || p.currency == 'USD'));
		const items = pack.items.map(item => packHelper.getItem(item)).filter(item => item);
		items.sort((a, b) => (a.portal - b.portal) || (a.sort - b.sort) || (a.value - b.value));

		const block = {
			id: pack.def_id,
			rid,
			date: 0,
			price: +price.amount,
			priceText: price.currency + ' ' + Locale.formatNumber(+price.amount, 2),
			items,
			limited,
			name_loc: pack.name_loc
		};
		blocks.push(block);
	}
	return blocks;
}

function getTieredOffers(id) {
	const offers = gui.getFile('tiered_offers');
	const offer = offers[id];
	// Get related offers
	const related = Object.values(offers).filter(o => o.start == offer.start);

	const blocks = [];
	const categories = {};
	for (const offer of related) {
		const rid = +offer.region_id;
		const category = gui.getArrayOfInt(offer.payer_category_list)[0] || 0;
		categories[category] = true;
		let tgems = 0;
		for (const tier of offer.tiers) tgems += +tier.gem_price;
		for (const tier of offer.tiers) {
			const items = tier.items.map(item => packHelper.getItem(item)).filter(item => item);
			items.sort((a, b) => (a.portal - b.portal) || (a.sort - b.sort) || (a.value - b.value));
			const block = {
				id: offer.def_id,
				tier: +tier.order_id,
				rid,
				date: 0,
				price: 0,
				gems: +tier.gem_price,
				tgems,
				category,
				items,
				name_loc: tier.name_loc
			};
			blocks.push(block);
		}
	}
	Object.keys(categories).map(k => +k).sort((a, b) => a - b).forEach((category, index) => {
		const price = index + 1;
		const priceText = String.fromCharCode(65 + index);
		for (const block of blocks.filter(block => block.category == category)) {
			block.price = price;
			block.priceText = priceText;
		}
	});
	return blocks;
}

function getOffers(id) {
	let blocks = getOffersBase(id);
	const DAILY_OFFER_TIMESPAN = 86400 * 1.2;
	const isDailyOffer = (offer) => +offer.end - +offer.start < DAILY_OFFER_TIMESPAN;
	const offers = gui.getFile('offers');
	const offer = offers[id];
	if (isDailyOffer(offer)) {
		// Extend to neareast offers
		const start = +offer.start;
		const arr = Object.values(offers);
		let start1;
		start1 = start;
		for (; ;) {
			const end1 = start1 + DAILY_OFFER_TIMESPAN;
			const other = arr.find(offer => +offer.start > start1 && +offer.start < end1 && isDailyOffer(offer));
			if (!other) break;
			blocks = blocks.concat(getOffersBase(other.def_id));
			start1 = +other.start;
		}
		start1 = start - DAILY_OFFER_TIMESPAN;
		for (; ;) {
			const end1 = start1 + DAILY_OFFER_TIMESPAN;
			const other = arr.find(offer => +offer.start > start1 && +offer.start < end1 && isDailyOffer(offer));
			if (!other) break;
			blocks = blocks.concat(getOffersBase(other.def_id));
			start1 = +other.start - DAILY_OFFER_TIMESPAN;
		}
	}
	return blocks;
}

function getOffersBase(id) {
	const offers = gui.getFile('offers');
	const start = +offers[id].start;
	const hash = {};
	let maxRid = 0;
	for (const offer of Object.values(offers).filter(offer => +offer.start == start)) {
		const regions = gui.getArrayOfInt(offer.regions || '0');
		const item = packHelper.getItem(offer);
		if (item) {
			for (const rid of regions) {
				maxRid = Math.max(rid, maxRid);
				const key = rid + '_' + start;
				let block = hash[key];
				if (!block) {
					block = hash[key] = {
						id: +offer.def_id,
						rid,
						date: start,
						price: 0,
						items: []
					};
				}
				if (+offer.def_id == id) block.id = id;
				block.items.push(item);
			}
		}
	}
	if (maxRid > 0) {
		const key = 0 + '_' + start;
		const block0 = hash[key];
		if (block0) {
			delete hash[key];
			const blocks = Object.values(hash);
			let minBlock = null;
			for (const block of blocks) {
				minBlock = !minBlock || minBlock.rid > block.rid ? block : minBlock;
				for (const item of block0.items) {
					block.items.push(item);
				}
			}
			if (block0.id == id) minBlock.id = id;
		}
	}
	const blocks = Object.values(hash);
	for (const block of blocks) {
		block.items.filter(item => item.type == 'building').forEach(item => item.limit = item.obj.limit);
		block.items.sort((a, b) => (a.portal - b.portal) || (a.sort - b.sort) || (a.value - b.value));
	}
	return blocks;
}

function showAny() {
	let htm = '';
	const addItem = (kind, current, sales) => {
		const messageId = 'gui_' + (kind == 'tier' ? 'tieredoffer' : kind);
		let min = +Infinity;
		let max = -Infinity;
		let minDate = +Infinity;
		let maxDate = -Infinity;
		let lastPackName = '';
		let lastPackYear = 2013;
		const packsByYear = [];
		const processedPacks = {};
		const tieredOffersByYear = [];
		let lastTierDate = 0;
		for (const sale of Object.values(sales).filter(sale => (+sale.hide || 0) == 0)) {
			min = Math.min(min, +sale.def_id);
			max = Math.max(max, +sale.def_id);
			if (kind == 'offer') {
				let v = +sale.start;
				if (v && v < minDate) minDate = v;
				v = +sale.end;
				if (v && v > maxDate) maxDate = v;
			}
			if (kind == 'pack') {
				const id = +sale.def_id;
				const name = sale.name_loc || '';
				if (!(id in processedPacks) && name != '' && name != lastPackName) {
					lastPackName = name;
					if (+sale.start > 0) lastPackYear = Math.max(lastPackYear, Locale.getDate(sale.start).getFullYear());
					packsByYear.push([lastPackYear, +sale.def_id, gui.getString(name)]);
					gui.getArrayOfInt(sale.deny_list).forEach(id => processedPacks[id] = true);
				}
			}
			if (kind == 'tier' && +sale.start != lastTierDate) {
				lastTierDate = +sale.start;
				const start = Locale.getDate(lastTierDate);
				tieredOffersByYear.push([start.getFullYear(), +sale.def_id, Locale.formatDate(start) + ' - ' + Locale.formatDate(sale.end)]);
			}
		}
		packsByYear.reverse();
		tieredOffersByYear.reverse();
		if (current < min || current > max) current = max;
		htm += Html.br`<thead><tr><th colspan="2" style="text-align:left">${gui.getMessage(messageId)}</th></tr></thead>`;
		htm += Html.br`<tbody class="row-coloring">`;
		htm += Html.br`<tr><th>${gui.getMessage('gui_id')}</th>`;
		htm += Html.br`<td><input name="${kind}" type="number" value="${current}" min="${min}" max="${max}" style="width:80px">`;
		htm += Html.br`<button data-method="${kind}">${gui.getMessage('gui_show')}</td></tr>`;
		if (kind == 'offer') {
			const minText = Locale.getDate(minDate).toISOString().replace(/T.+Z/, '');
			const maxText = Locale.getDate(maxDate).toISOString().replace(/T.+Z/, '');
			htm += Html.br`<tr><th>${gui.getMessage('gui_date')}</th>`;
			htm += Html.br`<td><input name="${kind}_date" type="date" min="${minText}" max="${maxText}" value="${(new Date()).toISOString().replace(/T.+Z/, '')}">`;
			htm += Html.br`<button data-method="${kind}_date">${gui.getMessage('gui_show')}</td></tr>`;
		}
		let byYear = null;
		if (kind == 'pack') byYear = packsByYear;
		if (kind == 'tier') byYear = tieredOffersByYear;
		if (byYear) {
			htm += Html.br`<tr><th>${gui.getMessage(kind == 'tier' ? 'gui_date' : 'gui_name')}</th>`;
			htm += Html.br`<td><select name="${kind}_name">`;
			for (let index = 0; index < byYear.length;) {
				const year = byYear[index][0];
				htm += Html.br`<optgroup label="${Locale.formatYear(new Date(year, 0, 1))}">`;
				while (index < byYear.length && byYear[index][0] == year) {
					htm += Html.br`<option value="${byYear[index][1]}">${byYear[index][2]}</option>`;
					index++;
				}
				htm += Html.br`</optgroup>`;
			}
			htm += Html.br`</select>`;
			htm += Html.br`<button data-method="${kind}_name">${gui.getMessage('gui_show')}</td></tr>`;
		}
		htm += Html.br`</tbody>`;
	};
	htm += Html.br`<table class="daf-table equipment-all">`;
	addItem('pack', lastPack, gui.getFile('packs'));
	addItem('offer', lastOffer, gui.getFile('offers'));
	addItem('tier', lastTieredOffer, gui.getFile('tiered_offers'));
	htm += Html.br`</table>`;
	const dialog = Dialog();
	allOptions = allOptions || { rid: +gui.getGenerator().region };
	allOptions.callback = () => dialog.visible = true;
	dialog.show({
		title: `${gui.getMessage('gui_pack')} / ${gui.getMessage('gui_offer')} / ${gui.getMessage('gui_tieredoffer')}`,
		html: htm,
		style: [Dialog.CLOSE]
	}, (method, params) => {
		dialog.visible = false;
		let id = params[method];
		const preferRegion = method == 'offer_date' || method == 'pack_name' || method == 'tier_name';
		if (method == 'offer_date') {
			method = 'offer';
			if (id) {
				let d1 = new Date(id);
				d1.setHours(0, 0, 0, 0);
				let d2 = new Date(d1.getTime() + 86400000);
				d1 = d1.getTime() / 1000;
				d2 = d2.getTime() / 1000;
				const list = Object.values(gui.getFile('offers')).filter(offer => {
					const s = +offer.start;
					const e = +offer.end;
					return s && e && s < d2 && e > d1;
				});
				list.sort((a, b) => (+b.start - +a.start) || (+a.def_id - +b.def_id));
				id = list.length ? +list[0].def_id : 0;
			}
		}
		if (method == 'pack_name') method = 'pack';
		if (method == 'tier_name') method = 'tier';
		if (method == 'pack' || method == 'offer' || method == 'tier') {
			try {
				showOffer(method, id, preferRegion ? allOptions : { callback: () => dialog.visible = true });
			} catch (e) {
				dialog.visible = true;
			}
		} else {
			dialog.remove();
		}
	});
}