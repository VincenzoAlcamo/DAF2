/*global bgp gui Html Locale SmartTable*/

export default {
	init, update, getState, setState, visibilityChange,
	events: {
		input() {
			gui.updateTabState(tab);
			refresh();
		}
	},
	requires: [
		...[...gui.getRegionsArray(), 99].map(rid => 'locations_' + rid),
		'materials', 'tutorials', 'achievements', 'collections', 'levelups', 'map_filters', 'quests', 'artifacts', 'location_replaces'
	]
};

const REGION_SEPARATOR = '_';

let tab, container, inputs, progress, smartTable, show, levelSums, sliderLevel;
const imgCompleted = Html.br`<img width="24" src="/img/gui/tick.png"/>`;
let lastTimeMined = 0;
let mapFilters, mapTutorials;
let qtypes, cdn_root, versionParameter;

function init() {
	tab = this;
	({ container, inputs } = tab);

	container.querySelector('.progress_table tbody').addEventListener('click', onClickMain);

	progress = [{
		id: 'level',
		icon: '/img/gui/trophy.png',
		label: gui.getMessage('gui_level'),
		calc: calcLevel
	}, {
		id: 'achievements',
		icon: '/img/gui/medal.png',
		label: gui.getMessage('progress_achievements'),
		calc: calcAchievements
	}, {
		id: 'treasures',
		icon: '/img/gui/chest.png',
		label: gui.getMessage('progress_treasures'),
		calc: calcCollection
	}];
	for(const rid of [99, ...gui.getRegionsArray()]) if (+rid > 0) {
		const locations = gui.getFile('locations_' + rid);
		if (locations && Object.keys(locations).length >= 0) progress.push({
			id: 'region' + rid,
			rid: rid,
			icon: gui.getObjectImage('region', rid),
			iconError: 'region-error',
			label: gui.getObjectName('region', rid),
			calc: calcRegion
		});
	}

	smartTable = new SmartTable(container.querySelector('.progress_table'));
	smartTable.onSort = refresh;
	gui.setupScreenshot(smartTable.container, gui.getMessage('tab_progress'), container.querySelector('.screenshot'));
}

function getState() {
	return {
		hidecompleted: inputs.hidecompleted.checked,
		groups: inputs.grouplocations.checked,
		dates: inputs.showdates.checked,
		energy: inputs.showenergy.checked,
		show: show,
		sort: gui.getSortState(smartTable)
	};
}

function setState(state) {
	inputs.hidecompleted.checked = !!state.hidecompleted;
	inputs.grouplocations.checked = !!state.groups;
	inputs.showdates.checked = !!state.dates;
	inputs.showenergy.checked = !!state.energy;
	show = state.show;
	const showInfo = getShowInfo(show);
	if (!progress.find(item => item.id == showInfo.id)) show = '';
	gui.setSortState(state.sort, smartTable, 'index');
}

function update() {
	({ cdn_root, versionParameter } = gui.getGenerator());
	qtypes = getQuestTypes();

	mapFilters = {};
	for (const item of Object.values(gui.getFile('map_filters'))) {
		if (item.filter in mapFilters) continue;
		mapFilters[item.filter] = {
			name: item.name_loc,
			map: item.def_id,
			order_id: +item.order_id,
			ma: item.mobile_asset
		};
	}

	// A tutorial map must match the user tutorial
	const userTutorial = +gui.getGenerator().tutorial_def_id;
	mapTutorials = {};
	for (const lesson of Object.values(gui.getFile('tutorials'))) {
		const flag = userTutorial == +lesson.def_id;
		for (const lid of gui.getArrayOfInt(lesson.locations)) mapTutorials[lid] = flag;
	}

	const rid = +gui.getGenerator().region;
	lastTimeMined = bgp.Synchronize.lastTimeMined;
	for (const item of progress) {
		item.calc(item);
		item.percent = item.max > 0 ? item.value / item.max * 100 : 0;
		item.isCompleted = item.value == item.max;
		item.isLocked = +item.rid > 0 && +item.rid < 99 && +item.rid > rid;
		item.excluded = item.id == 'level' || item.rows.length == 0;
	}
	for (const element of container.querySelectorAll('.warning')) {
		element.innerText = gui.getMessage('gui_infodated', Locale.formatDateTime(gui.getGenerator().time));
	}
	refresh();
}

