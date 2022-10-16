/*global gui Locale SmartTable Html*/
export { ProductionHelper, TICKET_ID };
export default kitchenFoundry;

const TICKET_ID = 347;

class ProductionHelper {
	type = '';
	productionType = ''
	slotName = ''
	minNumSlots = 0;
	unlockName = '';
	dpWeeks = null;

	constructor(type) {
		this.type = type;
		switch (type) {
			case 'foundry':
				this.productionType = 'alloy';
				this.slotName = 'anvils';
				this.minNumSlots = 1;
				this.unlockName = 'alloys';
				break;
			case 'kitchen':
				this.productionType = 'recipe';
				this.slotName = 'pots';
				this.minNumSlots = 4;
				this.unlockName = 'pot_recipes';
				break;
			case 'caravan':
				this.productionType = 'destination';
				this.slotName = 'caravans';
				this.minNumSlots = 4;
				break;
		}
	}

	getSlots() {
		const slots = gui.getGenerator()[this.slotName];
		return Array.isArray(slots) ? slots : [];
	}

	getNormalizedSlots() {
		const slots = this.getSlots().map(slot => this.normalizeSlot(slot));
		slots.sort((a, b) => a.id - b.id);
		return slots;
	}

	normalizeSlot(slot) {
		let id, prodId, finish;
		switch (this.type) {
			case 'caravan':
				id = +slot.caravan_id;
				prodId = slot.dest_id;
				finish = slot.arrival;
				break;
			case 'kitchen':
				id = +slot.pot_id;
				prodId = slot.pot_recipe_id;
				finish = slot.finish;
				break;
			case 'foundry':
				id = +slot.anvil_id;
				prodId = slot.alloy_id;
				finish = slot.finish;
				break;
		}
		return { id, prodId, finish, cargo: slot.cargo }
	}

	getNumSlots() {
		return Math.max(this.minNumSlots, this.getSlots().length);
	}

	getUnlockedIds() {
		const arr = gui.getGenerator()[this.unlockName] || null;
		return (Array.isArray(arr) ? arr : []).map(id => +id);
	}

	getProductions() {
		const productions = gui.getFile('productions');
		return Object.values(productions).filter(item => item.type == this.productionType && +item.hide == 0);
	}

	getTicketHeader() {
		const img = gui.getObjectImg('material', TICKET_ID, 24, true);
		const qty = gui.getGenerator().materials[TICKET_ID] || 0;
		return Html.br`${img}${gui.getMessage('rings_stats', Locale.formatNumber(qty), gui.getObjectName('material', TICKET_ID))}`;
	}

	getSlotCargo(slot) {
		if (!this.dpWeeks) {
			const specialWeeks = gui.getSpecialWeeks();
			this.dpWeeks = specialWeeks.production || [];
		}
		slot = slot.id ? slot : this.normalizeSlot(slot);
		const production = slot.cargo ? gui.getFile('productions')[slot.prodId] : null;
		const cargo = production ? production.cargo[0] : null;
		if (!cargo) return null;
		const factor = this.dpWeeks.find(sw => sw.start <= start && sw.end > start) ? 2 : 1;
		return {
			min: factor * +cargo.min,
			max: factor * +cargo.max,
			type: cargo.type,
			object_id: +cargo.object_id,
			hasTicket: this.type == 'caravan' && production.requirements.find(req => +req.material_id == TICKET_ID),
			material_id: production.requirements.find(req => +req.material_id != TICKET_ID).material_id
		};
	}

