/*global bgp gui Locale Html Dialog Tooltip*/
import packHelper from '../../packHelper.js';

export default {
	init, update, getState, setState,
	actions: { 'visit_camp': actionVisitCamp },
	requires: ['configs', 'materials', 'buildings', 'lines', 'special_weeks', 'sales', 'diggy_skins', 'usables', 'events', 'decorations'],
	events: {
		regen: rebuildSetup,
		playboard: findThePair,
		luckycards: luckyCards,
		ads: adsLimit,
		input: toggleFlags
	}
};

const NUM_SLOTS = 24;

let tab, container, inputs;
let regBuildings, capBuildings, campNames;
let swDiscount;

const addonsMeta = [
	{ name: 'diggy_skin', title: 'GUI3178', type: '', id: 0, desc: '' },
	{ name: 'golem', title: 'EXT06', type: 'extension', id: 1, desc: 'EXT07' },
	{ name: 'professor_switch', title: 'EXT11', type: 'extension', id: 2, desc: 'EXT12' },
	{ name: 'gc_one_click', title: 'EXT20', type: 'extension', id: 3, desc: 'EXT21' },
	{ name: 'last_tile_finder', title: 'EXT56', type: 'extension', id: 4, desc: 'EXT58' },
	{ name: 'hollander', title: 'ABNA004', type: 'addon_building', id: 6, desc: 'EXT09' },
	{ name: 'rotor', title: 'ABNA005', type: 'addon_building', id: 7, desc: ['EXT18', 'EXT08', 'EXT23', 'EXT25', 'EXT27', 'EXT29', 'EXT31', 'EXT33', 'EXT35', 'EXT37', 'EXT39', 'EXT41', 'EXT43', 'EXT45', 'EXT47', 'EXT49'] },
	{ name: 'potion_double_exp', title: 'EXT81', type: 'passive_effect_extension', id: 1, desc: ['EXT61', 'EXT61', 'EXT62', 'EXT63', 'EXT64', 'EXT65', 'EXT66', 'EXT67', 'EXT68', 'EXT69', 'EXT70'] },
	{ name: 'potion_energy_back', title: 'EXT82', type: 'passive_effect_extension', id: 2, desc: ['EXT71', 'EXT71', 'EXT72', 'EXT73', 'EXT74', 'EXT75', 'EXT76', 'EXT77', 'EXT78', 'EXT79', 'EXT80'] },
	{ name: 'speedpotion', title: 'USNA025', type: '', id: 0, desc: '' },
];

function init() {
	tab = this;
	({ container, inputs } = tab);

	campNames = [gui.getMessage('camp_day_mode'), gui.getMessage('camp_night_mode'), gui.getMessage('camp_setup_mode')];

	let htm = '';
	for (let i = 144; i >= 0; i--) htm += Html`<option value="${i}">${i}</option>`;
	Html.set(inputs.regen, htm);
	Html.set(inputs.regen.parentNode.querySelector('span'), Html`${gui.getMessage('camp_numofregenslots')} \u2192 ${gui.getMessage('camp_fill_time')}`);

	Html.set(inputs.playboard, Html(gui.getString('GUI3326')));
	Html.set(inputs.luckycards, Html(gui.getProperCase(gui.getString('GUI3120'))));

	['camp-player', 'camp-neighbor'].forEach(className => {
		let div = tab.container.querySelector('.' + className);
		div.addEventListener('render', function (_event) {
			updateCamp(this);
		});

		const input = div.querySelector('input');
		input.addEventListener('click', () => gui.updateTabState(tab));

		div = div.querySelector('div');
		['mouseover', 'mouseout', 'mouseleave'].forEach(name => div.addEventListener(name, onMouseMove));
		div.addEventListener('click', onClick);
	});

	container.querySelectorAll('.toolbar .camp_warning').forEach(img => {
		img.style.display = 'none';
		img.addEventListener('click', onClick);
	});

	container.addEventListener('tooltip', onTooltip);
}

function update() {
	packHelper.onUpdate();
	const specialWeeks = gui.getSpecialWeeks();
	inputs.playboard.style.display = specialWeeks.types.find_the_pair ? '' : 'none';
	swDiscount = specialWeeks.active.debris_discount;
	gui.showSpecialWeeks(container, Object.values(specialWeeks.active));

	markToBeRendered(container.querySelector('.camp-player'));
	markToBeRendered(container.querySelector('.camp-neighbor'));

	const buildings = gui.getFile('buildings');
	regBuildings = [];
	capBuildings = [];
	for (const [id, qty] of Object.entries(gui.getOwnedActive('building').owned)) {
		const building = buildings[id];
		if (building) {
			const reg = +building.stamina_reg;
			const cap = +building.max_stamina;
			const height = +building.rows;
			const width = +building.columns;
			const total = (reg > 0 ? reg : cap)
			const item = { building, qty, width, height, total, value: total / width, isReg: reg > 0 };
			if (reg > 0) regBuildings.push(item);
			else if (cap > 0) capBuildings.push(item);
		}
	}
	// Sort by slot value descending, then width descending, then height descending
	const fnSort = (a, b) => (b.value - a.value) || (b.width - a.width) || (b.height - a.height);
	regBuildings.sort(fnSort);
	capBuildings.sort(fnSort);

	rebuildSetupFillTime();
}

function actionVisitCamp() {
	markToBeRendered(container.querySelector('.camp-neighbor'));
}

function markToBeRendered(div) {
	updateCamp(div, true);
	gui.setLazyRender(div.querySelector('div'));
}

function getState() {
	const getCheck = (id, c) => document.getElementById(id).checked ? c : '';
	const hide = [inputs.day, inputs.night, inputs.extra, inputs.neighbor, inputs.setup].filter(check => !check.checked).map(check => check.name).join(',');
	return { hide, regen: inputs.regen.value, h: [getCheck('camp_neighbor', 'n'), getCheck('camp_player', 'p')].join('') };
}

function getSetupRegen(state) {
	return Math.min(144, Math.max(0, parseInt(state.regen) || 0));
}

function setState(state) {
	const h = String(state.h || '').toLowerCase();
	const setCheck = (id, c) => document.getElementById(id).checked = h.indexOf(c) >= 0;
	setCheck('camp_player', 'p');
	setCheck('camp_neighbor', 'n');
	const hide = (state.hide || '').split(',');
	// compatibility
	if ('no-neighbour' in state) hide.push('neighbor');
	if ('no-addons' in state) hide.push('extra');
	if (!('regen' in state)) {
		hide.push('setup');
		if (state.show == 'day') hide.push('night');
		if (state.show == 'night') hide.push('day');
	}
	[inputs.day, inputs.night, inputs.extra, inputs.neighbor, inputs.setup].forEach(input => input.checked = !hide.includes(input.name));
	inputs.regen.value = getSetupRegen(state);
	container.querySelector('.camp-neighbor').style.display = inputs.neighbor.checked ? '' : 'none';
	const campPlayer = container.querySelector('.camp-player');
	campPlayer.classList.toggle('no-addons', !inputs.extra.checked);
	campPlayer.classList.toggle('no-camp-1', !inputs.day.checked);
	campPlayer.classList.toggle('no-camp-2', !inputs.night.checked);
	campPlayer.classList.toggle('no-camp-3', !inputs.setup.checked);
}

