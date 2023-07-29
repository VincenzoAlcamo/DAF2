/*global bgp gui Html Locale Dialog*/

export default ringLoot;

const MAX_LEVEL = 1999;

function ringLoot(kind) {

	let tokenId, locations;
	let requires = ['materials', 'usables', 'tokens', 'xp'];
	// mineid: ringid
	const christmasMines = {
		1987: 5605,
		2284: 6844,
		2640: 7833,
		2965: 8996,
		3254: 10085,
		3779: 10941
	};

	if (kind == 'green') {
		tokenId = 32;
		const maxRId = gui.getMaxRegion();
		locations = [];
		for (let rid = 1; rid <= maxRId; rid++) locations.push('locations_' + rid);
		requires.push('special_weeks');
	} else if (kind == 'red') {
		tokenId = 1642;
		locations = ['locations_0'];
	} else if (kind == 'christmas') {
		tokenId = 0;
		locations = ['locations_0'];
		requires.push('special_weeks');
	} else throw 'Invalid kind "' + kind + '"';
	requires = requires.concat(locations);

	let tab, container, inputs, floorData, swDoubleDrop, swPostcards;
	let checkState = {};
	let selectState = [];

	function init() {
		tab = this;
		({ container, inputs } = tab);

		if (inputs.region) {
			let htm = '';
			for (let rid = 1, maxRid = gui.getMaxRegion(); rid <= maxRid; rid++) htm += Html`<option value="${rid}">${gui.getObjectName('region', rid)}</option>`;
			Html.set(inputs.region, htm);
		}

		if (inputs.level) inputs.level.addEventListener('blur', onBlur);
	}

	function toInt(value) {
		const n = parseInt(value);
		return isFinite(n) && n > 0 ? n : 0;
	}

	function getState() {
		const level = inputs.level ? parseInt(inputs.level.value) || 0 : 0;
		let selected = '';
		for (let i = 0; i < selectState.length; i++) {
			selected += ',' + (toInt(selectState[i]) || '');
		}
		selected = selected.substr(1).replace(/,+$/, '');
		const result = {
			region: inputs.region ? inputs.region.value : '',
			minmax: inputs.minmax.checked,
			xp: inputs.xp.checked,
			dmw: inputs.dmw ? inputs.dmw.value : undefined,
			h: Object.keys(checkState).join(','),
			selected
		};
		if (inputs.showlevel) {
			result[inputs.showlevel.checked ? 'level' : 'no-level'] = (level >= 1 && level <= MAX_LEVEL ? level : +gui.getGenerator().level);
		}
		return result;
	}

	function setState(state) {
		checkState = {};
		for (const index of gui.getArrayOfInt(state.h)) checkState[index] = true;
		const setCheck = (id, c) => {
			const input = document.getElementById(id);
			if (input) {
				input.checked = !!checkState[c];
				setRotate(input);
			}
		};
		if (inputs.region) {
			state.region = gui.setSelectState(inputs.region, state.region);
		}
		inputs.xp.checked = !!state.xp;
		state.dmw = inputs.dmw ? gui.setSelectState(inputs.dmw, state.dmw) : undefined;
		if (inputs.showlevel) {
			inputs.showlevel.checked = 'level' in state;
			const level = parseInt(state.level || state['no-level']) || 0;
			inputs.level.value = level >= 1 && level <= MAX_LEVEL ? level : +gui.getGenerator().level;
		}
		for (const data of Object.values(floorData || {})) setCheck('loot_' + data.mine.def_id, data.index);
		inputs.minmax.checked = !!state.minmax;
		selectState = String(state.selected).split(',').map(n => toInt(n));
	}

	function onInput(event) {
		updateTabState();
		const name = event.target.name;
		if (name == 'xp' || name == 'minmax' || name == 'showlevel') setStateFlags();
		else refresh();
	}

	function onBlur() {
		const level = parseInt(inputs.level.value) || 0;
		if (level < 1 || level > MAX_LEVEL) {
			inputs.level.value = +gui.getGenerator().level;
			onInput();
		}
	}

	async function update() {
		if (tokenId) {
			const img = gui.getObjectImg('token', tokenId, 24, true);
			const qty = gui.getGenerator().tokens[tokenId] || 0;
			Html.set(container.querySelector('.stats'), Html.br`${img}${gui.getMessage('rings_stats', Locale.formatNumber(qty), gui.getObjectName('token', tokenId))}`);
		}

		const specialWeeks = gui.getSpecialWeeks();
		if (kind == 'green' || kind == 'christmas') {
			swDoubleDrop = specialWeeks.active.refresh_drop;
			swPostcards = specialWeeks.active.postcards;
		}
		gui.showSpecialWeeks(container, [swPostcards, swDoubleDrop]);
		if (inputs.dmw) {
			const oldValue = inputs.dmw.value;
			const htm = `<option value="">(${gui.getMessage(swDoubleDrop ? 'dialog_yes' : 'dialog_no').toLowerCase()})</option>
<option value="yes">${gui.getMessage('dialog_yes')}</option><option value="no">${gui.getMessage('dialog_no')}</option>`;
			Html.set(inputs.dmw, htm);
			inputs.dmw.value = oldValue;
		}

		const seconds = (kind == 'green' ? 168 : 2) * 3600;
		const eid = kind == 'green' ? 0 : 20;
		let mines = [];
		if (kind == 'christmas') {
			for (const loc of locations) mines = mines.concat(Object.values(gui.getFile(loc)).filter(mine => {
				if (+mine.test !== 0) return false;
				return +mine.def_id in christmasMines || (+mine.reset_cd === 7200 && +mine.event_id !== 20 && +mine.reset_gems === 25);
			}));
		} else {
			for (const loc of locations) mines = mines.concat(Object.values(gui.getFile(loc)).filter(mine => {
				return +mine.test == 0 && +mine.event_id == eid && +mine.reset_cd == seconds;
			}));
			if (kind == 'red') {
				const quests = gui.getArrayOfInt(gui.getGenerator().quests_f);
				mines = mines.filter(mine => quests.includes(+mine.vis_quest));
				mines.sort((a, b) => +a.vis_quest - +b.vis_quest);
			}
		}

		floorData = {};
		const parent = container.querySelector('.scrollable-content');
		Html.set(parent, '');
		let index = 0;
		for (const mine of mines) {
			const lid = mine.def_id;
			if (+mine.region_id > +gui.getGenerator().region) continue;
			const floors = await bgp.Data.getFile('floors_' + lid);
			const allLoots = [];
			let chest = 0;
			let hasCandy = false;
			let christmastTokenId = christmasMines[lid] || 0;
			for (const floor of floors.floor) {
				if (!floor.def_id) continue;
				if (kind == 'christmas') {
					const beacons = floor.beacons.beacon;
					(beacons ? [].concat(beacons) : []).forEach(beacon => {
						const parts = beacon.parts.part;
						(parts ? [].concat(parts) : []).forEach(part => {
							if (+part.req_material > 0) christmastTokenId = part.req_material;
						});
					})
				}
				const { columns: cols, rows } = floor;
				const lootAreas = gui.getLootAreas(floor);
				const loots = [];
				let gemTle = '';
				let candyTle = '';
				for (const lootArea of lootAreas) {
					if (lootArea.type == 'token') continue;
					let tle = lootArea.tiles;
					if (typeof tle != 'string') continue;
					tle = tle.split(';');
					for (let t of tle) {
						t = t.split(',').map(n => parseInt(n));
						const [y, x] = t;
						// Bug in "Red deck of rewards"
						if (lid == 2999 && x == 2 && y == 37) continue;
						if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
						if (kind == 'red' || (kind == 'christmas' && lid != 2965)) {
							t[0] = 99 - t[0];
						}
						t = t.map(n => String(n).padStart(3, '0')).join(',');
						// skip spurious Orichalcum in "Temple of Fortune" (no more necessary as the file has been fixed)
						if (lid == 2193 && t.substr(0, 3) == '030,' && lootArea.type == 'material' && lootArea.object_id == 148) continue;
						const copy = Object.assign({}, lootArea);
						copy.tle = t;
						const type = copy.type;
						const oid = copy.object_id;
						if (type == 'material' && oid == 2) gemTle = copy.tle;
						if (type == 'usable' && oid == 19) candyTle = copy.tle;
						loots.push(copy);
					}
				}
				for (const lootArea of loots) {
					if (lootArea.tle == candyTle) {
						lootArea.tle = 'z' + lootArea.tle;
						hasCandy = true;
					} else if (lootArea.tle == gemTle) {
						lootArea.tle = 'g' + lootArea.tle;
					}
				}
				loots.sort((a, b) => a.tle.localeCompare(b.tle));

				let last = null;
				for (const lootArea of loots) {
					if (last == null || last.tle != lootArea.tle) {
						last = lootArea;
						chest = chest + 1;
						lootArea.numRows = 1;
					} else {
						last.numRows++;
					}
					lootArea.chest = chest;
					allLoots.push(lootArea);
				}
			}
			floorData[lid] = {
				index: ++index,
				mine: mine,
				chests: chest,
				hasCandy: hasCandy,
				loots: allLoots
			};
			let htm = '';
			htm += Html.br`<input type="checkbox" id="loot_${lid}">`;
			if (kind == 'christmas') {
				if (!christmastTokenId) continue;
				const qty = gui.getGenerator().tokens[christmastTokenId] || 0;
				htm += Html.br`<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${gui.getObjectImg('token', christmastTokenId, 32, true)}<span>${gui.getString(mine.name_loc)}<br>${gui.getMessageAndValue('rings_rings', Locale.formatNumber(qty))}</span></label>`;
			} else {
				htm += Html.br`<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${kind == 'green' ? gui.getRegionImg(mine.region_id) : Html`<img src="/img/gui/redrings.png">`}<span>${gui.getString(mine.name_loc)}</span></label>`;
			}
			htm += Html.br`<div></div>`;
			const div = Html.get('<div class="card rings">' + htm + '</div>')[0];
			parent.appendChild(div);
			const input = div.querySelector('input');
			input.addEventListener('click', function () {
				setRotate(this);
				updateTabState();
			});
		}
		setState(getState());
		updateTabState();
		refresh();
	}

	function setRotate(input) {
		const div = input.parentNode;
		const lid = input.id.substr(5);
		const data = floorData[lid];
		if (!data) return;
		const index = data.index;
		if (input.checked) checkState[index] = true;
		else delete checkState[index];
		if (input.checked) {
			const width = div.offsetWidth;
			const height = div.offsetHeight;
			div.style.transform = 'rotate(-90deg) translateY(' + (-Math.floor((width - height) / 2)) + 'px) translateX(' + (-Math.floor((width - height) / 2)) + 'px)';
			div.style.marginRight = (-Math.floor(width - height - 3)) + 'px';
			div.querySelector('label').style.cursor = 'ew-resize';
		} else {
			div.style.transform = '';
			div.style.marginRight = '';
			div.querySelector('label').style.cursor = '';
		}
	}

	function setStateFlags() {
		const state = getState();
		container.classList.toggle('rings-minmax', state.minmax);
		container.classList.toggle('rings-no-minmax', !state.minmax);
		container.classList.toggle('rings-no-level', !('level' in state));
		container.classList.toggle('rings-no-xp', !state.xp);
	}

	function updateTabState() {
		selectState.length = Object.values(floorData).length;
		for (const data of Object.values(floorData)) {
			const max = data.chests + (data.hasCandy ? -1 : 0);
			const mask = (2 ** max) - 1;
			selectState[data.index - 1] = selectState[data.index - 1] & mask;
		}
		gui.updateTabState(tab);
	}

	function refresh() {
		gui.updateTabState(tab);
		setStateFlags();
		let level = inputs.level ? inputs.level.value : 0;
		if (level < 1 || level > MAX_LEVEL) level = +gui.getGenerator().level;
		const rid = inputs.region ? +inputs.region.value : 0;
		for (const data of Object.values(floorData)) showLoot(level, data.mine.def_id, rid);
	}

	function getLootAvg(avg) {
		return avg >= 400 ? Math.floor(avg) : Math.floor(avg * 10) / 10;
	}

	function showLoot(otherLevel, lid, rid) {
		const state = getState();
		const isDMW = state.dmw ? state.dmw === 'yes' : !!swDoubleDrop;
		const doubleDrop = isDMW ? swDoubleDrop || { coeficient: 2 } : null;
		let parent = container.querySelector('#loot_' + lid);
		const data = floorData[lid];
		if (!parent || !data) return;
		const cardIndex = data.index;
		const chestState = toInt(selectState[cardIndex - 1]);
		const level = +gui.getGenerator().level;
		let htm = '';
		htm += Html.br`<table><thead><tr>`;
		if (kind == 'christmas') {
			htm += Html.br`<th><img src="/img/gui/chest.png"/></th>`;
			htm += Html.br`<th><button class="loot">${gui.getMessage('gui_loot')}</button></th>`;
			htm += Html.br`<th class="minmax"><img src="/img/gui/min.png" title="${gui.getMessage('gui_minimum')}"/></th>`;
			htm += Html.br`<th class="minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
			htm += Html.br`<th class="minmax"><img src="/img/gui/max.png" title="${gui.getMessage('gui_maximum')}"/></th>`;
			htm += Html.br`<th class="no-minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
			htm += Html.br`<th class="level">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(otherLevel) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
		} else {
			htm += Html.br`<th rowspan="2"><img src="/img/gui/chest.png"/></th>`;
			htm += Html.br`<th rowspan="2"><button class="loot">${gui.getMessage('gui_loot')}</button></th>`;
			htm += Html.br`<th colspan="3" class="minmax">${gui.getMessage('gui_level') + ' ' + Locale.formatNumber(level)}</th>`;
			htm += Html.br`<th rowspan="2" class="no-minmax">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(level) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
			htm += Html.br`<th rowspan="2" class="level">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(otherLevel) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
			htm += Html.br`</tr><tr>`;
			htm += Html.br`<th class="minmax"><img src="/img/gui/min.png" title="${gui.getMessage('gui_minimum')}"/></th>`;
			htm += Html.br`<th class="minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
			htm += Html.br`<th class="minmax"><img src="/img/gui/max.png" title="${gui.getMessage('gui_maximum')}"/></th>`;
		}
		htm += Html.br`</tr></thead>`;
		htm += Html.br`<tbody>`;
		let lastChest = 0;
		let odd = false;
		const tdAvg = Html`<td class="avg">`;
		const tdNotDependent = Html`<td class="avg dot" title="${gui.getMessage('rings_notdependent')}">`;
		const showXp = (exp) => {
			return exp ? Html`<div class="xp">${Locale.formatNumber(exp)} ${gui.getMessage('gui_xp')}</div>` : '';
		};
		let totalExp, totalExp2, countExp;
		totalExp = totalExp2 = countExp = 0;

		let last = null;
		let chest = 0;
		const loots = [];
		for (const lootArea of floorData[lid].loots.filter(lootArea => lootArea.region_id == rid || (lootArea.region_id || 0) == 0)) {
			if (last == null || last.tle != lootArea.tle) {
				last = lootArea;
				chest = chest + 1;
				lootArea.numRows = 1;
				delete lootArea.additional;
			} else {
				// Merge material
				const existing = loots.find(l => l.chest == chest && l.type == lootArea.type && l.object_id == lootArea.object_id);
				if (existing) {
					if (!existing.additional) existing.additional = [];
					existing.additional.push(lootArea);
					continue;
				}
				last.numRows++;
			}
			loots.push(lootArea);
		}
		floorData[lid].curLoots = loots;

		const calculateLoot = (lootArea, level) => {
			const loot = gui.calculateLoot(lootArea, level, doubleDrop);
			if (lootArea.additional) {
				for (const lootArea2 of lootArea.additional) {
					const loot2 = gui.calculateLoot(lootArea2, level, doubleDrop);
					loot.notRandom = loot.notRandom && loot2.notRandom;
					loot.coef = loot.coef || loot2.coef;
					loot.min += loot2.min;
					loot.max += loot2.max;
					loot.avg += loot2.avg;
				}
			}
			loot.avg = getLootAvg(loot.avg);
			return loot;
		};

		let checked = true;
		for (const lootArea of loots) {
			const type = lootArea.type;
			const oid = lootArea.object_id;
			const matXp = gui.getXp(type, oid);

			const loot = calculateLoot(lootArea, level);
			const loot2 = calculateLoot(lootArea, otherLevel);
			lootArea.exp = Math.floor(loot.avg * matXp);
			lootArea.exp2 = Math.floor(loot2.avg * matXp);

			if (lootArea.chest != lastChest) odd = !odd;
			htm += Html.br`<tr class="${(odd ? 'odd' : '') + (loot.notRandom ? ' not-random' : '')}">`;
			if (lootArea.chest != lastChest) {
				lastChest = lootArea.chest;
				let checkbox = '';
				if (kind == 'christmas' && lootArea.tle.startsWith('z')) {
					checkbox = Html`<input type="checkbox" class="xp" data-chest-id="${lootArea.chest}" checked disabled>`;
				} else if (kind == 'red' || kind == 'christmas') {
					checked = (chestState & (2 ** (lootArea.chest - 1))) > 0;
					checkbox = Html`<input type="checkbox" class="xp" data-chest-id="${lootArea.chest}"${checked ? ' checked' : ''} title="${gui.getMessage('gui_ctrlclick')}">`;
					if (checked) countExp++;
				} else if (kind == 'green') {
					countExp++;
				}
				htm += Html.br`<td class="chest" rowspan="${lootArea.numRows}">${checkbox}<span class="chest-id">${Locale.formatNumber(lootArea.chest)}</span></td>`;
			}

			lootArea.checked = checked;
			if (lootArea.checked || lootArea.tle.startsWith('z')) totalExp += lootArea.exp;
			if (lootArea.checked || lootArea.tle.startsWith('z')) totalExp2 += lootArea.exp2;

			htm += Html.br`<td class="material" style="background-image:url(${gui.getObjectImage(type, oid, true)})">${gui.getObjectName(type, oid)}</td>`;
			htm += Html.br`<td class="min">${loot.notRandom ? '' : Locale.formatNumber(loot.min)}</td>`;
			htm += Html.br`${loot.coef == 0 && kind != 'christmas' ? tdNotDependent : tdAvg}${Locale.formatNumber(loot.avg)}${showXp(lootArea.exp)}</td>`;
			htm += Html.br`<td class="max">${loot.notRandom ? '' : Locale.formatNumber(loot.max)}</td>`;
			htm += Html.br`<td class="level">${Locale.formatNumber(loot2.avg)}${showXp(lootArea.exp2)}</td>`;
			htm += Html.br`</tr>`;
		}
		htm += Html.br`</tbody>`;
		htm += Html.br`<tfoot class="xp"><tr class="not-random"><th colspan="2">${gui.getMessage('rings_averageperring')}</th><th class="min"></th>`;
		htm += Html.br`<th class="avg">${Locale.formatNumber(Math.floor(totalExp / countExp))}</th>`;
		htm += Html.br`<th class="max"></th><th class="level">${Locale.formatNumber(Math.floor(totalExp2 / countExp))}</th>`;
		htm += Html.br`</tfoot>`;
		htm += Html.br`</table>`;
		parent = parent.parentNode.querySelector('div');
		Html.set(parent, htm);
		for (const input of parent.querySelectorAll('input[type=checkbox].xp,button.loot')) {
			input.addEventListener('click', onChestClick);
		}
	}

	function showDetailedLoot(lid, isDMW) {
		const data = floorData[lid];
		const level = +gui.getGenerator().level;
		const chests = {};
		const lootAreas = data.curLoots.filter(lootArea => {
			if (lootArea.tle.startsWith('z')) return true;
			if (lootArea.checked) chests[lootArea.chest] = true;
			return lootArea.checked;
		});
		let rings = 0;
		if (tokenId) rings = gui.getGenerator().tokens[tokenId] || 0;
		if (kind == 'christmas') {
			const tokenId = christmasMines[lid];
			rings = gui.getGenerator().tokens[tokenId] || 0;
		}
		const numChests = Object.keys(chests).length;
		let max = Math.floor(rings / numChests);

		let totals, totalXp;
		const recomputeTotals = () => {
			const doubleDrop = isDMW ? swDoubleDrop || { coeficient: 2 } : null;
			totals = {};
			for (const lootArea of lootAreas) {
				const loot = gui.calculateLoot(lootArea, level, doubleDrop);
				const type = lootArea.type;
				const oid = lootArea.object_id;
				const key = type + '_' + oid;
				let total = totals[key];
				if (!total) totals[key] = total = { type, oid, avg: 0, xp: gui.getXp(type, oid) };
				total.avg += loot.avg;
			}
			totals = Object.values(totals);
			for (const total of totals) {
				total.avg = getLootAvg(total.avg);
				total.txp = Math.floor(total.avg * total.xp);
			}
			totals.sort((a, b) => b.txp - a.txp);
			let txp = +data.mine.reward_exp || 0;
			if (swPostcards) txp *= 10;
			totals.push({ type: 'system', oid: 1, txp, name: gui.getMessage('events_clearbonus').toUpperCase() });
			totalXp = 0;
			for (const total of totals) totalXp += total.txp;
		};

		const getTBody = () => {
			let htm = '';
			for (const total of totals) {
				htm += Html.br`<tr>`;
				htm += Html.br`<td class="material" style="background-image:url(${gui.getObjectImage(total.type, total.oid, true)})">${total.name ? total.name : gui.getObjectName(total.type, total.oid)}</td>`;
				htm += Html.br`<td class="avg">${Locale.formatNumber(total.avg)}</td>`;
				htm += Html.br`<td class="avg">${total.txp ? Locale.formatNumber(total.txp) : ''}</td>`;
				htm += Html.br`<td class="avg">${Locale.formatNumber(max * total.avg)}</td>`;
				htm += Html.br`<td class="avg">${total.txp ? Locale.formatNumber(max * total.txp) : ''}</td>`;
				htm += Html.br`</tr>`;
			}
			return htm;
		};

		let htm = '';
		if (inputs.dmw) {
			htm += Html`<label style="display:block;margin-bottom:8px;" for="r_dmw"><b>${gui.getMessage('specialweek_double_drop')}</b> <input id="r_dmw" name="dmw" type="checkbox" style="vertical-align:middle" ${isDMW ? 'checked' : ''} data-method="dmw"></label>`;
		}
		htm += Html.br`<table class="rings daf-table">`;
		htm += Html.br`<thead>`;
		htm += Html.br`<tr>`;
		htm += Html.br`<th colspan="5"><div class="title">${gui.getString(data.mine.name_loc)}</div>`;
		htm += Html.br`${gui.getMessage('gui_level')} ${Locale.formatNumber(level)} (${gui.getMessage('gui_average')})</th>`;
		htm += Html.br`</tr>`;
		htm += Html.br`<tr>`;
		htm += Html.br`<th rowspan="2">${gui.getMessage('gui_loot')}</th>`;
		htm += Html.br`<th colspan="2">1 &times; (${gui.getMessageAndValue('rings_rings', Locale.formatNumber(numChests))})</th>`;
		htm += Html.br`<th colspan="2"><input type="number" name="max" value="${Locale.formatNumber(max)}" data-method="max" style="width:60px" min="1" max="9999"> &times; (<span class="num-rings">${gui.getMessageAndValue('rings_rings', Locale.formatNumber(max * numChests))}</span>)</th>`;
		htm += Html.br`</tr>`;
		htm += Html.br`<tr>`;
		htm += Html.br`<th>${gui.getMessage('gui_qty')}</th>`;
		htm += Html.br`<th>${gui.getMessage('gui_xp')}</th>`;
		htm += Html.br`<th>${gui.getMessage('gui_qty')}</th>`;
		htm += Html.br`<th>${gui.getMessage('gui_xp')}</th>`;
		htm += Html.br`</tr>`;
		htm += Html.br`</thead>`;
		htm += Html.br`<tbody class="row-coloring loot-data">`;
		htm += Html.br`</tbody>`;
		htm += Html.br`<tfoot><tr><th>${gui.getMessage('events_total')}</td>`;
		htm += Html.br`<th colspan="2" class="avg total1"></td>`;
		htm += Html.br`<th colspan="2" class="avg total2"></td>`;
		htm += Html.br`</table>`;
		gui.dialog.show({ html: htm, style: [Dialog.CLOSE, Dialog.AUTORUN] }, (method, params) => {
			if (method === 'dmw' || method === 'max' || method == Dialog.AUTORUN) {
				isDMW = params.dmw == 'on';
				max = Math.max(1, Math.min(9999, params.max));
				if (max != params.max) gui.dialog.element.querySelector('[name=max]').value = max;
				recomputeTotals();
				const el = gui.dialog.element;
				Html.set(el.querySelector('.loot-data'), getTBody());
				Html.set(el.querySelector('.num-rings'), Html(gui.getMessageAndValue('rings_rings', Locale.formatNumber(max * numChests))));
				Html.set(el.querySelector('.total1'), Html(Locale.formatNumber(totalXp)));
				Html.set(el.querySelector('.total2'), Html(Locale.formatNumber(max * totalXp)));
				// showDetailedLoot(lid, params.dmw);
			}
		});
	}

	function onChestClick(event) {
		const input = event.target;
		const card = input.closest('.card');
		if (!card) return;
		const toggler = card.querySelector('input');
		const lid = toggler.id.substr(5);
		const data = floorData[lid];
		if (!data) return;
		if (input.classList.contains('loot')) {
			const state = getState();
			return showDetailedLoot(lid, state.dmw ? state.dmw === 'yes' : !!swDoubleDrop);
		}
		const checked = input.checked;
		const chestId = parseInt(input.getAttribute('data-chest-id'));
		for (const lootArea of data.curLoots) {
			if (lootArea.chest == chestId || event.ctrlKey) {
				lootArea.checked = checked;
				if (lootArea.chest != chestId && !lootArea.tle.startsWith('z')) {
					const other = card.querySelector(`[data-chest-id="${lootArea.chest}"]`);
					if (other) other.checked = checked;
				}
			}
		}
		let lastChest = 0;
		let totalExp, totalExp2, countExp;
		totalExp = totalExp2 = countExp = 0;
		let chestState = 0;
		for (const lootArea of data.curLoots) {
			if (lootArea.chest != lastChest) {
				lastChest = lootArea.chest;
				if (lootArea.checked) {
					if (!lootArea.tle.startsWith('z')) countExp++;
					chestState += (2 ** (lootArea.chest - 1));
				}
			}
			if (lootArea.checked || lootArea.tle.startsWith('z')) {
				totalExp += lootArea.exp;
				totalExp2 += lootArea.exp2;
			}
		}
		selectState[data.index - 1] = chestState;
		card.querySelector('tfoot th.avg').innerText = Locale.formatNumber(Math.floor(totalExp / countExp));
		card.querySelector('tfoot th.level').innerText = Locale.formatNumber(Math.floor(totalExp2 / countExp));
		updateTabState();
	}

	return {
		css: false, init, update, refresh, getState, setState, requires, events: {
			region: onInput,
			minmax: onInput,
			xp: onInput,
			dmw: refresh,
			level: onInput,
			showlevel: onInput
		}
	};
}