/*global bgp gui SmartTable Locale Html Tooltip Dialog*/
export default {
	init, update, getState, setState,
	requires: ['materials', 'decorations', 'levelups', 'sales', 'usables', 'productions', 'special_weeks', 'xp',],
	events: {
		show: refresh,
		type: refresh,
		dpw: refresh,
		search: refresh,
		ready: toggleReady,
		cap: toggleCap,
		grid: refresh,
		ultimate: calcUltimateLevel,
		options: showOptions
	}
};

const GRID_COLUMNS = 10;
const TICKET_ID = 347;

let tab, container, inputs, smartTable, pillars, pillarsByMaterial, swDoubleProduction, isDPW;
let pillarsExcluded = [];

function init() {
	tab = this;
	({ container, inputs } = tab);

	smartTable = new SmartTable(container.querySelector('.data'));
	smartTable.onSort = refresh;
	smartTable.fixedHeader.parentNode.classList.add('pillars');
	smartTable.fixedFooter.parentNode.classList.add('pillars');

	container.addEventListener('tooltip', onTooltip);
}

function update() {
	const pillarsInfo = gui.getPillarsInfo();
	const sales = gui.getFile('sales');
	const decorations = gui.getFile('decorations');
	const productions = gui.getFile('productions');
	const materialInventory = gui.getGenerator().materials;
	const generator = gui.getGenerator();
	const level = +generator.level;
	const region = +generator.region;
	pillars = [];
	pillarsByMaterial = {};
	for (const saleId of pillarsInfo.sales) {
		const sale = sales[saleId];
		const decoration = decorations[sale.object_id];
		const req = sale.requirements[0];
		if (decoration && req) {
			const matId = req.material_id;
			const pillar = {};
			pillar.incoming = pillar.incoming_dpw = pillar.incoming_xp = 0;
			pillar.caravan = false;
			pillar.mid = matId;
			pillar.did = +decoration.def_id;
			pillar.img = gui.getObjectImage('decoration', pillar.did);
			pillar.excluded = pillarsExcluded.includes(pillar.did);
			pillar.name = gui.getObjectName('decoration', pillar.did);
			pillar.xp = +sale.exp;
			pillar.coins = +decoration.sell_price;
			pillar.mname = gui.getObjectName('material', matId) + '\n' + gui.getMessage('gui_xp') + ': ' + Locale.formatNumber(gui.getXp('material', matId));
			pillar.required = +req.amount;
			pillar.available = materialInventory[matId] || 0;
			pillar.matimg = gui.getObjectImage('material', matId, true);
			pillar.perc_next = (pillar.available % pillar.required) / pillar.required * 100;
			pillar.level = +sale.level;
			pillar.region = (sale.req_type == 'camp_skin' ? gui.getRegionFromSkin(+sale.req_object) : 0) || 1;
			pillar.locked = level < pillar.level || region < pillar.region;
			pillar.possible = pillar.locked ? 0 : Math.floor(pillar.available / pillar.required);
			pillar.ratio = pillar.xp / pillar.required;
			pillars.push(pillar);
			if (!(matId in pillarsByMaterial)) pillarsByMaterial[matId] = [];
			pillarsByMaterial[matId].push(pillar);
		}
	}
	// Caravans
	const specialWeeks = gui.getSpecialWeeks();
	swDoubleProduction = specialWeeks.active.production;

	const caravans = {};
	const incomingCaravans = Array.isArray(generator.caravans) ? generator.caravans : [];
	const dpwWeeks = specialWeeks.production || [];
	for (const production of Object.values(productions)) {
		if (production.type !== 'destination') continue;
		const cargo = production.cargo[0];
		if (!cargo || cargo.type !== 'system' || +cargo.object_id !== 1 || !production.requirements.find(req => +req.material_id === TICKET_ID)) continue;
		const req = production.requirements.find(req => +req.material_id !== TICKET_ID);
		if (!req) continue;
		const matId = req.material_id;
		const pillar = {};
		pillar.caravan = true;
		pillar.mid = matId;
		pillar.did = -matId;
		pillar.img = gui.getObjectImage('material', pillar.mid);
		pillar.excluded = pillarsExcluded.includes(pillar.did);
		pillar.name = gui.getMessageAndValue('tab_caravan', gui.getObjectName('material', pillar.mid));
		pillar.xp = Math.floor((+cargo.min + +cargo.max) / 2);
		pillar.incoming = pillar.incoming_dpw = pillar.incoming_xp = 0;
		// if (matId == 197) pillar.incoming = 2, pillar.incoming_dpw = 1;
		const dest_id = +production.def_id;
		incomingCaravans.forEach(c => {
			if (+c.dest_id === dest_id) {
				pillar.incoming++;
				const start = +c.arrival - +production.duration;
				if (dpwWeeks.find(sw => sw.start <= start && sw.end > start)) pillar.incoming_dpw++;
			}
		})
		pillar.incoming_xp = pillar.xp * (pillar.incoming + pillar.incoming_dpw);
		pillar.coins = 0;
		pillar.mname = gui.getObjectName('material', matId) + '\n' + gui.getMessage('gui_xp') + ': ' + Locale.formatNumber(gui.getXp('material', matId));
		pillar.required = +req.amount;
		pillar.available = materialInventory[matId] || 0;
		pillar.matimg = gui.getObjectImage('material', matId, true);
		pillar.perc_next = (pillar.available % pillar.required) / pillar.required * 100;
		pillar.level = +production.req_level;
		pillar.region = +production.region_id || 1;
		pillar.locked = level < pillar.level || region < pillar.region;
		pillar.possible = pillar.locked ? 0 : Math.floor(pillar.available / pillar.required);
		pillar.ratio = pillar.xp / pillar.required;
		if (!(matId in caravans) || caravans[matId].region > pillar.region) caravans[matId] = pillar;
	}
	for (const pillar of Object.values(caravans)) {
		const matId = pillar.mid;
		pillars.push(pillar);
		if (!(matId in pillarsByMaterial)) pillarsByMaterial[matId] = [];
		pillarsByMaterial[matId].push(pillar);
	}

	const oldValue = inputs.dpw.value;
	const htm = `<option value="">(${gui.getMessage(swDoubleProduction ? 'dialog_yes' : 'dialog_no').toLowerCase()})</option>
<option value="yes">${gui.getMessage('dialog_yes')}</option><option value="no">${gui.getMessage('dialog_no')}</option>`;
	Html.set(inputs.dpw, htm);
	inputs.dpw.value = oldValue;
	gui.showSpecialWeeks(container, [swDoubleProduction]);

	refresh();
}