function toggleFlags() {
	gui.updateTabState(tab);
	setState(getState());
}

function rebuildSetupFillTime() {
	const generator = gui.getGenerator();
	const camp = generator.camp;
	let campResult = calculateCamp(camp, []);
	Array.from(inputs.regen.options).forEach(option => {
		campResult = calculateCamp(camp, fillCamp(campResult.lines, +option.value));
		const fillTime = Math.ceil(campResult.cap_tot / campResult.reg_tot * 3600);
		const time = fillTime ? gui.getDuration(fillTime, 2) : '';
		let s = Locale.formatNumber(+option.value);
		if (s.length < 3) s = '\xa0'.repeat((3 - s.length) * 2) + s;
		Html.set(option, Html`${s} \u2192 ${time}`);
	});
}

const getSetupName = (numRegen) => gui.getMessage('camp_setup_mode') + ` (${gui.getMessage('camp_numofregenslots')} = ${Locale.formatNumber(numRegen)})`;

function rebuildSetup() {
	gui.updateTabState(tab);
	const generator = gui.getGenerator();
	const camp = generator.camp;
	let campResult = calculateCamp(camp, []);
	campResult = calculateCamp(camp, fillCamp(campResult.lines, getSetupRegen(getState())));
	Html.set(container.querySelector('.camp-player .camp-summary.camp-3'), getCampSummary(campResult, campNames[2], true));
	let htm = '';
	htm += Html.br`<table class="camp-caption"><thead><tr><th>${getSetupName(campResult.stat.numRegSlots)}</th></tr></thead></table>`;
	htm += renderCamp(campResult);
	Html.set(container.querySelector('.camp-player .camp-container.camp-3'), htm);
}

function onClick(event) {
	const target = event.target;
	if (target && target.hasAttribute('data-numreg')) {
		const numReg = +event.target.getAttribute('data-numreg');
		if (target.classList.contains('camp_warning')) {
			inputs[target.classList.contains('day') ? 'day' : 'night'].checked = true;
			event.preventDefault();
			event.stopPropagation();
		}
		inputs.regen.value = numReg;
		inputs.setup.checked = true;
		toggleFlags();
		rebuildSetup();
	}
}

function onMouseMove(event) {
	let el = event.target;
	let bid = [];
	while (!el.classList.contains('card')) {
		if (el.hasAttribute('data-bid')) bid = el.getAttribute('data-bid').split(',');
		el = el.parentNode;
	}
	let selected = Array.from(el.querySelectorAll('.item.building')).filter(el => {
		el.classList.remove('selected', 'selected-first', 'selected-last');
		return bid.includes(el.getAttribute('data-bid'));
	});
	if ((bid == 'camp-1' || bid == 'camp-2') && inputs.setup.checked) {
		const setupItems = Array.from(el.querySelectorAll(`.camp-container.camp-3 .item.building`));
		selected = Array.from(el.querySelectorAll(`.camp-container.${bid} .item.building`)).filter(el => {
			const bid = el.getAttribute('data-bid');
			const foundAt = setupItems.findIndex(el => el.getAttribute('data-bid') == bid);
			if (foundAt >= 0) setupItems.splice(foundAt, 1);
			return foundAt < 0;
		});
		selected = selected.concat(setupItems);
	}
	selected.forEach(el => el.classList.add('selected'));
	selected.forEach(el => {
		if (!el.previousElementSibling || !el.previousElementSibling.classList.contains('selected')) el.classList.add('selected-first');
		if (!el.nextElementSibling || !el.nextElementSibling.classList.contains('selected')) el.classList.add('selected-last');
	});
}

function getCampSummary(campResult, campName, isSetup) {
	const cap_total = campResult.cap_tot;
	const reg_total = campResult.reg_tot;
	const fillTime = Math.ceil(cap_total / reg_total * 3600);
	const time = fillTime ? gui.getDuration(fillTime, 2) : '';

	// table Regeneration
	let htm = '';
	htm += Html.br`<table class="camp-data camp-summary row-coloring">`;
	htm += Html.br`<thead><tr class="energy_capacity"><th>${campName}</th><th><img src="/img/gui/camp_energy.png" title="${gui.getMessage('camp_regen')}"></th><th><img src="/img/gui/camp_capacity.png" title="${gui.getMessage('camp_capacity')}"></th></tr></thead>`;
	htm += Html.br`<tbody>`;
	htm += Html.br`<tr><td>${gui.getMessage('camp_total')}</td><td>${Locale.formatNumber(reg_total)}</td><td>${Locale.formatNumber(cap_total)}</td></tr>`;
	htm += Html.br`<tr><td>${gui.getMessage('camp_min_value')}</td><td data-bid="${campResult.stat.reg.min.join(',')}">${Locale.formatNumber(campResult.reg_min)}</td>`;
	htm += Html.br`<td data-bid="${campResult.stat.cap.min.join(',')}">${Locale.formatNumber(campResult.cap_min)}</td></tr>`;
	htm += Html.br`<tr><td>${gui.getMessage('camp_max_value')}</td><td data-bid="${campResult.stat.reg.max.join(',')}">${Locale.formatNumber(campResult.reg_max)}</td>`;
	htm += Html.br`<td data-bid="${campResult.stat.cap.max.join(',')}">${Locale.formatNumber(campResult.cap_max)}</td></tr>`;
	htm += Html.br`<tr><td>${gui.getMessage('camp_num_slots')}</td>`;
	const getTitleSetup = (num) => `${gui.getMessage('camp_showsetup')} (${gui.getMessage('camp_numofregenslots')} = ${num})`;
	if (isSetup) {
		htm += Html.br`<td data-numreg="144" title="${getTitleSetup(gui.getMessage('gui_maximum'))}">${Locale.formatNumber(campResult.stat.numRegSlots)}</td>`;
		htm += Html.br`<td data-numreg="0" title="${getTitleSetup(gui.getMessage('gui_minimum'))}">${Locale.formatNumber(campResult.stat.numCapSlots)}</td></tr>`;
	} else {
		const title = (campResult.canBeImproved ? gui.getMessage('camp_canbeimproved') + '\n' : '') + getTitleSetup(Locale.formatNumber(campResult.stat.numRegSlots));
		const extra = campResult.canBeImproved ? Html` class="warn"` : '';
		htm += Html.br`<td data-numreg="${campResult.stat.numRegSlots}" title="${Html(title)}"${extra}>${Locale.formatNumber(campResult.stat.numRegSlots)}</td>`;
		htm += Html.br`<td>${Locale.formatNumber(campResult.stat.numCapSlots)}</td></tr>`;
		const imgWarn = container.querySelector(`.toolbar input[name=${campResult.isDay ? 'day' : 'night'}] + .camp_warning`);
		imgWarn.style.display = campResult.canBeImproved ? 'inline' : 'none';
		imgWarn.title = campResult.canBeImproved ? title : '';
		imgWarn.setAttribute('data-numreg', campResult.stat.numRegSlots);
	}
	htm += Html.br`<tr><td>${gui.getMessage('camp_avg_value')}</td><td>${Locale.formatNumber(campResult.reg_avg)}</td><td>${Locale.formatNumber(campResult.cap_avg)}</td></tr>`;
	htm += Html.br`</tbody>`;
	if (time) {
		htm += Html.br`<thead title="${gui.getMessage('camp_fill_time_info')}">`;
		htm += Html.br`<tr><td>${gui.getMessage('camp_fill_time')}</td><td colspan="2">${time}</td></tr>`;
		htm += Html.br`</thead>`;
	}
	htm += Html.br`</table>`;
	return htm;
}

