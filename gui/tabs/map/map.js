/*global bgp gui Dialog Locale Html PackTiles*/
import ThemeEditor from '../../themeEditor.js';

export default {
	init,
	update,
	getState,
	setState,
	actions: { daf_mine_action: markToBeRendered },
	requires: [
		...[0, ...gui.getRegionsArray(), 99].map(rid => 'locations_' + rid),
		'addons', 'artifacts', 'backgrounds', 'draggables', 'npcs', 'childs', 'tiles', 'extensions', 'events',
		'usables', 'materials', 'tokens', 'photo_albums_photos', 'achievements', 'quests', 'map_filters',
		'tablets', 'location_replaces', 'pet_features'
	]
};

function asArray(t) {
	return t ? [].concat(t) : [];
}
function splitString(v, char) {
	return typeof v == 'number' ? ['' + v] : typeof v === 'string' && v !== '' ? v.split(char) : [];
}

function arrayToBase64(array) {
	return btoa(String.fromCharCode.apply(null, array));
}
function arrayFromBase64(text) {
	return Uint8Array.from(
		atob(text)
			.split('')
			.map((c) => c.charCodeAt(0))
	);
}
function applyViewed(tileDefs, viewed) {
	if (!viewed) return;
	try {
		const a = arrayFromBase64(viewed);
		const length = tileDefs.length;
		if (a.length * 8 < length) return;
		let v = 0;
		for (let index = 0, i = 0; index < length; index++) {
			if (index % 8 == 0) v = a[i++];
			if (v & 1) tileDefs[index].viewed = true;
			v >>= 1;
		}
	} catch (e) { }
}
function getViewed(tileDefs, setAllVisibility) {
	const length = Math.ceil(tileDefs.length / 8);
	const a = new Uint8Array(length);
	for (const tileDef of tileDefs.filter((t) => (setAllVisibility ? t.show : t.viewed))) {
		const index = tileDef.tileIndex;
		a[Math.floor(index / 8)] |= 1 << index % 8;
	}
	return arrayToBase64(a);
}

const getMapKey = (mine) => (mine ? JSON.stringify([mine.id, mine.level_id]) : '');
const findMine = (lid, fid) => {
	const mines = bgp.Data.mineCache[lid];
	if (!mines) return null;
	if (fid > 0) return mines[fid];
	let max = null;
	Object.values(mines).forEach((mine) => {
		if (!max || mine.time > max.time) max = mine;
	});
	return max;
};
const setLastViewedMine = (mine) => (bgp.Data.lastViewedMine = getMapKey(mine));
const getLastViewedMine = () => {
	try {
		const key = bgp.Data.lastViewedMine;
		const [lid, fid] = key ? JSON.parse(key) : [];
		return key ? findMine(lid, fid) : null;
	} catch (e) {
		return null;
	}
};

const getTileKey = (x, y) => `${x},${y}`;
const isTileMixable = (tileDef) => tileDef.isSpecial || tileDef.isQuest || tileDef.isGC;
const isKeyForDoor = (key) => key.startsWith('t_') || key.startsWith('n_') || key.startsWith('x_');

const TILE_SIZE = 62;
const IMG_DIGGY = '/img/gui/diggy.png';
const IMG_DEFAULT_GC = '/img/gui/default_gc.png';
const IMG_DEFAULT_NPC = '/img/gui/default_npc.png';
const IMG_SHADOWS = '/img/gui/shadows.png';
const IMG_BEAMS = '/img/gui/beams.png';
const IMG_LOGO = '/img/logo/logo.png';
const IMG_PUSH = '/img/gui/push.png';

const OPTION_COORDINATES = 'c';
const OPTION_GROUPLOCATIONS = 'g';
const OPTION_REGIONSELECTOR = 's';
const OPTION_FRIENDSHIPSELECTOR = 'f';
const OPTION_LOCATIONINFO = 'i';
const OPTION_REPEATABLES = 'r';
const OPTION_TITLE = 't';
const OPTION_BLANKS = 'b';
const OPTION_MARGIN = 'm';
const OPTION_LOGO = 'l';
const OPTION_ACHIEVEMENT = 'a';
const OPTION_FLOORINDICATORS = 'k';
const ALL_OPTIONS = [
	OPTION_GROUPLOCATIONS,
	OPTION_FLOORINDICATORS,
	OPTION_REGIONSELECTOR,
	OPTION_FRIENDSHIPSELECTOR,
	OPTION_LOCATIONINFO,
	OPTION_COORDINATES,
	OPTION_TITLE,
	OPTION_BLANKS,
	OPTION_MARGIN,
	OPTION_LOGO,
	OPTION_ACHIEVEMENT
];
const ALL_OPTIONS_AND_PREFERENCES = [...ALL_OPTIONS, OPTION_REPEATABLES];

let tab, container, map, table, canvas, zoom, titles;
let cdn_root, versionParameter, checks, tableTileInfo, imgLocation, selectRegion, selectFriendship;
const images = {};
let addons, backgrounds, draggables, npcs, childs, tiles, subtiles;
let specialDrops, allQuestDrops, allQuestDropsFlags, mapFilters, allEventMaterials, allEventTokens;
let playerLevel, playerUidRnd, effects, beamsLoaded;
let currentData, lastTeleportId;
let showBackground, showBeacon, showTeleportArrow, showDiggy, showExitMarker, showTeleportMarker;
let showDebug, showAll, showFull, showTiles;
let showViewed, showBonus, showNotableLoot, showMixed, showOpaque, showUncleared, showSolution, showColors;
const options = {};
let isAdmin, canShowBonus, canShowBeacon, lastMapId, waitHandler;
let resize, listMaterial;
let unclearTilesToMix = {};
let isEditMode = false, hasPendingEdits = false;
const theme = new ThemeEditor();

const forbiddenLoot = {
	// KOI FISH
	'token_12273': 1,
	'token_12274': 1,
	'token_12275': 1,
	'token_12276': 1,
	// DEBRIS
	'token_12288': 1,
};

//#region QUEUE
const queue = {
	enabled: false,
	enable() {
		this.enabled = true;
		setTimeout(() => this.process(), 0);
	},
	list: [],
	add(fn) {
		this.list.push(fn);
		if (this.enabled) setTimeout(() => this.process(), 0);
	},
	async process() {
		if (!this.list.length || this.isProcessing) return;
		try {
			this.isProcessing = true;
			const promise = this.list.shift();
			if (promise) await promise();
		} catch (e) {
			console.error(e);
			clearWaitHandler();
			this.list = [];
			gui.dialog.show({ text: gui.getMessage('friendship_collecterror'), style: [Dialog.CRITICAL, Dialog.OK] });
		} finally {
			this.isProcessing = false;
		}
		this.process();
	}
};
//#endregion

//#region THEME
function getThemeDefaults() {
	const INT = ThemeEditor.Int;
	const COL = ThemeEditor.Color;
	const CSS = { css: true };
	const CONTRAST = { contrast: 'fg' };
	const DOOR = (prefix, width, color, roundness, borderWidth, borderColor, textColor) => {
		return {
			[prefix + '.width']: INT(width, 20, TILE_SIZE / 2),
			[prefix + '.color']: COL(color),
			[prefix + '.roundness']: INT(roundness, 0, 100),
			[prefix + '.border.width']: INT(borderWidth, 0, 8),
			[prefix + '.border.color']: COL(borderColor),
			[prefix + '.text.color']: COL(textColor)
		};
	};
	const ARROW = (prefix, width, color, borderWidth, borderColor) => {
		return {
			[prefix + '.width']: INT(width, 1, 5),
			[prefix + '.color']: COL(color),
			[prefix + '.border.width']: INT(borderWidth, 0, 2),
			[prefix + '.border.color']: COL(borderColor)
		};
	};
	const defaults = Object.assign(
		{},
		{
			'solution.color': COL('#0F0', { admin: true }),
			'title.color': COL('#FFF'),
			'marker.arrow': COL('#FF0', CSS),
			'marker.special': COL('#FF0', CSS, CONTRAST),
			'marker.quest': COL('#F0F', CSS, CONTRAST),
			'marker.photo': COL('#0DF', CSS, CONTRAST),
			'marker.material': COL('#0F0', CSS, CONTRAST),
			'marker.tile': COL('#CCC', CSS),
			'marker.pet': COL('#FA0', CSS, CONTRAST)
		},
		DOOR('door', 26, '#FFF', 20, 4, '#F00', '#000'),
		DOOR('doornt', 26, '#F00', 20, 4, '#F00', '#FFF'),
		DOOR('entrance', 26, '#090', 20, 4, '#0F0', '#FFF'),
		DOOR('teleport', 26, '#FFF', 20, 4, '#F00', '#000'),
		ARROW('arrow', 3, '#F8C', 1, '#400'),
		ARROW('arrow2', 3, '#F00', 1, '#440')
	);
	[
		'#000', '#F00', '#0F0', '#FF0', '#00F', '#F0F', '#0FF', '#FFF', '#FA0', '#AAF',
		'#000', '#800', '#080', '#880', '#008', '#808', '#088', '#888', '#850', '#558'
	].forEach((col, i) => (defaults['marker.color.' + i] = COL(col, CSS)));
	return defaults;
}

function setMapTheme(obj) {
	theme.applySettings(obj);
	const newValue = JSON.stringify(theme.settings);
	if (newValue != gui.getPreference('mapSettings')) {
		gui.setPreference('mapSettings', newValue);
		queue.add(processMine);
	}
}
//#endregion

const lightColors = [
	gui.getMessage('map_unknown'),
	gui.getMessage('map_yellow'),
	gui.getMessage('map_red'),
	gui.getMessage('map_blue'),
	gui.getMessage('map_green')
];
const getLightColorName = (id) => lightColors[id] || lightColors[0];

const orientations = [
	gui.getMessage('map_unknown'),
	gui.getMessage('map_right'),
	gui.getMessage('map_down'),
	gui.getMessage('map_left'),
	gui.getMessage('map_up')
];
const getOrientationName = (status) => orientations[status] || orientations[0];
const reqOrientations = { right: 1, down: 2, left: 3, up: 4 };
const getReqOrientationName = (value) => getOrientationName(reqOrientations[value]);

function getLocation(lid) {
	for (const rid of [0, ...gui.getRegionsArray(), 99]) {
		const locations = gui.getFile('locations_' + rid);
		if (lid in locations) return locations[lid];
	}
}

function isLocationTower(lid, location) {
	location = location || getLocation(lid);
	return location ? +location.tower_id > 0 : false;
}

function getTowerEventName() {
	return gui.getString('GUI3719');
}

function getLocationName(lid, location) {
	location = location || getLocation(lid);
	if (isLocationTower(lid, location)) {
		const num = Locale.formatNumber(+location.tower_floor);
		const name = gui.getString('GUI3734');
		return name.indexOf('XXX') >= 0 ? name.replace('XXX', num) : gui.getMessageAndValue('map_floor', num);
	}
	const name = location && location.name_loc;
	const text = name && gui.getString(name).replace(/\s+/g, ' ');
	return (!text || text.startsWith('#')) ? '#' + lid : text;
}

function hasOption(id) {
	if (id == OPTION_REPEATABLES) {
		options[id] = bgp.Preferences.getValue('mapShowRepeatables');
	}
	return !!options[id];
}
function setOption(id, flag) {
	flag = !!flag;
	if (id == OPTION_REPEATABLES && flag != bgp.Preferences.getValue('mapShowRepeatables'))
		bgp.Preferences.setValue('mapShowRepeatables', flag);
	options[id] = flag;
}

function init() {
	tab = this;
	container = tab.container;
	isAdmin = bgp.Data.isMapper;

	tableTileInfo = container.querySelector('.tile-info table');

	const parseJSON = (value) => {
		try {
			return value ? JSON.parse(value) : null;
		} catch (e) {
			return null;
		}
	};
	theme.init({
		defaults: getThemeDefaults(),
		settings: parseJSON(gui.getPreference('mapSettings')),
		replacements: { doornt : 'door not taken'},
		cssPrefix: 'map-',
		isAdmin: isAdmin,
		table: container.querySelector('.properties .table'),
		tableCallback: setMapTheme,
		tableDelay: 1000
	});
	theme.createSettingsTable();

	const slider = container.querySelector('.scrollable-content');
	map = slider.querySelector('.map');
	canvas = slider.querySelector('canvas');
	table = slider.querySelector('table');
	canvas.width = 1;
	canvas.height = 1;
	zoom = 5;

	let isDragging = false;
	let wasDragged = false;
	let startX, startY, scrollLeft, scrollTop;

	const startDrag = () => {
		isDragging = true;
		wasDragged = false;
	};
	const endDrag = () => {
		isDragging = false;
		slider.classList.remove('dragging');
	};

	slider.addEventListener('mousedown', (e) => {
		if (e.button != 0) return;
		if (slider.scrollWidth <= slider.clientWidth && slider.scrollHeight <= slider.clientHeight) return;
		startX = e.pageX - slider.offsetLeft;
		startY = e.pageY - slider.offsetTop;
		scrollLeft = slider.scrollLeft;
		scrollTop = slider.scrollTop;
		startDrag();
	});
	slider.addEventListener('mouseleave', () => {
		endDrag();
	});
	slider.addEventListener('mouseup', () => {
		endDrag();
	});
	slider.addEventListener('mousemove', (e) => {
		if (!isDragging) {
			wasDragged = false;
			onTableMouseMove(e);
			return;
		}
		e.preventDefault();
		const x = e.pageX - slider.offsetLeft;
		const y = e.pageY - slider.offsetTop;
		const dx = x - startX;
		const dy = y - startY;
		if (dx != 0 && dy != 0) {
			slider.scrollLeft = scrollLeft - dx;
			slider.scrollTop = scrollTop - dy;
			if (!wasDragged) {
				wasDragged = true;
				slider.classList.add('dragging');
			}
		}
	});
	slider.addEventListener('click', (e) => {
		if (wasDragged) {
			e.preventDefault();
			e.stopPropagation();
			wasDragged = false;
		} else {
			onTableClick(e);
		}
	});
	slider.addEventListener('wheel', (e) => {
		e.preventDefault();
		zoom -= Math.sign(e.deltaY);
		zoom = Math.min(Math.max(1, zoom), 10);
		gui.updateTabState(tab);
		setCanvasZoom();
	});
	setCanvasZoom();

	selectRegion = container.querySelector('[name=region]');
	selectRegion.addEventListener('change', () => queue.add(processMine));

	selectFriendship = container.querySelector('[name=friendship]');
	selectFriendship.addEventListener('change', () => queue.add(processMine));

	checks = Array.from(container.querySelectorAll('.toolbar input[type=checkbox][data-flags]'));
	checks.forEach((el) => {
		if (el.previousSibling && el.previousSibling.nodeType == Node.TEXT_NODE) el.previousSibling.remove();
		const flags = el.getAttribute('data-flags').split(',');
		el.title = flags
			.map((flag) => {
				if (!isFlagAllowed(flag)) return '';
				const text = gui.getMessage('map_button_' + flag.toLowerCase());
				return text && `${flag} = ${text}`;
			})
			.filter((v) => v)
			.join('\n');
		el.addEventListener('click', onStateButtonClick);
	});

	container.querySelector('[data-id="lid"]').addEventListener('change', (e) => {
		const mine = findMine(+e.target.value, -1);
		if (mine) {
			queue.add(async () => await processMine(mine));
		}
	});

	for (const button of container.querySelectorAll('.toolbar button[data-action]'))
		button.addEventListener('click', onClickButton);

	imgLocation = container.querySelector('.toolbar img.location');
	imgLocation.addEventListener('load', () => (imgLocation.style.display = ''));
	imgLocation.addEventListener('error', () => (imgLocation.style.display = 'none'));

	container.querySelector('.toolbar .warning').classList.toggle('hidden', !!determineCurrentMine());
	container.addEventListener('render', () => queue.add(processMine));

	container.addEventListener('tooltip', onTooltip);

	document.body.addEventListener('keydown', onKeydown);

	container.querySelector('.toolbar button[data-action="edit"]').title = `I = toggle edit mode
U = toggle Uncleared mode

Highlight a tile and press:
0-9 = set tile outline color 0-9
O = toggle the outline style (solid, corners, dots)
M = toggle mix for tile

Highlight a teleport tile and press:
ALT 0-9 = set teleport arrow color 0-9

When selecting a color use SHIFT for colors 10-19
0 will remove the color

CTRL click a door/teleport tile to rename it
`
}

function setStateButton(input, state = 0) {
	const flags = (input.getAttribute('data-flags') || '').split(',');
	state = Math.max(0, Math.min(state, flags.length));
	const flag = state ? flags[state - 1] : '';
	input.setAttribute('data-flag', flag);
	input.checked = state > 0;
	const caption = flags[state ? state - 1 : 0];
	const replacement = { 1: '¹', 2: '²', 3: '³' };
	input.setAttribute('data-flag-caption', caption.replace(/[123]/, (c) => replacement[c]));
	return flag;
}
function getStateButtonFlag(input) {
	const flag = input.getAttribute('data-flag') || '';
	return input.checked && isFlagAllowed(flag) ? flag : '';
}
function activateStateButton(input, state = 1) {
	const prevFlag = input.getAttribute('data-flag') || '';
	const flag = setStateButton(input, state) || prevFlag;
	updateTableFlags();
	if ('UK'.includes(flag)) queue.add(processMine);
	else if ('LBEO'.includes(flag)) return;
	else if (flag == 'G') resetCellTitles();
	else queue.add(drawMine);
}

function onStateButtonClick(e) {
	const input = e.target;
	const flags = (',' + input.getAttribute('data-flags')).split(',');
	const flag = input.getAttribute('data-flag') || '';
	let state = flags.indexOf(flag) + 1;
	while (state < flags.length && !isFlagAllowed(flags[state])) state++;
	if (state >= flags.length) state = 0;
	activateStateButton(input, state);
}

const isValidEvent = () => gui.isValidEventForTab('map', true);
function onKeydown(event) {
	if (!isValidEvent()) return;
	const key = event.key.toUpperCase();
	const hasModifiers = event.ctrlKey || event.altKey || event.shiftKey;
	if (key == 'I' && !hasModifiers && isAdmin) {
		toggleEditMode();
		event.preventDefault();
		return;
	}
	const isUncleared = container.classList.contains('is_uncleared');
	const td = isEditMode && container.querySelector('.map td:hover');
	if (td) {
		const mine = currentData.mine, x = td.cellIndex, y = td.parentNode.rowIndex;
		const tileDef = currentData.tileDefs[y * mine.columns + x];
		const isMixed = !isUncleared && td.hasAttribute('data-mix');
		event.preventDefault();
		const getEdit = () => {
			const eName = isUncleared || isMixed ? 'ue' : 'e', eKey = getTileKey(x, y);
			const edits = mine._p[eName];
			return (edits && edits[eKey]) || {};
		};
		const storeEdit = (edit) => {
			const eName = isUncleared || isMixed ? 'ue' : 'e', eKey = getTileKey(x, y);
			let edits = mine._p[eName];
			if (Object.keys(edit).length == 0) {
				// Delete
				if (!edits || !(eKey in edits)) return;
				delete edits[eKey];
			} else {
				if (!edits) edits = mine._p[eName] = {};
				edits[eKey] = edit;
			}
			hasPendingEdits = true;
			unclearTilesToMix = {};
			bgp.Data.saveMine(mine);
		};
		let isDigit = key >= '0' && key <= '9';
		let col = isDigit ? +key : 0;
		if (event.code.startsWith('Digit')) {
			const c = event.code.charAt(5);
			if (c >= '0' && c <= '9' && event.shiftKey && !event.ctrlKey) {
				isDigit = true;
				col = c == '0' ? 0 : +c + 10;
			}
		}
		if (isDigit) {
			if (event.altKey) {
				const teleport = currentData.teleports[tileDef.teleportId];
				if (!teleport) return;
				const target = currentData.teleports[teleport.target_teleport_id];
				const isBidi = target && target.target_teleport_id == teleport.teleport_id;
				const eKey = 'tc_' + teleport.teleport_id;
				const eKey2 = isBidi ? 'tc_' + teleport.target_teleport_id : null;
				const td2 = isBidi ? table.rows[target.row].cells[target.column] : null;
				const edits = mine._p.e;
				let edit = edits && edits[eKey];
				if (edit == col || (col == 0 && edit > 0)) {
					delete edits[eKey];
					if (eKey2) delete edits[eKey2];
					edit = null;
				} else {
					edit = edits[eKey] = col;
					if (eKey2) edits[eKey2] = col;
				}
				td.setAttribute('data-tcol', edit);
				if (td2) td2.setAttribute('data-tcol', edit);
				hasPendingEdits = true;
				unclearTilesToMix = {};
				bgp.Data.saveMine(mine);
				return;
			} else {
				const edit = getEdit();
				// If '0', set the edit with '0' to remove any pre-defined markings
				if (edit.c == col || (col == 0 && edit.c > 0)) delete edit.c;
				else edit.c = col;
				td.setAttribute('data-col', edit.c);
				storeEdit(edit);
				return;
			}
		}
		if (key == 'O') {
			const edit = getEdit();
			if (edit.c) {
				const o = ((edit.o || 0) + 1) % 3;
				if (o) edit.o = o; else delete edit.o;
				storeEdit(edit);
				return;
			}
		}
		if (key == 'M') {
			if (isUncleared) {
				const edit = getEdit();
				const isMixable = isTileMixable(tileDef);
				const m = isMixable ? 0 : 1;
				if (edit.m === m) delete edit.m;
				else edit.m = m;
				if (!isMixable && edit.m !== 1) td.removeAttribute('data-mix');
				else td.setAttribute('data-mix', edit.m === 0 ? 0 : 1);
				return storeEdit(edit);
			} else if (td.hasAttribute('data-mix')) {
				const edit = getEdit();
				if (edit.m) delete edit.m;
				else edit.m = 1;
				td.setAttribute('data-mix', edit.m === 1 ? 1 : 0);
				storeEdit(edit);
				return;
			}
		}
		if (key != 'U') return;
	}
	if (!hasModifiers) {
		const input = checks.find((el) => el.getAttribute('data-flags').split(',').find((v) => v.startsWith(key) && isFlagAllowed(v)));
		if (input) {
			const arr = (',' + input.getAttribute('data-flags')).split(',');
			const flag = getStateButtonFlag(input);
			let state = arr.indexOf(flag) + 1;
			while (state < arr.length && (!isFlagAllowed(arr[state]) || !arr[state].startsWith(key))) state++;
			if (state >= arr.length) state = 0;
			activateStateButton(input, state);
			event.preventDefault();
		}
		if (key >= '0' && key <= '9') {
			const fid = key == '0' ? '10' : key;
			const input = Array.from(container.querySelectorAll('.toolbar input[type="radio"][data-flag]')).find(
				(el) => el.getAttribute('data-flag') == fid
			);
			if (input && !input.disabled) {
				event.preventDefault();
				input.click();
			}
		}
	}
}

