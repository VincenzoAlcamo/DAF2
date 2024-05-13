/*global gui Html Locale*/

let last_login;
let matCache = {};
let backpack = {};

function getRequirements(requirements) {
	return Array.isArray(requirements) ? requirements.map(req => {
		const result = {};
		result.material_id = +req.material_id;
		result.amount = +req.amount;
		result.stored = backpack[result.material_id] || 0;
		return result;
	}).sort((a, b) => a.material_id - b.material_id) : null;
}

function getItem({ type, object_id, amount, portal, limit, owned, requirements }) {
	const oid = +object_id;
	amount = +amount || 0;
	portal = +portal || 0;
	limit = +limit || 0;
	owned = owned === undefined ? undefined : (+owned || 0);
	let kind = type;
	let value = oid;
	let sort = 0;
	let caption;
	let title;
	const obj = (type == 'building' || type == 'material' || type == 'usable') ? gui.getObject(type, oid) : null;
	const item = { type, oid, amount, portal, owned, limit, obj, reqs: getRequirements(requirements) };
	// type can be: "system", "building", "decoration", "usable", "material", "token", "camp_skin"
	if (type == 'building' && obj) {
		const cap = +obj.max_stamina;
		const reg = +obj.stamina_reg;
		value = cap || reg;
		kind = cap ? 'capacity' : 'regen';
		sort = cap ? 2 : 1;
		title = cap ? gui.getString('GUI2921') : gui.getString('GUI2920');
		caption = Html`<span>${Locale.formatNumber(value)}</span> <img width="40" src="/img/gui/${cap ? 'camp_capacity' : 'camp_energy'}.png">`;
		item.width = +obj.columns;
		item.height = +obj.rows;
	} else if (type == 'material' && obj) {
		if (oid == 2) {
			kind = 'gem';
			sort = 0;
		} else {
			sort = 3;
			title = gui.getString('GUI0010');
		}
		value = amount;
	} else if (type == 'usable' && obj) {
		sort = 4;
		value = +obj.value;
		if (obj.action == 'speedup_ctrl') {
			caption = Html`<span class="with-time">${gui.getDuration(value)}</span>`;
			sort = 5;
		} else {
			caption = Html`<span class="with-energy">${Locale.formatNumber(value)}</span>`;
		}
		if (amount > 1) caption = Html`<span class="qty outlined">${Locale.formatNumber(amount) + ' \xd7 '}</span>${caption}`;
		title = gui.getString('GUI0008');
	} else if (type == 'token') {
		sort = 6;
	} else if (type == 'decoration') {
		sort = 7;
		caption = Html`<span class="with-deco">${Locale.formatNumber(amount)}</span>`;
	} else if (type == 'diggy_skin') {
		sort = 8;
		title = gui.getString('GUI3192');
	} else if (type == 'pet') {
		sort = 9;
		title = gui.getString('GUI4069');
	} else if (type == 'system') {
		sort = 10;
		kind = oid == 2 ? 'energy' : 'xp';
		caption = Html`<span class="with-${kind}">${Locale.formatNumber(amount)}</span>`;
	} else {
		return null;
	}
	if (amount == 1 && ['diggy_skin', 'decoration'].includes(type)) caption = '';
	else if (!caption) caption = Html`<span>${Locale.formatNumber(amount)}</span>`;
	// if (amount == 1 && ['diggy_skin', 'decoration'].contains(type)) caption = 'one';
	if (!title) title = gui.getObjectName(type, oid);
	return Object.assign(item, { kind, value, sort, caption, title });
}

function getMaterialImg(req) {
	const id = req.material_id;
	let result = matCache[id];
	if (!result) {
		result = {};
		result.url = gui.getObjectImage('material', id, true);
		const item = gui.getObject('material', id);
		const name_loc = item && item.name_loc;
		result.name = name_loc ? gui.getString(name_loc) : '#' + id;
		result.title = (item && item.desc ? '\n' + gui.getWrappedText(gui.getString(item.desc)) : '');
		matCache[id] = result;
	}
	const img = result.url ? Html`<img src="${result.url}">` : '';
	let title = result.name + ' (' + Locale.formatNumber(req.amount) + ' / ' + Locale.formatNumber(req.stored) + ')';
	const extra = gui.getObjectName('material', id, '-name+xp', req.amount);
	if (extra) title += '\n' + extra;
	title += result.title;
	return Html`<span class="material-img ${req.amount > req.stored ? 'locked' : ''}" title="${title}">${Locale.formatNumber(req.amount)}${img}</span>`;
}

function getHtml(item) {
	let htm = '';
	htm += Html.br`<div class="pack-item ${item.kind}" title="${Html(gui.getObjectName(item.type, item.oid, 'info+desc'))}">`;
	htm += Html.br`<div class="title"><span>${item.title.toUpperCase()}</span></div>`;
	htm += Html.br`<div class="image">${gui.getObjectImg(item.type, item.oid, 0, false, 'none')}</div>`;
	if (item.type == 'building') htm += Html.br`<div class="mask"><div class="equipment_mask" style="--w:${item.width};--h:${item.height}"></div></div>`;
	if (item.owned !== undefined) {
		let s = Locale.formatNumber(item.owned);
		if (item.limit) s += ' / ' + Locale.formatNumber(item.limit);
		htm += Html.br`<div class="limit outlined">${s}</div>`;
	} else {
		if (item.limit) htm += Html.br`<div class="limit outlined">${gui.getMessageAndValue('gui_maximum', Locale.formatNumber(item.limit))}</div>`;
	}
	if (item.portal) htm += Html.br`<div class="bonus"><span class="outlined-text">${gui.getString('GUI3065')}</span></div>`;
	htm += Html.br`<div class="caption"><div>${item.caption}</div></div>`;
	if (item.reqs) {
		htm += Html.br`<div class="cost">`;
		let first = true;
		for (const req of item.reqs) {
			if (!first) htm += `<br>`;
			first = false;
			htm += getMaterialImg(req);
		}
		htm += Html.br`</div>`;
	}
	htm += Html.br`</div>`;
	return Html.raw(htm);
}

function onUpdate() {
	const generator = gui.getGenerator();
	if (last_login != generator.last_login) {
		last_login = generator.last_login;
		matCache = {};
		backpack = generator.materials || {};
	}
}

const packHelper = { onUpdate, getRequirements, getItem, getHtml, getMaterialImg };

export default packHelper;