function getProgress({ id, value, max, energy }) {
	if (max == 0) {
		return Html.br`<td></td><td></td><td></td><td></td><td class="energy"></td><td></td>`;
	}
	let htm = '';
	const percent = max > 0 ? (value / max * 100) : 0;
	const isCompleted = value == max;
	htm += Html.br`<td>${id == 'level' ? '' : (isCompleted ? imgCompleted : Locale.formatNumber(percent, 2) + '%')}</td>`;
	htm += Html.br`<td>${Locale.formatNumber(value)}</td>`;
	htm += Html.br`<td>${Locale.formatNumber(max)}</td>`;
	htm += Html.br`<td>${Locale.formatNumber((max - value) || NaN)}</td>`;
	htm += Html.br`<td class="energy">${energy ? Locale.formatNumber(energy) : ''}</td>`;
	htm += Html.br`<td><progress value="${value}" max="${max}"></progress></td>`;
	return htm;
}

function getTimes(isCompleted, bt, et) {
	let htm = '';
	if (bt) {
		htm += Html.br`<td class="date">${Locale.formatDate(bt)}</td>`;
		htm += Html.br`<td class="date">${isCompleted && et ? Locale.formatDate(et) : ''}</td>`;
		htm += Html.br`<td class="date">${isCompleted && et ? gui.getDuration(et - bt, true) : ''}</td>`;
	} else {
		htm += Html.br`<td class="date" colspan="3"></td>`;
	}
	return htm;
}

function getTitle({ name, max, bonus, value, energy }, isLeaf) {
	const tileCost = max > 0 && bonus > 0 ? Math.round(bonus / max) : 0;
	const titles = [];
	if (name) titles.push(name);
	if (bonus) {
		titles.push(gui.getMessageAndValue('events_clearbonus', Locale.formatNumber(bonus / 10)));
		titles.push(gui.getMessageAndValue('gui_estimatedenergy', Locale.formatNumber(bonus)));
		titles.push(`[ ${gui.getMessage('gui_estimatedenergy')} = ${gui.getMessage('events_clearbonus')} \xd7 ${Locale.formatNumber(10)} ]`);
		titles.push(gui.getMessageAndValue('repeat_progress_total', Locale.formatNumber(max)));
	}
	if (tileCost) {
		titles.push(gui.getMessageAndValue('progress_averagetilecost', Locale.formatNumber(tileCost)));
		titles.push(`[ ${gui.getMessage('progress_averagetilecost')} = ${gui.getMessage('gui_estimatedenergy')} / ${gui.getMessage('repeat_progress_total')} ]`);
		const remaining = max - value;
		if (remaining > 0) {
			titles.push(gui.getMessageAndValue('map_remaining_tiles', Locale.formatNumber(remaining)));
			const remainingEnergy = `${gui.getMessage('progress_remaining')} (${gui.getMessage('gui_energy')})`;
			titles.push(`${remainingEnergy}: ${Locale.formatNumber(energy)}`);
			if (isLeaf) {
				titles.push(`[ ${remainingEnergy} = ${gui.getMessage('map_remaining_tiles')} \xd7 ${gui.getMessage('progress_averagetilecost')} ]`);
			}
		}
	}
	return titles.join('\n');
}