function updateCamp(div, flagHeaderOnly = false) {
	let camp, campName, pal, level, started;

	const generator = gui.getGenerator();

	const isPlayer = div.classList.contains('camp-player');
	if (isPlayer) {
		camp = generator.camp;
		pal = {
			name: generator.name,
			surname: generator.surname,
			id: generator.player_id,
			fb_id: generator.fb_id
		};
		level = +generator.level;
		['region', 'windmill_limit', 'windmill_reg'].forEach(key => camp[key] = +generator[key]);
		const time = Locale.formatDateTime(+generator.time);
		campName = pal && pal.name ? gui.getMessage('camp_player_name', gui.getPlayerNameFull(pal), time) : `${gui.getMessage('camp_your_camp')} (${time})`;
		started = new Date(+generator.registered_on * 1000);
	} else {
		camp = bgp.Data.lastVisitedCamp;
		const neighbourId = camp && camp.neigh_id;
		pal = neighbourId ? bgp.Data.getNeighbour(neighbourId) : null;
		level = pal ? +pal.level : 1;
		campName = (neighbourId ? gui.getMessage('camp_player_name', pal ? gui.getPlayerNameFull(pal) : '#' + neighbourId, Locale.formatDateTime(+camp.time)) : gui.getMessage('camp_no_player'));
	}

	div.querySelector('img').setAttribute('src', pal ? gui.getNeighborAvatarUrl(pal) : '/img/gui/anon.png');
	Html.set(div.querySelector('span'), Html`${campName}<span class="screenshot"></span>`);
	gui.setupScreenshot(div, campName);
	Html.set(div.querySelector('div'), '');
	if (flagHeaderOnly || !camp) return;

	const campResult = calculateCamp(camp, true);
	const camps = [campResult];

	// add secondary camp setup if Professor's Switch was bought
	if (isPlayer && gui.getArrayOfInt(generator.extensions).includes(2)) camps.push(calculateCamp(camp, false));
	// sorts camps by total regeneration descending (day first, night last)
	camps.sort((a, b) => b.reg_tot - a.reg_tot);

	if (isPlayer) {
		camps.forEach((campResult, index) => {
			campResult.isDay = index == 0;
			const setupResult = calculateCamp(camp, fillCamp(campResult.lines, campResult.stat.numRegSlots));
			const regDiff = setupResult.reg_tot - campResult.reg_tot, capDiff = setupResult.cap_tot - campResult.cap_tot;
			// Regeneration is preferred over capacity
			campResult.canBeImproved = regDiff > 0 || (regDiff == 0 && capDiff > 0);
		});
		if (camps.length < 2) camps.push(null);
		camps.push(calculateCamp(camp, fillCamp(campResult.lines, getSetupRegen(getState()))));
	}

	const addons = calculateAddons(camp, isPlayer ? generator : null);
	addons.empty = addons.blocked = 0;
	camps.forEach(campResult => {
		if (!campResult) return;
		let slots = [];
		Object.values(campResult.lines).forEach(line => slots = slots.concat(line.slots));
		addons.empty = Math.max(addons.empty, slots.filter(slot => slot.kind === 'empty').length);
		addons.blocked = Math.max(addons.blocked, slots.filter(slot => slot.kind === 'block').length);
	});

	let htm = '';
	htm += Html.br`<table class="camp-tables"><tr>`;

	// table Player
	htm += Html.br`<td><table class="camp-data camp-player-info row-coloring">`;
	htm += Html.br`<thead><tr><th colspan="2">${gui.getMessage('camp_player')}</th></tr></thead>`;
	htm += Html.br`<tbody>`;
	htm += Html.br`<tr><td>${gui.getMessage('gui_level')}</td><td>${Locale.formatNumber(level)}</td></tr>`;
	htm += Html.br`<tr><td>${gui.getMessage('gui_region')}</td><td>${gui.getObjectName('region', camp.region)}</td></tr>`;
	htm += Html.br`<tr><td>${gui.getMessage('gui_theme')}</td><td>${gui.getObjectName('skin', camp.skin)}</td></tr>`;
	htm += Html.br`</tbody>`;
	if (started && !isNaN(started.getFullYear())) {
		htm += Html.br`<tbody>`;
		htm += Html.br`<tr><td colspan="2">${gui.getMessage('camp_start_date', Locale.formatDateTime(started))}</td></tr>`;
		htm += Html.br`</tbody>`;
	}
	htm += Html.br`</table><div class="screenshot"></div></td>`;

	camps.forEach(function (campResult, index) {
		if (!campResult) return;
		htm += Html.br`<td class="camp-summary camp-${index + 1}">` + getCampSummary(campResult, isPlayer ? campNames[index] : '', index == 2) + Html.br`</td>`;
	});

	const wind_count = Math.min(camp.windmill_limit, (camp && Array.isArray(camp.windmills) && camp.windmills.length) || 0);
	const wind_expiry = bgp.Data.getCampWindmillTime(camp);
	// table Windmills
	htm += Html.br`<td><table class="camp-data row-coloring">`;
	htm += Html.br`<thead><tr><th colspan="2">${gui.getMessage('camp_windmills')}</th></tr></thead>`;
	htm += Html.br`<tbody>`;
	htm += Html.br`<tr><td>${gui.getMessage('camp_windmill_num')}</td><td>${Locale.formatNumber(wind_count) + ' / ' + Locale.formatNumber(camp.windmill_limit)}</td></tr>`;
	if (camp.windmill_reg) {
		htm += Html.br`<tr><td>${gui.getMessage('camp_windmill_regen')}</td><td>${Locale.formatNumber(camp.windmill_reg)}</td></tr>`;
		htm += Html.br`<tr><td>${gui.getMessage('camp_windmill_regen_total')}</td><td>${Locale.formatNumber(camp.windmill_reg * Math.min(wind_count, camp.windmill_limit))}</td></tr>`;
	}
	htm += Html.br`</tbody>`;
	if (wind_expiry) {
		htm += Html.br`<tbody>`;
		htm += Html.br`<tr><td colspan="2">${gui.getMessage('camp_windmill_expiry', Locale.formatDateTime(wind_expiry))}</td></tr>`;
		htm += Html.br`</tbody>`;
	}
	htm += Html.br`</table></td>`;

	if (campResult.blocks[2].blocked || campResult.blocks[3].blocked || campResult.blocks[4].blocked) {
		const mat = {};
		const matDiscount = {};
		Object.values(campResult.blocks).forEach(block => {
			for (let i = NUM_SLOTS * 2 - block.blocked; i < NUM_SLOTS * 2; i++) {
				for (const req of (block.slots[i] && block.slots[i].requirements)) {
					const matId = req.material_id;
					mat[matId] = (mat[matId] || 0) + +req.amount;
					if (swDiscount) matDiscount[matId] = (matDiscount[matId] || 0) + Math.ceil(+req.amount * swDiscount.coeficient);
				}
			}
		});
		htm += Html.br`<td><table class="camp-data">`;
		htm += Html.br`<thead><tr><th colspan="3">${gui.getMessage('camp_unlock_materials')}</th>`;
		if (swDiscount) htm += Html.br`<th>${gui.getMessage('camp_discounted')}</th>`;
		htm += Html.br`</tr></thead>`;

		const materials = gui.getFile('materials');

		// Show materials
		for (const matId of [1, 7, 22, 32, 8]) {
			const material = materials[matId];
			const img = material ? gui.getObjectImg('material', matId, 24, true) : '';
			if (matId in mat) {
				htm += Html.br`<tr class="material"><td>${img}</td><td>${gui.getObjectName('material', matId)}</td><td>${Locale.formatNumber(mat[matId])}</td>`;
				if (swDiscount) htm += Html.br`<td>${Locale.formatNumber(matDiscount[matId])}</td>`;
				htm += Html.br`</tr>`;
			}
		}
		htm += Html.br`<tbody>`;
		if (swDiscount) {
			htm += Html.br`<tfoot><tr><th colspan="4" class="warning">${swDiscount.name}<br>${swDiscount.ends}</th></tfoot>`;
		}
		htm += Html.br`</table></td>`;
	}

	htm += Html.br`</tr></table>`;

	if (Object.keys(addons).length > 0) {
		htm += Html`<div class="camp_addons">`;
		for (const addon of addonsMeta) {
			const name = addon.name;
			if (name in addons) {
				let value = addons[name];
				let title = gui.getString(addon.title);
				if (addon.desc) {
					const msg = Array.isArray(addon.desc) ? addon.desc[value] : addon.desc;
					if (msg) title += '\n' + gui.getString(msg);
				}
				const cost = getCostForAddon(name, value);
				if (cost) title += `\n${cost}`;
				let img = `/img/gui/${name}.png`;
				let extraClass = '';
				if (addon.name == 'diggy_skin') {
					extraClass = addon.name;
					img = gui.getObjectImage('diggy_skin', addons.costume.def_id);
					title += `\n${gui.getString(addons.costume.name_loc)}`;
				}
				if (addon.name == 'speedpotion') {
					extraClass = addon.name;
					title += addons.speedpotion_title;
					img = addons.speedpotion_img;
				}
				htm += Html`<div class="camp_addon ${value ? 'camp_addon_on' : ''}" title="${title}">`;
				htm += Html`<div class="camp_addon_img ${extraClass}"><img src="${img}"></div>`;
				if (typeof value === 'number') value = Locale.formatNumber(value);
				if (typeof value === 'string' && value != '') htm += Html.br`<div class="camp_addon_level">${value}</div>`;
				htm += Html`</div>`;
			}
		}
		if (addons.decorations) {
			htm += Html`<div class="camp_addon camp_addon_on" title="${gui.getString('GUI0006')}:\n${addons.decolist.join('\n')}">`;
			htm += Html`<div class="camp_addon_img"><img src="/img/gui/deco.png"></div>`;
			htm += Html.br`<div class="camp_addon_level">${Locale.formatNumber(addons.decorations)}</div>`;
			htm += Html`</div>`;
		}
		if (addons.empty) {
			htm += Html`<div class="camp_addon camp_addon_empty" title="${gui.getMessage('camp_slot_empty')}">`;
			htm += Html`<div class="camp_addon_img"><img src="/img/gui/mill.png"></div>`;
			htm += Html.br`<div class="camp_addon_level">${Locale.formatNumber(addons.empty)}</div>`;
			htm += Html`</div>`;
		}
		if (addons.blocked) {
			htm += Html`<div class="camp_addon camp_addon_blocked" title="${gui.getMessage('camp_slot_blocked')}">`;
			htm += Html`<div class="camp_addon_img"><img src="/img/gui/bomb.png"></div>`;
			htm += Html.br`<div class="camp_addon_level">${Locale.formatNumber(addons.blocked)}</div>`;
			htm += Html`</div>`;
		}
		htm += Html`</div>`;
	}

	camps.forEach(function (campResult, index) {
		if (!campResult) return;
		htm += Html.br`<div class="camp-container camp-new camp-${index + 1}">`;
		if (camps.length > 1)
			htm += Html.br`<table class="camp-caption"><thead><tr><th data-bid="camp-${index + 1}">${index == 2 ? getSetupName(campResult.stat.numRegSlots) : campNames[index]}</th></tr></thead></table>`;
		htm += renderCamp(campResult);
		htm += Html.br`</div>`;
	});

	Html.set(div.querySelector('div'), htm);
}