function addQuestDrop(lid, type, id, value) {
	let h = allQuestDrops[lid];
	if (!h) h = allQuestDrops[lid] = {};
	const key = type + '_' + id;
	if (!(key in h)) h[key] = value;
}

function deleteWormsFrom(map) {
	delete map['token_168']; // WORM
	delete map['token_1461']; // WORM FOR EELS
	delete map['token_4122']; // LEECH
}

function isFlagAllowed(flag) {
	return 'CDNTUVX'.indexOf(flag) >= 0 || isAdmin;
}

function scrollToCenter(x, y, smooth) {
	table.rows[y].cells[x].scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center', inline: 'center' });
}

function getDownloadPath(lid, location) {
	if (!lid) {
		lid = currentData.lid;
		location = currentData.location;
	} else {
		location = location || getLocation(lid);
	}
	const rid = location ? +location.region_id : currentData.rid;
	const eid = location ? +location.event_id : currentData.eid;
	const isTower = isLocationTower(lid, location);
	const isEvent = eid > 0 || rid == 0 || isTower;
	let path = gui.getPreference(isEvent ? 'mapDownloadEvent' : 'mapDownloadRegion');
	path = path.replace(/\$[a-z]+/g, function (v) {
		const t = v.toLowerCase();
		if (t == '$event' && isEvent) v = isTower ? getTowerEventName() : gui.getObjectName('event', eid);
		else if (t == '$region' && !isEvent) v = gui.getObjectName('region', rid);
		else if (t == '$god' && !isEvent) {
			const filter = location && mapFilters[location.filter];
			if (filter) v = filter;
		} else if (t == '$location') v = getLocationName(lid, location);
		return gui.getSafeFileName(v);
	});
	return path;
}

function prepareFloorData(data, unclear, removeMarks) {
	data = data.map((mine) => Object.assign({}, mine)).sort((a, b) => a.level_id - b.level_id);
	if (removeMarks) {
		const list = [];
		data.forEach(mine => {
			if (mine._p) {
				mine._p = Object.assign({}, mine._p);
				if (mine._p.ue) list.push(mine._p.ue = Object.assign({}, mine._p.ue));
				if (mine._p.e) list.push(mine._p.e = Object.assign({}, mine._p.e));
			}
		});
		list.forEach(edits => {
			(edits ? Object.keys(edits) : []).forEach(key => {
				if (!key.startsWith('t_') && !key.startsWith('x_')) delete edits[key];
			});
		})
	}
	if (unclear) {
		unclear.num = 0;
		data.filter((mine) => mine._p.o).forEach((mine) => {
			unclear.num++;
			mine.packedTiles = mine._p.o.packed;
			['beacons', 'entrances', 'exits', 'npcs', 'hints', 'drags', 'teleports', 'cur_column', 'cur_row'].forEach(
				(key) => (mine[key] = mine._p.o[key])
			);
			delete mine.actions;
			calcMine(mine, { setAllVisibility: true });
		});
	}
	data.forEach((mine) =>
		['processed', 'numTiles', 'cost', 'numSpecial', 'numQuest', 'numPhoto', 'numMaterial', 'numTilesPet', 'costPet', '_t'].forEach(
			(key) => delete mine[key]
		)
	);
	return data;
}

function saveImage() {
	return new Promise((resolve, _reject) => {
		const filename = `${getLocationName(currentData.lid, currentData.location)}_floor${currentData.fid}.png`;
		const path = getDownloadPath();
		let canvas2 = canvas;
		if (resize < 100) {
			canvas2 = gui.createCanvas(Math.round((canvas.width * resize) / 100), Math.round((canvas.height * resize) / 100));
			canvas2.getContext('2d').drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, canvas2.width, canvas2.height);
		}
		canvas2.toBlob((data) => {
			gui.downloadData({ data, filename, path });
			resolve();
		}, 'image/png');
	});
}

async function saveAllImages() {
	const { lid, fid, mine, floorNumbers } = currentData;
	await saveImage();
	for (const floorId of floorNumbers) {
		const found = findMine(lid, floorId);
		if (found && floorId != fid) {
			await processMine(found);
			await saveImage();
		}
	}
	await processMine(mine);
}

function toggleThemeEditor() {
	const el = container.querySelector('.properties');
	const flag = el.classList.contains('hidden');
	el.classList.toggle('hidden', !flag);
	container.querySelector('.toolbar button[data-action="theme"]').classList.toggle('activated', flag);
}

function toggleEditMode() {
	isEditMode = !isEditMode;
	updateTableFlags();
	if (!isEditMode && hasPendingEdits) queue.add(drawMine);
	hasPendingEdits = false;
}

function onClickButton(event) {
	const action = this.getAttribute('data-action');
	if (action == 'save') {
		if (!currentData || !canvas) return;
		if (event.ctrlKey && isAdmin) saveAllImages();
		else saveImage();
	} else if (action == 'options') {
		showAdvancedOptions();
	} else if (action == 'edit') {
		toggleEditMode();
	} else if (action == 'theme') {
		toggleThemeEditor();
	} else if (action == 'theme-reset') {
		setMapTheme(null);
		theme.createSettingsTable();
	} else if (action == 'theme-export') {
		gui.downloadData({ data: theme.settings, filename: 'daf2-map-theme.json' });
	} else if (action == 'theme-import') {
		gui.chooseFile(async function (file) {
			try {
				const data = await gui.readFile(file);
				theme.settings = {};
				setMapTheme(data);
				theme.createSettingsTable();
				gui.toast.show({ text: gui.getMessage('export_importsuccess'), delay: 2000, style: [Dialog.CLOSE] });
			} catch (error) {
				gui.dialog.show({
					title: gui.getMessage('export_import'),
					text: error.message || error,
					style: [Dialog.CRITICAL, Dialog.OK]
				});
			}
		});
	} else if (action == 'export_location' || action == 'export_floor') {
		if (!currentData || !canvas) return;
		const flagUnclear = event ? event.ctrlKey : false;
		const flagNoMarks = event ? event.altKey : false;
		const isLocation = action == 'export_location';
		const unclear = flagUnclear ? {} : null;
		const data = prepareFloorData(isLocation ? Object.values(bgp.Data.mineCache[currentData.lid]) : [currentData.mine], unclear, flagNoMarks);
		const isFull = unclear ? unclear.num == data.length : false;
		const filename = `${getLocationName(currentData.lid, currentData.location)}${isLocation ? '' : `_floor${currentData.fid}`}.${isFull ? 'full' : ''}map.json`;
		gui.downloadData({ data, filename, path: getDownloadPath() });
		if (unclear) gui.toast.show(isFull ? { text: 'All floors were uncleared!' } : { text: 'Not all floors were uncleared!', style: Dialog.CRITICAL });
	} else if (action == 'import') {
		gui.chooseFile(
			async function (files) {
				let lastLid = 0,
					lastError = '';
				for (const file of files) {
					try {
						const invalidExport = new Error(gui.getMessage('export_invalidexport'));
						const data = await gui.readFile(file);
						if (!Array.isArray(data) || data.length == 0) throw invalidExport;
						const lid = data[0].id;
						for (const mine of data) if (mine.id != lid || !(+mine.level_id > 0)) throw invalidExport;
						bgp.Data.addMine(data);
						lastLid = lid;
					} catch (error) {
						lastError = error.message || error;
					}
				}
				if (lastLid) {
					const mine = findMine(lastLid, -1);
					queue.add(async () => await processMine(mine));
					gui.toast.show({
						text: gui.getMessage('export_importsuccess'),
						delay: 2000,
						style: [Dialog.CLOSE]
					});
				} else {
					gui.dialog.show({
						title: gui.getMessage('gui_export'),
						text: lastError,
						style: [Dialog.CRITICAL, Dialog.OK]
					});
				}
			},
			'.json',
			true
		);
	} else if (action == 'test') {
		test();
	}
}

function getEmptyMine(lid, floor, mines) {
	const fid = +floor.def_id;
	const mine = { id: lid, level_id: fid, region: +floor.region_id, columns: +floor.columns, rows: +floor.rows, time: 0, _p: { links: {} } };
	if (mines) mines[fid] = mine;
	return mine;
}

async function test() {
	const value = prompt('Enter location id');
	const lid = +value;
	if (lid <= 0 || !isFinite(lid)) return;
	let mines = bgp.Data.mineCache[lid];
	if (!mines) {
		const floors = await bgp.Data.getFile(`floors_${lid}`);
		mines = bgp.Data.mineCache[lid] = {};
		asArray(floors && floors.floor).filter((floor) => floor.def_id > 0).forEach(floor => getEmptyMine(lid, floor, mines));
	}
	const mine = Object.values(mines)[0];
	if (mine) queue.add(async () => await processMine(mine));
}

function showAdvancedOptions() {
	let flagReprocess = false;
	const addOption = (id, caption) => {
		return Html`<label style="margin:1px 0"><input name="${id}" data-method="flags" type="checkbox" ${hasOption(id) ? 'checked ' : ''
			}style="vertical-align:middle"> ${caption}</label>`;
	};
	let htm = '';
	htm += Html`<table style="user-select:none"><tr><td>`;
	htm += Html`<fieldset style="min-width: 260px;"><legend>${gui.getMessage('tab_options')}</legend>`;
	htm += addOption(OPTION_GROUPLOCATIONS, gui.getMessage('progress_grouplocations'));
	[
		OPTION_REGIONSELECTOR,
		OPTION_FLOORINDICATORS,
		OPTION_FRIENDSHIPSELECTOR,
		OPTION_LOCATIONINFO,
		OPTION_REPEATABLES,
		OPTION_COORDINATES,
		isAdmin && OPTION_ACHIEVEMENT,
		OPTION_TITLE,
		OPTION_BLANKS,
		OPTION_MARGIN,
		OPTION_LOGO
	].forEach((option) => {
		if (option) {
			let text = gui.getMessage('map_option_' + option);
			if (option == OPTION_ACHIEVEMENT) text = 'Special drop for achievements';
			htm += addOption(option, text);
		}
	});
	htm += Html`<label style="margin-top:3px">${gui.getMessage('map_option_resize')} <select name="resize">`;
	const sizes = [100, 80, 75, 66, 60, 50, 40, 33, 25];
	if (resize < 100 && resize > 25 && !sizes.includes(resize)) {
		sizes.push(resize);
		sizes.sort(gui.sortNumberDescending);
	}
	sizes.forEach((step) => {
		htm += Html`<option value="${step}"${step == resize ? ' selected' : ''}>${Locale.formatNumber(step)}%</option>`;
	});
	htm += Html`</select></label>`;
	htm += Html`</fieldset>`;
	htm += Html`<fieldset style="margin-top:8px"><legend>${gui.getMessage('map_downloadfolder')}</legend>`;
	htm += Html`<label style="margin:1px 0">${gui.getMessage(
		'gui_event'
	)}<br><input name="folderevent" type="text" style="width:100%" value="${gui.getPreference(
		'mapDownloadEvent'
	)}"></label>`;
	htm += Html`<label style="margin:1px 0">${gui.getMessage(
		'gui_region'
	)}<br><input name="folderregion" type="text" style="width:100%" value="${gui.getPreference(
		'mapDownloadRegion'
	)}"></label>`;
	htm += Html`</fieldset>`;
	htm += Html`</td><td style="text-align:center">`;
	htm += Html`<fieldset><legend>${gui.getMessage('equipment_include_material')}</legend>`;
	const materials = gui.getFile('materials');
	let items = Object.values(materials)
		.map((obj) => {
			if (+obj.event_id || !obj.name_loc) return null;
			if (obj.name && (obj.name.indexOf('NEOPOUZIVAT') >= 0 || obj.name.indexOf('NEPOUZIVAT') >= 0)) return null;
			let name = gui.getString(obj.name_loc);
			name = name.substr(0, 1) + name.substr(1).toLowerCase();
			return [+obj.def_id, name];
		})
		.filter((v) => v);
	items.push([-1, `[ ${gui.getObjectName('system', 1).toUpperCase()} ]`]);
	items.push([-2, `[ ${gui.getObjectName('system', 2).toUpperCase()} ]`]);
	items.push([-3, `[ ${gui.getString('GUI0008').toUpperCase()} ]`]);
	items.push([-4, `[ ${gui.getMessage('gui_from_events').toUpperCase()} ]`]);
	items.push([-5, `[ ${gui.getString('GUI4080').toUpperCase()} ]`]);
	items = items.sort((a, b) => a[1].localeCompare(b[1]));
	const list = gui.getArrayOfInt(listMaterial);
	htm += Html`<select name="materials" multiple size="20" style="padding:2px;margin-bottom:2px;min-width: 260px;">`;
	for (const item of items) {
		htm += `<option value="${item[0]}">${item[1]}</option>`;
	}
	htm += Html`</select>`;
	htm += Html`<br><input data-method="clr.mat" type="button" class="small" value="${gui.getMessage(
		'gui_filter_clear'
	)}"/>`;
	htm += Html`&#32;<input data-method="inv.mat" type="button" class="small" value="${gui.getMessage(
		'gui_filter_invert'
	)}"/>`;
	htm += Html`</fieldset></td><td style="text-align:center">`;
	htm += Html`<fieldset><legend>${gui.getMessage('events_locations')}</legend>`;
	htm += Html`<select name="mines" multiple size="20" style="padding:2px;margin-bottom:2px;min-width: 260px;"></select>`;
	htm += Html`<br><input data-method="clr.mine" type="button" class="small" value="${gui.getMessage(
		'gui_filter_clear'
	)}"/>`;
	htm += Html`&#32;<input data-method="inv.mine" type="button" class="small" value="${gui.getMessage(
		'gui_filter_invert'
	)}"/>`;
	htm += Html`&#32;<input data-method="remove" type="button" class="small" value="${gui.getMessage(
		'rewardlinks_removeselected'
	)}"/>`;
	htm += Html`&#32;<input data-method="export" type="button" class="small" value="${gui.getMessage(
		'export_export'
	)}"/>`;
	htm += Html`</fieldset></td></tr></table>`;
	const getElement = (selector) => gui.dialog.element.querySelector(selector);
	gui.dialog.show(
		{
			title: gui.getMessage('tab_options'),
			html: htm,
			style: [Dialog.CONFIRM, Dialog.CANCEL, Dialog.AUTORUN, Dialog.WIDEST]
		},
		function (method, params) {
			const arr = method.split('.');
			const methodArg = arr[1];
			method = arr[0];
			ALL_OPTIONS_AND_PREFERENCES.forEach((id) => params[id] = params[id] == 'on');
			const setNoMines = () => {
				setLastViewedMine(null);
				lastMapId = '';
				container.querySelector('.toolbar .warning').classList.remove('hidden');
				document.body.classList.remove('map-rendered');
				setMapVisibility(false);
			};
			if (method == 'export') {
				const mines = asArray(params.mines);
				if (!mines.length) return;
				const event = params.$event;
				const flagUnclear = event ? event.ctrlKey : false;
				const flagNoMarks = event ? event.altKey : false;
				const dialog = Dialog();
				dialog.show(
					{
						title: gui.getMessage('export_export'),
						text: `Export ${Locale.formatNumber(mines.length)} locations?`,
						style: [Dialog.CONFIRM, Dialog.CANCEL, Dialog.CRITICAL]
					},
					function (method) {
						dialog.remove();
						if (method == Dialog.CONFIRM) {
							mines.forEach(lid => {
								const location = getLocation(lid);
								const unclear = flagUnclear ? {} : null;
								const data = prepareFloorData(Object.values(bgp.Data.mineCache[lid]), unclear, flagNoMarks);
								const isFull = unclear ? unclear.num == data.length : false;
								const filename = `${getLocationName(lid, location)}.${isFull ? 'full' : ''}map.json`;
								gui.downloadData({ data, filename, path: getDownloadPath(lid, location) });
							})
						}
					}
				);
				return;
			}
			if (method == 'remove') {
				const mines = asArray(params.mines);
				if (!mines.length) return;
				const dialog = Dialog();
				dialog.show(
					{
						title: gui.getMessage('rewardlinks_removeselected'),
						text: gui.getMessage('map_remove_confirmation'),
						style: [Dialog.CONFIRM, Dialog.CANCEL, Dialog.CRITICAL]
					},
					function (method) {
						dialog.remove();
						if (method == Dialog.CONFIRM) {
							gui.dialog.hide();
							bgp.Data.removeStoredMines(mines);
							if (Object.keys(bgp.Data.mineCache).length == 0) {
								gui.dialog.hide();
								setNoMines();
							} else {
								flagReprocess = true;
								gui.dialog.runCallback(Dialog.AUTORUN, null, true);
							}
						}
					}
				);
				return;
			}
			if (method == Dialog.AUTORUN || method == 'flags') {
				const select = getElement('[name=mines]');
				Html.set(
					select,
					getMineList(params[OPTION_GROUPLOCATIONS], params[OPTION_REPEATABLES], null, params.mines)
				);
				select.style.height = getElement('[name=materials]').offsetHeight + 'px';
				const setSelection = (select, list) => {
					Array.from(select.options).forEach(option => option.selected = list.includes(+option.value));
					params[select.name] = select.selectedOptions.length > 0;
				};
				setSelection(getElement('[name=materials]'), gui.getArrayOfInt(listMaterial));
			}
			if (method == 'clr' || method == 'inv') {
				const fn = method == 'clr' ? (o) => (o.selected = false) : (o) => (o.selected = !o.selected);
				const select = getElement(
					`[name=${methodArg == 'mine' ? 'mines' : 'materials'}]`
				);
				for (const option of select.options) fn(option);
			}
			if (method == Dialog.CONFIRM) {
				ALL_OPTIONS_AND_PREFERENCES.forEach((id) => setOption(id, params[id]));
				if (!isAdmin) setOption(OPTION_ACHIEVEMENT, true);
				resize = +params.resize;
				listMaterial = gui.getArrayOfInt(params.materials).sort(gui.sortNumberAscending).join(',');
				gui.setPreference('mapDownloadEvent', params.folderevent);
				gui.setPreference('mapDownloadRegion', params.folderregion);
				gui.updateTabState(tab);
			}
			if (method == Dialog.CONFIRM || (method == Dialog.CANCEL && flagReprocess)) {
				queue.add(async () => {
					if (determineCurrentMine()) await processMine();
					else setNoMines();
				});
			}
		}
	);
}