	getSlotHtml(slot) {
		slot = slot.id ? slot : this.normalizeSlot(slot);
		const cargo = this.getSlotCargo(slot);

		let ready, img, imgTitle, title, outTitle, outImg, outValue, small;

		img = '/img/gui/' + this.type + '.png';
		imgTitle = title = outTitle = outImg = outValue = '';

		if (cargo) {
			ready = slot.finish <= gui.getUnixTime();
			if (cargo.min == cargo.max) outValue = Locale.formatNumber(cargo.min);
			else outValue = `${Locale.formatNumber(cargo.min)} - ${Locale.formatNumber(cargo.max)}`
			img = gui.getObjectImage(cargo.type, cargo.object_id);
			title = gui.getObjectName(cargo.type, cargo.object_id);
			if (cargo.hasTicket) {
				outImg = img;
				outTitle = title;
				img = gui.getObjectImage('material', cargo.material_id);
				imgTitle = `${gui.getObjectName('material', TICKET_ID)} + ${gui.getObjectName('material', cargo.material_id, 'info+desc')}`;
				title = `${gui.getObjectName('material', TICKET_ID)}\n+ ${gui.getObjectName('material', cargo.material_id)}`;
				small = outValue.length >= 9;
			} else {
				imgTitle = gui.getObjectName(cargo.type, cargo.object_id, 'info+xp+desc');
				outValue = '\xd7 ' + outValue;
			}
		}

		return Html`
<div class="production_slot${ready ? ' ready' : ''}" data-slot-id="${slot.id}">
	<div class="pic${cargo && cargo.hasTicket ? ' with-ticket' : ''}"><img loading="lazy" src="${img}"${imgTitle ? Html` title="${imgTitle}"` : ''}></div>
	<div>
		<div class="title">${Html.br`${title}`}</div>
		<div class="out${small ? ' small' : ''}"${outTitle ? Html` title="${outTitle}"` : ''}${outImg ? Html` style="background-image:url(${outImg})"` : ''}>${outValue}</div>
	</div>
</div>`;
	}

	updateCurrentProduction(container) {
		const parent = container && container.querySelector('.production_slots');
		if (!parent) return;
		const productions = this.getNormalizedSlots().map(slot => this.getSlotHtml(slot)).join('');
		Html.set(parent, productions);
	}
}