function recalcMaxPossible() {
	const state = getState();
	const caravan = state.type == 'caravan' ? true : state.type == '' ? false : undefined;
	for (const items of Object.values(pillarsByMaterial)) {
		let available = items[0].available;
		// Sort by ratio descending, then required ascending
		items.sort((a, b) => (b.ratio - a.ratio) || (a.required - b.required));
		items.forEach(pillar => {
			if (caravan !== undefined && caravan !== pillar.caravan) pillar.max_possible = 0;
			else pillar.max_possible = pillar.possible > 0 ? Math.floor(available / pillar.required) : 0;
			available -= (pillar.max_possible * pillar.required);
			setQty(pillar, pillar.max_possible);
		});
	}
}

function setQty(pillar, qty) {
	pillar.qty = pillar.excluded ? 0 : qty;
	pillar.predicted_xp = pillar.qty * pillar.xp;
	pillar.predicted_coins = pillar.qty * pillar.coins;
}

function getState() {
	return {
		show: inputs.show.value,
		type: inputs.type.value,
		dpw: inputs.dpw.value,
		search: inputs.search.value,
		ready: inputs.ready.checked,
		uncapped: !inputs.cap.checked,
		excluded: pillarsExcluded.join(','),
		grid: inputs.grid.checked,
		sort: gui.getSortState(smartTable, 'name')
	};
}

function setState(state) {
	inputs.search.value = state.search || '';
	inputs.show.value = state.show == 'possible' ? state.show : '';
	state.type = gui.setSelectState(inputs.type, state.type);
	state.dpw = gui.setSelectState(inputs.dpw, state.dpw);
	inputs.ready.checked = !!state.ready;
	inputs.cap.checked = !state.uncapped;
	inputs.grid.checked = !!state.grid;
	pillarsExcluded = gui.getArrayOfInt(state.excluded);
	gui.setSortState(state.sort, smartTable, 'name');
}

function toggleCap() {
	gui.updateTabState(tab);
	const state = getState();
	if (state.uncapped) pillars.forEach(pillar => updateQty(pillar, state));
	else {
		const pillarsByMaterial = {};
		pillars.forEach(pillar => {
			const matId = pillar.mid;
			if (!(matId in pillarsByMaterial)) pillarsByMaterial[matId] = [];
			pillarsByMaterial[matId].push(pillar);
		});
		for (const matId of Object.keys(pillarsByMaterial)) recalcPillars(matId, null);
	}
	refreshTotals();
}

function toggleReady() {
	gui.updateTabState(tab);
	refreshTotals();
}

function updatePillar(e) {
	const el = e.target;
	const td = el.parentNode.parentNode;
	const did = parseInt(td.getAttribute('data-did'));
	const pillar = pillars.find(pillar => pillar.did == did);
	const state = getState();
	let recalcOthers = false;
	if (el.type == 'checkbox') {
		if (e.ctrlKey) {
			// e.preventDefault();
			const flag = el.checked;
			for (const pillar of pillars) {
				pillar.excluded = !flag;
				pillar.qty = pillar.excluded ? 0 : pillar.max_possible;
				updateQty(pillar, state);
			}
			pillarsExcluded = pillars.filter(pillar => pillar.excluded).map(pillar => pillar.did);
			gui.updateTabState(tab);
		} else if (e.altKey) {
			e.preventDefault();
			const setAsMax = !pillars.find(pillar => pillar.qty !== 0);
			for (const pillar of pillars) {
				pillar.qty = setAsMax ? pillar.max_possible : 0;
				updateQty(pillar, state);
			}
		} else {
			pillar.excluded = !el.checked;
			pillarsExcluded = pillarsExcluded.filter(id => id != pillar.did);
			if (pillar.excluded) pillarsExcluded.push(pillar.did);
			gui.updateTabState(tab);
			setQty(pillar, pillar.max_possible);
			recalcOthers = true;
		}
	} else {
		setQty(pillar, +el.value);
		recalcOthers = !getState().uncapped;
	}
	updateQty(pillar, state);
	if (recalcOthers) recalcPillars(pillar.mid, pillar);
	refreshTotals();
}