function refresh() {
	gui.updateTabState(tab);
	const state = getState();
	let total = 0;
	let count = 0;
	let htm = '';
	for (const item of progress) {
		if (!item.excluded) {
			total += item.percent;
			count++;
		}
		item.name = item.label;
		htm += Html.br`<tr data-level="0" data-id="${item.id}" class="${!item.isCompleted || !state.hidecompleted ? 'inspect' : ''}" title="${Html(getTitle(item))}">`;
		let img = Html.br`<img height="32" src="${item.icon}"${item.iconError ? Html`data-error="${item.iconError}"`: ''} class="on-error"/>`;
		if (item.isLocked) { img = Html.br`<span class="locked32" title="${gui.getMessage('gui_locked')}">${img}</span>`; }
		htm += Html.br`<td>${img}</td>`;
		htm += Html.br`<td>${item.label.toUpperCase()}</td>`;
		htm += getProgress(item);
		htm += getTimes(item.isCompleted, item.bt, item.et);
		htm += Html.br`</tr>`;
	}
	const parent = smartTable.table.querySelector('tbody');
	Html.set(parent, htm);
	gui.setErrorHandler(parent);
	container.classList.toggle('no-dates', !state.dates);
	container.classList.toggle('no-energy', !state.energy);

	const percent = count ? total / count : 0;
	Array.from(smartTable.container.querySelectorAll('tfoot td:nth-child(2)')).forEach(cell => cell.innerText = Locale.formatNumber(percent, 2) + '%');
	Array.from(smartTable.container.querySelectorAll('tfoot td progress')).forEach(progress => progress.value = percent);

	showDetail(show);

	smartTable.syncLater();
}

function refreshPlayTime() {
	const now = new Date();
	const started = new Date(+gui.getGenerator().registered_on * 1000);
	const playing = Math.floor((now - started) / 1000);
	container.querySelector('.progress_playtime').innerText = gui.getMessage('progress_playtime', Locale.formatDateTime(started), gui.getDuration(playing), Locale.formatDateTime(now));
}

function setInspected(row, inspected) {
	const level = +row.getAttribute('data-level');
	const parent = row.parentNode;
	row.classList.toggle('inspected', inspected);
	let nextRow = row.nextSibling;
	while (nextRow && +nextRow.getAttribute('data-level') > level) {
		const temp = nextRow;
		nextRow = nextRow.nextSibling;
		parent.removeChild(temp);
	}
	while (nextRow && +nextRow.getAttribute('data-level') == level) {
		nextRow.classList.toggle('not-inspected', inspected);
		nextRow = nextRow.nextSibling;
	}
	nextRow = row.previousSibling;
	while (nextRow && +nextRow.getAttribute('data-level') == level) {
		nextRow.classList.toggle('not-inspected', inspected);
		nextRow = nextRow.previousSibling;
	}
}

function getShowInfo(show) {
	show = show || '';
	let id = show;
	let subId = null;
	const i = show.indexOf(REGION_SEPARATOR);
	if (i > 0) {
		id = show.substr(0, i);
		subId = +show.substr(i + 1) || 0;
	}
	const item = progress.find(item => item.id === id);
	if (!item) return {};
	if (subId && (!item.rows || !item.rows.find(sub => sub.seq === subId))) subId = null;
	return {
		id: id,
		subId: subId,
		show: id + (subId ? REGION_SEPARATOR + subId : '')
	};
}

function onClickMain(event) {
	let row = null;
	for (let node = event.target; node && !row; node = node.parentNode) {
		if (node.tagName == 'TABLE') break;
		if (node.tagName == 'TR') row = node;
	}
	if (!row || !row.classList.contains('inspect')) return;

	const level = +row.getAttribute('data-level');
	const showInfo = getShowInfo(row.getAttribute('data-id') || '');
	if (!showInfo.show) return;
	const parent = row.parentNode;
	if (row.classList.contains('inspected')) {
		show = '';
		gui.updateTabState(tab);
		setInspected(row, false);
		smartTable.sync();
		return;
	}

	const otherRow = parent.querySelector('tr.inspected[data-level="' + level + '"]');
	if (otherRow) setInspected(otherRow, false);

	show = showInfo.show;
	gui.updateTabState(tab);
	showDetail(show);
	if (lastTimeMined < bgp.Synchronize.lastTimeMined) update();
}