function calculateCamp(camp, current = true) {
	const lines_ids = gui.getArrayOfInt(camp.lines_ids);
	const lines_blocked = gui.getArrayOfInt(camp.lines_blocked);
	const buildings = gui.getFile('buildings');
	const lines = {};
	const blocks = {};
	let reg_min, reg_max, reg_cnt, cap_min, cap_max, cap_cnt, reg_tot, cap_tot;

	// setup blocks
	[2, 3, 4].forEach(height => {
		blocks[height] = {
			blocked: 0,
			slots: []
		};
	});
	Object.values(gui.getFile('lines')).forEach(line => {
		const height = +line.height;
		const order = +line.order + (height == 2 ? 3 : 0);
		if (height >= 2 && height <= 4 && order >= 1 && order <= NUM_SLOTS * 2)
			blocks[height].slots[order - 1] = line;
	});

	// setup lines
	[1, 2, 3, 5, 7, 9].forEach((lid, index) => {
		const height = Math.floor(index / 2) + 2;
		const slots = [];
		const emptySlot = {
			kind: 'empty',
			title: gui.getMessage('camp_slot_empty'),
			width: 1,
			height: height
		};
		const pos = lines_ids.indexOf(lid);
		const blocked = pos >= 0 ? parseInt(lines_blocked[pos]) || 0 : NUM_SLOTS;
		for (let i = 0; i < NUM_SLOTS; i++) slots[i] = emptySlot;
		if (blocked > 0) {
			const slot = {
				kind: 'block',
				title: gui.getMessage('camp_slot_blocked'),
				width: blocked,
				height: height
			};
			for (let i = 0; i < blocked; i++) slots[index % 2 ? NUM_SLOTS - 1 - i : i] = slot;
		}
		lines[lid] = {
			lid: lid,
			isReversed: (index % 2) == 0,
			height: height,
			slots: slots,
			blocked: blocked
		};
		blocks[height].blocked += blocked;
	});

	const reg_base = bgp.Data.getConfigValue('stamina_reg', 60) + Math.min((camp.windmills && camp.windmills.length) || 0, camp.windmill_limit || 5) * (parseInt(camp.windmill_reg) || 5);
	const cap_base = bgp.Data.getConfigValue('starting_stamina', 200);

	// position buildings
	reg_min = reg_max = cap_min = cap_max = reg_tot = cap_tot = reg_cnt = cap_cnt = 0;

	const stat = {};
	stat.cap = { min: [], max: [] };
	stat.reg = { min: [], max: [] };

	let blds = Array.isArray(current) ? current : (current ? camp.buildings : camp.inactive_b);
	blds = blds ? (Array.isArray(blds) ? blds : [blds]) : [];
	blds.forEach(building => {
		const lid = building.line_id;
		const line = lines[lid];
		if (line) {
			const bid = +building.def_id;
			const slot = +building.slot;
			building = buildings[bid];
			if (building) {
				const regen = +building.stamina_reg;
				const capacity = +building.max_stamina;
				const width = +building.columns;
				const value = Math.floor((regen || capacity) / width);
				if (capacity > 0) {
					if (cap_min == 0 || value < cap_min) {
						cap_min = value;
						stat.cap.min = [bid];
					} else if (value == cap_min) {
						stat.cap.min.push(bid);
					}
					if (cap_max == 0 || value > cap_max) {
						cap_max = value;
						stat.cap.max = [bid];
					} else if (value == cap_max) {
						stat.cap.max.push(bid);
					}
					cap_tot += capacity;
					cap_cnt += width;
				}
				if (regen > 0) {
					if (reg_min == 0 || value < reg_min) {
						reg_min = value;
						stat.reg.min = [bid];
					} else if (value == reg_min) {
						stat.reg.min.push(bid);
					}
					if (reg_max == 0 || value > reg_max) {
						reg_max = value;
						stat.reg.max = [bid];
					} else if (value == reg_max) {
						stat.reg.max.push(bid);
					}
					reg_tot += regen;
					reg_cnt += width;
				}
				const data = {
					kind: 'building',
					bid: bid,
					capacity: capacity,
					regen: regen,
					value: value,
					width: +building.columns,
					height: +building.rows,
					region_id: building.region_id || 0,
					title: gui.getObjectName('building', bid)
				};
				for (let i = 0; i < data.width; i++) line.slots[slot + i] = data;
			}
		}
	});

	stat.numRegSlots = stat.numCapSlots = stat.numEmptySlots = 0;
	Object.values(lines).forEach(line => line.slots.forEach(slot => {
		if (slot.kind == 'empty') stat.numEmptySlots++;
		if (slot.kind == 'building' && slot.regen) stat.numRegSlots++;
		if (slot.kind == 'building' && !slot.regen) stat.numCapSlots++;
	}));

	const reg_avg = reg_cnt && Math.floor(reg_tot / reg_cnt);
	const cap_avg = cap_cnt && Math.floor(cap_tot / cap_cnt);
	reg_tot += reg_base;
	cap_tot += cap_base;

	return {
		lines,
		blocks,
		stat,
		reg_min,
		reg_max,
		reg_avg,
		cap_min,
		cap_max,
		cap_avg,
		reg_base,
		cap_base,
		reg_tot,
		cap_tot
	};
}