function recalcPillars(matId, pillar) {
	const items = pillars.filter(p => p.mid == matId && p !== pillar);
	if (items.length == 0) return;
	let available = (pillar || items[0]).available;
	if (pillar) available -= (pillar.qty * pillar.required);
	const recalcQty = !!pillar;
	// Sort by ratio descending, then required ascending
	items.sort((a, b) => (b.ratio - a.ratio) || (a.required - b.required));
	const state = getState();
	items.forEach(pillar => {
		const qty = Math.floor(available / pillar.required);
		if (recalcQty || qty < pillar.qty) setQty(pillar, qty);
		updateQty(pillar, state);
		available -= (pillar.qty * pillar.required);
	});
}

function updateQty(pillar, state) {
	state = state || getState();
	const max = state.uncapped ? 999 : pillar.possible;
	setQty(pillar, Math.min(Math.max(pillar.qty, 0), max));
	const input = container.querySelector('td[data-did="' + pillar.did + '"] input[type=number]');
	if (input) {
		input.value = pillar.qty;
		input.max = max;
		const td = input.parentNode.parentNode;
		if (!td.classList.contains('grid')) {
			const factor = pillar.caravan && isDPW ? 2 : 1;
			Html.set(td.nextElementSibling, Html.br`${Locale.formatNumber(factor * pillar.predicted_xp)}${pillar.incoming > 0 ? Html.br`<div class="incoming_xp">(${Locale.formatNumber(pillar.incoming_xp)})</div>` : ''}`);
			td.nextElementSibling.nextElementSibling.innerText = Locale.formatNumber(pillar.predicted_coins);
		}
		td.querySelector('input[type=checkbox]').checked = !pillar.excluded;
		(td.classList.contains('grid') ? td : td.parentNode).classList.toggle('excluded', pillar.excluded);
	}
}

function refreshTotals() {
	const state = getState();
	const levelups = gui.getFile('levelups');

	function setProgress(className, level, xp) {
		Array.from(container.querySelectorAll(className)).forEach(parent => {
			const levelup = levelups[level - 1];
			const levelupXp = levelup ? levelup.xp : NaN;
			let div = parent.querySelectorAll('div');
			Html.set(div[1], Html`${gui.getMessage('gui_level')}: ${Locale.formatNumber(level)}<br/>${gui.getMessage('gui_xp')}: ${Locale.formatNumber(xp)}`);
			Html.set(div[2], Html`${gui.getMessage('gui_level')}: ${Locale.formatNumber(level + 1)}<br/>${gui.getMessage('gui_xp')}: ${Locale.formatNumber(levelupXp)}`);
			Html.set(div[3], Html`${Locale.formatNumber(xp / levelupXp * 100, 2)}%`);
			div = parent.querySelector('progress');
			div.setAttribute('value', xp);
			div.setAttribute('max', levelupXp);
		});
	}
	let tot, qty, xp, coins, maxXp, maxCoins;
	tot = qty = xp = coins = maxXp = maxCoins = 0;
	pillars.forEach(pillar => {
		const factor = pillar.caravan && isDPW ? 2 : 1;
		tot += pillar.max_possible;
		qty += pillar.qty;
		xp += factor * pillar.predicted_xp;
		coins += pillar.predicted_coins;
		maxXp += factor * pillar.max_possible * pillar.xp;
		maxCoins += pillar.max_possible * pillar.coins;
		if (state.ready) {
			tot += pillar.incoming;
			qty += pillar.incoming;
			xp += pillar.incoming_xp;
			maxXp += pillar.incoming_xp;
		}
	});
	const generator = gui.getGenerator();
	const level = +generator.level;
	const exp = +generator.exp;
	function calcGain(level, exp, boost, coins, food) {
		let nextLevel = level;
		for (const levelup of levelups) {
			if (levelup.def_id < level) continue;
			if (nextLevel > level) {
				levelup.reward.filter(reward => reward.type == 'usable').forEach(reward => food += gui.getXp(reward.type, reward.object_id) * reward.amount);
				boost += levelup.boost;
				coins += levelup.coins;
			}
			if (exp < levelup.xp) break;
			exp -= levelup.xp;
			nextLevel++;
		}
		return { nextLevel, exp, boost, coins, food };
	}
	const gain = calcGain(level, exp + xp, 0, 0, 0);
	const maxGain = calcGain(level, exp + maxXp, 0, maxCoins, 0);
	Array.from(container.querySelectorAll('.pillars-totals')).forEach(row => {
		row.cells[1].innerText = Locale.formatNumber(tot);
		row.cells[2].innerText = Locale.formatNumber(qty);
		row.cells[3].innerText = Locale.formatNumber(xp);
		row.cells[4].innerText = Locale.formatNumber(coins);
	});
	setProgress('.pillars-progress.pillars-current', level, exp);
	setProgress('.pillars-progress.pillars-next', gain.nextLevel, gain.exp);
	let gains = [];
	if (gain.boost) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_energy', Locale.formatNumber(gain.boost))}</span>`);
	if (gain.food) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_food', Locale.formatNumber(gain.food))}</span>`);
	if (gain.coins) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_coins', Locale.formatNumber(gain.coins))}</span>`);
	gains = gains.join(', ');
	for (const el of Array.from(container.querySelectorAll('.pillars-gain'))) Html.set(el, gains);
	gains = [];
	gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('pillars_maxpossible', Locale.formatNumber(tot))}</span>`);
	gains.push(Html`<span class="outlined nowrap">${gui.getMessageAndValue('gui_xp', Locale.formatNumber(maxXp))}</span>`);
	gains.push(Html`<span class="outlined nowrap">${gui.getMessageAndValue('gui_level', Locale.formatNumber(maxGain.nextLevel))}</span>`);
	if (maxGain.boost) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_energy', Locale.formatNumber(maxGain.boost))}</span>`);
	if (maxGain.food) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_food', Locale.formatNumber(maxGain.food))}</span>`);
	if (maxGain.coins) gains.push(Html`<span class="nowrap">${gui.getMessageAndValue('gui_coins', Locale.formatNumber(maxGain.coins))}</span>`);
	gains = gains.join(', ');

	const img = gui.getObjectImg('material', TICKET_ID, 24, true);
	const numTickets = gui.getGenerator().materials[TICKET_ID] || 0;
	const tickets = Html.br`${img}${gui.getMessage('rings_stats', Locale.formatNumber(numTickets), gui.getObjectName('material', TICKET_ID))}<br>`;

	Html.set(container.querySelector('.stats'), tickets + gains);
}