function kitchenFoundry(type) {
	const prodHelper = new ProductionHelper(type);

	let tab, container, inputs, productions, smartTable, oldState;
	let swDoubleProduction, swHalfTimeProduction;

	let hasQty, hasLevel, hasTicket, hasEnergy, hasUplift, hasXp, hasEvent;

	hasQty = hasLevel = hasTicket = hasEnergy = hasUplift = hasXp = false;
	switch (type) {
		case 'foundry':
			hasQty = hasLevel = hasUplift = hasXp = true;
			break;
		case 'kitchen':
			hasLevel = hasEnergy = hasEvent = true;
			break;
		case 'caravan':
			hasTicket = hasQty = hasUplift = hasXp = true;
			break;
	}

	function init() {
		tab = this;
		({ container, inputs } = tab);

		smartTable = new SmartTable(container.querySelector('.data'));
		smartTable.onSort = refresh;

		container.querySelector('.production_slots').addEventListener('render', function (_event) {
			prodHelper.updateCurrentProduction(container);
		});

		setState({});
	}

	function getState() {
		return {
			show: inputs.show.value,
			from: inputs.from.style.display == 'none' ? '' : inputs.from.value,
			region: inputs.region && (inputs.region.options.length ? inputs.region.value : inputs.region.getAttribute('data-value')),
			dpw: inputs.dpw.value,
			search: inputs.search.value,
			sort: gui.getSortState(smartTable, 'name', 'ingredient')
		};
	}

	function setState(state) {
		if (inputs.region) {
			if (inputs.region.options.length) state.region = gui.setSelectState(inputs.region, state.region || '');
			inputs.region.setAttribute('data-value', state.region);
		}
		inputs.search.value = state.search || '';
		inputs.show.value = state.show == 'possible' ? state.show : '';
		inputs.from.value = state.from == 'region' || state.from == 'event' ? state.from : '';
		state.dpw = gui.setSelectState(inputs.dpw, state.dpw);
		gui.setSortState(state.sort, smartTable, 'name', 'ingredient');
	}

	function update() {
		if (hasTicket) Html.set(container.querySelector('.stats'), prodHelper.getTicketHeader());
		const specialWeeks = gui.getSpecialWeeks();
		swDoubleProduction = specialWeeks.active.production;
		swHalfTimeProduction = specialWeeks.active.prod_time;
		const oldValue = inputs.dpw.value;
		const htm = `<option value="">(${gui.getMessage(swDoubleProduction ? 'dialog_yes' : 'dialog_no').toLowerCase()})</option>
<option value="yes">${gui.getMessage('dialog_yes')}</option><option value="no">${gui.getMessage('dialog_no')}</option>`;
		Html.set(inputs.dpw, htm);
		inputs.dpw.value = oldValue;
		gui.showSpecialWeeks(container, [swDoubleProduction, swHalfTimeProduction]);
		for (const el of Array.from(container.querySelectorAll('[data-sort-name="total_time"]'))) Html.set(el, Html.br(gui.getMessage(el.getAttribute('data-i18n-text'), prodHelper.getNumSlots())));
		productions = getProductions();
		inputs.from.style.display = productions.find(p => p.eid != 0) ? '' : 'none';
		if (inputs.region) {
			const state = getState();
			let htm = Html`<option value="">${gui.getMessage('gui_all')}</option>`;
			for (let rid = 1, maxRid = gui.getMaxRegion(); rid <= maxRid; rid++) htm += Html`<option value="${rid}">${gui.getObjectName('region', rid)}</option>`;
			Html.set(inputs.region, htm);
			setState(state);
		}
		oldState = {};
		updateCurrentProduction();
		refresh();
	}

	function updateCurrentProduction() {
		gui.setLazyRender(container.querySelector('.production_slots'));
	}

	function getProductions() {
		const generator = gui.getGenerator();
		const region = +generator.region;
		const level = +generator.level;
		const usables = gui.getFile('usables');
		const materials = gui.getFile('materials');
		const tokens = gui.getFile('tokens');
		const player_events = Object.assign({}, generator.events);
		const events = gui.getFile('events');
		const slots = prodHelper.getNumSlots();
		const unlocked = prodHelper.getUnlockedIds();

		let productions = prodHelper.getProductions();

		for (const item of productions) {
			const eid = +item.event_id;
			if (eid > 0 && unlocked.includes(+item.def_id)) player_events[eid] = true;
		}
		productions = productions.filter(item => {
			const eid = +item.event_id;
			if (eid == 0 || (eid > 0 && eid in player_events)) return true;
			return +item.unlocked == 1 || unlocked.includes(+item.def_id);
		});

		let result = [];
		for (const item of productions) {
			const cargo = item.cargo.find(item => item.type == 'system' || item.type == 'usable' || item.type == 'material' || (item.type == 'token' && tokens[item.object_id].name_loc != ''));
			if (!cargo) continue;
			let c = null;
			if (cargo.type == 'usable') c = usables[cargo.object_id];
			else if (cargo.type == 'material') c = materials[cargo.object_id];
			else if (cargo.type == 'token') c = tokens[cargo.object_id];
			else if (cargo.type == 'system') c = gui.getObject(cargo.type, cargo.object_id);
			if (!c || c.name_loc == '') continue;
			const p = {};
			p.id = item.def_id;
			p.level = Math.max(+item.req_level, 1);
			p.region = Math.max(+item.region_id, 1);
			p.cargo = cargo;
			p.name = p.gname = gui.getString(item.name_loc);
			// qty is not specified for usables, and it has equal min/max for other types
			// we just get the max, assuming that either it is equal to min or it is undefined
			p.min = +cargo.min || 1;
			p.max = +cargo.max || 1;
			p.qty1 = p.qty2 = Math.floor((p.min + p.max) / 2);
			// Tokens are not doubled (Jade/Obsidian key)
			if (cargo.type != 'token') p.qty2 *= 2;
			p.cname = (c && c.name_loc && gui.getString(c.name_loc)) || '';
			p.cimg = gui.getObjectImage(cargo.type, cargo.object_id, true);
			p.energy = (cargo.type == 'usable' && c && c.action == 'add_stamina' && +c.value) || NaN;
			p.eid = +item.event_id;
			p.locked = p.level > level || (p.eid == 0 && p.region > region);
			const event = p.eid ? events && events[p.eid] : null;
			p.ename = (event && gui.getString(event.name_loc)) || '';
			p.eimg = event && gui.getObjectImage('event', p.eid);
			p.time = +item.duration;
			if (swHalfTimeProduction) p.time *= swHalfTimeProduction.coeficient;
			p.ingredients = [];
			let numProd = 0;
			let maxProd = 0;
			p.xp_spent = 0;
			p.ticket = 0;
			for (const req of item.requirements) {
				const matId = req.material_id;
				const mat = materials[matId];
				const ingredient = {
					id: matId,
					img: mat && gui.getObjectImage('material', matId, true),
					dsc: gui.getObjectName('material', matId, hasXp ? 'xp+desc' : 'desc', +req.amount),
					required: +req.amount,
					available: generator.materials[matId] || 0,
					name: gui.getObjectName('material', matId)
				};
				ingredient.qty = Math.floor(ingredient.available / ingredient.required);
				maxProd = Math.max(maxProd, ingredient.qty);
				numProd = p.ingredients.length == 0 ? ingredient.qty : Math.min(numProd, ingredient.qty);
				p.xp_spent += ((ingredient.required * gui.getXp('material', ingredient.id)) || NaN);
				if (matId == TICKET_ID) {
					p.ticket = 1;
					continue;
				}
				p.ingredients.push(ingredient);
			}
			if (type == 'caravan') {
				if (p.ticket) {
					p.name = `${gui.getObjectName('material', TICKET_ID)}\n+ ${p.ingredients[0].name}`
					p.cimg = gui.getObjectImage('material', p.ingredients[0].id, true);
				}
				else p.name = p.cname + ' \xd7 ' + Locale.formatNumber(p.qty1);
				p.gname = `${cargo.object_id}${cargo.type}${+cargo.max}t${+item.duration}_` + item.requirements.map(r => `${r.material_id}x${+r.amount}`).join(',');
			}
			if (hasTicket) {
				const req = p.ingredients[0];
				p.required = req.required;
				p.ingredient = req.name;
				p.available = req.available;
			}
			p.xp = gui.getXp(p.cargo.type, p.cargo.object_id);
			p.uplift = p.uplift2 = NaN;
			if (p.xp_spent > 0 && p.xp > 0) {
				p.uplift = Math.floor((p.xp * p.qty1 - p.xp_spent) / (p.time / 3600));
				p.uplift2 = Math.floor((p.xp * p.qty2 - p.xp_spent) / (p.time / 3600));
			}
			p.numprod = numProd;
			p.total_time = p.time * Math.floor((numProd + slots - 1) / slots) || NaN;
			result.push(p);
		}

		// For each production, register the maximum region associated with that production's name
		const hash = {};
		result.sort((a, b) => a.region - b.region);
		for (const item of result) {
			if (item.eid > 0 && item.region > generator.events_region[item.eid]) continue;
			let r = hash[item.gname];
			if (!r || (item.region > r && item.region <= region)) r = item.region;
			hash[item.gname] = r;
		}
		if (type == 'caravan') {
			result.forEach(item => item.current = item.region == hash[item.gname]);
		} else {
			// Get only the max region for each distinct name
			result = result.filter(item => item.region == hash[item.gname]);
		}
		return result;
	}

	function recreateRowsIfNecessary() {
		const state = getState();
		const isDPW = state.dpw ? state.dpw === 'yes' : !!swDoubleProduction;
		function getIngredient(ingredient) {
			return Html.br`<td>${Locale.formatNumber(ingredient.required)}</td><td class="material" style="background-image:url(${ingredient.img})" title="${Html(ingredient.dsc)}">${ingredient.name}</td><td class="right">${Locale.formatNumber(ingredient.available)}</td>`;
		}
		for (const p of productions.filter(p => !p.rows)) {
			const rspan = p.ingredients.length;
			const title = hasQty ? p.cname : gui.getObjectName(p.cargo.type, p.cargo.object_id, 'info+xp+desc');
			let htm = '';
			let img = Html.br`<img src="${p.cimg}" loading="lazy" width="32" height="32" title="${Html(title)}"/>`;
			if (p.ticket) img = Html.br`<div class="with-ticket">${img}</div>`
			if (p.locked) { img = Html.br`<span class="locked32" title="${gui.getMessage('gui_locked')}">${img}</span>`; }
			htm += Html.br`<td rowspan="${rspan}">${img}</td>`;
			htm += Html.br`<td rowspan="${rspan}">${p.name}</td>`;
			htm += Html.br`<td rowspan="${rspan}">${gui.getRegionImg(p.region)}</td>`;
			if (hasEvent) {
				let eimage = '';
				if (p.eid != 0) {
					const wikiPage = ''; // wikiEvents[p.eid]
					eimage = Html.br`<img class="wiki" data-wiki-page="${wikiPage || 'Events'}" data-lazy="${p.eimg}" width="32" height="32" title="${Html(p.ename)}"/>`;
				}
				htm += Html.br`<td rowspan="${rspan}">${eimage}</td>`;
			}
			if (hasLevel) {
				htm += Html.br`<td rowspan="${rspan}">${Locale.formatNumber(p.level)}</td>`;
			}
			if (hasTicket) {
				htm += Html.br`<td rowspan="${rspan}"><img width="24" src="/img/gui/${p.ticket ? 'ticked' : 'unticked'}.png"></td>`;
			}
			htm += Html.br`<td rowspan="${rspan}">${gui.getDuration(p.time)}</td>`;
			if (hasQty) {
				const factor = isDPW ? 2 : 1;
				let qty;
				if (p.min == p.max) qty = Locale.formatNumber(p.qty);
				else qty = `${Locale.formatNumber(p.min * factor)} - ${Locale.formatNumber(p.max * factor)}`;
				const ctitle = gui.getObjectName(p.cargo.type, p.cargo.object_id, 'info+xp+desc', qty);
				htm += Html.br`<td class="material2" rowspan="${rspan}" style="background-image:url(${p.cimg})" title="${Html(ctitle)}">${qty}</td>`;
			}
			if (hasEnergy) {
				htm += Html.br`<td rowspan="${rspan}">${Locale.formatNumber(p.energy)}</td>`;
				htm += Html.br`<td rowspan="${rspan}">${Locale.formatNumber(p.energy_per_hour)}</td>`;
			}
			htm += getIngredient(p.ingredients[0]);
			htm += Html.br`<td rowspan="${rspan}">${Locale.formatNumber(p.output)}</td>`;
			if (hasEnergy) {
				htm += Html.br`<td rowspan="${rspan}">${Locale.formatNumber(p.total_energy)}</td>`;
			}
			if (hasXp) {
				htm += Html.br`<td rowspan="${rspan}">${Locale.formatNumber(p.total_xp)}</td>`;
			}
			htm += Html.br`<td rowspan="${rspan}">${gui.getDuration(p.total_time)}</td>`;
			if (hasUplift) {
				htm += Html.br`<td rowspan="${rspan}">${Locale.formatNumber(p.uplift)}</td>`;
				htm += Html.br`<td rowspan="${rspan}">${Locale.formatNumber(p.uplift2)}</td>`;
			}
			const row = Html.get('<tr>' + htm + '<tr>')[0];
			row.setAttribute('data-id', p.id);
			p.rows = [row];
			for (let i = 1; i < p.ingredients.length; i++) {
				const row = Html.get('<tr>' + getIngredient(p.ingredients[i]) + '</tr>')[0];
				row.classList.add('ingredient');
				p.rows.push(row);
			}
		}
	}

	function refresh() {
		let flagRecreate = false;
		let sort;

		gui.updateTabState(tab);
		const state = getState();
		state.search = (state.search || '').toUpperCase();
		const fnSearch = gui.getSearchFilter(state.search);

		const isDPW = state.dpw ? state.dpw === 'yes' : !!swDoubleProduction;
		smartTable.table.classList.toggle('dpw', isDPW);
		for (const p of productions) {
			const oldQty = p.qty;
			p.qty = isDPW ? p.qty2 : p.qty1;
			if (p.qty !== oldQty) delete p.rows;
			p.output = p.numprod * p.qty;
			p.total_energy = p.energy * p.output;
			p.energy_per_hour = p.time ? Math.round(p.energy * p.qty / p.time * 3600) : 0;
			p.total_xp = p.xp ? p.xp * p.output : NaN;
		}

		smartTable.showFixed(false);

		if (type == 'caravan') {
			const sort = gui.getSortFunction(null, smartTable, 'name');
			productions = sort(productions);
		} else {
			sort = gui.getSortInfoText(smartTable.sort);
			if (sort != oldState.sort) {
				oldState.sort = sort;
				const name = smartTable.sort.name;
				const sortFn = gui.getSortFunctionBySample(name == 'name' ? '' : 0, smartTable.sort.ascending);
				productions.sort((a, b) => sortFn(a[name], b[name]));
			}

			sort = gui.getSortInfoText(smartTable.sortSub);
			if (sort && sort != oldState.sortSub) {
				oldState.sortSub = sort;
				const name = smartTable.sortSub.name;
				productions.forEach(p => {
					p.ingredients.sort((a, b) => (name != 'ingredient' ? a[name] - b[name] : 0) || a.name.localeCompare(b.name));
					if (!smartTable.sortSub.ascending) p.ingredients.reverse();
				});
				flagRecreate = true;
			}
		}

		if (productions[0] && !productions[0].rows) flagRecreate = true;
		if (flagRecreate) for (const p of productions) delete p.rows;

		const rid = inputs.region ? +inputs.region.value : 0;
		function isVisible(p) {
			if (rid != 0 && p.region != rid) return false;
			if (rid == 0 && type == 'caravan' && !p.current) return false;
			if (state.show == 'possible' && (p.output == 0 || p.locked)) return false;
			if (state.from == 'region' && p.eid > 0) return false;
			if (state.from == 'event' && p.eid == 0) return false;
			if (fnSearch && !fnSearch((p.name + '\t' + p.ingredients.map(i => i.name).join('\t')).toUpperCase())) return false;
			return true;
		}

		let isOdd = false;
		const tbody = smartTable.tbody[0];
		Html.set(tbody, '');
		const total = productions.length;
		const items = productions.filter(isVisible);
		recreateRowsIfNecessary();
		for (const p of items) {
			isOdd = !isOdd;
			const toggleOdd = isOdd != p.rows[0].classList.contains('odd');
			for (const row of p.rows) {
				if (toggleOdd) row.classList.toggle('odd', isOdd);
				tbody.appendChild(row);
			}
		}
		gui.setErrorHandler(tbody);

		Array.from(container.querySelectorAll('tfoot td.totals')).forEach(cell => {
			cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(total));
		});

		gui.collectLazyElements(smartTable.container);
		smartTable.syncLater();

		if (type == 'kitchen') {
			let htm = '';
			htm += Html`<span class="outlined nowrap">${gui.getMessageAndValue('gui_energy', Locale.formatNumber(gui.getBackpackFood()))}</span> (${gui.getMessage('kitchen_food_in_backpack')})`;
			Html.set(container.querySelector('.stats'), htm);
		}
	}

	return {
		init, update, getState, setState,
		requires: ['materials', 'usables', 'tokens', 'productions', 'events', 'special_weeks', hasXp ? 'xp' : ''],
		actions: {
			'update_productions': updateCurrentProduction,
			'productions': updateCurrentProduction,
		},
		events: {
			search: refresh,
			show: refresh,
			from: refresh,
			dpw: refresh,
			region: refresh
		}
	};
}