function calculateAddons(camp, generator) {
	const addons = {};
	const getItems = (arr, map) => {
		const items = {};
		arr && arr.filter(o => o).map(map).forEach(o => items[o.id] = o);
		return items;
	};
	const deco = {};
	const campDecorations = camp.decorations || [];
	addons.decorations = campDecorations.length;
	campDecorations.forEach(d => deco[d.def_id] = (deco[d.def_id] || 0) + 1);
	addons.decolist = Object.entries(deco).map(entry => {
		const name = gui.getObjectName('decoration', entry[0]);
		return entry[1] == 1 ? name : name + ' \xd7 ' + Locale.formatNumber(entry[1]);
	}).sort(gui.sortTextAscending);
	if (camp.addon_buildings) {
		const items = getItems(camp.addon_buildings, o => { return { id: +o.def_id, level: +o.level }; });
		addons.hollander = items[6] ? 8 : 5;
		addons.rotor = items[7] ? items[7].level : 0;
	}
	if (generator) {
		const items = getItems([].concat(generator.passive_effect_extension && generator.passive_effect_extension.item), o => { return { id: +o.extension_def_id, level: +o.extension_level }; });
		addons.potion_double_exp = items[1] ? items[1].level : 0;
		addons.potion_energy_back = items[2] ? items[2].level : 0;

		const ext = getItems(gui.getArrayOfInt(generator.extensions), o => { return { id: o }; });
		addons.golem = !!ext[1];
		addons.professor_switch = !!ext[2];
		addons.gc_one_click = !!ext[3];
		addons.last_tile_finder = !!ext[4];

		const costumes = Object.values(gui.getFile('diggy_skins'));
		addons.diggy_skin = gui.getArrayOfInt(generator.diggy_skins).length + costumes.filter(c => +c.free).length;
		addons.costume = costumes.find(c => +c.def_id == +generator.diggy_skins_active) || costumes[0];

		const usables = gui.getFile('usables');
		const potions = [];
		let total = 0;
		for (const [id, qty] of Object.entries(generator.usables)) {
			const usable = usables[id];
			if (usable && usable.action == 'speedup_ctrl') {
				const value = +usable.value;
				const tot = qty * value;
				total += tot;
				potions.push({ id, qty, value, tot });
			}
		}
		if (potions.length) {
			addons.speedpotion = gui.getDuration(total);
			potions.sort((a, b) => b.tot - a.tot);
			addons.speedpotion_img = gui.getObjectImage('usable', potions[0].id, true);
			addons.speedpotion_title = '\n' + potions.map(p => `${gui.getObjectName('usable', p.id)} \xd7 ${Locale.formatNumber(p.qty)} = ${gui.getDuration(p.tot, 2)}`).join('\n');
			addons.speedpotion_title += '\n' + gui.getMessageAndValue('camp_total', gui.getDuration(total, 2));
		}

	}
	return addons;
}

function findSales(type, id) {
	return Object.values(gui.getFile('sales')).filter(sale => sale.type == type && +sale.hide == 0 && +sale.object_id == id);
}