function refresh() {
	gui.updateTabState(tab);

	recalcMaxPossible();

	smartTable.showFixed(false);
	Html.set(smartTable.tbody[0], '');

	const state = getState();
	const fnSearch = gui.getSearchFilter(state.search);

	isDPW = state.dpw ? state.dpw === 'yes' : !!swDoubleProduction;
	smartTable.table.classList.toggle('dpw', isDPW);

	const caravan = state.type == 'caravan' ? true : state.type == '' ? false : undefined;
	function isVisible(p) {
		if (caravan !== undefined && p.caravan !== caravan) return false;
		if (state.show == 'possible' && p.possible == 0) return false;
		if (fnSearch && !fnSearch(p.name.toUpperCase() + (p.locked ? '' : '\t\n\f'))) return false;
		return true;
	}

	const sort = gui.getSortFunction(null, smartTable, 'name');
	pillars = sort(pillars);

	Array.from(container.querySelectorAll('.pillars thead th')).forEach(th => {
		const isFirstCol = th.classList.contains('firstcol');
		th.colSpan = state.grid && isFirstCol ? GRID_COLUMNS : (th.classList.contains('colspan3') ? 3 : 1);
		th.style.display = state.grid && !isFirstCol ? 'none' : '';
	});
	Array.from(container.querySelectorAll('.pillars tfoot tr')).forEach(tr => {
		switch (tr.getAttribute('data-row')) {
			case '1':
				tr.style.display = state.grid ? 'none' : '';
				break;
			case '2':
				tr.cells[0].colSpan = state.grid ? GRID_COLUMNS : 13;
				break;
		}
	});

	let htm = '';
	let isOdd = false;
	const titleIgnore = gui.getMessage('pillars_ignore') + '\n' + gui.getMessage('gui_ctrlclick') + '\n' + gui.getMessage('pillars_altclick');
	let index = 0;
	let hasIncoming = false;
	pillars.filter(isVisible).forEach((pillar, i, arr) => {
		const imgClass = 'tooltip-event' + (pillar.caravan ? ' caravan' : '');
		let htmInputs = Html.br`<div class="qty"><input type="checkbox" ${pillar.excluded ? '' : 'checked'} title="${Html(titleIgnore)}"><input type="number" name="${pillar.did}" title="${pillar.name} (${pillar.possible})" value="${pillar.qty}" step="1" min="0" max="${state.uncapped ? 999 : pillar.possible}"></div>`;
		if (pillar.incoming > 0) {
			const num = pillar.incoming - pillar.incoming_dpw;
			const numDpw = pillar.incoming_dpw;
			const texts = [];
			if (numDpw > 0) texts.push(Locale.formatNumber(numDpw) + ' \xd7 DPW');
			if (num > 0) texts.push(Locale.formatNumber(num));
			htmInputs = Html.br`${htmInputs}<div class="incoming">${texts.join(' + ')}</div>`;
		}
		if (state.grid) {
			index++;
			if (index > GRID_COLUMNS) {
				htm += `</tr><tr>`;
				index = 1;
			}
			if (index == 1) {
				hasIncoming = false;
				for (let count = 0; count < GRID_COLUMNS; count++) if (arr[i + count] && arr[i + count].incoming > 0) hasIncoming = true;
			}
			htm += Html.br`<td class="image grid${pillar.excluded ? ' excluded' : ''}${pillar.caravan ? ' caravan' : ''}" data-did="${pillar.did}"><img src="${pillar.img}" loading="lazy" title="${Html(pillar.name)}" class="${imgClass}"/>${htmInputs}${hasIncoming && !pillar.incoming ? Html.br`<div class="incoming">&nbsp;</div>` : ''}</td>`;
		} else {
			isOdd = !isOdd;
			const factor = pillar.caravan && isDPW ? 2 : 1;
			htm += Html.br`<tr class="${isOdd ? 'odd' : ''}${pillar.excluded ? ' excluded' : ''}${pillar.caravan ? ' caravan' : ''}">`;
			htm += Html.br`<td class="image" data-did="${pillar.did}"><img src="${pillar.img}" loading="lazy" title="${Html(pillar.name)}" class="${imgClass}"></td>`;
			htm += Html.br`<td>${pillar.name}</td>`;
			htm += Html.br`<td>${gui.getRegionImg(pillar.region)}</td>`;
			htm += Html.br`<td>${pillar.level ? Locale.formatNumber(pillar.level) : ''}</td>`;
			htm += Html.br`<td>${Locale.formatNumber(factor * pillar.xp)}</td>`;
			htm += Html.br`<td>${Locale.formatNumber(pillar.coins)}</td>`;
			htm += Html.br`<td>${Locale.formatNumber(pillar.required)}</td>`;
			htm += Html.br`<td class="material" style="background-image:url(${pillar.matimg})" title="${Html(pillar.mname)}">${Locale.formatNumber(pillar.available)}</td>`;
			htm += Html.br`<td>${Locale.formatNumber(pillar.perc_next, 2)}%</td>`;
			htm += Html.br`<td>${Locale.formatNumber(pillar.possible)}</td>`;
			htm += Html.br`<td data-did="${pillar.did}">${htmInputs}</td>`;
			htm += Html.br`<td>${Locale.formatNumber(factor * pillar.predicted_xp)}${pillar.incoming > 0 ? Html.br`<div class="incoming_xp">(${Locale.formatNumber(pillar.incoming_xp)})</div>` : ''}</td>`;
			htm += Html.br`<td>${Locale.formatNumber(pillar.predicted_coins)}</td>`;
			htm += Html.br`</tr>`;
		}
	});
	if (state.grid && index > 0) {
		while (index++ < GRID_COLUMNS) htm += `<td class="grid"></td>`;
		htm = `<tr>` + htm + `</tr>`;
	}
	smartTable.tbody[0].classList.toggle('chessboard-coloring', state.grid);
	Html.set(smartTable.tbody[0], htm);
	Array.from(smartTable.tbody[0].querySelectorAll('input[type=checkbox]')).forEach(input => {
		input.addEventListener('click', updatePillar);
	});
	Array.from(smartTable.tbody[0].querySelectorAll('input[type=number]')).forEach(input => {
		input.addEventListener('input', updatePillar);
	});
	refreshTotals();
	gui.collectLazyElements(smartTable.container);
	smartTable.syncLater();
}