function showDetail(show) {
	refreshPlayTime();
	const showInfo = getShowInfo(show);
	if (!showInfo.show) return;

	const item = progress.find(item => item.id == showInfo.id);
	let row = smartTable.table.querySelector('tr[data-id="' + showInfo.show + '"]');
	if (!row && showInfo.subId) {
		showDetail(showInfo.id);
		row = smartTable.table.querySelector('tr[data-id="' + showInfo.show + '"]');
	}
	if (!row || !row.classList.contains('inspect')) return;

	const level = +row.getAttribute('data-level');

	smartTable.syncLater();
	if (item.id == 'level') return infoLevel(row);
	if (!item.rows) return;

	setInspected(row, true);

	const nextRow = row.nextSibling;
	const parent = row.parentNode;
	const state = getState();
	const hideCompleted = state.hidecompleted;
	let isOdd = false;
	const group = {};
	initGroupTotals(group.grandtotal = {});
	const url = cdn_root + 'mobile/graphics/map/webgl_filters/';
	let rows = [];
	let sublist = [];
	let lastSub = null;
	const sort = gui.getSortFunction(null, smartTable, 'index');
	for (const sub of item.rows) {
		const { value, max } = sub;
		sub.goal = max || NaN;
		sub.attained = max ? value : NaN;
		sub.remaining = (max - value) || NaN;
		sub.progress = max > 0 ? (value / max * 100) : NaN;
		sub.energy = sub.energy || NaN;
		sub.bonus = sub.bonus || 0;
		sub.start = sub.bt || NaN;
		sub.end = sub.et || NaN;
		sub.duration = sub.end - sub.start;
		if (sub.gname && lastSub && sub.gname != lastSub.gname) {
			rows = rows.concat(sort(sublist));
			sublist = [];
		}
		sublist.push(sub);
		sub.index = sublist.length;
		lastSub = sub;
	}
	rows = rows.concat(sort(sublist));
	for (const sub of rows) {
		if (level == 1 && sub.seq != showInfo.subId) continue;
		const isCompleted = sub.value == sub.max;
		const visible = hideCompleted ? !isCompleted : true;

		if (sub.gname) {
			if (sub.gname != group.name) {
				updateGroup(group);
				group.row = null;
				group.name = sub.gname;
				group.url = url + sub.ma + '.png' + versionParameter;
				group.ma = sub.ma;
				if (level == 0) {
					group.row = Html.get(Html`<tr><td colspan="2">${gui.getString(sub.gname)}</td></tr>`)[0];
					group.row.setAttribute('height', 31);
					group.row.setAttribute('data-level', '1');
					if (state.groups) {
						group.row.setAttribute('data-id', item.id + REGION_SEPARATOR + sub.seq);
					} else group.row.classList.add('header');
					parent.insertBefore(group.row, nextRow);
				}
				initGroupTotals(group.total = {});
				initGroupTotals(group.subtotal = {});
			}
			addGroupTotal(group.total, sub);
			if (!visible || (level == 0 && state.groups)) continue;
			addGroupTotal(group.subtotal, sub);
			addGroupTotal(group.grandtotal, sub);
		}

		if (!visible) continue;
		if (!sub.row) {
			const info = sub.info ? Html`<div>${sub.info}</div>` : '';
			let htm = '';
			if (!sub.name) sub.name = gui.getString(sub.name_loc);
			htm += Html`<td>${sub.img}</td><td>${sub.name}${info}</td>` + getProgress(sub);
			htm += getTimes(isCompleted, sub.bt, sub.et);
			sub.row = Html.get('<tr>' + htm + '</tr>')[0];
			if (sub.id) sub.row.setAttribute('data-id', sub.id);
			sub.row.title = getTitle(sub, true);
			sub.row.setAttribute('data-level', level + (state.groups ? 1 : 2));
		}
		isOdd = !isOdd;
		sub.row.classList.toggle('odd', isOdd);
		parent.insertBefore(sub.row, nextRow);
	}
	updateGroup(group);
	if (group.row && !state.groups) updateGroupSubTotal(group, true);

	function initGroupTotals(total) {
		total.qty = total.value = total.max = total.bt = total.et = total.energy = total.bonus = 0;
	}

	function addGroupTotal(total, sub) {
		total.qty++;
		total.value += sub.value;
		total.max += sub.max;
		total.bonus += sub.bonus;
		if (sub.energy) total.energy = (total.energy || 0) + sub.energy;
		if (sub.bt && (sub.bt < total.bt || total.bt == 0)) total.bt = sub.bt;
		if (sub.et && sub.et > total.et) total.et = sub.et;
	}

	function updateGroup(group) {
		if (group.row) {
			const total = group.total;
			const isCompleted = total.value == total.max;
			let htm = '';
			htm += Html`<td class="filter ${group.ma == 'father' || group.ma == 'main' ? group.ma : ''}" style="background-image:url(${group.url})"></td><td>${gui.getString(group.name)}</td>` + getProgress(total);
			htm += getTimes(isCompleted, total.bt, total.et);
			const row = group.row;
			group.row = Html.get('<tr>' + htm + '</tr>')[0];
			group.row.setAttribute('data-level', row.getAttribute('data-level'));
			group.row.setAttribute('data-id', row.getAttribute('data-id'));
			total.name = group.name && gui.getString(group.name);
			group.row.title = getTitle(total);
			group.row.classList.toggle('inspect', (!state.hidecompleted || !isCompleted) && state.groups);
			row.replaceWith(group.row);
		}
		// Sub total
		if ((group.row && !state.groups) || (group.name && level == 1)) updateGroupSubTotal(group);
	}

	function updateGroupSubTotal(group, isGrandTotal) {
		const total = isGrandTotal ? group.grandtotal : group.subtotal;
		if (total.qty <= 0) return;
		const isCompleted = total.value == total.max;
		let htm = '';
		const caption = gui.getMessage(isGrandTotal ? 'progress_grandtotal' : 'progress_subtotal');
		htm += Html`<td></td><td>${caption} (${gui.getMessageAndValue('events_locations', Locale.formatNumber(total.qty))})</td>` + getProgress(total);
		htm += getTimes(isCompleted, total.bt, total.et);
		const row = Html.get('<tr>' + htm + '</tr>')[0];
		row.setAttribute('data-level', '2');
		row.classList.add(isGrandTotal ? 'grandtotal' : 'subtotal');
		row.title = getTitle(total);
		parent.insertBefore(row, nextRow);
	}
}