function resetCellTitles() {
	table.querySelectorAll('td').forEach(cell => cell.removeAttribute('title'));
}
function setCellTitle(x, y) {
	const cell = table.rows[y]?.cells[x];
	if (!cell) return;
	const title = titles[`${x}_${y}`];
	if (!title) return;
	let s = hasOption(OPTION_COORDINATES) ? `(${x}, ${y})` : '';
	if (title.info) s += (s ? '\n' : '') + title.info;
	if (showDebug && title.debug) s += (s ? '\n' : '') + title.debug;
	cell.title = s;
}

function findTableCell(event) {
	let cell = currentData ? event.target : null;
	for (; cell; cell = cell.parentNode) {
		if (cell == container) return;
		const tagName = cell.tagName;
		if (tagName == 'TR' || tagName == 'TBODY' || tagName == 'TABLE') return;
		if (tagName == 'TD') break;
	}
	return cell;
}
let cellsShown = [], lastShownTileDef;
function onTableMouseMove(event) {
	if (!currentData) return;
	const cell = findTableCell(event);
	let sx, sy, tileDef;
	if (cell) {
		sx = cell.cellIndex;
		sy = cell.parentNode.rowIndex;
		tileDef = currentData.tileDefs[sy * currentData.cols + sx];
		if (!cell.hasAttribute('title')) setCellTitle(sx, sy);
	}
	// Show cells
	const tileShown = event.shiftKey ? tileDef : null;
	if (tileShown !== lastShownTileDef) {
		lastShownTileDef = tileShown;
		cellsShown.forEach(cell => cell.classList.remove('halo', 'halo-e', 'halo-w', 'halo-n', 'halo-s'));
		cellsShown = [];
		if (tileShown) {
			let lastCell;
			const addTile = (cell, className) => {
				if (!cell.classList.contains('tile')) return;
				cell.classList.add('halo');
				if (className) cell.classList.add(className);
				cellsShown.push(cell);
				lastCell = cell;
			};
			const show = (x, y, num, className) => {
				if (x >= 0 && y >= 0) {
					let cell = table.rows[y]?.cells[x];
					if (!cell) return;
					lastCell = null;
					for(let n = 0; cell && n <= num; n++, cell = cell.previousElementSibling) addTile(cell, className);
					if (lastCell) lastCell.classList.add('halo-w');
					cell = table.rows[y].cells[x + 1];
					lastCell = null;
					for(let n = 0; cell && n < num; n++, cell = cell.nextElementSibling) addTile(cell, className);
					if (lastCell) lastCell.classList.add('halo-e');
				}
			};
			const mark = (x, y, className) => {
				const cell = table.rows[y]?.cells[x];
				if (cell?.classList.contains('halo')) cell.classList.add(className);
			};
			show(sx, sy, 3);
			show(sx, sy - 1, 3);
			show(sx, sy - 2, 3);
			show(sx, sy - 3, 2, 'halo-n');
			show(sx, sy + 1, 3);
			show(sx, sy + 2, 3);
			show(sx, sy + 3, 2, 'halo-s');
			mark(sx - 3, sy - 2, 'halo-n');
			mark(sx + 3, sy - 2, 'halo-n');
			mark(sx - 3, sy + 2, 'halo-s');
			mark(sx + 3, sy + 2, 'halo-s');
		}
		map.classList.toggle('halo', cellsShown.length > 0);
	}
	// Teleport
	let teleportId = 0, tx, ty;
	if (cell && cell.classList.contains('teleport')) {
		teleportId = (tileDef && tileDef.teleportId) || 0;
		const teleport = currentData.teleports[teleportId];
		const target = teleport && currentData.teleports[teleport.target_teleport_id];
		if (!teleport || !target) teleportId = 0;
		if (target) {
			tx = target.column;
			ty = target.row;
		}
	}
	if (teleportId == lastTeleportId) return;
	lastTeleportId = teleportId;
	const line = map.querySelector('.line');
	const circle = map.querySelector('.circle');
	line.style.display = circle.style.display = 'none';
	if (teleportId) {
		const table = cell.parentNode.parentNode.parentNode;
		const offsetX = +table.getAttribute('data-x'), offsetY = +table.getAttribute('data-y');
		(sx -= offsetX), (tx -= offsetX), (sy -= offsetY), (ty -= offsetY);
		const dx = sx - tx, dy = sy - ty;
		if (dx || dy) {
			const angle = Math.atan2(dy, dx) + Math.PI;
			const width = (Math.sqrt(dx * dx + dy * dy) - 1) * TILE_SIZE;
			line.style.left = Math.floor((sx + 0.5 + Math.cos(angle) / 2) * TILE_SIZE) + 'px';
			line.style.top = Math.floor((sy + 0.5 + Math.sin(angle) / 2) * TILE_SIZE - 5) + 'px';
			line.style.width = Math.floor(width) + 'px';
			line.style.transform = `rotate(${(angle / Math.PI) * 180}deg)`;
			line.style.display = 'block';
		}
		circle.style.left = Math.floor(tx * TILE_SIZE) + 'px';
		circle.style.top = Math.floor(ty * TILE_SIZE) + 'px';
		circle.style.display = 'block';
	}
}

function onTableClick(event) {
	const cell = findTableCell(event);
	if (isAdmin && event.ctrlKey) {
		let mine = currentData.mine;
		const x = cell.cellIndex, y = cell.parentNode.rowIndex, tileDef = currentData.tileDefs[y * currentData.cols + x];
		let value = undefined, key, key2;
		if (tileDef && (tileDef.miscType == 'X' || tileDef.miscType == 'N')) {
			const action = cell.getAttribute('data-action');
			if (!action || !action.startsWith('goto')) return;
			const door1 = currentData.doors[`${currentData.fid}_p_${x}_${y}`];
			const door2 = door1 && currentData.doors[door1.to];
			if (!door1 || !door2) return;
			const door = door1.miscType == 'X' ? door1 : door2;
			mine = findMine(currentData.lid, door.fid);
			if (!mine) return;
			key = `x_${door.id}`;
			value = prompt('Enter door name', door.name);
		} else {
			const teleports = currentData.teleports;
			const teleport = teleports[tileDef.teleportId];
			if (!teleport) return;
			key = `t_${tileDef.teleportId}`;
			const target = teleports[teleport.target_teleport_id];
			const isBidi = target && target.target_teleport_id == teleport.teleport_id;
			key2 = isBidi ? `t_${teleport.target_teleport_id}` : null;
			value = prompt('Enter teleport name', teleport.name);
		}
		if (value === undefined || value === null) return;
		value = value.trim().substr(0, 3);
		let edits = mine._p.e;
		if (!value && !edits) return;
		if (!edits) edits = mine._p.e = {};
		if (!value && !(key in edits) && !(key2 in edits)) return;
		Object.entries(edits).forEach(([key, v]) => {
			if (isKeyForDoor(key) && v == value) delete edits[key];
		});
		if (value) edits[key] = value;
		else delete edits[key];
		if (key2)
			if (value) edits[key2] = value;
			else delete edits[key2];
		bgp.Data.saveMine(mine);
		queue.add(processMine);
		return;
	}
	const dataAction = cell && cell.getAttribute('data-action');
	if (!dataAction) return;
	const arr = dataAction.split('_');
	const action = arr[0];
	if (action == 'goto') {
		const fid = +arr[1];
		const x = +arr[2];
		const y = +arr[3];
		if (fid == currentData.fid) scrollToCenter(x, y, true);
		else {
			const found = findMine(currentData.lid, fid);
			if (found) {
				queue.add(async () => await processMine(found, { x, y }));
			}
		}
	}
}

function update() {
	isAdmin = theme.isAdmin = bgp.Data.isMapper;
	canShowBonus = isFlagAllowed('B');
	canShowBeacon = isFlagAllowed('E');
	({ cdn_root, versionParameter } = gui.getGenerator());
	if (determineCurrentMine()) gui.setLazyRender(map);
	addons = gui.getFile('addons');
	backgrounds = gui.getFile('backgrounds');
	draggables = gui.getFile('draggables');
	npcs = gui.getFile('npcs');
	childs = gui.getFile('childs');
	tiles = gui.getFile('tiles');
	subtiles = {};
	for (const tile of Object.values(tiles)) {
		for (const subTile of asArray(tile.subtypes)) {
			const id = subTile.def_id;
			if (!(id in subtiles)) subtiles[id] = subTile;
		}
	}
	specialDrops = {
		token_215: 'Q', // FATHER'S JOURNAL PAGE
		token_505: 'Q', // CODED FATHER'S NORDIC JOURNAL 1
		token_802: 'Q', // CODED FATHER'S NORDIC JOURNAL 2
		token_818: 'Q', // CODED FATHER'S NORDIC JOURNAL 3
		token_1470: 'Q', // CHINESE JOURNAL
		material_93: 'M', // JADEITE
		material_270: 'M' // OBSIDIAN
	};
	Object.values(gui.getFile('achievements'))
		.filter((a) => +a.event_id > 0 && a.action == 'collect' && a.type == 'material')
		.forEach((a) => {
			const key = a.type + '_' + a.object_id;
			specialDrops[key] = 'A';
		});

	allQuestDrops = {};
	allQuestDropsFlags = {};
	const replaces = {};
	Object.values(gui.getFile('location_replaces')).forEach((r) => (replaces[r.location_id] = r.replace_id));
	// Quests -> steps -> objectives -> location_type can be:
	// camp, floor, city, bill, map, global_contract_popup, create_mine, crafting_popup
	const materials = gui.getFile('materials');
	for (const quest of Object.values(gui.getFile('quests'))) {
		for (const step of asArray(quest.steps)) {
			for (const obj of asArray(step.objectives)) {
				if (
					(obj.type == 'get' || obj.type == 'have') &&
					obj.location_type == 'floor' &&
					+obj.amount > 0 &&
					obj.object_type != 'create_mine'
				) {
					const { location_id: lid, object_type: type, object_id: id } = obj;
					if (type == 'material') {
						const m = materials[id];
						if (!m || +m.event_id == 0) continue;
					}
					addQuestDrop(lid, type, id, quest.def_id);
					if (lid in replaces) addQuestDrop(replaces[lid], type, id, quest.def_id);
				}
			}
		}
	}

	allEventMaterials = [];
	Object.values(materials).forEach((m) => {
		if (+m.event_id > 0) allEventMaterials.push(+m.def_id);
	});

	const skipList = {
		token_3090: 0, // generic treasure
		material_2: 0, // gem
		material_47: 0, // amethyst
		material_92: 0, // ruby
		material_143: 0, // topaz
		material_149: 0 // black pearl
	};
	for(const rid of [0, ...gui.getRegionsArray(), 99]) {
		Object.values(gui.getFile('locations_' + rid)).forEach((location) => {
			if (!location.loot_drop || +location.reset_cd > 0) return;
			const lid = location.def_id;
			const questItems = allQuestDrops[lid] || {};
			location.loot_drop.split(';').forEach((loot) => {
				const key = loot.replace(':', '_');
				if (key in skipList || key in specialDrops || key in questItems) return;
				specialDrops[key] = 'L';
			});
		});
	}
	// Add tokens
	allEventTokens = {};
	Object.values(gui.getFile('tokens')).forEach(token => {
		const eid = +token.event_id;
		if (eid) (allEventTokens[eid] || (allEventTokens[eid] = {}))[token.def_id] = true;
	});
	deleteWormsFrom(specialDrops);

	mapFilters = {};
	for (const filter of Object.values(gui.getFile('map_filters'))) {
		mapFilters[filter.filter] = gui.getString(filter.name_loc);
	}

	const generator = gui.getGenerator();
	playerLevel = generator.level;
	const uid = generator.player_id;
	playerUidRnd = parseInt(uid.length > 0 ? uid.substring(uid.length - 6) : uid);
	const boughtEffects = asArray(generator.passive_effect_extension && generator.passive_effect_extension.item);
	effects = Object.values(gui.getFile('extensions'))
		.map((e) => {
			const id = +e.def_id;
			const effect = boughtEffects.find((t) => +t.extension_def_id == id);
			let chance = 0,
				bonus = 0,
				level = 0;
			if (effect) {
				level = +effect.extension_level;
				const item = asArray(e.levels).find((t) => +t.level == level);
				asArray(item && item.attributes).forEach((a) => {
					if (a.attribute_type == 'chance') chance = +a.attribute_value;
					if (a.attribute_type == 'bonus_in_percent') bonus = +a.attribute_value;
				});
			}
			return bonus > 0 && chance > 0 ? { id, type: e.type, level, chance, bonus } : null;
		})
		.filter((t) => t);

	const state = getState();
	let htm = '';
	for (let rid = 0, maxRid = gui.getMaxRegion(); rid <= maxRid; rid++)
		htm += Html`<option value="${rid ? '' + rid : ''}">${rid ? Locale.formatNumber(rid) + ' = ' + gui.getObjectName('region', rid) : gui.getMessage('equipment_current')}</option>`;
	Html.set(selectRegion, htm);
	htm = '';
	let maxFriendship = 24;
	const arr = gui.getArray(gui.getFile('pet_features')?.[1]?.friendships);
	arr.forEach(item => { if(+item.level_id > maxFriendship) maxFriendship = +item.level_id; });
	for (let n = 0; n <= maxFriendship; n++) htm += Html`<option value="${n ? '' + n : ''}">${n ? Locale.formatNumber(n) : gui.getMessage('equipment_current')}</option>`;
	Html.set(selectFriendship, htm);
	setState(state);
	updateTableFlags();
	queue.enable();
}

function markToBeRendered() {
	gui.setLazyRender(map);
}

function getState() {
	return {
		region: selectRegion.options.length ? selectRegion.value : selectRegion.getAttribute('data-value'),
		friendship: selectFriendship.options.length ? selectFriendship.value : selectFriendship.getAttribute('data-value'),
		show: checks.map(getStateButtonFlag).sort().join('').toLowerCase(),
		options: ALL_OPTIONS.filter((id) => !hasOption(id)).join(''),
		resize: resize == 100 ? null : resize,
		zoom: zoom,
		material: listMaterial
	};
}

function setState(state) {
	if (selectRegion.options.length) state.region = gui.setSelectState(selectRegion, state.region || '');
	selectRegion.setAttribute('data-value', state.region);
	if (selectFriendship.options.length) state.friendship = gui.setSelectState(selectFriendship, state.friendship || '');
	selectFriendship.setAttribute('data-value', state.friendship);
	const flags = String(state.show || '').toUpperCase();
	checks.forEach((check) => {
		const arr = (check.getAttribute('data-flags') || '').split(',');
		const flag = [].concat(arr).reverse().find((flag) => isFlagAllowed(flag) && flags.includes(flag));
		const state = arr.indexOf(flag) + 1;
		setStateButton(check, state);
	});
	zoom = Math.min(Math.max(2, Math.round(+state.zoom || 5)), 10);
	const options = String(state.options || '').toLowerCase();
	ALL_OPTIONS.forEach((id) => setOption(id, options.indexOf(id) < 0));
	if (!isAdmin) setOption(OPTION_ACHIEVEMENT, true);
	resize = +state.resize || 0;
	if (resize < 25 || resize > 100) resize = 100;
	state.resize = resize;
	listMaterial = state.material;
	setCanvasZoom();
}

function addImage(asset, url) {
	if (typeof asset == 'string' && !(asset in images)) {
		const item = { loaded: false };
		images[asset] = item;
		item.promise = new Promise((resolve, _reject) => {
			if (!url)
				url = asset.startsWith('/')
					? asset
					: cdn_root + 'mobile/graphics/all/' + encodeURIComponent(asset) + '.png' + versionParameter;
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				item.img = img;
				resolve();
			};
			img.onerror = () => {
				console.log('Error loading', url);
				resolve();
			};
			img.src = url;
		});
		return item.promise;
	}
}

const zoomFactors = [0.25, 0.375, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.4];
function setCanvasZoom() {
	const width = canvas.width;
	const height = canvas.height;
	const zoomFactor = zoomFactors[zoom - 1];
	canvas.parentNode.style.transform = `scale(${zoomFactor})`;
	map.style.width = `${Math.floor(width * zoomFactor)}px`;
	map.style.height = `${Math.floor(height * zoomFactor)}px`;
}

function addTitle(x, y, text, isBlockTitle) {
	const key = `${x}_${y}`;
	let title = titles[key];
	if (!title) title = titles[key] = { info: '' };
	title.info = (title.info ? title.info + '\n' + (isBlockTitle ? '\n' : '') : '') + text;
}
function addTitleDebug(x, y, text) {
	const key = `${x}_${y}`;
	if (!titles[key]) titles[key] = {};
	titles[key].debug = (titles[key].debug ? titles[key].debug + '\n' : '') + '\n' + text;
}

function changeLevel(e) {
	if (!currentData || e.target.disabled) return;
	const fid = +e.target.getAttribute('data-flag')
	let found = findMine(currentData.lid, fid);
	if (!found && isAdmin) {
		const lid = currentData.lid;
		const floor = currentData.floors.find(floor => floor.def_id == fid);
		const mines = bgp.Data.mineCache[lid];
		found = floor && getEmptyMine(lid, floor, mines);
	}
	if (found) queue.add(async () => await processMine(found));
}

function isValidTile(tileDef, beaconPart) {
	if (tileDef.stamina < 0 && !tileDef.npcId) return false;
	if (beaconPart && !beaconPart.active && (beaconPart.activation == 'use' || beaconPart.activation == 'door')) return true;
	return tileDef.isTile || !!tileDef.npcId;
}