function onTooltip(event) {
	const element = event.target;
	element.removeAttribute('title');
	const did = parseInt(element.parentNode.getAttribute('data-did'));
	const pillar = pillars.find(pillar => pillar.did == did);
	const htm = Html.br`<div class="pillars-tooltip"><img src="${pillar.img}" class="outlined"/><span>${pillar.name}</span></div>`;
	Tooltip.show(element, htm);
}


async function calcUltimateLevel() {
	const generator = gui.getGenerator();

	// Find the green ring mine for the player
	await bgp.Data.getFile('tokens');
	let grMine, grFloors;
	for (let rid = +generator.region; rid > 0 && !grMine; rid--) {
		const name = 'locations_' + rid;
		const locations = await bgp.Data.getFile(name);
		grMine = Object.values(locations).find(mine => +mine.test == 0 && +mine.event_id == 0 && +mine.reset_cd == 168 * 3600);
	}
	if (grMine) grFloors = await bgp.Data.getFile('floors_' + grMine.def_id);

	// Buildings are required
	const buildings = await bgp.Data.getFile('buildings');
	const decorations = gui.getFile('decorations');
	const usables = gui.getFile('usables');
	const levelups = gui.getFile('levelups');
	const caravans = gui.getPillarsInfo().caravans || {};

	// INVENTORY
	const getSpare = (type) => {
		const { owned, active } = gui.getOwnedActive(type);
		const spare = {};
		Object.keys(owned).forEach(id => {
			const qty = owned[id] - (active[id] || 0);
			if (qty > 0) spare[id] = qty;
		});
		return spare;
	};
	let colBuildings, colDecorations, colMaterials, colUsables, colTokens;

	const addToCol = (col, id, qty) => col[id] = (col[id] || 0) + qty;
	const sellAmount = (col, items) => {
		let value = 0;
		for (const id of Object.keys(col)) {
			const qty = col[id];
			delete col[id];
			const item = items[id];
			const price = (item && +item.sell_price) || 0;
			value += price * qty;
		}
		return value;
	};
	const addLoot = (type, id, qty) => {
		if (type == 'usable') addToCol(colUsables, id, qty);
		if (type == 'material') addToCol(colMaterials, id, qty);
		if (type == 'building') addToCol(colBuildings, id, qty);
		if (type == 'decoration') addToCol(colDecorations, id, qty);
		if (type == 'token') addToCol(colTokens, id, qty);
	};

	// PILLARS
	const pillarsByMaterial = {};
	for (const pillar of pillars) {
		const matId = pillar.mid;
		if (!(matId in pillarsByMaterial)) pillarsByMaterial[matId] = [];
		pillarsByMaterial[matId].push(pillar);
	}
	// Sort by ratio descending, then required ascending
	for (const items of Object.values(pillarsByMaterial)) items.sort((a, b) => (b.ratio - a.ratio) || (a.required - b.required));

	// PASSIVE EFFECTS
	const extensions = await bgp.Data.getFile('extensions');
	const getFactor = (id, level) => {
		let chance = 0;
		let bonus = 0;
		const ext = extensions && extensions[id];
		const l = Array.isArray(ext && ext.levels) && ext.levels.find(o => +o.level == level);
		if (Array.isArray(l && l.attributes)) l.attributes.forEach(a => {
			if (a && a.attribute_type == 'chance') chance = +a.attribute_value;
			if (a && a.attribute_type == 'bonus_in_percent') bonus = +a.attribute_value;
		});
		return chance * bonus / 10000;
	};
	let pXpFactor = 0;
	let pEnergyFactor = 0;
	[].concat(generator.passive_effect_extension && generator.passive_effect_extension.item).forEach(o => {
		if (o && o.extension_def_id == 1) pXpFactor = getFactor(1, +o.extension_level);
		if (o && o.extension_def_id == 2) pEnergyFactor = getFactor(2, +o.extension_level);
	});

	// Windmills
	const windmills = await bgp.Data.getFile('windmills');

	let level, exp, energy, isCaravan;

	let htm = '';
	htm += `<div class="pillars-u-level outlined"></div>`;
	htm += `<input type="button" class="DAF-on-footer" data-method="details" value="${gui.getMessage('gui_show')}">`;
	htm += `<input type="button" class="DAF-on-footer" data-method="caravan" value="${gui.getMessage('tab_caravan')}">`;
	htm += `<div class="pillars-u-table" style="display:none">`;
	htm += `<table class="daf-table">`;
	htm += `<thead><tr><th></th><th>${gui.getMessage('gui_xp')}</th><th>${gui.getMessage('gui_energy')}</th></tr></thead>`;
	htm += `<tbody class="pillars-u-details row-coloring">`;
	htm += getBody();
	htm += `</tbody>`;
	htm += `</table>`;
	htm += `</div>`;

	function getBody() {
		let htm = '';
		level = +generator.level;
		exp = +generator.exp;
		energy = 0;

		colBuildings = getSpare('building');
		colDecorations = getSpare('decoration');
		colMaterials = Object.assign({}, generator.materials);
		colUsables = Object.assign({}, generator.usables);
		colTokens = Object.assign({}, generator.tokens);

		let windmillCoins = 0;
		for (const [id, qty] of Object.entries(Object.assign({}, generator.stored_windmills))) {
			const windmill = windmills[id];
			if (windmill) windmillCoins += +qty * +windmill.sell_price;
		}

		const number = value => Locale.formatNumber(value);
		const format = value => value ? (typeof value == 'string' ? value : (value < 0 ? '' : '+') + number(value)) : '';
		const MILESTONE = 'MILESTONE';
		const addRow = (img, text, expText, energyText) => {
			let cls = '';
			if (img === MILESTONE) {
				img = '/img/gui/trophy.png';
				text = gui.getMessageAndValue('gui_level', number(level));
				expText = number(exp);
				energyText = number(energy);
				cls = Html.raw(' class="milestone"');
			}
			htm += Html.br`<tr${cls}><td${img ? Html` style="background-image:url(${img})"` : ''}>${text}</td>`;
			htm += Html.br`<td>${format(expText)}</td><td>${format(energyText)}</td>`;
			htm += Html`</tr>`;
		};

		addRow(MILESTONE);

		let showLevelBeforeRings = true;
		let showLevelBeforeMaterial = true;
		let incomingCaravansXp = pillars.reduce((xp, pillar) => xp + pillar.incoming_xp, 0);
		for (; ;) {
			let sellValue;
			// SELL WINDMILLS
			sellValue = windmillCoins;
			if (sellValue) {
				windmillCoins = 0;
				addToCol(colMaterials, 1, sellValue);
				addRow('/img/gui/shop.png', `${gui.getString('GUI0054')}:  ${gui.getMessage('camp_windmills')}`, `(${number(sellValue)})`);
				continue;
			}

			// SELL BUILDINGS
			sellValue = sellAmount(colBuildings, buildings);
			if (sellValue) {
				addToCol(colMaterials, 1, sellValue);
				addRow('/img/gui/shop.png', `${gui.getString('GUI0054')}:  ${gui.getMessage('gui_equipment')}`, `(${number(sellValue)})`);
				continue;
			}
			// SELL DECORATIONS
			sellValue = sellAmount(colDecorations, decorations);
			if (sellValue) {
				addToCol(colMaterials, 1, sellValue);
				addRow('/img/gui/shop.png', `${gui.getString('GUI0054')}:  ${gui.getMessage('gui_decoration')}`, `(${number(sellValue)})`);
				continue;
			}
			// INCOMING CARAVANS
			if (incomingCaravansXp) {
				addRow('/img/gui/caravan.png', gui.getMessageAndValue('tab_caravan', gui.getMessage('repeat_ready')), incomingCaravansXp);
				incomingCaravansXp = 0;
				continue;
			}
			// BUYING PILLARS
			let pillarExp = 0;
			// Using caravan
			for (const [mid, item] of Object.entries(isCaravan ? caravans : {})) {
				const qty = Math.floor(colMaterials[mid] / item.amount);
				if (qty) {
					const totXp = qty * item.xp * 2;
					addRow(gui.getObjectImage('material', mid), `CARAVAN (DPW): ${gui.getObjectName('material', mid)} \xd7 ${number(qty)}`, totXp);
					addToCol(colMaterials, mid, -qty * item.amount);
					pillarExp += totXp;
				}
			}
			// let pillarNum = 0;
			for (const items of Object.values(pillarsByMaterial)) {
				const mid = items[0].mid;
				items.forEach(pillar => {
					if (pillar.caravan) return;
					const qty = Math.floor(colMaterials[mid] / pillar.required);
					if (qty) {
						addRow(gui.getObjectImage('material', mid), `${pillar.name} \xd7 ${number(qty)}`, qty * pillar.xp);
						addToCol(colDecorations, pillar.did, qty);
						addToCol(colMaterials, mid, -qty * pillar.required);
						pillarExp += qty * pillar.xp;
						// pillarNum += qty;
					}
				});
			}
			if (pillarExp) {
				// console.log('Buying pillars', pillarExp, pillarNum);
				exp += pillarExp;
				continue;
			}
			// LEVEL UP
			let nextLevel = level;
			let gainEnergy = 0;
			for (const levelup of levelups) {
				if (levelup.def_id < level) continue;
				if (nextLevel > level) {
					gainEnergy += levelup.boost;
					for (const reward of levelup.reward) addLoot(reward.type, reward.object_id, reward.amount);
				}
				if (exp < levelup.xp) break;
				exp -= levelup.xp;
				nextLevel++;
			}
			if (nextLevel != level) {
				energy += gainEnergy;
				level = nextLevel;
				addRow('/img/gui/level.png', gui.getMessageAndValue('gui_level', number(level)), number(exp), gainEnergy);
				continue;
			}
			// USE FOOD
			let food = 0;
			for (const [id, qty] of Object.entries(colUsables)) {
				const usable = usables[id];
				if (usable && usable.action == 'add_stamina') {
					food += +usable.value * qty;
					delete colUsables[id];
				}
			}
			if (food) {
				energy += food;
				addRow('/img/gui/usable.png', `${gui.getMessage('gui_food')} \u2192 ${gui.getMessage('gui_energy')}`, null, food);
				continue;
			}
			// ENERGY -> XP
			const startingEnergy = energy;
			let gainExp = 0;
			while (energy) {
				gainExp += energy + Math.floor(energy * pXpFactor);
				energy = Math.floor(energy * pEnergyFactor);
			}
			if (gainExp) {
				exp += gainExp;
				addRow('/img/gui/energy.png', `${gui.getMessage('gui_energy')} \u2192 ${gui.getMessage('gui_xp')}`, gainExp, -startingEnergy);
				continue;
			}
			// USE GREEN RINGS (32 = GREEN RING, 17 = number of chests)
			if (colTokens[32] >= 17 && grFloors) {
				if (showLevelBeforeRings) {
					showLevelBeforeRings = false;
					addRow(MILESTONE);
				}
				addToCol(colTokens, 32, -17);
				let xp = 0;
				for (const floor of grFloors.floor) {
					let lootAreas = floor.loot_areas && floor.loot_areas.loot_area;
					lootAreas = Array.isArray(lootAreas) ? lootAreas : [];
					for (const lootArea of lootAreas) {
						const count = typeof lootArea.tiles == 'string' ? lootArea.tiles.split(';').length : 0;
						const random = +lootArea.random;
						const num = random > 0 && random < count ? random : count;
						const loot = gui.calculateLoot(lootArea, level, { coeficient: 2 });
						xp += num * loot.avg * gui.getXp(lootArea.type, lootArea.object_id);
						addLoot(lootArea.type, lootArea.object_id, num * loot.avg);
					}
				}
				const clearBonus = +grMine.reward_exp;
				exp += clearBonus;
				addRow(gui.getObjectImage('token', 32), `${gui.getString(grMine.name_loc)}\n${gui.getObjectName('token', 32)} \xd7 17 (DMW)`, `${number(clearBonus)}\n(+${number(xp)})`);
				continue;
			}
			// ADDING MATERIAL XP
			gainExp = 0;
			for (const [id, qty] of Object.entries(colMaterials)) {
				const xpByMat = qty * gui.getXp('material', id);
				const xpByCaravan = (isCaravan && id in caravans) ? qty * caravans[id].xpByUnit * 2 : 0;
				const matXp = Math.max(xpByMat, xpByCaravan);
				if (matXp) {
					delete colMaterials[id];
					gainExp += matXp;
				}
			}
			if (gainExp) {
				if (showLevelBeforeRings || showLevelBeforeMaterial) {
					showLevelBeforeRings = showLevelBeforeMaterial = false;
					addRow(MILESTONE);
				}
				exp += gainExp;
				addRow('/img/gui/xp.png', `${gui.getMessage('gui_material')} \u2192 ${gui.getMessage('gui_xp')}${isCaravan ? ' (CARAVAN DPW)' : ''}`, gainExp);
				continue;
			}
			break;
		}
		addRow(MILESTONE);
		return htm;
	}

	gui.dialog.show({
		title: gui.getMessage('gui_maximum'),
		html: htm,
		style: [Dialog.OK, Dialog.AUTORUN],
	}, function (method) {
		const element = gui.dialog.element;
		Html.set(element.querySelector('.pillars-u-level'), Html(Locale.formatNumber(level)));
		if (method == 'details') {
			const table = element.querySelector('.pillars-u-table');
			const flag = table.style.display == 'none';
			table.style.display = flag ? '' : 'none';
			gui.dialog.element.querySelector('[data-method="details"]').style.backgroundColor = flag ? 'green' : '';
		} else if (method == 'caravan') {
			isCaravan = !isCaravan;
			Html.set(element.querySelector('.pillars-u-details'), getBody());
			Html.set(element.querySelector('.pillars-u-level'), Html(Locale.formatNumber(level)));
			gui.dialog.element.querySelector('[data-method="caravan"]').style.backgroundColor = isCaravan ? 'green' : '';
		}
	});
}