function calcLevel(item) {
	item.max = gui.getFile('levelups').length;
	item.value = +gui.getGenerator().level;
}

function infoLevel(row) {
	setInspected(row, true);

	if (!levelSums) {
		levelSums = [0];
		for (const levelup of gui.getFile('levelups')) {
			levelSums[levelup.def_id] = +levelup.xp;
		}
		for (let i = 1; i < levelSums.length; i++) levelSums[i] += levelSums[i - 1];
	}
	const maxLevel = levelSums.length - 1;

	const nextRow = row.nextSibling;
	const parent = row.parentNode;

	const level = +gui.getGenerator().level;
	const xp = +gui.getGenerator().exp;
	sliderLevel = sliderLevel || (level + 1);

	addRowLevel(1, levelSums.length);

	let rowLevel = addRowLevel(level, sliderLevel);

	let htm = '';
	htm += Html.br`<td colspan="6">`;
	htm += Html.br`<input type="range" step="1" value="${sliderLevel}" min="${level + 1}" max="${maxLevel}">`;
	htm += Html.br`<span class="slider-step slider-min">${Locale.formatNumber(level + 1)}</span>`;
	htm += Html.br`<span class="slider-step slider-val">${Locale.formatNumber(sliderLevel)}</span>`;
	htm += Html.br`<span class="slider-step slider-max">${Locale.formatNumber(maxLevel)}</span>`;
	htm += Html.br`</td>`;
	htm += Html.br`<td class="energy"></td><td></td>`;
	htm += getTimes(false, 0, 0);
	const rowSlider = Html.get('<tr class="slider" data-level="1">' + htm + '</tr>')[0];
	parent.insertBefore(rowSlider, nextRow);
	rowSlider.querySelector('input').addEventListener('input', function () {
		sliderLevel = this.value;
		Html.set(rowSlider.querySelector('.slider-val'), Html(Locale.formatNumber(sliderLevel)));
		const row = addRowLevel(level, sliderLevel);
		rowLevel.replaceWith(row);
		rowLevel = row;
	});

	function addRowLevel(levelFrom, levelTo) {
		const value = levelSums[level - 1] + xp - levelSums[levelFrom - 1];
		const max = levelSums[levelTo - 1] - levelSums[levelFrom - 1];
		let htm = '';
		htm += Html`<td><img src="/img/gui/xp.png" height="24"></td><td>${gui.getMessage('progress_levelrange', Locale.formatNumber(levelFrom), Locale.formatNumber(levelTo))}</td>` + getProgress({ value, max, energy: 0, bonus: 0 });
		htm += getTimes(false, 0, 0);
		const row = Html.get('<tr data-level="1">' + htm + '<tr>')[0];
		parent.insertBefore(row, nextRow);
		return row;
	}
}