function getCostForAddon(name, value) {
	let cost = '';
	let sales;
	const addon = addonsMeta.find(o => o.name == name);
	if (addon && addon.type) {
		sales = findSales(addon.type, addon.id);
		if (name == 'rotor') {
			if (sales.length && value != +sales[sales.length - 1].object_level) value++;
			sales = sales.filter(sale => +sale.object_level == value);
		}
	}
	const isPotion = name == 'potion_double_exp' || name == 'potion_energy_back';
	if (sales && sales.length) {
		sales.sort((a, b) => (+a.object_level - +b.object_level) || (+a.level - +b.level));
		let prefix = sales.length > 1 ? '\u2022 ' : '';
		cost = sales.map(sale => {
			if (isPotion) prefix = `${gui.getMessage('gui_level')} ${Locale.formatNumber(+sale.object_level)}: `;
			let text = sale.requirements.map(req => gui.getObjectName('material', req.material_id) + ' \xd7 ' + Locale.formatNumber(req.amount)).join(', ');
			if (+sale.level > 1) text = `${text} (${gui.getMessage('gui_level')} ${Locale.formatNumber(sale.level)})`;
			return prefix + text;
		}).join('\n');
		if (name == 'rotor') cost = '\n' + gui.getMessage('gui_cost') + ' [' + gui.getMessage('gui_level').toUpperCase() + ' ' + Locale.formatNumber(value) + ']:\n' + cost;
		else cost = '\n' + gui.getMessage('gui_cost') + ':\n' + cost;
	}
	return cost;
}

function renderCamp(campResult) {
	const {
		lines,
		blocks,
		reg_min,
		reg_max,
		cap_min,
		cap_max
	} = campResult;

	// render the camp and calculate some values
	const reg_range = reg_max - reg_min;
	const cap_range = cap_max - cap_min;
	const opacity_min = 0.4;
	const opacity_range = 1 - opacity_min;
	let htm = '';

	htm += Html.br`<div class="camp public">`;

	function getStrength(value, min, range) {
		return range ? (value - min) / range * opacity_range + opacity_min : 1;
	}
	[1, 2, 3, 5, 7, 9].forEach((lid) => {
		const line = lines[lid];
		const slots = line.slots;
		htm += Html.br`<div class="line" style="--lw:24;--lh:${line.height}">`;
		const getSlot = function (index) {
			return slots[line.isReversed ? NUM_SLOTS - 1 - index : index];
		};
		for (let i = 0; i < NUM_SLOTS;) {
			const slot = getSlot(i);
			let title = slot.title;
			let width = slot.width;
			let kind = slot.kind;
			let colValues = '';
			let strength = 0;
			let bid = 0;
			let exStyle = '';
			while (kind == 'empty' && i + width < NUM_SLOTS && getSlot(i + width).kind == kind) width++;
			if (width > 1 && (kind == 'empty' || kind == 'block')) title += ' \xd7 ' + width;
			if (kind == 'block') {
				const block = blocks[line.height].slots[NUM_SLOTS * 2 - blocks[line.height].blocked];
				if (block) {
					title += '\n' + gui.getMessage('camp_unlock_one', Locale.formatNumber(+block.exp));
					title += '\n' + gui.getMessage('camp_unlock_cost', Locale.formatNumber(+block.gems));
					for (const req of block.requirements) {
						title += '\n    ' + gui.getObjectName('material', req.material_id) + ' \xd7 ' + Locale.formatNumber(+req.amount);
					}
				}
			}
			if (kind == 'building') {
				title += ' (' + width + '\xd7' + slot.height + ')';
				bid = slot.bid;
				const url = gui.getObjectImage('building', bid);
				if (url) {
					kind += ' img tooltip-event';
					exStyle = ';background-image:url(' + url + ')';
				}
				if (slot.capacity > 0) {
					kind += ' capacity';
					title += '\n' + gui.getMessageAndValue('camp_capacity', slot.capacity);
					strength = getStrength(slot.value, cap_min, cap_range);
				}
				if (slot.regen > 0) {
					kind += ' regen';
					title += '\n' + gui.getMessageAndValue('camp_regen', slot.regen);
					strength = getStrength(slot.value, reg_min, reg_range);
				}
				if (slot.region_id > 0) {
					kind += ' reg' + slot.region_id;
					title += '\n' + gui.getMessageAndValue('gui_region', gui.getObjectName('region', slot.region_id));
				}
				colValues = Html.raw(String(Html.br`<div class="value">${slot.value}</div>`).repeat(width));
				strength = Math.round(strength * 1000) / 1000;
			}
			htm += Html.br`<div class="item ${kind}" style="--w:${width};--h:${slot.height};--v:${strength}${exStyle}" title="${Html(title)}"`;
			if (bid) htm += Html.br` data-bid="${bid}"`;
			htm += Html.br`>${colValues}</div>`;
			i += width;
		}
		htm += Html.br`</div>`;
	});
	htm += Html.br`</div>`;
	return htm;
}

function fillCamp(campLines, numRegSlotsOriginal) {
	function compute(exceptReg, exceptCap) {
		let numSlots = 0;
		const lines = Object.values(campLines).map(line => {
			const copy = Object.assign({}, line, { regblds: [], capblds: [], empty: line.slots.length - line.blocked });
			numSlots += copy.empty;
			return copy;
		}).sort((a, b) => a.height - b.height);
		let numRegSlots = Math.min(numSlots, Math.max(0, numRegSlotsOriginal));
		let numCapSlots = numSlots - numRegSlots;
		const getBuildings = (base, except) => {
			base = base.map(item => Object.assign({}, item));
			if (except) {
				const remove = (building) => {
					const index = base.findIndex(item => item.building === building);
					const item = base[index];
					if (--item.qty <= 0) base.splice(index, 1);
				};
				remove(except[0].building);
				remove(except[1].building);
			}
			return base;
		};
		const regBuildingsRest = getBuildings(regBuildings, exceptReg);
		const capBuildingsRest = getBuildings(capBuildings, exceptCap);
		let totReg = 0, totCap = 0;
		const tryFind = (num, buildings) => {
			if (num <= 0) return 0;
			const index = buildings.findIndex(item => {
				if (item.width > num) return false;
				const line = lines.find(line => line.height >= item.height && line.empty >= item.width);
				if (!line) return false;
				(item.isReg ? line.regblds : line.capblds).push(item);
				line.empty -= item.width;
				return true;
			});
			if (index < 0) return 0;
			const item = buildings[index];
			if (--item.qty <= 0) buildings.splice(index, 1);
			if (item.isReg) totReg += item.total; else totCap += item.total;
			return item.width;
		};
		let switched = false;
		for (; ;) {
			const regPlaced = tryFind(numRegSlots, regBuildingsRest);
			const capPlaced = tryFind(numCapSlots, capBuildingsRest);
			numRegSlots -= regPlaced;
			numCapSlots -= capPlaced;
			numSlots -= (regPlaced + capPlaced);
			// Cannot add any building
			if (regPlaced == 0 && capPlaced == 0) {
				if (switched || numSlots == 0) break;
				// Switch the quantities, so we try to fill the remaining slots
				switched = true;
				[numRegSlots, numCapSlots] = [numCapSlots, numRegSlots];
			}
		}
		const tryPlace = (item) => {
			if (!item || item.width != 2) return false;
			const minLines = lines.filter(line => {
				const blds = line.blds = item.isReg ? line.regblds : line.capblds;
				const bld = blds.length && blds[blds.length - 1];
				line.min = bld && bld.width == 1 ? bld.value : 0;
				return line.min > 0;
			}).sort((a, b) => a.min - b.min);
			let diff = 0;
			const minLine = minLines.find(line => {
				if (line.height < item.height) return false;
				const arr = line.blds, len = arr.length;
				return len >= 2 && arr[len - 2].width == 1 && (diff = item.total - arr[len - 1].total - arr[len - 2].total) > 0;
			});
			if (minLine) {
				if (item.isReg) totReg += diff; else totCap += diff;
				minLine.blds.splice(minLine.blds.length - 2, 2, item);
				return false;
			}
			if ((item.isReg && exceptReg) || (!item.isReg && exceptCap)) return false;
			const minBlds = [];
			minLines.forEach(line => {
				const arr = line.blds;
				let i = arr.length - 1;
				minBlds.push(arr[i]);
				while (--i >= 0) {
					if (arr[i].width == 1) {
						minBlds.push(arr[i]);
						break;
					}
				}
			});
			minBlds.sort((a, b) => (a.value - b.value) || (b.height - a.height));
			if (minBlds.length >= 2 && minBlds[0].total + minBlds[1].total < item.total) {
				const except = [minBlds[0], minBlds[1]];
				const alternate = compute(item.isReg ? except : exceptReg, !item.isReg ? except : exceptCap);
				if ((alternate.totReg >= totReg && alternate.totCap > totCap) || (alternate.totReg > totReg && alternate.totCap >= totCap)) {
					// console.log(`SWITCHED #${numRegSlotsOriginal} REG:${totReg} -> ${alternate.totReg}  CAP:${totCap} -> ${alternate.totCap}`);
					return alternate;
				}
			}
			return false;
		};
		return tryPlace(regBuildingsRest[0]) || tryPlace(capBuildingsRest[0]) || { totReg, totCap, lines };
	}
	const { lines } = compute();
	const blds = [];
	lines.forEach(line => {
		let first = line.isReversed ? line.blocked : 0;
		let last = line.isReversed ? line.slots.length : line.slots.length - line.blocked;
		const place = (item) => {
			const fromStart = line.isReversed ^ item.isReg, width = item.width;
			blds.push({ def_id: item.building.def_id, line_id: line.lid, slot: fromStart ? first : last - width });
			if (fromStart) first += width; else last -= width;
		};
		line.regblds.forEach(place);
		line.capblds.forEach(place);
	})
	return blds;
}