async function calcMine(mine, { addImages = false, setAllVisibility = false } = {}) {
	if (!mine) return;
	mine.processed = gui.getUnixTime();

	const { id: lid, level_id: fid, columns: cols, rows } = mine;
	let { region: rid, tiles: mineTiles } = mine;

	const isPreview = mine.time === 0;
	const isUnclear = !!(showUncleared && mine._p.o);
	const base = isUnclear ? mine._p.o : mine;
	const packedTiles = isUnclear ? base.packed : mine.packedTiles;
	if (packedTiles) mineTiles = PackTiles.unpack(packedTiles);

	const generator = gui.getGenerator();
	const locProg = bgp.Data.getLocProg(lid);
	const resetCount = (locProg && locProg.reset) || 0;

	const locations = gui.getFile('locations_' + rid);
	const location = locations[lid];
	const isRepeatable = +location.reset_cd > 0;
	const isTower = isLocationTower(lid, location);
	const eid = rid == 0 && +location.event_id;
	const event = eid && gui.getObject('event', eid);
	const maxSegment = (event ? event.reward : []).reduce((max, obj) => Math.max(max, +obj.region_id), 0);

	const isInvalidCoords = (x, y) => y < 0 || y >= rows || x < 0 || x >= cols;
	const addAsset = (item) => addImages && item && addImage(item.mobile_asset);

	// Default values
	let d_rid = 0, d_friendship = 0;
	if (rid == 99) d_rid = +mine.pet_feature?.region_id || 0;
	else if (eid && eid in generator.events_region) d_rid = +generator.events_region[eid] || 0;
	if (mine.pet_feature) d_friendship = +mine.pet_feature.friendship_level || 0;
	d_rid = d_rid || generator.region;
	d_friendship = d_friendship || +generator.pet_feature?.friendship?.level || 1;

	let floors = await bgp.Data.getFile(`floors_${lid}`);
	floors = asArray(floors && floors.floor).filter((floor) => floor.def_id > 0);
	const floor = floors.find((floor) => floor.def_id == fid);
	if (!floor) return;

	let segmented = maxSegment > 1;
	// Fix for segmentation flag in special weeks
	let maxRegion = 0;
	floors.forEach((floor) =>
		asArray(floor.loot_areas && floor.loot_areas.loot_area).forEach((a) => {
			if (a.region_id > maxRegion) maxRegion = a.region_id;
		})
	);
	if (!segmented && maxRegion > 1) segmented = true;

	const data = { mine, lid, fid, eid, segmented, d_rid, d_friendship, cols, rows, resetCount, location, isRepeatable, floors, floor };
	data.floorNumbers = floors.map((f) => f.def_id).filter((n) => n > 0).sort((a, b) => a - b);

	if (rid == 99) rid = d_rid;
	else if (eid) rid = segmented ? data.d_rid : 1;
	let petFriendshipLevel = data.d_friendship;

	// Apply specific selection
	if (segmented && hasOption(OPTION_REGIONSELECTOR)) {
		const state = getState();
		if (+state.region > 0) rid = Math.min(+state.region, maxRegion);
	}
	if (hasOption(OPTION_FRIENDSHIPSELECTOR)) {
		const state = getState();
		if (+state.friendship > 0) petFriendshipLevel = +state.friendship;
	}

	data.rid = rid;
	data.friendship = petFriendshipLevel;

	const defaultBgId = floor.bg_id;
	addAsset(backgrounds[defaultBgId]);

	const computeTile = (tileDef) => {
		const { x, y } = tileDef;
		let { tileId, tileSubtype } = tileDef;
		let tile = null;
		delete tileDef.pet;
		if (tileId > 0) {
			const pTileId = tileId;
			tile = tiles[tileId];
			if (tile) {
				if (+tile.pet) tileDef.pet = true;
				if (tile.overrides) {
					let override = null;
					if (tileDef.pet) {
						override = tile.overrides.find((o) => +o.pet_friendship_level == petFriendshipLevel);
					} else if (rid != 0) {
						override = tile.overrides.find((o) => +o.region_id == rid);
					}
					if (override) {
						tileId = +override.override_tile_id;
						tile = tiles[tileId];
					}
				}
				if (tileId != pTileId && tile.subtypes && tile.subtypes.length) {
					const subtypes = tile.subtypes.filter((st) => +st.frames == 0 || +st.breakup == 0);
					if (subtypes.length) {
						tileSubtype = +subtypes[CustomRandomRND(x * 1000 + y * 100) % subtypes.length | 0].def_id;
					}
				}
			}
		}
		tileDef.tileId = tileId;
		tileDef.tileSubtype = tileSubtype;
		addAsset(subtiles[tileDef.tileSubtype]);
		tileDef.stamina = tile ? +tile.stamina : 0;
		tileDef.shadow = tile ? +tile.shadow : 0;
		delete tileDef.toDo;
		delete tileDef.bonusEnergy;
		delete tileDef.bonusXp;
		if (tileDef.stamina > 0) {
			for (const effect of (canShowBonus && !isTower) ? effects : []) {
				let rnd = CustomRandomRND(
					playerUidRnd + 10000 * lid + 1000 * fid + 100 * y + 10 * x + effect.id + resetCount
				);
				rnd = (rnd % 10001) / 100;
				if (rnd <= effect.chance) {
					const amount = Math.floor((tileDef.stamina * effect.bonus) / 100);
					if (amount > 0) {
						if (effect.type == 'stamina_bonus_passive_effect') tileDef.bonusEnergy = amount;
						if (effect.type == 'xp_bonus_passive_effect') tileDef.bonusXp = amount;
					}
				}
			}
		}
	};

	// Build tileDefs
	const tileDefs = (data.tileDefs = []);
	let splittedTiles = mineTiles && mineTiles.split(';');
	if (!splittedTiles) {
		splittedTiles = (new Array(cols * rows)).fill('5,2,0,34,0');
		// if (data.floor.blocked) data.floor.blocked.split(';').forEach(t => {
		// 	const a = t.split('_');
		// 	const x = +a[1], y = +a[0];
		// 	splittedTiles[y * cols + x] = '1,0,0,1,1';
		// })
	}
	splittedTiles.forEach((tileData, tileIndex) => {
		const x = tileIndex % cols;
		const y = Math.floor(tileIndex / cols);
		const tileDef = (tileDefs[tileIndex] = { x, y, tileIndex });
		tileDef.bgId = defaultBgId;
		// eslint-disable-next-line prefer-const
		let [tileId, tileStatus, , tileSubtype, visible] = tileData.split(',').map((v) => +v || 0);
		tileDef.tileStatus = tileStatus;
		tileDef.visible = visible == 1;
		if (tileDef.visible) tileDef.show = tileDef.viewed = true;
		tileDef.tileId = tileId;
		tileDef.tileSubtype = tileSubtype;
		computeTile(tileDef);
	});
	applyViewed(tileDefs, mine._p.vis);
	for (const tileDef of tileDefs) if (tileDef.viewed) tileDef.show = true;

	// Loot
	const filterByRegion = (a) => {
		const regionId = +a.region_id || 0;
		return regionId == rid || regionId == 0;
	};
	const artifacts = gui.getArrayOfInt(generator.artifacts);
	const tokens = gui.getFile('tokens');
	const mineKey = mine.key;
	for (const area of asArray(floor.loot_areas && floor.loot_areas.loot_area).filter(filterByRegion)) {
		const { area_id, min, max, random, type } = area;
		const tiles = typeof area.tiles == 'string' ? area.tiles.split(';') : [];
		const indexes = random > 0 ? lootIndex(mineKey, area_id, tiles.length, random) : null;
		tiles.forEach((tile, index) => {
			if (!indexes || indexes.indexOf(index) >= 0) {
				const [y, x] = tile.split(',').map((v) => +v);
				let coef = 0, amount;
				if (min > max) {
					amount = 1;
				} else {
					amount = min == max ? min : Math.floor(Math.max((CustomRandomTileRND(mineKey, x, y, area_id * 10000) % (max - min + 1)) + min, 0));
					coef = area.coef;
				}
				const lootType = type == 'chest' ? 'artifact' : type;
				const lootId = type == 'chest' ? pickTreasure(mineKey, x, y, area_id, gui.getArrayOfInt(area.pieces), artifacts) : +area.object_id;
				if (lootType == 'artifact' && artifacts.includes(lootId)) amount = 0;
				if (amount > 0 && lootId > 0) {
					if (coef > 0) amount = amount + Math.floor(amount * coef * playerLevel);
					const tileDef = tileDefs[y * cols + x];
					if (!tileDef.tloot) tileDef.tloot = [];
					const loot = { type: lootType, id: lootId, amount };
					if (indexes) loot.random = area_id;
					if (lootType == 'token') {
						const t = tokens[lootId];
						if (!t || +t.visibility != 1) loot.hidden = true;
					}
					tileDef.tloot.push(loot);
				}
			}
		});
	}

	// Backgrounds
	for (const obj of asArray(floor.backgrounds && floor.backgrounds.background)) {
		const id = obj.id;
		const item = backgrounds[id];
		if (item) {
			addAsset(item);
			for (const tile of obj.tiles.split(';')) {
				const [y, x] = tile.split(',').map((v) => +v);
				const tileDef = tileDefs[y * cols + x];
				tileDef.bgId = id;
			}
		}
	}

	// Addons
	for (const obj of asArray(floor.addons && floor.addons.addon)) {
		const id = obj.id;
		const item = addons[id];
		if (item) {
			addAsset(item);
			const type = item.type;
			obj.tiles.split(';').forEach((tile) => {
				const [y, x] = tile.split(',').map((v) => +v);
				const tileDef = tileDefs[y * cols + x];
				if (type == 'background') {
					tileDef.backgroundAddonId = id;
				} else if (type == 'static') {
					tileDef.staticAddonId = id;
				} else if (type == 'foreground') {
					tileDef.foregroundAddonId = id;
				}
			});
		}
	}

	// Npcs
	const max_child = (+generator.camp.max_child || 0) + 1;
	const child_charges = 15;
	const getRndValue = (min, max) => Math.floor((CustomRandomRND(playerUidRnd + (100 * max_child + child_charges + 1) + 20000) % (max - min + 1)) + min);
	const setNpc = (tileDef, npcId) => {
		const item = npcId && npcs[npcId];
		delete tileDef.npcId;
		delete tileDef.npcLoot;
		delete tileDef.isGC;
		if (item) {
			addAsset(item);
			tileDef.npcId = npcId;
			if (+item.pick_child > 0) {
				tileDef.isGC = true;
				const child = childs[item.pick_child] || { min_stamina: 0, max_stamina: 0 }
				let energy = getRndValue(+child.min_stamina, +child.max_stamina);
				tileDef.npcLoot = [];
				for (const obj of asArray(child.drops).filter((t) => +t.region_id == rid)) {
					const value = getRndValue(+obj.min, +obj.max);
					if (obj.type == 'system' && +obj.object_id == 2) {
						energy += value;
					} else {
						tileDef.npcLoot.push({ type: obj.type, id: +obj.object_id, amount: value * 15 });
					}
				}
				tileDef.npcLoot.push({ type: 'system', id: 2, amount: energy * 15 });
			} else if (item.pick_token && item.pick_token != '0') {
				const pickTokens = item.pick_token.split(',').map((v) => +v);
				const pickAmounts = item.pick_amount.split(',').map((v) => +v);
				tileDef.npcLoot = pickTokens.map((t, i) => ({ type: 'token', id: t, amount: pickAmounts[i] })).filter((l) => l.amount > 0);
			}
		}
	};
	for (const obj of asArray(base.npcs)) {
		const { def_id: id, column: x, row: y } = obj;
		setNpc(tileDefs[y * cols + x], id);
	}

	// Hints
	const hints = (data.hints = {});
	for (const hint of asArray(floor.hints && floor.hints.hint)) {
		hints[hint.hint_id] = hint;
	}
	for (const obj of asArray(base.hints)) {
		const { def_id: id, row: y, column: x } = obj;
		const item = hints[id];
		if (item) {
			addAsset(item);
			const tileDef = tileDefs[y * cols + x];
			tileDef.miscId = id;
			tileDef.miscType = 'H';
		}
	}

	// Entrances and exits
	const doors = (data.doors = {});
	const usedNames = {};
	const edits = mine._p.e || {};
	Object.entries(edits).forEach(([key, value]) => {
		if (isKeyForDoor(key)) usedNames[value] = value;
	});
	const locationMines = {};
	locationMines[mine.level_id] = mine;
	if (lid in bgp.Data.mineCache) Object.values(bgp.Data.mineCache[lid]).forEach((m) => (locationMines[m.level_id] = m));
	let numExits = 0;
	const setDoorPosition = (door, x, y) => {
		if (!door) return;
		door.x = x;
		door.y = y;
		doors[door.fid + '_p_' + x + '_' + y] = door;
	};
	floors.forEach((floor) => {
		const fid = floor.def_id;
		const mine = locationMines[fid], edits = (mine && mine._p.e) || {};
		Object.entries(edits).forEach(([key, value]) => {
			if (key.startsWith('x_')) usedNames[value] = value;
		});
		asArray(floor.exits && floor.exits.exit).forEach((exit) => {
			const { exit_id: id, mobile_asset } = exit;
			const key = `x_${id}`;
			let name = edits[key];
			if (!name) {
				name = String.fromCharCode(65 + (numExits % 26)) + (numExits >= 26 ? Math.floor((numExits - 26) / 26) + 1 : '');
				for (let index = 1; name in usedNames; name = `d${index++}`);
			}
			numExits++;
			doors[fid + '_x_' + id] = { fid, miscType: 'X', id, mobile_asset, name };
		});
		asArray(floor.entrances && floor.entrances.entrance).forEach((entrance) => {
			const { entrance_id: id, mobile_asset } = entrance;
			doors[fid + '_n_' + id] = { fid, miscType: 'N', id, mobile_asset };
		});
		for (const obj of asArray(mine && mine.entrances))
			setDoorPosition(doors[fid + '_n_' + obj.def_id], obj.column, obj.row);
		for (const obj of asArray(mine && mine.exits))
			setDoorPosition(doors[fid + '_x_' + obj.def_id], obj.column, obj.row);
	});
	const setDoorTile = (door) => {
		if (!door) return;
		addAsset(door);
		const tileDef = tileDefs[door.y * cols + door.x];
		tileDef.miscId = door.id;
		tileDef.miscType = door.miscType;
	};
	for (const obj of asArray(floor.hide_entrance == 0 ? mine.entrances : []))
		setDoorTile(doors[fid + '_n_' + obj.def_id]);
	for (const obj of asArray(mine.exits)) setDoorTile(doors[fid + '_x_' + obj.def_id]);
	for (const [keyStartPartial, keyEnd] of Object.entries(mine._p.links)) {
		const keyStart = fid + '_' + keyStartPartial;
		const start = doors[keyStart], end = doors[keyEnd];
		if (start && end) {
			start.to = keyEnd;
			end.to = keyStart;
			start.name = end.name = start.name || end.name;
		}
	}

	// Draggables
	for (const obj of asArray(base.drags)) {
		const { def_id: id, row: y, column: x, state } = obj;
		const item = draggables[id];
		if (item) {
			addAsset(item);
			addAsset(
				draggables[
				asArray(item.overrides)
					.filter((o) => +o.region_id == rid)
					.map((o) => o.override_drag_id)[0]
				]
			);
			const tileDef = tileDefs[y * cols + x];
			tileDef.draggableId = id;
			tileDef.draggableStatus = state;
		}
	}

	// Teleports
	const teleports = (data.teleports = {});
	for (const teleport of asArray(floor.teleports && floor.teleports.teleport))
		teleports[teleport.teleport_id] = teleport;
	for (const teleport of asArray(mine.teleports))
		teleports[teleport.def_id] = Object.assign(teleports[teleport.def_id], teleport);
	for (const teleport of Object.values(teleports)) {
		const { row: y, column: x } = teleport;
		const tileDef = tileDefs[y * cols + x];
		if (tileDef) tileDef.teleportId = teleport.teleport_id;
	}
	let teleportIndex = 0;
	const sortedTeleports = Object.values(teleports).sort((a, b) => a.row - b.row || a.column - b.column);
	sortedTeleports.forEach((teleport) => delete teleport.name);
	sortedTeleports.forEach((teleport) => {
		const target = teleports[teleport.target_teleport_id];
		const isBidi = target.target_teleport_id == teleport.teleport_id;
		let name = edits[`t_${teleport.teleport_id}`];
		if (!name && isBidi) name = edits[`t_${teleport.target_teleport_id}`] || target.name;
		while (!name) {
			name = Locale.formatNumber(++teleportIndex);
			if (name in usedNames) name = null;
		}
		teleport.name = name;
	});

	// Beacons
	const beaconIsTeleport = {};
	Object.values(teleports).forEach((t) => (beaconIsTeleport[t.beacon_id] = true));
	const beacons = (data.beacons = {});
	const beaconParts = (data.beaconParts = {});
	const getBeaconPart = (beaconId, partId) => beaconParts[`${beaconId}_${partId}`];
	for (const beacon of asArray(floor.beacons && floor.beacons.beacon)) {
		const id = beacon.beacon_id;
		const copy = Object.assign({}, beacon);
		beacons[id] = copy;
		copy.parts = {};
		copy.parts.part = asArray(beacon.parts && beacon.parts.part).map((beaconPart) => {
			const copy = Object.assign({}, beaconPart);
			copy.active = false;
			delete copy.mobile_asset_cn;
			delete copy.mobile_sound_asset;
			delete copy.sound_clip;
			delete copy.sound_library;
			delete copy.gr_library;
			delete copy.gr_clip;
			beaconParts[`${id}_${beaconPart.part_id}`] = copy;
			return copy;
		});
		// Show flag
		let activable = id in beaconIsTeleport;
		if (!activable) {
			const parts = copy.parts.part;
			const activableParts = parts.filter((p) => {
				return p.activation != 'door_r' || p.req_material > 0 || p.req_drag > 0 || p.req_light > 0;
			});
			activable = parts.length && parts.length == activableParts.length;
		}
		if (activable) {
			for (const action of asArray(beacon.actions.action).filter((a) => a.layer == 'vision')) {
				const values = splitString(action.values, ',');
				if (values.length == 1 && +values[0] != 1) continue;
				for (const tile of splitString(action.tiles, ';')) {
					const [y, x] = tile.split(',').map((v) => +v);
					if (!isInvalidCoords(x, y)) tileDefs[y * cols + x].show = true;
				}
			}
		}
	}
	for (const obj of asArray(base.beacons)) {
		const { def_id: id, row: y, column: x, part, state } = obj;
		const beaconPart = getBeaconPart(id, part);
		if (beaconPart) {
			const tileDef = tileDefs[y * cols + x];
			tileDef.miscId = id;
			tileDef.miscType = 'B';
			tileDef.beaconPart = part;
			beaconPart.active = state == 1;
			addAsset(beaconPart);
		}
	}

	// Execute all queued actions
	const isRequiredOrientation = (beaconPart, status) => {
		const v = beaconPart.req_drag_rotation;
		return v === 'none' || v === ['', 'right', 'down', 'left', 'up'][status];
	};
	const removeBeacon = (tileDef) => {
		delete tileDef.miscId;
		delete tileDef.miscType;
		delete tileDef.beaconPart;
	};
	const layerFns = {
		misc: (tileDef, value, values) => {
			// 0 = remove
			// B_beaconid_partid_active = set active
			// more value = use the next
			// else toggle active
			if (value == '0') {
				removeBeacon(tileDef);
				return;
			}
			let active;
			if (values.length > 1) {
				const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
				const current = beaconPart ? tileDef.miscType + '_' + tileDef.miscId + '_' + tileDef.beaconPart + '_' + (beaconPart.active ? '1' : '0') : '';
				let index = values.indexOf(current) + 1;
				if (index == values.length) index = 0;
				value = values[index];
			}
			if (value) {
				const v = value.split('_');
				tileDef.miscId = +v[1] || 0;
				tileDef.beaconPart = +v[2] || 0;
				active = v[3] == '1';
			}
			const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
			if (!beaconPart) return false;
			if (active === undefined) active = !beaconPart.active;
			// beaconPart.active = active;
			if (!setBeaconPartActive(tileDef, beacons[tileDef.miscId], beaconPart, active)) return false;
		},
		drag: (tileDef, _value, values) => {
			// one value = set that drag (draggableid or draggableid_status)
			// more value = use the next
			let index = values.indexOf(!tileDef.draggableId ? 'null' : '' + tileDef.draggableId) + 1;
			if (index == values.length) index = 0;
			const v = values[index].split('_');
			const id = +v[0];
			if (id == 0) {
				delete tileDef.draggableId;
				delete tileDef.draggableStatus;
			} else {
				const draggable = draggables[id];
				if (!draggable) return false;
				tileDef.draggableId = id;
				addAsset(draggable);
				addAsset(draggables[asArray(draggable.overrides).filter((o) => +o.region_id == rid).map((o) => o.override_drag_id)[0]]);
				if (v.length > 1) tileDef.draggableStatus = +v[1];
				tileDef.draggableStatus = tileDef.draggableStatus || 1;
			}
		},
		npc: (tileDef, value, _values) => {
			if (value == '0') {
				setNpc(tileDef, 0);
			} else {
				const npc = npcs[value];
				if (!npc) return false;
				setNpc(tileDef, +value);
				removeBeacon(tileDef);
			}
		},
		id: (tileDef, value, values) => {
			tileDef.tileId = values.length > 1 && tileDef.tileId == +value ? +values[1] : +value;
			tileDef.toDo = true;
		},
		subtype: (tileDef, value, values) => {
			tileDef.tileSubtype = values.length > 1 && tileDef.tileSubtype == +value ? +values[1] : +value;
			tileDef.toDo = true;
		},
		status: (tileDef, value, values) => {
			tileDef.tileStatus = values.length > 1 && tileDef.tileStatus == +value ? +values[1] : +value;
		},
		vision: (tileDef, value, values) => {
			tileDef.visible = values.length == 1 ? +value == 1 : !tileDef.visible;
			if (tileDef.visible) tileDef.viewed = true;
		}
	};
	layerFns['drag_swap'] = layerFns['drag'];
	['delay', 'focus', 'force_focus', 'instant_focus', 'force_idle_text', 'loot'].forEach(name => layerFns[name] = 'skip');
	let beaconsExecuted = {};
	const executeBeaconActions = (beacon) => {
		if (beacon.beacon_id in beaconsExecuted) {
			console.log('beacon actions already executed', beacon);
			return true;
		}
		beaconsExecuted[beacon.beacon_id] = true;
		for (const action of asArray(beacon.actions.action)) {
			const layer = action.layer;
			const fn = layerFns[action.layer];
			if (fn === 'skip') continue;
			if (!fn) {
				console.log('unknown layer', action);
				return false;
			}
			const values = splitString(action.values, ',');
			const value = values.length >= 1 ? values[0] : undefined;
			const tiles = splitString(action.tiles, ';');
			for (const tile of tiles) {
				const [y, x] = tile.split(',').map((v) => +v);
				if (isInvalidCoords(x, y)) return false;
				if (fn(tileDefs[y * cols + x], value, values) === false) return false;
			}
		}
		return true;
	};
	const setBeaconPartActive = (tileDef, beacon, beaconPart, flag) => {
		beaconPart.active = flag;
		if (!beacon) return false;
		// two-way beacon does always trigger ?
		if (flag || (beaconPart.type == 'two-way' && asArray(beacon.parts.part).length == 1)) {
			// if (beaconPart.type == 'one-way') removeBeacon(tileDef);
			if (!asArray(beacon.parts.part).find((p) => p.active != flag)) return executeBeaconActions(beacon);
		}
		return true;
	};
	const executeAction = (action) => {
		const { x, y } = action;
		let { cx, cy } = action;
		beaconsExecuted = {};
		if (isInvalidCoords(x, y)) return false;
		const tileDef = tileDefs[y * cols + x];
		if (action.action == 'mine') {
			tileDef.tileStatus = 2;
			const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
			if (beaconPart && beaconPart.activation == 'dig' && !beaconPart.active) {
				if (!setBeaconPartActive(tileDef, beacons[tileDef.miscId], beaconPart, true)) return false;
			}
		} else if (action.action == 'use_beacon') {
			const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
			if (!beaconPart) return false;
			if (!setBeaconPartActive(tileDef, beacons[tileDef.miscId], beaconPart, !beaconPart.active)) return false;
		} else if (action.action == 'use_teleport') {
			const teleport = teleports[tileDef.teleportId];
			const target = teleport && teleports[teleport.target_teleport_id];
			if (!teleport || !target) return false;
			const beacon = beacons[target.beacon_id];
			if (beacon && !executeBeaconActions(beacon)) return false;
			if (!action.pet) {
				cx = target.column;
				cy = target.row;
			}
		} else if (action.action == 'leave_mine') {
			if (action.loc_id != lid || action.level != fid) return false;
		} else if (action.action == 'pick_child' || action.action == 'pick_npc') {
			delete tileDef.npcId;
			delete tileDef.npcLoot;
		} else if (action.action == 'manipulate_object') {
			tileDef.draggableStatus = ((tileDef.draggableStatus - 1 + (action.direction == 'right' ? 1 : 3)) % 4) + 1;
			// check beacon
			const beaconPart = tileDef.miscType == 'B' && getBeaconPart(tileDef.miscId, tileDef.beaconPart);
			if (beaconPart && !beaconPart.active && (beaconPart.activation == 'pit' || beaconPart.activation == 'push')) {
				if (beaconPart.req_drag == 0 || (beaconPart.req_drag == tileDef.draggableId && isRequiredOrientation(beaconPart, tileDef.draggableStatus))) {
					setBeaconPartActive(tileDef, beacons[tileDef.miscId], beaconPart, true);
				} else if (beaconPart.activation == 'pit') {
					return true;
				}
			}
		} else if (action.action == 'change_level') {
			const id = action.exit_id;
			const obj = asArray(action.direction == 'down' ? mine.exits : mine.entrances).find((e) => e.def_id == id);
			if (!obj) return false;
			cx = obj.column;
			cy = obj.row;
		} else if (action.action == 'drag_object') {
			const draggableId = tileDef.draggableId;
			const draggable = draggables[draggableId];
			if (!draggable) return false;
			let beaconPart = tileDef.miscType == 'B' && getBeaconPart(tileDef.miscId, tileDef.beaconPart);
			if (beaconPart && beaconPart.active && beaconPart.activation == 'push' && beaconPart.type == 'two-way') {
				if (beaconPart.req_drag == 0 || (beaconPart.req_drag == draggableId && isRequiredOrientation(beaconPart, tileDef.draggableStatus))) {
					setBeaconPartActive(tileDef, beacons[tileDef.miscId], beaconPart, false);
				}
			}
			const { direction, type } = action;
			let dx = x, dy = y;
			const applyDirection = (_) => {
				if (direction == 'left') dx--;
				else if (direction == 'right') dx++;
				else if (direction == 'up') dy--;
				else if (direction == 'down') dy++;
				else dx = -1;
			};
			applyDirection();
			if (isInvalidCoords(dx, dy)) return false;
			const dest = tileDefs[dy * cols + dx];
			dest.draggableId = draggableId;
			dest.draggableStatus =
				+draggable.rotate == 1 && (action.direction == 'right' || action.direction == 'left')
					? ((tileDef.draggableStatus - 1 + (action.direction == 'right' ? 1 : 3)) % 4) + 1
					: tileDef.draggableStatus;
			delete tileDef.draggableId;
			delete tileDef.draggableStatus;
			// check pit
			beaconPart = dest.miscType == 'B' && getBeaconPart(dest.miscId, dest.beaconPart);
			if (beaconPart && !beaconPart.active && (beaconPart.activation == 'pit' || beaconPart.activation == 'push')) {
				if (beaconPart.req_drag == 0 || (beaconPart.req_drag == draggableId && isRequiredOrientation(beaconPart, dest.draggableStatus))) {
					setBeaconPartActive(dest, beacons[dest.miscId], beaconPart, true);
				} else if (beaconPart.activation == 'pit') {
					return true;
				}
			}
			if (type == 'push') {
				cx = x;
				cy = y;
			} else if (type == 'pull') {
				applyDirection();
				cx = dx;
				cy = dy;
			} else {
				return false;
			}
		} else {
			return false;
		}
		if (cx !== undefined) {
			if (isInvalidCoords(cx, cy)) return false;
			mine.cur_column = cx;
			mine.cur_row = cy;
		}
		return true;
	};
	const wrongAction = asArray(base.actions).find((action) => !executeAction(action));
	if (wrongAction) console.log(wrongAction);
	for (const tileDef of tileDefs.filter((t) => t.toDo)) computeTile(tileDef);

	// Add beacon requirements as quest loot
	// for (const beaconPart of Object.values(beaconParts).filter(b => !b.active && b.req_material > 0)) {
	//     addQuestDrop(lid, 'token', beaconPart.req_material, 'beacon');
	// }
	for (const floor of floors) {
		for (const beacon of asArray(floor.beacons && floor.beacons.beacon)) {
			for (const beaconPart of asArray(beacon.parts && beacon.parts.part).filter((b) => b.req_material > 0)) {
				addQuestDrop(lid, 'token', beaconPart.req_material, 'beacon');
			}
		}
	}
	allQuestDropsFlags[`${lid}_${fid}`] = Object.keys(allQuestDrops[lid] || {}).length;

	// Store beacon active
	tileDefs
		.filter((t) => t.miscType == 'B')
		.forEach((tileDef) => {
			const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
			if (beaconPart) tileDef.beaconActive = beaconPart.active;
		});

	// Check loot
	const questDrops = (!isRepeatable && allQuestDrops[mine.id]) || {};
	const eventTokens = allEventTokens[eid] || {};
	deleteWormsFrom(questDrops);
	const materialDrops = {};
	gui.getArrayOfInt(listMaterial).forEach((id) => {
		let key = 'material_' + id;
		if (id == -1 || id == -2) key = 'system_' + -id;
		if (id == -3) key = 'usable';
		if (id == -4) {
			allEventMaterials.forEach((id) => (materialDrops['material_' + id] = true));
			return;
		}
		if (id == -5) key = 'pet';
		if (key == 'material_1') key = 'coins';
		materialDrops[key] = true;
	});
	const noAchievements = !hasOption(OPTION_ACHIEVEMENT);
	for (const tileDef of tileDefs) {
		delete tileDef.isSpecial;
		delete tileDef.isQuest;
		delete tileDef.isPhoto;
		delete tileDef.isMaterial;
		delete tileDef.isPet;
		tileDef.isTile = tileDef.tileSubtype && tileDef.tileSubtype in subtiles && tileDef.stamina >= 0 && tileDef.tileStatus == 0 && !showBackground;
		let hasLoot = false;
		if (tileDef.isTile && tileDef.tloot) {
			tileDef.loot = tileDef.tloot;
			delete tileDef.tloot;
			hasLoot = true;
		}
		if (tileDef.miscType == 'B') {
			const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
			if (!beaconPart.active && (beaconPart.activation == 'use' || beaconPart.activation == 'door' || beaconPart.activation == 'dig')) {
				let loot = [];
				const beacon = beacons[tileDef.miscId];
				for (const action of asArray(beacon.actions.action).filter((a) => a.layer == 'loot')) {
					for (const tile of splitString(action.tiles, ';')) {
						const [y, x] = tile.split(',').map((v) => +v);
						if (!isInvalidCoords(x, y)) {
							const tileDef2 = tileDefs[y * cols + x];
							if (tileDef2.tloot) loot = loot.concat(tileDef2.tloot);
						}
					}
				}
				if (loot.length) {
					hasLoot = true;
					tileDef.loot = (tileDef.loot || []).concat(loot);
				}
			}
		}
		if (isPreview) hasLoot = tileDef.loot && tileDef.loot.length > 0;
		if (isValidTile(tileDef, tileDef.miscType == 'B' && getBeaconPart(tileDef.miscId, tileDef.beaconPart)) || (isPreview && hasLoot)) {
			if (tileDef.isTile && tileDef.pet && 'pet' in materialDrops) tileDef.isPet = true;
			if (hasLoot && tileDef.loot) tileDef.hasLoot = true;
			const loot = [].concat((hasLoot && tileDef.loot) || [], (tileDef.npcId && tileDef.npcLoot) || []);
			let numCoins = 0;
			for (const drop of tileDef.show && loot ? loot : []) {
				if (drop.skip || (drop.forAdmin && !isAdmin)) continue;
				const key = drop.type + '_' + drop.id;
				if (key == 'material_1') numCoins++;
				let sd = specialDrops[key];
				if (sd === 'A' && noAchievements) sd = undefined;
				const isQuest = key in questDrops || sd === 'Q' || drop.type == 'tablet' || (sd === undefined && drop.type == 'token' && drop.id in eventTokens);
				const isSpecial = !isQuest && !isTower && (sd !== undefined || drop.type == 'artifact');
				const isPhoto = drop.type == 'photo';
				const isMaterial = key in materialDrops || drop.type in materialDrops;
				if (isSpecial) tileDef.isSpecial = true;
				if (isQuest) tileDef.isQuest = true;
				if (isPhoto) tileDef.isPhoto = true;
				if (isMaterial) tileDef.isMaterial = true;
			}
			if (numCoins > 0 && 'coins' in materialDrops && (numCoins > 1 || tileDef.stamina == 0)) tileDef.isMaterial = true;
		}
	}
	{
		let numTiles = 0, cost = 0, numSpecial = 0, numQuest = 0, numPhoto = 0, numMaterial = 0, numTilesPet = 0, costPet = 0;
		tileDefs
			.filter((tileDef) => tileDef.show)
			.forEach((tileDef) => {
				if (tileDef.isTile) {
					if (tileDef.pet) {
						numTilesPet++;
						costPet += (tileDef.stamina || 0);
					} else {
						numTiles++;
						cost += tileDef.stamina;
					}
				}
				if (tileDef.isSpecial) numSpecial++;
				if (tileDef.isQuest) numQuest++;
				if (tileDef.isPhoto) numPhoto++;
				if (tileDef.isMaterial) numMaterial++;
			});
		mine._t = { numTiles, cost, numSpecial, numQuest, numPhoto, numMaterial, numTilesPet, costPet };
	}

	// Transparency
	for (const tileDef of tileDefs) tileDef.solid = 0;
	for (const tileDef of tileDefs) {
		const { x, y } = tileDef;
		if (tileDef.draggableId) tileDef.solid |= 1;
		if (tileDef.miscType == 'B') {
			const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
			const activation = beaconPart && beaconPart.activation;
			if (activation == 'pit' && !beaconPart.active) tileDef.solid |= 1;
			if (
				activation == 'use' ||
				activation == 'sensor' ||
				((activation == 'door_r' || activation == 'door') && !beaconPart.active)
			)
				tileDef.solid |= 16;
		}
		if (tileDef.backgroundAddonId) {
			const addon = addons[tileDef.backgroundAddonId];
			if (addon && +addon.solid) {
				const height = +addon.rows;
				const width = +addon.columns;
				let index = y * cols + x;
				for (let dy = 0; dy < height; dy++) {
					for (let dx = 0; dx < width; dx++)
						if (index + dx < tileDefs.length) tileDefs[index + dx].solid |= 2;
					index += cols;
				}
			}
		}
		if (tileDef.tileStatus != 2) {
			tileDef.solid |= 32;
			const tile = tiles[tileDef.tileId];
			if (tile && +tile.translucent == 0) tileDef.solid |= 4;
		}
		if (tileDef.miscType == 'H') tileDef.solid |= 64;
		if (tileDef.npcId) tileDef.solid |= 128;
	}

	mine._p.vis = getViewed(tileDefs, setAllVisibility);
	if (isUnclear) {
		const edits = mine._p.ue || {};
		unclearTilesToMix = {
			lid,
			fid,
			tiles: tileDefs.filter((tileDef) => {
				const edit = edits[getTileKey(tileDef.x, tileDef.y)];
				const m = edit ? edit.m : undefined;
				return m === undefined ? isTileMixable(tileDef) : m === 1;
			})
		};
	}

	return data;
}