function isValidItem(item) {
	return +item.hide == 0 && +item.event_id == 0 && item.name_loc;
}

const achievementImages = {
	'refresh_mine': 'repeat.png',
	'collection': 'chest.png',
	'friend_child': 'gc.png',
	'buy_building': 'equipment.png',
	'building': 'camp.png',
	'dig': 'dig.png',
	'debris': 'bomb.png',
	'gift': 'gift.png',
	'invite': 'friends.png',
	'caravan': 'caravan.png',
	'windmill': 'windmill.png',
	'decoration': 'deco.png'
};

function calcAchievements(item) {
	const achievements = gui.getFile('achievements');
	const achievs = gui.getGenerator().achievs;
	item.max = 0;
	item.value = 0;
	item.rows = [];
	for (const achievement of Object.values(achievements)) {
		if (isValidItem(achievement)) {
			const achiev = achievs[achievement.def_id];
			let total = 0;
			let max = 0;
			let val = 0;
			let next = 0;
			const userLevel = achiev ? +achiev.level : 1;
			const confirmedLevel = achiev ? +achiev.confirmed_level : 0;
			achievement.levels.forEach(level => {
				const amount = +level.amount;
				if (amount > 0) {
					total += amount;
					max++;
					const levelId = +level.level_id;
					if (levelId < userLevel || levelId <= confirmedLevel) {
						val += amount;
					} else if (levelId == userLevel) {
						const progress = achiev ? Math.min(amount, +achiev.progress) : 0;
						val += progress;
						next = amount - progress;
					}
				}
			});
			item.max += max;
			const value = userLevel - (next > 0 ? 1 : 0);
			item.value += value;
			let imgUrl = '/img/gui/blank.gif';
			let title = '';
			if (achievement.type == 'material') {
				imgUrl = gui.getObjectImage('material', achievement.object_id);
				title = gui.getObjectName('material', achievement.object_id);
			} else if (achievement.type == 'clear_mine') {
				imgUrl = gui.getObjectImage('region', achievement.object_id);
				title = gui.getObjectName('region', achievement.object_id);
			} else {
				let key = achievement.action + '_' + achievement.type;
				if (!(key in achievementImages)) key = achievement.type;
				if (key in achievementImages) imgUrl = '/img/gui/' + achievementImages[key];
			}
			title += (title ? '\n' : '') + gui.getString(achievement.desc);
			// imgUrl = `${gui.getGenerator().cdn_root}mobile/img/wallposts/achievements/achiev_${achiev.def_id}_${value}.png`;
			item.rows.push({
				img: Html`<img height="24" src="${imgUrl}" title="${title}">`,
				sort: (+achievement.region_id || 1) * 10 + value,
				name: gui.getString(achievement.name_loc) + ' [' + value + '/' + max + ']',
				info: val == total ? null : gui.getMessage('progress_achievementnextstep', next),
				value: val,
				max: total
			});
		}
	}
	item.rows.sort((a, b) => a.sort - b.sort);
}