async function adsLimit() {
	await bgp.Data.getFile('video_ads');
	const adsInfo = bgp.Data.getAdsInfo();
	const items = Html.raw(adsInfo.items.map(item => Html`<tr><td>${item.text}</td><td style="text-align:center">${item.limit}</td><td style="text-align:center">${item.date}</td></tr>`).join(''));
	let htm = '';
	htm += Html`<div class="ads_limit_warning">${gui.getMessage('camp_ads_limit_info')}<br>${gui.getMessage('camp_ads_limit_info2')}</div>`;
	htm += Html`<table class="daf-table"><thead>`;
	htm += Html.br`<tr><th>${gui.getMessage('gui_type')}</th><th>${gui.getMessage('gui_limit')}</th><th>${gui.getMessage('gui_date')}</th></tr>`;
	htm += Html`</thead><tbody class="row-coloring">${items}</tbody>`;
	htm += Html.br`<tfoot><tr><th>${gui.getMessage('camp_total')}</th><th>${adsInfo.total}</th><th></th></tr></tfoot>`;
	htm += Html`</table>`;
	gui.dialog.show({ title: gui.getMessage('camp_ads_limit'), html: htm, style: [Dialog.CLOSE] });
}

async function findThePair() {
	await bgp.Data.getFile('tokens');
	await bgp.Data.getFile('events');
	const playboards = await bgp.Data.getFile('playboards');
	const generator = gui.getGenerator();

	let htm = '';
	htm += Html`<label class="with-margin">${gui.getMessage('gui_date')} <select name="sw" data-method="sw">`;
	const weeks = gui.getSpecialWeeks().types.find_the_pair;
	weeks.sort((a, b) => a.start - b.start);
	weeks.forEach((sw, index) => {
		htm += Html`<option value="${sw.id}" ${index == weeks.length - 1 ? 'selected' : ''}>${Locale.formatDateTime(sw.start)} - ${Locale.formatDateTime(sw.finish)}</option>`;
	});
	htm += Html`</select></label>`;
	htm += Html`<label class="with-margin">${gui.getMessage('gui_type')} <select name="type" data-method="type">`;
	htm += Html`</select></label><br>`;
	htm += Html`<label class="with-margin" style="display:inline-block;margin-top:2px">${gui.getMessage('gui_region')} <select name="rid" data-method="rid">`;
	const maxRid = gui.getMaxRegion();
	for (let rid = 1; rid <= maxRid; rid++) htm += Html`<option value="${rid}"${rid == generator.region ? ' selected' : ''}>${gui.getObjectName('region', rid)}</option>`;
	htm += Html`</select></label>`;
	htm += Html`<div class="flipthepair"></div>`;
	gui.dialog.show({ title: gui.getString('GUI3326'), html: htm, style: [Dialog.CLOSE, Dialog.WIDEST, Dialog.AUTORUN] }, (method, params) => {
		if (method == Dialog.AUTORUN || method == 'sw') {
			const sw = bgp.Data.files.special_weeks[params.sw];
			const types = gui.getArrayOfInt(sw.info);
			const htm = types.map((type, index) => Html`<option value="${type}">${String.fromCharCode(65 + index)}</option>`);
			const select = gui.dialog.element.querySelector('select[name=type]');
			Html.set(select, htm.concat(''));
			select.parentNode.style.display = types.length > 1 ? '' : 'none';
			const currentId = generator.find_the_pair && +generator.find_the_pair.playboard_id;
			params.type = types.indexOf(currentId) >= 0 ? select.value = currentId : types[0];
		}
		if (method == Dialog.AUTORUN || method == 'sw' || method == 'type' || method == 'rid') {
			let htm = '';
			const playboard = playboards[params.type];
			const rid = params.rid;
			// const totChance = playboard.cards.reduce((sum, card) => sum += +card.chance, 0);
			let col = 0;
			const cards = playboard.cards.sort((a, b) => (+a.group - +b.group) || (+a.def_id - +b.def_id));
			const firstGroup = +cards[0].group || 0;
			const hasFirst3 = playboard.cards.find(card => +card.first3flips > 0);
			const hasGroups = (+cards[cards.length - 1].group || 0) != firstGroup;
			let groupFlag = true;
			let lastGroup = firstGroup;
			htm += Html`<table class="daf-table">`;
			htm += Html.br`<thead><tr><th colspan="8">${gui.getString('GUI3329')}${hasFirst3 ? '\n' + gui.getMessage('camp_ftp_dot_info') : ''}${hasGroups ? '\n' + gui.getMessage('camp_ftp_group_info') : ''}</th></thead>`;
			htm += Html`<tbody class="chessboard-coloring no-dark">`;
			cards.forEach(card => {
				const group = +card.group;
				if (group != lastGroup) {
					lastGroup = group;
					groupFlag = !groupFlag;
				}
				const isFirst3 = +card.first3flips > 0;
				if (col == 0) htm += Html`<tr>`;
				htm += Html`<td class="flip-card h ${groupFlag ? 'odd' : 'even'}${isFirst3 ? ' dot' : ''}">`;
				htm += card.rewards.filter(r => +r.region_id == 0 || +r.region_id == rid).map(reward => {
					let htm = '';
					const item = packHelper.getItem(reward);
					htm += packHelper.getHtml(item);
					// htm += Html`<div class="chance">${gui.getMessageAndValue('events_chance', Locale.formatNumber(+card.chance / totChance * 100, 1))} %</div>`;
					htm += Html`<div class="group">${gui.getMessage('camp_ftp_group', Locale.formatNumber(+card.group))}</div>`;
					return htm;
				}).join('');
				htm += Html`</td>`;
				col = (col + 1) % 8;
				if (col == 0) htm += Html`</tr>`;
			});
			htm += Html`<tbody>`;
			htm += Html`</table>`;
			const total = playboard.prices.reduce((s, p) => s += +p.gems, 0);
			htm += Html`<table class="daf-table flip-table">`;
			htm += Html`<thead><tr><th colspan="16">${gui.getString('GUI3332')} (${gui.getMessageAndValue('camp_total', Locale.formatNumber(total) + ' ' + gui.getObjectName('material', 2))})</th></thead>`;
			htm += Html`<tbody class="chessboard-coloring no-dark">`;
			col = 0;
			const gemUrl = gui.getObjectImage('material', 2, true);
			const getCost = gems => Html`<div class="reward"><img src="${gemUrl}" class="outlined"></div><div class="qty">${'\xd7 ' + Locale.formatNumber(gems)}</div>`;
			let gemsSoFar = 0;
			playboard.prices.map(price => { return { gems: +price.gems, order: +price.flip_order }; })
				.sort((a, b) => a.order - b.order)
				.forEach(price => {
					if (col == 0) htm += Html`<tr>`;
					const gems = +price.gems;
					gemsSoFar += gems;
					htm += Html`<td class="h" title="${gui.getMessageAndValue('camp_ftp_cumulativegems', Locale.formatNumber(gemsSoFar))}"><div class="ordinal">${Locale.formatNumber(price.order)}</div>${gems ? getCost(gems) : gui.getMessage('equipment_free')}</td>`;
					col = (col + 1) % 16;
					if (col == 0) htm += Html`</tr>`;
				});
			htm += Html`<tbody>`;
			htm += Html`</table>`;
			Html.set(gui.dialog.element.querySelector('.flipthepair'), htm);
		}
	});
}