async function addExtensionImages() {
	addImage(IMG_DIGGY);
	addImage(IMG_DEFAULT_GC);
	addImage(IMG_DEFAULT_NPC);
	addImage(IMG_SHADOWS);
	addImage(IMG_BEAMS);
	addImage(IMG_LOGO);
	addImage(IMG_PUSH);

	if (!beamsLoaded) {
		await images[IMG_BEAMS].promise;
		const img = images[IMG_BEAMS].img;
		const canvas = gui.createCanvas(img.naturalWidth, img.naturalHeight);
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		const len = canvas.width * canvas.height * 4;
		for (let i = 1; i <= 4; i++) {
			ctx.drawImage(img, 0, 0);
			const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const data = imgData.data;
			for (let k = 0; k < len; k += 4) {
				const v = data[k];
				data[k + 0] = i == 1 || i == 2 ? 255 : 0;
				data[k + 1] = i == 1 || i == 3 || i == 4 ? 255 : 0;
				data[k + 2] = i == 3 ? 255 : 0;
				data[k + 3] = v;
			}
			ctx.putImageData(imgData, 0, 0);
			addImage(`${IMG_BEAMS}${i}`, canvas.toDataURL());
		}
		beamsLoaded = true;
	}
}

function determineCurrentMine(selectedMine) {
	const showRepeatables = hasOption(OPTION_REPEATABLES);

	const isValid = (mine) => {
		if (!mine) return null;
		const rid = mine.region;
		const locations = gui.getFile('locations_' + rid);
		const location = locations[mine.id];
		if (!location) return null;
		const isRepeatable = +location.reset_cd > 0;
		if (!showRepeatables && isRepeatable) return null;
		return mine;
	};

	let mine = isValid(selectedMine) || isValid(getLastViewedMine()) || isValid(bgp.Data.lastEnteredMine);
	if (!mine) {
		Object.values(bgp.Data.mineCache).forEach((mines) => {
			Object.values(mines).forEach((m) => {
				if (m.time > (mine ? mine.time : 0) && isValid(m)) mine = m;
			});
		});
	}
	return mine;
}

function setWaitHandler() {
	if (waitHandler) return;
	waitHandler = setTimeout(() => { gui.wait.show(); }, 2000);
}
function clearWaitHandler() {
	if (waitHandler) clearTimeout(waitHandler);
	waitHandler = null;
	gui.wait.hide();
}

function getMineList(groupLocations, showRepeatables, currentMine, selection) {
	selection = ',' + asArray(selection).join(',') + ',';
	const options = {};
	const addOption = (id, rid) => {
		if (id in options) return;
		const locations = gui.getFile('locations_' + rid);
		const location = locations && locations[id];
		if (!location) return;
		const isRepeatable = +location.reset_cd > 0;
		if (!showRepeatables && isRepeatable) return;
		const eid = rid == 0 && +location.event_id;
		const name = getLocationName(id, locations[id]);
		let groupName = '';
		if (groupLocations) {
			if (isLocationTower(id, location)) groupName = getTowerEventName();
			else if (eid) groupName = gui.getObjectName('event', eid);
			else {
				groupName = gui.getObjectName('region', rid);
				const filter = location && mapFilters[location.filter];
				if (filter) groupName += ' \u2013 ' + filter;
			}
		}
		options[id] = [groupName + ' ' + name, `<option value="${id}"${selection.indexOf(',' + id + ',') >= 0 ? ' selected' : ''}>${name}</option>`, groupName];
	};
	if (currentMine) addOption(currentMine.id, currentMine.region);
	Object.values(bgp.Data.mineCache).forEach((mines) =>
		Object.values(mines).forEach((m) => addOption(m.id, m.region))
	);
	const values = Object.values(options);
	values.sort((a, b) => gui.sortTextAscending(a[0], b[0]));
	let htm = '';
	let lastGroupName = '';
	values.forEach((arr) => {
		if (groupLocations && arr[2] != lastGroupName) {
			if (lastGroupName) htm += `</optgroup>`;
			lastGroupName = arr[2];
			htm += Html`<optgroup label="${lastGroupName}">`;
		}
		htm += arr[1];
	});
	if (lastGroupName) htm += `</optgroup>`;
	return htm;
}

async function processMine(selectedMine, args) {
	currentData = await calcMine(determineCurrentMine(selectedMine), { addImages: true });
	if (!currentData) return;
	setLastViewedMine(currentData.mine);
	setWaitHandler();

	const htm = getMineList(hasOption(OPTION_GROUPLOCATIONS), hasOption(OPTION_REPEATABLES), currentData.mine, currentData.lid);
	Html.set(container.querySelector('[data-id="lid"]'), htm);

	const regionName = gui.getObjectName('region', currentData.rid);
	let caption, info;
	if (isLocationTower(currentData.lid, currentData.location)) {
		caption = getTowerEventName();
		info = getLocationName(currentData.lid, currentData.location);
	} else if (currentData.eid) {
		caption = gui.getMessage('gui_event') + (currentData.segmented ? ' \u2013 ' + regionName : '');
		info = gui.getObjectName('event', currentData.eid).replace(/\s+/g, ' ') + (currentData.isRepeatable ? '\n' + gui.getString('MAP002') : '');
	} else {
		const regionId = +currentData.location.region_id;
		caption = (regionId == 99 ? gui.getObjectName('region', regionId ) + ' \u2013 ' : '') + regionName;
		info = mapFilters[currentData.location.filter] || '';
	}
	Html.set(container.querySelector('[data-id="info-caption"]'), Html(caption));
	const divInfo = container.querySelector('[data-id="info"]');
	Html.set(divInfo, Html(info));

	tableTileInfo.classList.toggle('is-repeatable', +currentData.location.reset_cd > 0);

	divInfo.parentNode.classList.toggle('hidden', !hasOption(OPTION_LOCATIONINFO));
	selectRegion.parentNode.classList.toggle('hidden', !currentData || !currentData.segmented || !hasOption(OPTION_REGIONSELECTOR));
	selectFriendship.parentNode.classList.toggle('hidden', !currentData || !+currentData.location.pet || !hasOption(OPTION_FRIENDSHIPSELECTOR));
	function setDefaultOption(select, value) {
		const option = select.querySelector('option[value=""]');
		option.textContent = gui.getMessage('equipment_current') + (value ? ` (${Locale.formatNumber(value)})` : '');
	}
	setDefaultOption(selectRegion, currentData.d_rid);
	setDefaultOption(selectFriendship, currentData.d_friendship);

	await addExtensionImages();
	// for debugging purposes
	if (isAdmin) window.mineData = currentData;
	// window.subtiles = subtiles;
	// window.allQuestDrops = allQuestDrops;
	await drawMine(args);
}

function updateTableFlags() {
	if (!map) return;
	const state = getState();
	gui.updateTabState(tab);
	showBackground = state.show.includes('k');
	showBeacon = state.show.includes('e');
	showTeleportArrow = state.show.includes('t');
	showDiggy = state.show.includes('d');
	showExitMarker = state.show.includes('x') && !state.show.includes('x2');
	showTeleportMarker = state.show.includes('x') && !state.show.includes('x1');
	showDebug = state.show.includes('g');
	showAll = state.show.includes('a');
	showSolution = state.show.includes('s');
	showFull = state.show.includes('f');
	showTiles = state.show.includes('l');
	showViewed = state.show.includes('v');
	showBonus = state.show.includes('b');
	showMixed = state.show.includes('m');
	showNotableLoot = state.show.includes('n') || showMixed;
	showOpaque = state.show.includes('o');
	showUncleared = state.show.includes('u');
	showColors = state.show.includes('c');
	map.classList.toggle('show_beacon', showBeacon);
	map.classList.toggle('show_tiles', !showBackground && showTiles);
	map.classList.toggle('show_bonus', !showBackground && showBonus);
	map.classList.toggle('show_opaque', showOpaque);
	map.classList.toggle('show_edits', isEditMode);
	container.querySelector('.toolbar button[data-action="edit"]').classList.toggle('activated', isEditMode);
}