function calcCollection(item) {
	item.max = item.value = 0;
	const collectedArtifacts = gui.getArrayOfInt(gui.getGenerator().artifacts);
	const rid = +gui.getGenerator().region;
	const collections = Object.values(gui.getFile('collections')).filter(isValidItem);
	const artifacts = gui.getFile('artifacts');
	const images = {};
	item.rows = [];
	const locationRegions = {};
	for (const rid of [...gui.getRegionsArray(), 99]) {
		const locations = gui.getFile('locations_' + rid);
		Object.keys(locations || {}).forEach(lid => locationRegions[lid] = rid);
	}
	for (const collection of collections) {
		const pieces = gui.getArrayOfInt(collection.pieces);
		const max = pieces.length;
		let region_id = +collection.region_id || 1;
		pieces.forEach(piece => {
			const artifact = artifacts[piece];
			const lid = artifact && +artifact.found_in;
			region_id = Math.max(region_id, locationRegions[lid] || 1);
		});
		const value = pieces.filter(piece => collectedArtifacts.includes(piece)).length;
		item.max += max;
		item.value += value;
		if (region_id <= rid) {
			item.rows.push({
				img: images[region_id] || (images[region_id] = gui.getRegionImg(region_id, false, 24)),
				name_loc: collection.name_loc,
				value: value,
				max: max
			});
		}
	}
}