async function showOptions() {
	const [achievements, productions] = await Promise.all([bgp.Data.getFile('achievements'), bgp.Data.getFile('productions')]);
	const hashMaterials = {};
	Object.values(achievements)
		.filter(a => a.action == 'collect' && a.type == 'material' && +a.hide == 0 && !+a.event_id)
		.forEach(a => {
			const matId = +a.object_id;
			if (matId > 0) hashMaterials[matId] = matId;
		});
	Object.values(productions)
		.filter(p => p.type == 'alloy' && +p.hide == 0 && !+p.event_id)
		.forEach(p => {
			const material = p.cargo.find(c => c.type == 'material');
			const matId = material ? +material.object_id : 0;
			if (matId > 0) hashMaterials[matId] = matId;
		});
	// Exclude Jadeite and Obsidian
	const listMaterial = Object.values(hashMaterials).filter(matId => !gui.isMaterialXpDefined(matId) && matId != 93 && matId != 270);
	let htm = '';
	htm += Html`<table class="daf-table"><thead>`;
	htm += Html`<tr><th>${gui.getMessage('gui_material')}</th><th>${gui.getMessage('gui_xp')}</th></tr>`;
	htm += Html`</thead><tbody class="row-coloring">`;
	listMaterial
		.map(matId => [matId, gui.getObjectName('material', matId)])
		.sort((a, b) => gui.sortTextAscending(a[1], b[1]))
		.forEach(a => {
			htm += Html`<tr><th class="pillars-material" style="background-image:url(${gui.getObjectImage('material', a[0], true)})">${a[1]}</th>`;
			htm += Html`<td><input name="mat_${a[0]}" type="number" min="0" step="1000" style="width:90px" value="${gui.getXp('material', a[0])}"></td></tr>`;
		});
	htm += `</tbody></table>`;
	gui.dialog.show({
		title: gui.getMessage('tab_options'),
		html: htm,
		style: [Dialog.CONFIRM, Dialog.CANCEL]
	}, function (method, params) {
		if (method == Dialog.CONFIRM) {
			const map = {};
			Object.keys(params).filter(key => key.startsWith('mat_') && +params[key] > 0).forEach(key => map[key.substr(4)] = +params[key]);
			gui.setMaterialsXp(map);
		}
	});
}