function setMapVisibility(flag) {
	canvas.style.display = flag ? '' : 'none';
	table.style.display = flag ? '' : 'none';
}

async function drawMine(args) {
	const themeSettings = theme.settings;
	setMapVisibility(false);
	setWaitHandler();
	gui.updateTabState(tab);
	updateTableFlags();
	let base = currentData && currentData.mine;
	if (showUncleared && base && base._p.o) base = base._p.o;
	const isUncleared = base ? base !== currentData.mine : false;
	const isPreview = currentData.mine.time === 0;
	container.classList.toggle('is_uncleared', isUncleared);
	container.classList.toggle('is_preview', isPreview);
	if (!currentData) {
		clearWaitHandler();
		return;
	}

	const { lid, fid } = currentData;
	const numQuestDrops = Object.keys(allQuestDrops[lid] || {}).length;
	for (const floorId of currentData.floorNumbers) {
		const found = findMine(lid, floorId);
		if (found && floorId != fid) {
			const recalc =
				(found.processed || 0) < found.time || numQuestDrops !== allQuestDropsFlags[`${lid}_${floorId}`];
			if (recalc) await calcMine(found);
		}
	}
	if (Object.keys(allQuestDrops[lid] || {}).length !== allQuestDropsFlags[`${lid}_${fid}`])
		currentData = await calcMine(currentData.mine);

	const { rows, cols, rid, beaconParts, doors, hints, teleports, isRepeatable } = currentData;

	const tileDefs = [].concat(currentData.tileDefs);
	if (!showUncleared && showMixed) {
		if (unclearTilesToMix.lid != lid || unclearTilesToMix.fid != fid) {
			unclearTilesToMix = {};
			showUncleared = true;
			await calcMine(currentData.mine);
			showUncleared = false;
		}
		if (unclearTilesToMix && unclearTilesToMix.tiles)
			unclearTilesToMix.tiles.forEach(
				(tileDef) => (tileDefs[tileDef.tileIndex] = Object.assign({ mixed: true }, tileDef))
			);
	}

	const location = currentData.location|| getLocation(lid);
	const isTower = isLocationTower(lid, location);
	const eid = currentData.eid;
	const event = eid && gui.getObject('event', eid);
	const isSpecialWeekEvent = event && !gui.getArrayOfInt(event.collections).find(v => v > 0)
	const showLoot = isAdmin || isTower || !isSpecialWeekEvent || !isRepeatable;

	canvas.width = cols * TILE_SIZE;
	canvas.height = rows * TILE_SIZE;
	setCanvasZoom();
	document.body.classList.add('map-rendered');

	const tbody = table.querySelector('tbody');
	Html.set(tbody, '');
	for (let y = 0; y < rows; y++) {
		const row = tbody.insertRow();
		for (let x = 0; x < cols; x++) row.insertCell();
	}
	table.style.width = cols * TILE_SIZE + 'px';
	table.style.height = rows * TILE_SIZE + 'px';
	titles = {};

	bgp.Data.requiresFullLanguage = true;
	await (bgp.Data.checkLocalization() || Promise.resolve(0));
	await Promise.all(Object.values(images).map((i) => i.promise));

	// const specialColors = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1], [1, .7, 0], [.7, .7, 1]];
	const specialColors = Array.from({ length: 20}, (_, n) => ThemeEditor.toTripletColor(themeSettings.marker.color[n]));

	const getBeaconPart = (beaconId, partId) => beaconParts[`${beaconId}_${partId}`];
	const getMiscItem = (tileDef) => {
		if (tileDef.miscType == 'N' || tileDef.miscType == 'X') return doors[fid + '_' + tileDef.miscType.toLowerCase() + '_' + tileDef.miscId];
		if (tileDef.miscType == 'H') return hints[tileDef.miscId];
		if (tileDef.miscType == 'B') return getBeaconPart(tileDef.miscId, tileDef.beaconPart);
	};

	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	ctx.lineWidth = 1;
	const transform = (cx, cy, flipX, flipY, rotation) => {
		ctx.translate(cx, cy);
		if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
		if (rotation) ctx.rotate(rotation);
		ctx.translate(-cx, -cy);
	};

	const addonCache = {};

	const drawAddon = (x, y, item, img, dx, dy) => {
		if (img) {
			const width = +item.columns;
			const height = +item.rows;
			const isAnimated = +item.animated;
			const sw = isAnimated ? width * TILE_SIZE : img.naturalWidth;
			const sh = isAnimated ? height * TILE_SIZE : img.naturalHeight;
			let flipX = !!+item.horizontal_flip;
			let flipY = !!+item.vertical_flip;
			// Rotation is not currently supported for non-square images (except for 180°)
			let angle = +item.rotation % 360;
			if (angle < 0) angle += 360;
			let rotation = Math.round(angle / 90) % 4;
			if (rotation >= 2) { flipX = !flipX, flipY = !flipY, rotation -= 2; }
			if (width !== height) rotation = 0;
			const W = width * TILE_SIZE, H = height * TILE_SIZE;
			const X = x * TILE_SIZE, Y = y * TILE_SIZE;
			const key = `${item.def_id}_${flipX}_${flipY}_${rotation}`;
			let canvas = addonCache[key];
			if (!canvas) {
				const cx = W / 2, cy = H / 2;
				canvas = addonCache[key] = gui.createCanvas(W, H, true);
				const ctx = canvas.getContext('2d');
				ctx.save();
				ctx.translate(cx, cy);
				if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
				if (rotation) ctx.rotate(rotation * Math.PI / 2);
				ctx.translate(-cx, -cy);
				ctx.drawImage(img, 0, 0, sw, sh, 0, 0, W, H);
				ctx.restore();
			}
			if (dx === undefined) ctx.drawImage(canvas, 0, 0, W, H, X, Y, W, H);
			else ctx.drawImage(canvas, dx * TILE_SIZE, dy * TILE_SIZE, TILE_SIZE, TILE_SIZE, X, Y, TILE_SIZE, TILE_SIZE);
		}
	};
	const drawFrame = (x, y, img, frame, flipX, flipY, rotation) => {
		const sw = img.naturalWidth;
		const columns = Math.round(sw / TILE_SIZE);
		const xpos = frame % columns;
		const ypos = Math.floor(frame / columns);
		ctx.save();
		transform((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, flipX, flipY, (rotation * Math.PI) / 2);
		ctx.drawImage(img, xpos * TILE_SIZE, ypos * TILE_SIZE, TILE_SIZE, TILE_SIZE, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
		ctx.restore();
	};
	const getImg = async (asset) => {
		const p = addImage(asset);
		if (p) await p;
		return typeof asset == 'string' && asset in images && images[asset].img;
	};
	const drawAll = async (items, key, fn) => {
		for (const tileDef of tileDefs) {
			const item = items[tileDef[key]];
			if (item) fn(tileDef.x, tileDef.y, tileDef, item, await getImg(item && item.mobile_asset));
		}
	};
	const RANDOM_CHAR = '#1';
	const addDrop = (x, y, drops, tileDef) => {
		if (!showLoot) return;
		let hasRandom = false;
		const cell = table.rows[y].cells[x];
		if (tileDef) {
			const staminaDrops = [];
			if (tileDef.stamina && !isTower) staminaDrops.push({ type: 'system', id: 1, amount: tileDef.stamina });
			if (tileDef.bonusXp) staminaDrops.push({ type: 'system', id: 1, amount: tileDef.bonusXp });
			if (tileDef.bonusEnergy) staminaDrops.push({ type: 'system', id: 2, amount: tileDef.bonusEnergy });
			drops = staminaDrops.concat(drops);
		}
		drops = drops.filter((d) => !d.hidden && (isAdmin || !d.forAdmin));
		if (isTower) {
			drops.forEach(drop => {
				const other = drops.find(d => d.type === drop.type && d.id === drop.id);
				if (other !== drop) {
					other.amount += drop.amount;
					drop.amount = 0;
				}
			});
			drops = drops.filter(drop => drop.amount > 0);
		}
		let s = drops
			.map((d) => {
				let name = gui.getObjectName(d.type, d.id);
				// if ((d.type + '_' + d.id) in forbiddenLoot) name = '???';
				if (name.startsWith('#') && d.type == 'token') name = gui.getMessage('gui_token') + name;
				const random = d.random ? ` (${RANDOM_CHAR})` : '';
				if (d.random) {
					hasRandom = true;
					cell.classList.add('tooltip-event');
					cell.classList.add('random-loot');
					cell.classList.add('rl_' + d.random);
				}
				return `\n${Locale.formatNumber(d.amount)} \xd7 ${name}${random}`;
			})
			.join('');
		if (hasRandom) {
			s += `\n${RANDOM_CHAR} = ${gui.getMessage('map_positionrandom')}`;
		}
		if (s) addTitle(x, y, gui.getMessageAndValue('gui_loot', s), true);
	};

	const drawTeleport = (teleport) => {
		const { column: sx, row: sy } = teleport;
		const target = teleports[teleport.target_teleport_id];
		if (!target) return;

		const { column: tx, row: ty } = target;
		const isBidi = target.target_teleport_id == teleport.teleport_id;
		// Show only one arrow for bidirectional teleports
		if (isBidi && sx + sy * cols > tx + ty * cols) return;

		let base = isBidi ? themeSettings['arrow2'] : themeSettings['arrow'];
		const edits = currentData.mine._p.e;
		const tKey = 'tc_' + teleport.teleport_id;
		if (edits && tKey in edits) {
			const col = specialColors[edits[tKey]];
			base = Object.assign({}, base);
			base.color = '#' + col.map((n) => Math.floor(n * 15).toString(16)).join('');
			base.border.color = '#' + col.map((n) => Math.floor((n * 15) / 4).toString(16)).join('');
		}

		const width = base.width;
		const arrowWidth = width * 3;
		const arrowHeight = Math.floor((width * 20) / 3);
		const addSegment = (p, angle, length) => [p[0] + length * Math.cos(angle), p[1] + length * Math.sin(angle)];

		const ps = [(sx + 0.5) * TILE_SIZE, (sy + 0.5) * TILE_SIZE];
		const pe = [(tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE];
		const dx = pe[0] - ps[0];
		const dy = pe[1] - ps[1];
		const angle = Math.atan2(dy, dx);
		const angle2 = Math.floor((angle / Math.PI) * 180 + 360) % 90;
		const isCorner = angle2 > 40 && angle2 < 50;

		let length = Math.sqrt(dx * dx + dy * dy);
		let p1 = ps;
		if (!isBidi) {
			length -= (4 * TILE_SIZE) / 6;
			p1 = addSegment(ps, angle, TILE_SIZE / 6);
			if (isCorner) length -= TILE_SIZE / 8;
		}

		const p2 = addSegment(p1, angle + Math.PI / 2, width);
		const p3 = addSegment(p2, angle, length - arrowHeight);
		const p4 = addSegment(p3, angle + Math.PI / 2, arrowWidth);
		const p5 = addSegment(p1, angle, length);

		const p6 = addSegment(p1, angle - Math.PI / 2, width);
		const p7 = addSegment(p6, angle, length - arrowHeight);
		const p8 = addSegment(p7, angle - Math.PI / 2, arrowWidth);

		let path;
		if (isBidi) {
			const angle2 = angle + Math.PI;
			const p9 = addSegment(p5, angle2 + Math.PI / 2, width);
			const p10 = addSegment(p9, angle2, length - arrowHeight);
			const p11 = addSegment(p10, angle2 + Math.PI / 2, arrowWidth);
			const p12 = addSegment(p5, angle2 - Math.PI / 2, width);
			const p13 = addSegment(p12, angle2, length - arrowHeight);
			const p14 = addSegment(p13, angle2 - Math.PI / 2, arrowWidth);
			path = [p1, p14, p13, p3, p4, p5, p8, p7, p10, p11];
		} else {
			path = [p2, p3, p4, p5, p8, p7, p6];
		}

		ctx.save();
		ctx.strokeStyle = base.border.color;
		ctx.fillStyle = base.color;
		ctx.lineWidth = base.border.width;
		ctx.beginPath();
		ctx.moveTo(path[0][0], path[0][1]);
		for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
		ctx.closePath();
		ctx.fill();
		if (base.border.width) ctx.stroke();
		ctx.restore();
	};

	const drawRoundRect = (x, y, width, height, radius, fill, stroke) => {
		if (typeof stroke === 'undefined') stroke = true;
		if (typeof radius === 'undefined') radius = 5;
		if (typeof radius === 'number') {
			radius = { tl: radius, tr: radius, br: radius, bl: radius };
		} else {
			const defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
			for (const side in defaultRadius) {
				radius[side] = radius[side] || defaultRadius[side];
			}
		}
		ctx.beginPath();
		ctx.moveTo(x + radius.tl, y);
		ctx.lineTo(x + width - radius.tr, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
		ctx.lineTo(x + width, y + height - radius.br);
		ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
		ctx.lineTo(x + radius.bl, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
		ctx.lineTo(x, y + radius.tl);
		ctx.quadraticCurveTo(x, y, x + radius.tl, y);
		ctx.closePath();
		if (fill) ctx.fill();
		if (stroke) ctx.stroke();
	};

	const drawTextMarker = (x, y, name, base) => {
		const TEXTMARKER_WIDTH = base.width;
		const TEXTMARKER_BORDER = base.border.width;
		const TEXTMARKER_RADIUS = Math.floor(((TEXTMARKER_WIDTH + TEXTMARKER_BORDER) * base.roundness) / 100);
		const cx = (x + 0.5) * TILE_SIZE;
		const cy = (y + 0.5) * TILE_SIZE;
		ctx.save();
		ctx.fillStyle = base.color;
		ctx.strokeStyle = base.border.color;
		ctx.lineWidth = TEXTMARKER_BORDER;
		drawRoundRect(cx - TEXTMARKER_WIDTH, cy - TEXTMARKER_WIDTH, TEXTMARKER_WIDTH * 2, TEXTMARKER_WIDTH * 2, TEXTMARKER_RADIUS, true, TEXTMARKER_BORDER > 0);
		ctx.lineWidth = 1;
		ctx.fillStyle = base.text.color;
		ctx.textAlign = 'center';
		ctx.fillText(name, cx, cy + 3, TILE_SIZE - 16);
		ctx.restore();
	};

	// Set visibility
	for (const tileDef of tileDefs) {
		tileDef.isVisible = showFull || isPreview || (showAll ? tileDef.show : showViewed ? tileDef.viewed : tileDef.visible);
	}

	// Backgrounds
	await drawAll(backgrounds, 'bgId', (x, y, tileDef, item, img) => {
		if (img) {
			ctx.drawImage(img, (x % 4) * TILE_SIZE, (y % 4) * TILE_SIZE, TILE_SIZE, TILE_SIZE, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
		}
	});

	// Background Addons
	for (const tileDef of tileDefs) delete tileDef.addonDelta;
	const setAddonInfo = (tileDef, item, flag) => {
		const { x, y } = tileDef, width = +item.columns, height = +item.rows, pos = y * cols + x;
		for (let dy = 0; dy < height && y + dy < rows; dy++) {
			let delta = dy * cols;
			for (let dx = 0; dx < width && x + dx < cols; dx++, delta++) {
				const t = tileDefs[pos + delta];
				if (flag) {
					// Check if a tile is here
					const tileIsHere = t.tileStatus == 0 && ((!showBackground && t.stamina >= 0) || t.stamina < 0);
					if (!tileIsHere) t.addonDelta = delta;
				} else delete t.addonDelta;
			}
		}
	};
	await drawAll(addons, 'backgroundAddonId', (x, y, tileDef, item, img) => {
		// A previously background addon overlaps this tile
		if (tileDef.addonDelta >= 0) return;
		if (img) setAddonInfo(tileDef, item, true);
	});
	// A foreground addon will remove the background addon on the same tile
	await drawAll(addons, 'foregroundAddonId', (x, y, tileDef, item, img) => {
		if (+item.solid && img && tileDef.tileStatus == 0 && (!showBackground || tileDef.stamina < 0))
			setAddonInfo(tileDef, item, false);
	});
	for (const tileDef of tileDefs.filter((t) => t.addonDelta >= 0)) {
		const delta = tileDef.addonDelta, dx = delta % cols, dy = (delta - dx) / cols;
		delete tileDef.addonDelta;
		const item = addons[tileDefs[tileDef.y * cols + tileDef.x - delta].backgroundAddonId];
		const img = await getImg(item && item.mobile_asset);
		if (img) drawAddon(tileDef.x, tileDef.y, item, img, dx, dy);
	}

	// Misc
	const solutionTiles = [];
	for (const tileDef of tileDefs.filter((t) => t.miscType)) {
		const { x, y } = tileDef;
		const item = getMiscItem(tileDef);
		if (!item) continue;
		const texts = [];
		const debugs = [];
		if ((tileDef.miscType == 'N' || tileDef.miscType == 'X') && (tileDef.tileStatus == 2 || showBackground)) {
			let text;
			if (tileDef.miscType == 'N' && (fid == 1 || isRepeatable)) {
				text = gui.getMessage('map_mine_exit');
			} else if (isTower) {
				text = gui.getMessage('map_goto_floor', Locale.formatNumber(+currentData.location.tower_floor + 1));
			} else if (!item.to) {
				text = gui.getMessage('map_goto_unknown');
			} else {
				const door = doors[item.to];
				const fidText = Locale.formatNumber(door.fid);
				text = gui.getMessage('map_goto_floor', fidText);
				table.rows[y].cells[x].setAttribute('data-action', `goto_${door.fid}_${door.x}_${door.y}`);
			}
			texts.push(text);
		}
		if (tileDef.miscType == 'H') {
			const hint = gui.getString(item.localization);
			texts.push(hint ? gui.getWrappedText(gui.getMessageAndValue('map_hint', '\u201c' + hint + '\u201d')) : gui.getMessage('map_hint'));
		}
		if (tileDef.miscType == 'B' && canShowBeacon) {
			const cell = table.rows[y].cells[x];
			debugs.push(`${gui.getMessage('map_beacon')} (${gui.getMessage(item.active ? 'map_active' : 'map_not_active')})`);
			// Solution should be shown anyway?
			// if (tileDef.stamina >= 0) {
			{
				let asset = '';
				let rotation = 1;
				let isHidden = false;
				if (item.req_drag) {
					const draggable = draggables[item.req_drag];
					if (draggable) {
						debugs.push(`${gui.getMessage('map_require_draggable')} #${item.req_drag}${item.req_drag_rotation != 'none' ? ` (${getReqOrientationName(item.req_drag_rotation)})` : ''}`);
						asset = draggable.mobile_asset;
						const override = draggables[asArray(draggable.overrides).filter((o) => +o.region_id == rid).map((o) => o.override_drag_id)[0]];
						if (override && override.mobile_asset in images) asset = override.mobile_asset;
						rotation = reqOrientations[item.req_drag_rotation] || 1;
					}
				}
				if (item.req_material) {
					const token = gui.getObject('token', item.req_material);
					const name = token.name_loc
						? gui.getString(token.name_loc)
						: gui.getMessage('gui_token') + '#' + item.req_material;
					debugs.push(gui.getMessageAndValue('map_require_item', (item.req_amount > 1 ? Locale.formatNumber(item.req_amount) + ' \xd7 ' : '') + name));
					asset = token.mobile_asset;
					isHidden = +token.visibility == 0;
				}
				if (item.req_light) {
					debugs.push(gui.getMessageAndValue('map_require_light', getLightColorName(item.req_light)));
				}
				if (!asset && item.activation === 'push') {
					const beacon = currentData.beacons[tileDef.miscId];
					if (asArray(beacon && beacon.actions && beacon.actions.action).find(action => action.layer === 'loot')) {
						asset = IMG_PUSH;
						rotation = 1;
					}
				}
				if (asset) {
					const url = asset.startsWith('/') ? asset : cdn_root + 'mobile/graphics/all/' + encodeURIComponent(asset) + '.png' + versionParameter;
					cell.classList.add('tooltip-event');
					let style = `background-image:url(${url})`;
					if (rotation > 1) style += `;transform:rotate(${(rotation - 1) * 90}deg)`;
					const div = Html.get(
						Html`<div class="beacon-req" data-beacon="${tileDef.miscId}" style="${style}"></div>`
					)[0];
					cell.appendChild(div);
					solutionTiles.push({ x, y, asset, rotation });
					if (showSolution && !isHidden && !(asset in images)) {
						addImage(asset);
						await images[asset].promise;
					}
				}
			}
			const activable = ['use'].includes(item.activation) && (!tileDef.beaconActive || item.type === 'two-way');
			const div = Html.get(Html`<div class="beacon beacon-${item.activation}${activable ? ' beacon-activable' : ''}"></div>`)[0];
			cell.appendChild(div);
			cell.classList.toggle('beacon-active', tileDef.beaconActive);
		}
		if (texts.length) addTitle(x, y, texts.join('\n'), true);
		if (debugs.length) addTitleDebug(x, y, debugs.join('\n'));
		const img = await getImg(item && item.mobile_asset);
		if (img) {
			if (tileDef.miscType == 'B') {
				if (tileDef.tileStatus == 2 || showBackground)
					drawFrame(x, y, img, tileDef.beaconActive ? 0 : item.frames - 1, false, false, item.rotation / 90);
			} else {
				ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE);
			}
		}
	}

	// Tiles
	await drawAll(subtiles, 'tileSubtype', (x, y, tileDef, item, img) => {
		if (!tileDef.isVisible) return;
		const cell = table.rows[y].cells[x];
		cell.classList.toggle('tile', tileDef.isTile);
		if (tileDef.isTile) {
			cell.classList.toggle('tile-w', x > 0 && tileDefs[y * cols + x - 1].isTile);
			cell.classList.toggle('tile-e', x < cols - 1 && tileDefs[y * cols + x + 1].isTile);
			cell.classList.toggle('tile-n', y > 0 && tileDefs[(y - 1) * cols + x].isTile);
			cell.classList.toggle('tile-s', y < rows - 1 && tileDefs[(y + 1) * cols + x].isTile);
		}
		if (isValidTile(tileDef, tileDef.miscType == 'B' && getBeaconPart(tileDef.miscId, tileDef.beaconPart))) {
			if (tileDef.bonusXp) cell.classList.add('xp');
			if (tileDef.bonusEnergy) cell.classList.add('energy');
			if (tileDef.stamina >= 0 && tileDef.tileStatus == 0)
				addTitle(x, y, `${gui.getMessage('map_tile')} (${gui.getMessageAndValue('gui_cost', Locale.formatNumber(tileDef.stamina))})`, true);
		}
		if (img && tileDef.tileStatus == 0 && (!showBackground || tileDef.stamina < 0)) {
			if (tileDef.tileId === 5 || tileDef.tileId === 11) {
				ctx.fillStyle = '#000';
				ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
			} else {
				ctx.save();
				transform((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, false, false, ((+item.rotation / 90) * Math.PI) / 2);
				ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
				ctx.restore();
			}
		}
	});

	// Foreground Addons
	await drawAll(addons, 'foregroundAddonId', (x, y, tileDef, item, img) => {
		if (tileDef.tileStatus == 0 && (!showBackground || tileDef.stamina < 0)) drawAddon(x, y, item, img);
	});

	// Shadows
	const getShadows = (tileDef) => {
		const { x, y } = tileDef;
		const index = x + y * cols;
		const checkTop = y > 0;
		const checkRight = x < cols - 1;
		const checkBottom = y < rows - 1;
		const checkLeft = x > 0;
		return (
			0 +
			(checkTop && tileDefs[index - cols].shadow ? 1 : 0) +
			(checkRight && tileDefs[index + 1].shadow ? 2 : 0) +
			(checkBottom && tileDefs[index + cols].shadow ? 4 : 0) +
			(checkLeft && tileDefs[index - 1].shadow ? 8 : 0) +
			(checkTop && checkLeft && tileDefs[index - cols - 1].shadow ? 16 : 0) +
			(checkTop && checkRight && tileDefs[index - cols + 1].shadow ? 32 : 0) +
			(checkBottom && checkRight && tileDefs[index + cols + 1].shadow ? 64 : 0) +
			(checkBottom && checkLeft && tileDefs[index + cols - 1].shadow ? 128 : 0)
		);
	};
	const shadows = [
		null,
		[0, 0, 12],
		[0, 1, 9],
		[1, 0, 8],
		[0, 2, 3],
		[2, 0, 0],
		[1, 1, 1],
		[3, 0, 0],
		[0, 3, 6],
		[1, 3, 4],
		[2, 1, 0],
		[3, 3, 0],
		[1, 2, 2],
		[3, 2, 0],
		[3, 1, 0],
		[4, 0, 0]
	];
	const imgShadow = images[IMG_SHADOWS].img;
	for (const tileDef of tileDefs.filter(
		(t) => t.tileStatus == 2 || (showBackground && t.tileStatus == 0 && t.stamina >= 0)
	))
		tileDef.shadow = 0;
	for (const tileDef of tileDefs.filter(
		(t) => t.isVisible && (t.solid & !32) == 0 && !(t.shadow > 0 && t.tileStatus == 0)
	)) {
		// if (tileDef.shadow && tileDef.tileStatus != 2) continue;
		const { x, y } = tileDef;
		const shadow = getShadows(tileDef);
		const shadow1 = shadow & 15;
		let shadow2 = shadow >> 4;
		if (shadow1 > 0) {
			drawFrame(x, y, imgShadow, shadows[shadow1][0], false, false, shadows[shadow1][1]);
			shadow2 = shadow2 & shadows[shadow1][2];
		}
		if (shadow2 > 0) {
			drawFrame(x, y, imgShadow, shadows[shadow2][0] + 5, false, false, shadows[shadow2][1]);
		}
	}

	// Static Addons
	await drawAll(addons, 'staticAddonId', (x, y, tileDef, item, img) => {
		// Clear any static addon that overlaps this one
		const width = +item.columns;
		const height = +item.rows;
		for (let sy = 0; sy < height; sy++) {
			for (let sx = 0; sx < width; sx++) {
				if (sx > 0 || sy > 0) delete tileDefs[(y + sy) * cols + x + sx].staticAddonId;
			}
		}
		drawAddon(x, y, item, img);
	});

	// Draggables
	await drawAll(draggables, 'draggableId', async (x, y, tileDef, item, img) => {
		if (!tileDef.isVisible) return;
		const override = draggables[asArray(item.overrides).filter((o) => +o.region_id == rid).map((o) => o.override_drag_id)[0]];
		const img2 = await getImg(override && override.mobile_asset);
		if (img2) img = img2;
		// if (override && override.mobile_asset in images) img = images[override.mobile_asset];
		const cost = override ? +override.stamina : +item.stamina;
		let title = `${gui.getMessage('map_draggable')} #${tileDef.draggableId} (${getOrientationName(tileDef.draggableStatus)})`;
		if (item.type == 'light') title += '\n' + gui.getMessageAndValue('map_emitter', getLightColorName(item.color_light));
		if (item.type == 'mirror') title += '\n' + gui.getMessage('map_mirror');
		if (item.type == 'filter') title += '\n' + gui.getMessageAndValue('map_filter', getLightColorName(item.color_filter));
		if (+item.moveable == 0 && +item.manipulate == 0) {
			title += '\n' + gui.getMessage('map_fixed');
		} else {
			if (+item.moveable) {
				title += '\n' + gui.getMessage('map_can_move');
				if (cost > 0) title += ' (' + gui.getMessageAndValue('gui_energy', Locale.formatNumber(cost)) + ')';
			}
			if (+item.manipulate) title += '\n' + gui.getMessage('map_can_rotate');
		}
		addTitle(x, y, title, true);
		const segmentedItem = draggables[asArray(item.overrides).filter((o) => +o.region_id == rid).map((o) => o.override_drag_id)[0]];
		const img3 = await getImg(segmentedItem && segmentedItem.mobile_asset);
		if (img3) img = img3;
		// if (segmentedItem && segmentedItem.mobile_asset) img = images[segmentedItem.mobile_asset].img;
		if (img) {
			ctx.save();
			transform((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, false, false, ((tileDef.draggableStatus - 1) * Math.PI) / 2);
			ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE);
			ctx.restore();
		}
	});

	// Npcs
	await drawAll(npcs, 'npcId', (x, y, tileDef, item, img) => {
		if (!tileDef.isVisible) return;
		const isGC = +item.pick_child;
		addTitle(x, y, gui.getMessage(isGC ? 'map_godchild' : 'map_npc'), true);
		if (item.idle_text) {
			const hint = gui.getString(item.idle_text);
			if (hint) addTitle(x, y, gui.getMessageAndValue('map_says', gui.getWrappedText('\u201c' + hint + '\u201d')));
		}
		const isPlaceholder = !img || isGC;
		if (isPlaceholder) img = images[isGC ? IMG_DEFAULT_GC : IMG_DEFAULT_NPC].img;
		const width = +item.columns;
		const height = +item.rows * 1.15;
		const sw = img.naturalWidth;
		const sh = img.naturalHeight;
		const factorX = isPlaceholder ? 1 : height / sh / (width / sw);
		// console.log(width, height, sw, sh, rx, ry);
		ctx.save();
		transform((x + width / 2) * TILE_SIZE, (y + height / 2) * TILE_SIZE, item.orientation == 'right', false, 0);
		// ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - sh);
		ctx.drawImage(img, 0, 0, sw, sh, x * TILE_SIZE, y * TILE_SIZE - (height - 1) * TILE_SIZE, width * TILE_SIZE * factorX, height * TILE_SIZE);
		ctx.restore();
		if (tileDef.npcLoot && tileDef.npcLoot.length) {
			addDrop(x, y, tileDef.npcLoot);
		}
	});

	// Apply grayscale effect
	const isGrayscale = (+currentData.floor.params_mask & 2) > 0;
	checks.forEach((el) => {
		if (el.getAttribute('data-flags') == 'C') el.disabled = !isGrayscale;
	});
	if (!showColors && isGrayscale) {
		const imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
		const pixels = imgData.data;
		const length = pixels.length;
		for (let i = 0; i < length; i += 4) {
			const lightness = (3 * pixels[i] + 4 * pixels[i + 1] + pixels[i + 2]) >>> 3;
			pixels[i] = pixels[i + 1] = pixels[i + 2] = lightness;
		}
		ctx.putImageData(imgData, 0, 0);
	}

	// from this point, only OVERLAYS should be applied

	// Special tiles (with overlapped colors)
	{
		const tilesByPosition = {};
		const getTileAt = (x, y) => {
			const key = getTileKey(x, y);
			let tile = tilesByPosition[key];
			if (!tile) tile = tilesByPosition[key] = { x1: x * TILE_SIZE, y1: y * TILE_SIZE, corners: [] };
			return tile;
		}
		const hex2 = (n) => {
			const c = Math.round(n * 255).toString(16);
			return c.length == 1 ? '0' + c : c;
		};
		const setCorner = (x, y, index, color) => {
			const tile = getTileAt(x, y);
			let arr = tile.corners[index];
			if (!arr) arr = tile.corners[index] = [];
			arr.push(color);
		};
		const SW = 4;
		const unclearEdits = currentData.mine._p.ue || {}, edits = currentData.mine._p.e || {};
		const specialColor = ThemeEditor.toTripletColor(themeSettings.marker.special);
		const questColor = ThemeEditor.toTripletColor(themeSettings.marker.quest);
		const photoColor = ThemeEditor.toTripletColor(themeSettings.marker.photo);
		const materialColor = ThemeEditor.toTripletColor(themeSettings.marker.material);
		const petColor = ThemeEditor.toTripletColor(themeSettings.marker.pet);
		const SIZE_ALT = Math.floor((TILE_SIZE + SW * 2) / 3) - SW;
		const styles = {
			0: {
				outer: (x1, y1) => {
					ctx.fillRect(x1, y1 - SW, TILE_SIZE, SW);
					ctx.fillRect(x1, y1 + TILE_SIZE, TILE_SIZE, SW);
					ctx.fillRect(x1 - SW, y1, SW, TILE_SIZE);
					ctx.fillRect(x1 + TILE_SIZE, y1, SW, TILE_SIZE);
				},
				inner: (x1, y1) => {
					ctx.fillRect(x1, y1, TILE_SIZE, SW);
					ctx.fillRect(x1, y1 + TILE_SIZE - SW, TILE_SIZE, SW);
					ctx.fillRect(x1, y1 + SW, SW, TILE_SIZE - SW * 2);
					ctx.fillRect(x1 + TILE_SIZE - SW, y1 + SW, SW, TILE_SIZE - SW * 2);
				},
				corners: [
					[[1, 0], [0, 1], [1, 1]],
					[[-1, 0,], [0, 1], [-1, 1]],
					[[0, -1], [1, 0], [1, -1]],
					[[0, -1], [-1, 0], [-1, -1]]
				]
			},
			1: {
				outer: (x1, y1) => {
					ctx.fillRect(x1, y1 - SW, SIZE_ALT, SW);
					ctx.fillRect(x1 + TILE_SIZE - SIZE_ALT, y1 - SW, SIZE_ALT, SW);
					ctx.fillRect(x1, y1 + TILE_SIZE, SIZE_ALT, SW);
					ctx.fillRect(x1 + TILE_SIZE - SIZE_ALT, y1 + TILE_SIZE, SIZE_ALT, SW);
					ctx.fillRect(x1 - SW, y1, SW, SIZE_ALT);
					ctx.fillRect(x1 - SW, y1 + TILE_SIZE - SIZE_ALT, SW, SIZE_ALT);
					ctx.fillRect(x1 + TILE_SIZE, y1, SW, SIZE_ALT);
					ctx.fillRect(x1 + TILE_SIZE, y1 + TILE_SIZE - SIZE_ALT, SW, SIZE_ALT);
				},
				inner: (x1, y1) => {
					ctx.fillRect(x1, y1, SIZE_ALT, SW);
					ctx.fillRect(x1 + TILE_SIZE - SIZE_ALT, y1, SIZE_ALT, SW);
					ctx.fillRect(x1, y1 + TILE_SIZE - SW, SIZE_ALT, SW);
					ctx.fillRect(x1 + TILE_SIZE - SIZE_ALT, y1 + TILE_SIZE - SW, SIZE_ALT, SW);
					ctx.fillRect(x1, y1, SW, SIZE_ALT);
					ctx.fillRect(x1, y1 + TILE_SIZE - SIZE_ALT, SW, SIZE_ALT);
					ctx.fillRect(x1 + TILE_SIZE - SW, y1, SW, SIZE_ALT);
					ctx.fillRect(x1 + TILE_SIZE - SW, y1 + TILE_SIZE - SIZE_ALT, SW, SIZE_ALT);
				},
				corners: [
					[[1, 0], [0, 1], [1, 1]],
					[[-1, 0,], [0, 1], [-1, 1]],
					[[0, -1], [1, 0], [1, -1]],
					[[0, -1], [-1, 0], [-1, -1]]
				]
			},
			2: {
				outer: (x1, y1) => {
					const x2 = x1 + TILE_SIZE, y2 = y1 + TILE_SIZE
					for (let x = x1, y = y1 - SW, n = 0; x < x2; x += SW, n = (n + 1) % 4)  if (n == 0 || n == 3) ctx.fillRect(x, y, SW, SW);
					for (let x = x1, y = y1 + TILE_SIZE, n = 0; x < x2; x += SW, n = (n + 1) % 4)  if (n == 0 || n == 3) ctx.fillRect(x, y, SW, SW);
					for (let x = x1 - SW, y = y1, n = 0; y < y2; y += SW, n = (n + 1) % 4)  if (n == 0 || n == 3) ctx.fillRect(x, y, SW, SW);
					for (let x = x1 + TILE_SIZE, y = y1, n = 0; y < y2; y += SW, n = (n + 1) % 4)  if (n == 0 || n == 3) ctx.fillRect(x, y, SW, SW);
				},
				inner: (x1, y1) => {
					const x2 = x1 + TILE_SIZE, y2 = y1 + TILE_SIZE
					for (let x = x1, y = y1, n = 0; x < x2; x += SW, n = (n + 1) % 4)  if (n == 0 || n == 3) ctx.fillRect(x, y, SW, SW);
					for (let x = x1, y = y1 + TILE_SIZE - SW, n = 0; x < x2; x += SW, n = (n + 1) % 4)  if (n == 0 || n == 3) ctx.fillRect(x, y, SW, SW);
					for (let x = x1, y = y1, n = 0; y < y2; y += SW, n = (n + 1) % 4)  if (n == 0 || n == 3) ctx.fillRect(x, y, SW, SW);
					for (let x = x1 + TILE_SIZE - SW, y = y1, n = 0; y < y2; y += SW, n = (n + 1) % 4)  if (n == 0 || n == 3) ctx.fillRect(x, y, SW, SW);
				},
				corners: [
					[[1, 0], [0, 1], [1, 1]],
					[[-1, 0,], [0, 1], [-1, 1]],
					[[0, -1], [1, 0], [1, -1]],
					[[0, -1], [-1, 0], [-1, -1]]
				]
			}
		}
		tileDefs.forEach((tileDef) => {
			const { x, y } = tileDef, tileKey = getTileKey(x, y);
			let cell = null;
			const getCell = () => cell || (cell = table.rows[y].cells[x]);
			let style = 0;
			const getColor = (tDef) => {
				if (!tDef.isVisible) return null;
				const edit = tDef.mixed || isUncleared ? unclearEdits[tileKey] : edits[tileKey];
				if (edit && 'o' in edit) style = edit.o;
				if (edit && 'c' in edit) {
					getCell().setAttribute('data-col', edit.c);
					return edit.c ? specialColors[edit.c] : null;
				}
				return tDef.isQuest ? questColor : tDef.isSpecial ? specialColor : tDef.isPhoto ? photoColor : tDef.isMaterial ? materialColor : tDef.isPet ? petColor : null;
			};
			if (isUncleared) {
				const edit = unclearEdits[tileKey];
				const m = edit && 'm' in edit ? edit.m : isTileMixable(tileDef) ? 1 : -1;
				if (m >= 0) getCell().setAttribute('data-mix', m);
			}
			const color = getColor(tileDef);
			if (color && showNotableLoot) {
				const x1 = x * TILE_SIZE, y1 = y * TILE_SIZE;
				const tile = getTileAt(x, y);
				tile.col = '#' + color.map(hex2).join('');
				tile.style = style;
				// Draw external immediately
				ctx.fillStyle = tile.col;
				styles[style].outer(x1, y1);
				styles[style].corners.forEach((offsets, index) => {
					offsets.forEach(([ox, oy]) => setCorner(x + ox, y + oy, index, color));
				});
			}
		});
		const outlinedTiles = Object.values(tilesByPosition);
		// Draw corners
		const offsetX = [0, TILE_SIZE - SW, 0, TILE_SIZE - SW];
		const offsetY = [0, 0, TILE_SIZE - SW, TILE_SIZE - SW];
		const drawCorner = (x1, y1, index, arr) => {
			x1 += offsetX[index];
			y1 += offsetY[index];
			let r = 0, g = 0, b = 0;
			arr.forEach(([r1, g1, b1]) => {
				(r += r1), (g += g1), (b += b1);
			});
			ctx.fillStyle = '#' + hex2(r / arr.length) + hex2(g / arr.length) + hex2(b / arr.length);
			ctx.fillRect(x1, y1, SW, SW);
		}
		outlinedTiles.forEach(({ x1, y1, corners }) => corners.forEach((arr, index) => drawCorner(x1, y1, index, arr)));
		// Draw internal
		outlinedTiles.filter(tile => tile.col).forEach(({ x1, y1, col, style }) => {
			ctx.fillStyle = col;
			styles[style].inner(x1, y1);
		});
	}

	// Entrances/Exits
	if (showExitMarker) {
		ctx.font = 'bold 40px sans-serif';
		ctx.textBaseline = 'middle';
		for (const tileDef of tileDefs.filter((t) => (t.miscType == 'N' || t.miscType == 'X') && (t.tileStatus == 2 || showBackground))) {
			const { x, y } = tileDef;
			const door = getMiscItem(tileDef);
			if (door) {
				const isEntrance = door.miscType == 'N' && (door.fid == 1 || isRepeatable);
				const name = door.name || (isEntrance ? '\u2196' : '?');
				drawTextMarker(x, y, name, isEntrance ? themeSettings.entrance : door.to || isTower ? themeSettings.door : themeSettings.doornt);
			}
		}
	}

	// Diggy
	if (base.cur_column !== undefined) {
		const { cur_column: x, cur_row: y } = base;
		const img = images[IMG_DIGGY].img;
		const sh = img.naturalHeight;
		if (showDiggy) {
			ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - sh);
		}
		addTitle(x, y, `Diggy`, true);
	}

	// Solution
	(showSolution ? solutionTiles : []).forEach(async (tileDef) => {
		const img = await getImg(tileDef.asset);
		if (img) {
			const { x, y } = tileDef;
			ctx.save();
			ctx.fillStyle = themeSettings.solution.color;
			ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
			transform((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, false, false, ((tileDef.rotation - 1) * Math.PI) / 2);
			ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalWidth, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
			ctx.restore();
		}
	});

	// Beams
	const deltas = [
		[1, 0],
		[0, 1],
		[-1, 0],
		[0, -1]
	];
	const isInvalidCoords = (x, y) => y < 0 || y >= rows || x < 0 || x >= cols;
	const isTransparent = (x, y) => (tileDefs[y * cols + x].solid & 21) == 0;
	const mirrors = {
		mirror12: 1,
		mirror13: 4,
		mirror23: 2,
		mirror24: 1,
		mirror31: 2,
		mirror34: 3,
		mirror41: 4,
		mirror42: 3
	};
	await drawAll(draggables, 'draggableId', (x, y, tileDef, item, _img) => {
		if (item.type == 'light') {
			let color = +item.color_light;
			let rotation = tileDef.draggableStatus;
			const beams = [];
			let transparent = true;
			for (; ;) {
				const [dx, dy] = deltas[rotation - 1];
				x += dx;
				y += dy;
				if (isInvalidCoords(x, y)) break;
				tileDef = tileDefs[y * cols + x];
				item = tileDef.draggableId && draggables[tileDef.draggableId];
				if (item) {
					transparent = false;
					if (item.type == 'filter') {
						if (beams.length) beams[beams.length - 1].filter = true;
						transparent = true;
						color = +item.color_filter;
						continue;
					}
					rotation = mirrors[item.type + tileDef.draggableStatus + rotation];
					if (!rotation) break;
					beams.push({ x, y, color, frame: 3, rotation: (tileDef.draggableStatus % 4) + 1 });
					continue;
				}
				transparent = isTransparent(x, y);
				if (!transparent) break;
				beams.push({ x, y, color, frame: 1, rotation });
			}
			const lastBeam = beams.length && beams[beams.length - 1];
			if (!transparent && lastBeam && lastBeam.frame == 1 && !lastBeam.filter) lastBeam.frame = 2;
			if (beams.length && beams[0].frame == 1) beams[0].frame = 0;
			for (const beam of beams) {
				drawFrame(beam.x, beam.y, images[`${IMG_BEAMS}${beam.color}`].img, beam.frame, false, false, beam.rotation - 1);
			}
		}
	});

	// Teleports (where only one end is hidden)
	{
		const edits = currentData.mine._p.e || {};
		for (const tileDef of tileDefs.filter((t) => t.teleportId)) {
			const teleport = teleports[tileDef.teleportId];
			const target = teleport && teleports[teleport.target_teleport_id];
			if (!teleport || !target) continue;
			const targetTileDef = tileDefs[target.row * cols + target.column];
			if (tileDef.isVisible) {
				const cell = table.rows[tileDef.y].cells[tileDef.x];
				const col = edits['tc_' + teleport.teleport_id];
				if (col) cell.setAttribute('data-tcol', col);
				addTitle(tileDef.x, tileDef.y, gui.getMessage('map_teleport'), true);
				if (targetTileDef.isVisible) {
					// Both ends are visible
					cell.setAttribute('data-action', `goto_${fid}_${targetTileDef.x}_${targetTileDef.y}`);
					cell.classList.add('teleport');
				}
			}
			if (showTeleportArrow && tileDef.isVisible != targetTileDef.isVisible) drawTeleport(teleport);
		}
	}

	// Hide tiles
	ctx.fillStyle = '#000';
	for (const tileDef of tileDefs.filter((t) => !t.isVisible)) {
		const { x, y } = tileDef;
		ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
		const cell = table.rows[y].cells[x];
		Html.set(cell, '');
		Array.from(cell.attributes)
			.map((a) => a.name)
			.filter((n) => n == 'class' || n == 'title' || n.startsWith('data-'))
			.forEach((n) => cell.removeAttribute(n));
	}

	// Opaque tiles (non transparent)
	for (const tileDef of tileDefs.filter((t) => t.isVisible && (t.solid & 21) != 0)) {
		const { x, y } = tileDef;
		table.rows[y].cells[x].classList.add('opaque');
	}
	// for (const tileDef of tileDefs.filter(t => t.isVisible && t.solid == 0)) {
	//     const { x, y } = tileDef;
	//     table.rows[y].cells[x].classList.add('walkable');
	// }

	// Teleports (where both ends are visible)
	for (const tileDef of tileDefs.filter((t) => showTeleportArrow && t.isVisible && t.teleportId)) {
		const teleport = teleports[tileDef.teleportId];
		const target = teleport && teleports[teleport.target_teleport_id];
		if (!teleport || !target) continue;
		const targetTileDef = tileDefs[target.row * cols + target.column];
		if (targetTileDef.isVisible) drawTeleport(teleport);
	}

	// Teleports marker
	if (showTeleportMarker) {
		ctx.font = 'bold 40px sans-serif';
		ctx.textBaseline = 'middle';
		for (const tileDef of tileDefs.filter((t) => t.isVisible && t.teleportId)) {
			const teleport = teleports[tileDef.teleportId];
			const target = teleport && teleports[teleport.target_teleport_id];
			if (!teleport || !target) continue;
			drawTextMarker(tileDef.x, tileDef.y, teleport.name, themeSettings.teleport);
		}
	}

	// Add drop info
	for (const tileDef of tileDefs.filter((t) => t.isVisible && (t.hasLoot || t.stamina >= 0))) {
		const { x, y } = tileDef;
		addDrop(x, y, tileDef.loot || [], tileDef);
	}

	// Debug info
	for (const tileDef of tileDefs.filter((t) => t.isVisible)) {
		const copy = Object.assign({}, tileDef);
		delete copy.x;
		delete copy.y;
		if (copy.miscId) copy.misc = getMiscItem(copy);

		let title = JSON.stringify(copy, null, 4);
		title = title.replace(/"/g, '');
		title = title.replace(/\n{2,}/g, '\n');
		title = title.replace(/\{\n\s+/g, '{   ');
		addTitleDebug(tileDef.x, tileDef.y, title);
	}

	// Add mixed attribute
	tileDefs
		.filter((t) => t.mixed)
		.forEach((tileDef) => {
			const { x, y } = tileDef;
			const cell = table.rows[y].cells[x];
			cell.setAttribute('data-mix', 1);
		});

	// Floors, Tiles & Loot
	let htm = '';
	const total = { numTiles: 0, cost: 0, numSpecial: 0, numQuest: 0, numPhoto: 0, numMaterial: 0, numTilesPet: 0, costPet: 0 };
	let numFound = 0;
	for (const floorId of currentData.floorNumbers) {
		const found = findMine(lid, floorId);
		const _t = found && found._t;
		const visited = found && found.time > 0;
		const isCurrent = floorId == fid;
		let title = gui.getMessage(isCurrent ? 'map_floor_current' : visited ? 'map_floor_found' : 'map_floor_not_found');
		if (found && floorId <= 10) title = `${floorId || 10} = ${title}`;
		const hasIndicator = hasOption(OPTION_FLOORINDICATORS);
		let after = '';
		if (visited && _t) {
			numFound++;
			for (const key of Object.keys(total)) total[key] += _t[key] || 0;
			let arr = [], titles = [];
			const addIndicator = (num, className, text) => {
				if (num <= 0) return;
				arr.push(Html`<span class="map_ind_${className}"></span>`);
				titles.push(`${text} = ${Locale.formatNumber(num)}`);
			}
			addIndicator(_t.numTiles, 't', `${gui.getMessage('events_tiles')} (${'Diggy'})`);
			addIndicator(_t.numTilesPet, 'pet', `${gui.getMessage('events_tiles')} (${gui.getMessage('gui_pet')})`);
			addIndicator(_t.numSpecial, 's', gui.getMessage('map_special'));
			addIndicator(_t.numQuest, 'q', gui.getMessage('map_quest'));
			addIndicator(_t.numPhoto, 'p', gui.getString('QINA590'));
			addIndicator(_t.numMaterial, 'm', gui.getMessage('gui_material'));
			if (titles.length) title += `\n\n${titles.join('\n')}`;
			if (arr.length && hasIndicator) after = Html`<span class="map_ind_container">${Html.raw(arr.join(''))}</span>`;
		}
		htm += Html`<span class="${hasIndicator ? 'map_ind_main' : ''}" title="${title}"><input type="radio" data-flag="${floorId}"${isCurrent ? ' checked' : ''
			}${!visited && isAdmin && !isCurrent ? Html.raw(' style="background-color:#e8e"') : ''
			}${found || isAdmin ? '' : ' disabled'}>${after}</span>`;
	}
	const div = container.querySelector('[data-id="fid"]');
	Html.set(div, htm);
	Array.from(div.querySelectorAll('input')).forEach((e) => e.addEventListener('click', changeLevel));
	const setTable = (row, { numTiles, cost, numSpecial, numQuest, numPhoto, numMaterial, numTilesPet, costPet }, allFound) => {
		[numTiles, cost, numTilesPet, costPet, numSpecial, numQuest, numPhoto, numMaterial].forEach((n, i) => {
			const cell = row.cells[i + 1];
			Html.set(cell, Html(isNaN(n) ? '?' : (allFound ? '' : '\u2267 ') + Locale.formatNumber(n)));
			cell.style.fontWeight = n > 0 && i > 2 ? 'bold' : '';
		});
	};
	tableTileInfo.classList.toggle('has-pet', total.numTilesPet > 0 || +currentData.location.pet);
	tableTileInfo.classList.toggle('has-special', total.numSpecial > 0);
	tableTileInfo.classList.toggle('has-quest', total.numQuest > 0);
	tableTileInfo.classList.toggle('has-photo', total.numPhoto > 0);
	tableTileInfo.classList.toggle('has-material', total.numMaterial > 0);
	setTable(tableTileInfo.rows[1], currentData.mine._t, true);
	setTable(tableTileInfo.rows[2], total, numFound == currentData.floorNumbers.length);

	// Icon
	const src = `${gui.getGenerator().cdn_root}mobile/graphics/map/${currentData.location.mobile_asset}.png`;
	if (imgLocation.src != src) imgLocation.src = src;

	// Trim blank regions + add margin + add title + add logo
	{
		const EMPTY_THRESHOLD = 8;
		const isRegionEmpty = (x, y, width, height) => !ctx.getImageData(x, y, width, height).data.some((v, i) => v > EMPTY_THRESHOLD && (i & 3) != 3);
		const isTileRowEmpty = (x, y, cols) => isRegionEmpty(x * TILE_SIZE, y * TILE_SIZE, cols * TILE_SIZE, TILE_SIZE);
		const isTileColumnEmpty = (x, y, rows) => isRegionEmpty(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, rows * TILE_SIZE);
		let x1 = 0, y1 = 0, x2 = cols - 1, y2 = rows - 1;
		const margins = { top: 0, left: 0, right: 0, bottom: 0 };
		if (hasOption(OPTION_BLANKS)) {
			while (y1 < y2 && isTileRowEmpty(x1, y1, x2 - x1 + 1)) y1++;
			while (y1 < y2 && isTileRowEmpty(x1, y2, x2 - x1 + 1)) y2--;
			while (x1 < x2 && isTileColumnEmpty(x1, y1, y2 - y1 + 1)) x1++;
			while (x1 < x2 && isTileColumnEmpty(x2, y1, y2 - y1 + 1)) x2--;
		}
		const MARGIN_SIZE = Math.floor(TILE_SIZE / 2);
		if (hasOption(OPTION_MARGIN)) {
			if (!isRegionEmpty(x1 * TILE_SIZE, y1 * TILE_SIZE, (x2 - x1 + 1) * TILE_SIZE, MARGIN_SIZE)) margins.top++;
			if (!isRegionEmpty(x1 * TILE_SIZE, (y2 + 1) * TILE_SIZE - MARGIN_SIZE, (x2 - x1 + 1) * TILE_SIZE, MARGIN_SIZE)) margins.bottom++;
			if (!isRegionEmpty(x1 * TILE_SIZE, y1 * TILE_SIZE, MARGIN_SIZE, (y2 - y1 + 1) * TILE_SIZE)) margins.left++;
			if (!isRegionEmpty((x2 + 1) * TILE_SIZE - MARGIN_SIZE, y1 * TILE_SIZE, MARGIN_SIZE, (y2 - y1 + 1) * TILE_SIZE)) margins.right++;
		}
		let title = getLocationName(currentData.lid, currentData.location);
		if (currentData.floors.length > 1) title += ' \u2013 ' + gui.getMessage('map_floor').toUpperCase() + ' ' + Locale.formatNumber(currentData.fid);
		if (hasOption(OPTION_TITLE)) {
			const FIT_TITLE = false;
			const MINWIDTH = 14 * TILE_SIZE;
			ctx.font = 'bold 48px sans-serif';
			let maxWidth = (x2 - x1 + 1) * TILE_SIZE + (margins.left + margins.right) * MARGIN_SIZE;
			while (maxWidth < MINWIDTH) {
				margins.left++;
				margins.right++;
				maxWidth += 2 * MARGIN_SIZE;
			}
			const titleWidth = FIT_TITLE ? Math.min(Math.ceil(ctx.measureText(title).width) + 16, maxWidth) : maxWidth;
			let titleHeight = TILE_SIZE * 2 - (FIT_TITLE ? 6 : 0) - margins.top * MARGIN_SIZE;
			const x = x1 * TILE_SIZE + Math.floor((maxWidth - titleWidth) / 2);
			while (titleHeight > 0 && !isRegionEmpty(x, y1 * TILE_SIZE, titleWidth, titleHeight)) {
				margins.top++;
				titleHeight -= MARGIN_SIZE;
			}
		}
		const marginTop = margins.top * MARGIN_SIZE,
			marginLeft = margins.left * MARGIN_SIZE;
		if (x1 > 0 || y1 > 0 || x2 < cols - 1 || y2 < rows - 1 || margins.right || margins.bottom || margins.top || margins.left) {
			const width = (x2 - x1 + 1) * TILE_SIZE, height = (y2 - y1 + 1) * TILE_SIZE;
			const imgData = ctx.getImageData(x1 * TILE_SIZE, y1 * TILE_SIZE, width, height);
			canvas.width = width + marginLeft + margins.right * MARGIN_SIZE;
			canvas.height = height + marginTop + margins.bottom * MARGIN_SIZE;
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.putImageData(imgData, marginLeft, marginTop);
			for (let y = 0; y < rows; y++) {
				const row = tbody.rows[y];
				if (y < y1 || y > y2) row.style.display = 'none';
				else
					for (let x = 0; x < cols; x++) {
						const cell = row.cells[x];
						if (x < x1 || x > x2) cell.style.display = 'none';
					}
			}
			table.style.width = width + 'px';
			table.style.height = height + 'px';
		}
		const applyTitle = () => {
			if (!hasOption(OPTION_TITLE)) return;
			ctx.save();
			ctx.font = 'bold 48px sans-serif';
			ctx.textBaseline = 'middle';
			ctx.textAlign = 'center';
			ctx.fillStyle = themeSettings.title.color;
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 3;
			const x = Math.floor(canvas.width / 2), y = TILE_SIZE;
			ctx.strokeText(title, x, y, canvas.width);
			ctx.fillText(title, x, y, canvas.width);
			ctx.restore();
		};
		applyTitle();
		if (hasOption(OPTION_LOGO)) {
			const LOGO_SIZE = Math.floor(TILE_SIZE * 1.8);
			const img = images[IMG_LOGO].img;
			const checkLogoEmpty = (x, y) => {
				const flag = isRegionEmpty(x, y, LOGO_SIZE, LOGO_SIZE);
				return flag ? [x, y] : null;
			};
			let x = canvas.width - LOGO_SIZE,
				y = canvas.height - LOGO_SIZE;
			[x, y] = checkLogoEmpty(x, 0) ||
				checkLogoEmpty(0, 0) ||
				checkLogoEmpty(x, y) ||
				checkLogoEmpty(0, y) || [x, 0];
			ctx.save();
			ctx.globalAlpha = 0.75;
			ctx.drawImage(img, x, y, LOGO_SIZE, LOGO_SIZE);
			ctx.restore();
			if (y < LOGO_SIZE) applyTitle();
		}
		const overlay = map.querySelector('.overlay');
		table.style.marginTop = overlay.style.marginTop = marginTop + 'px';
		table.style.marginLeft = overlay.style.marginLeft = marginLeft + 'px';
		table.setAttribute('data-x', x1);
		table.setAttribute('data-y', y1);
		setCanvasZoom();
	}

	setMapVisibility(true);
	lastTeleportId = 0;
	clearWaitHandler();

	// Auto-scroll map
	let x, y;
	const mapId = getMapKey(currentData.mine);
	const smooth = mapId == lastMapId;
	if (mapId != lastMapId) {
		lastMapId = mapId;
		({ cur_column: x, cur_row: y } = base);
	}
	if (args && 'x' in args) ({ x, y } = args);
	if (x !== undefined) scrollToCenter(x, y, smooth);
	map.scrollTop = 0;
	map.scrollLeft = 0;
}

function CustomRandomRND(key) {
	let [p1, p2] = [key % 28603, key % 37397];
	for (let i = 0; i < 10; i++) {
		const pp = p1 * p2;
		[p1, p2] = [(pp + 15767) % 28603, (pp + 51803) % 37397];
	}
	return p1 * 28603 + p2;
}
function CustomRandomTileRND(key, x, y, shift) {
	const result = Math.floor(CustomRandomRND(key + 100 * y + x + shift));
	return result;
}
function lootIndex(key, area_id, length, count) {
	count = Math.min(count, length);
	if (count == 0 || count >= length) return null;
	const indexes = [];
	for (let i = 0; i < length; i++) indexes[i] = i;
	const picked = [];
	for (let i = 0; i < count; i++) {
		const index = Math.floor(CustomRandomRND(key + 100 * area_id + i) % indexes.length);
		picked.push(indexes[index]);
		indexes.splice(index, 1);
	}
	return picked;
}
function pickTreasure(key, x, y, area_id, pieces, artifacts) {
	if (pieces.length) {
		const index = CustomRandomTileRND(key, x, y, area_id * 20000) % pieces.length;
		pieces = pieces.slice(index).concat(pieces.slice(0, index));
		while (pieces.length && artifacts.includes(pieces[0])) pieces.shift();
	}
	return pieces.length ? pieces[0] : 0;
}

function onTooltip(event) {
	const element = event.target;
	let listDivToHide = [];
	let randomTiles = [];
	const setRandomTiles = (flag) =>
		randomTiles.forEach((tile) => table.rows[tile.y].cells[tile.x].classList.toggle('random-pos', flag));
	const div = element.querySelector('div.beacon-req');
	if (div) {
		const id = div.getAttribute('data-beacon');
		listDivToHide = Array.from(
			table.querySelectorAll(event.shiftKey ? `.beacon-req[data-beacon]` : `.beacon-req[data-beacon="${id}"]`)
		);
		listDivToHide.forEach((el) => (el.style.display = 'block'));
	}
	if (element.classList.contains('random-loot')) {
		const hash = {};
		element.classList.forEach((name) => {
			if (name.startsWith('rl_')) {
				const id = name.substr(3);
				const area = asArray(currentData.floor.loot_areas && currentData.floor.loot_areas.loot_area).find(
					(a) => a.area_id == id
				);
				if (area) {
					const tiles = typeof area.tiles == 'string' ? area.tiles.split(';') : [];
					tiles.forEach((tile) => {
						const [y, x] = tile.split(',').map((v) => +v);
						hash[getTileKey(x, y)] = { x, y };
					});
				}
			}
		});
		randomTiles = Object.values(hash);
		setRandomTiles(true);
	}
	if (listDivToHide.length || randomTiles.length) {
		const eventNames = ['mouseleave', 'blur'];
		const autoHide = () => {
			eventNames.forEach((name) => element.removeEventListener(name, autoHide));
			listDivToHide.forEach((el) => (el.style.display = 'none'));
			setRandomTiles(false);
		};
		eventNames.forEach((name) => element.addEventListener(name, autoHide));
	}
}