function calcRegion(item) {
	item.max = item.value = item.crtd = item.cmpl = item.energy = item.bonus = 0;
	const locations = gui.getFile('locations_' + item.rid);
	const loc_prog = Object.assign({}, gui.getGenerator().loc_prog, bgp.Data.loc_prog);
	const getProg = (lid) => +loc_prog[lid]?.crtd || 0;
	const excluded = {};
	const checkPair = (oldId, newId) => {
		if (oldId in locations && newId in locations) {
			if (getProg(oldId) == 0) excluded[oldId] = 5;
			else if (getProg(newId) == 0) excluded[newId] = 5;
		}
	}
	Object.values(gui.getFile('location_replaces')).forEach((r) => +r.active && checkPair(r.location_id, r.replace_id));
	// Patch Egypt: Oasis (#43) and Dry Oasis (#2808) to have the same group_id
	if (item.rid == 1 && 43 in locations && 2808 in locations) locations[2808].group_id = locations[43].group_id;
	for (const mine of Object.values(locations)) {
		const lid = mine.def_id;
		if (lid in excluded) continue;
		const filter = mapFilters[mine.filter];
		if (!filter) {
			excluded[lid] = 1;
		} else if (!isMineValid(mine)) {
			excluded[lid] = 2;
		}
	}
	// Exclude some maps, if the progress is 0
	// Special cases
	// a) Emerald Nest (LONA203 / #1345) was a re-diggable location until December of 2015.
	// PF changed the format. It will NOT count towards the Hero of Egypt Achievement,
	// so we ignore it. In case the Mine ID changes, we will use the Name ID as the
	// identifier
	// b) Anpu's Arena (#1642) and Anpu's Racetrack (#1643) are not part of the
	// main game so skip as well (seem to have been a later addition?)
	// c) Deserted Tomb (#29)
	// d) Linda's Trap (#25), Stone Pit (#37)
	for (const lid of [25, 29, 37, 1345, 1642, 1643]) {
		if (getProg(lid) == 0) excluded[lid] = 4;
	}
	// Exclude maps
	// Small Oasis (406)
	for (const lid of [406]) {
		excluded[lid] = 4;
	}

	item.rows = [];
	item.bt = item.et = 0;
	for (const mine of Object.values(locations)) {
		const lid = +mine.def_id;
		if (!(lid in excluded)) {
			const filter = mapFilters[mine.filter];
			const isSide = (qtypes[lid] || mine.mobile_filter) == 'side';
			const mPrg = +mine.progress;
			let uPrg = 0;
			const done = loc_prog[lid];
			let bt = 0;
			let et = 0;
			if (done) {
				uPrg = +done.prog;
				bt = +done.crtd;
				et = +done.cmpl;
				if (!isSide) {
					// Kludge, if no created time, use the end time minus 1 second
					if (bt == 0 && et > 0) bt = (et - 1);
					if (bt < item.bt || item.bt == 0) item.bt = bt;
					if (et > item.et) item.et = et;
				}
			}
			uPrg = Math.min(mPrg, uPrg);
			const bonus = +mine.reward_exp * 10;
			const tileCost = mPrg > 0 ? Math.round(bonus / mPrg) : 0;
			const energy = mPrg > 0 ? (mPrg - uPrg) * tileCost : 0;
			item.max += mPrg;
			item.value += uPrg;
			item.energy += energy;
			item.bonus += bonus;

			let imgUrl;
			if (mine.def_id in mapTutorials) {
				imgUrl = 'tutorial.png';
			} else if (+mine.reset_cd > 0) {
				imgUrl = 'repeat.png';
			} else if (isSide) {
				imgUrl = 'q-side.png';
			} else {
				imgUrl = 'q-main.png';
			}

			item.rows.push({
				id: lid,
				img: Html`<img height="24" src="/img/gui/${imgUrl}">`,
				name_loc: mine.name_loc,
				// name: gui.getString(mine.name_loc) + ' (' + lid + ')',
				value: uPrg,
				max: mPrg,
				bonus,
				gname: filter.name,
				seq: filter.order_id,
				ma: filter.ma,
				group_id: mine.group_id,
				order_id: +mine.order_id,
				energy: energy,
				side: +isSide,
				bt,
				et
			});
		}
	}
	item.rows.sort((a, b) => {
		let result = (a.seq - b.seq) || (a.group_id - b.group_id) || (a.side - b.side);
		if (!result)  {
			if (a.order_id && b.order_id) result = a.order_id - b.order_id;
			if (!result) {
				const aProg = getProg(a.id), bProg = getProg(b.id);
				if (aProg && bProg) result = aProg - bProg;
				else if(aProg) result = -1;
				else if(bProg) result = 1;
			}
			if (!result) result = a.id - b.id;
		}
		return result;
	});
}

function visibilityChange(visible) {
	if (visible && lastTimeMined < bgp.Synchronize.lastTimeMined) update();
}

function isMineValid(mine) {
	// Test mine are excluded
	if (+mine.test || mine.filter == 'test' || mine.name_loc == 'TEST') return false;
	// Exclude repeatables
	if (+mine.reset_cd) return false;
	// Tutorial id must match player's tutorial
	if (mine.def_id in mapTutorials && !mapTutorials[mine.def_id]) return false;
	return true;
}

function getQuestTypes() {
	const qtypes = {};
	const toArray = a => a ? [].concat(a) : [];
	for (const quest of Object.values(gui.getFile('quests'))) {
		if (+quest.event_id) continue;
		const qtype = quest.quest_type;
		for (const step of toArray(quest.steps)) {
			for (const obj of toArray(step.objectives)) {
				const lid = +obj.location_id;
				if (lid > 1) {
					if (!(lid in qtypes)) qtypes[lid] = qtype;
					else if (qtypes[lid] != qtype) qtypes[lid] = null;
				}
			}
		}
	}
	return qtypes;
}