async function luckyCards() {
	await bgp.Data.getFile('tokens');
	await bgp.Data.getFile('random_rewards');

	const generator = gui.getGenerator();
	const level = +generator.level;
	const calculation = new Calculation();
	calculation.defineConstant('level', level);
	const randomRewards = {};
	Object.values(bgp.Data.files.random_rewards).forEach(item => randomRewards[item.name] = item);

	function getRewardsTable(reward, rid, title, wrapCount) {
		let htm = '';
		const rewards = reward.items.filter(item => +item.region_id == rid);
		const totalChances = rewards.reduce((a, item) => a + +item.chance, 0);
		htm += Html`<table class="daf-table">`;
		if (title) htm += Html.br`<thead><tr><th colspan="3">${title}</th></thead>`;
		htm += Html`<tbody class="chessboard-coloring no-dark">`;
		rewards.forEach((reward, index) => {
			if (index == 0 || index % wrapCount == 0) htm += Html`<tr>`;
			reward = Object.assign({}, reward);
			let formula = String(reward.amount);
			const isFormula = formula.indexOf('[') >= 0 || isNaN(+formula);
			formula = formula.replace(/\[([a-z]+)\]/g, '$1');
			htm += Html`<td class="flip-card h${isFormula ? ' dot' : ''}">`;
			reward.amount = isFormula ? Math.floor(calculation.compute(formula)) : +reward.amount;
			const item = packHelper.getItem(reward);
			htm += packHelper.getHtml(item);
			const chance = +reward.chance / totalChances * 100;
			const chanceText = Locale.formatNumber(chance, Math.trunc(chance) === chance ? 0 : 1);
			htm += Html`<div class="group" title="${isFormula ? gui.getMessageAndValue('dailyreward_formula', formula.replace(/(\W)/g, ' $1 ')) : ''}">${gui.getMessageAndValue('events_chance', chanceText + ' %')}</div>`;
			htm += Html`</td>`;
			if (index == rewards.length - 1 || index % wrapCount == wrapCount - 1) htm += Html`</tr>`;
		});
		htm += Html`<tbody>`;
		htm += Html`</table>`;
		return htm;
	}

	let htm = '';
	htm += Html`<label class="with-margin" style="display:inline-block;margin-top:2px">${gui.getMessage('gui_region')} <select name="rid" data-method="rid">`;
	const maxRid = gui.getMaxRegion();
	for (let rid = 1; rid <= maxRid; rid++) htm += Html`<option value="${rid}"${rid == generator.region ? ' selected' : ''}>${gui.getObjectName('region', rid)}</option>`;
	htm += Html`</select></label>`;
	htm += Html`<div class="flipthepair"></div>`;
	gui.dialog.show({ title: gui.getProperCase(gui.getString('GUI3120')), html: htm, style: [Dialog.CLOSE, Dialog.WIDEST, Dialog.AUTORUN] }, (method, params) => {
		if (method == Dialog.AUTORUN || method == 'rid') {
			let htm = '';
			htm += Html`<table><tr>`;
			['lucky_cards_video_energy', 'lucky_cards_second_chest', 'lucky_cards_third_chest'].forEach((name, index) => {
				let reward = randomRewards[name];
				if (!reward) return;
				htm += Html`<td class="innertable">`;
				htm += getRewardsTable(reward, params.rid, Locale.formatNumber(index + 1), 3);
				htm += Html`</td>`;
			})
			htm += Html`</tr></table>`;
			htm += Html`<br><table class="daf-table">`;
			htm += Html.br`<thead><tr><th colspan="3">${gui.getString('GUI3123')}</th></thead>`;
			htm += Html`<tbody><tr><td style="background-color:var(--td-brcol)"><table><tr>`;
			['lucky_cards_box_XP', 'lucky_cards_box_coins', 'lucky_cards_box_material'].forEach(name => {
				let reward = randomRewards[name];
				if (!reward) return;
				htm += '<td class="no-border">' + getRewardsTable(reward, params.rid, null, 10) + '</td>';
			});
			htm += Html`</tr></table></td></tr><tbody>`;
			htm += Html`</table>`;
			Html.set(gui.dialog.element.querySelector('.flipthepair'), htm);
		}
	});
}

function onTooltip(event) {
	const element = event.target;
	const bid = parseInt(element.getAttribute('data-bid'));
	const htm = Html.br`<div class="camp-tooltip"><img src="${gui.getObjectImage('building', bid)}"/></div>`;
	Tooltip.show(element, htm, 'bb');
}