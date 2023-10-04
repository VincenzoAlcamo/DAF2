/*global gui bgp Html Tooltip Locale SmartTable*/
export default {
	init, update, getState, setState,
	requires: ['events'],
	events: {
		show() {
			setState(getState());
			refresh();
		},
		event: refresh,
		search: refresh
	}
};

const kinds = {
	achievements: { event: 'event_id' },
	addons: {},
	artifacts: {},
	atlass: { folder: 'map/' },
	backgrounds: {},
	buildings: {},
	// childs: { folder: 'npc/' },
	collections: { event: 'event_id' },
	decorations: { folder: 'decorations/' },
	diggy_skins: { folder: 'gui/diggy_skin/' },
	draggables: {},
	events: { event: 'def_id' },
	events_bg: { type: 'events', event: 'def_id', asset: 'bg_graphics', folder: 'map/' },
	events_intro: { type: 'events', event: 'def_id', asset: 'intro_graphics', folder: 'news/' },
	events_shelf: { type: 'events', event: 'def_id', asset: 'shelf_graphics', folder: 'map/' },
	events_shelf2: { type: 'events', event: 'def_id', asset: 'shelf_graphics', folder: 'map/webgl_events/' },
	events_shop: { type: 'events', event: 'def_id', asset: 'shop_icon_graphics' },
	g_teams: {},
	journals: { name: 'pic_title' },
	// infos: {},
	locations_mobile: { event: 'event_id', folder: 'map/' },
	locations_webgl: { event: 'event_id', folder: 'map/webgl_locations/' },
	mails: { folder: 'news/' },
	map_filters: { folder: 'map/webgl_filters/' },
	map_filters2: { type: 'map_filters', asset: 'mobile_map_asset', folder: 'map/' },
	materials: { event: 'event_id' },
	news_popups: { folder: 'news/' },
	npcs: { event: 'event_id' },
	// panteons: { folder: 'panteon/' },
	photo_albums_photos: {},
	quests: { event: 'event_id', name: 'heading_text' },
	regions: { asset: 'icon_mobile_asset', folder: 'gui/' },
	tablets: {},
	team_member_avatars: {},
	tiles: {},
	tokens: { event: 'event_id' },
	usables: {},
};

if (!bgp.Data.isAdmin) {
	// Remove all, except these
	const keep = ['diggy_skins', 'g_teams', 'photo_albums_photos', 'regions', 'team_member_avatars'];
	Object.keys(kinds).filter(key => !keep.includes(key)).forEach(key => delete kinds[key]);
}

let tab, container, smartTable, grid, cdn_root, versionParameter;
let allEvents, type, allItems;

function init() {
	tab = this;
	container = this.container;

	const htm = Object.keys(kinds).map(type => Html`<option value="${type}">${type.toUpperCase().replace(/[_]/g, ' ')}</option>`).join('');
	Html.set(tab.inputs.show, htm);

	smartTable = new SmartTable(container.querySelector('.data'));
	grid = container.querySelector('.grid');
	grid.addEventListener('render', gui.getLazyRenderer(updateItem));
	grid.addEventListener('tooltip', onTooltip);
}

function getState() {
	return {
		show: tab.inputs.show.value,
		event: allEvents ? tab.inputs.event.value : tab.inputs.event.getAttribute('data-value'),
		search: tab.inputs.search.value
	};
}

function setState(state) {
	state.show = gui.setSelectState(tab.inputs.show, state.show);
	if (allEvents) state.event = gui.setSelectState(tab.inputs.event, state.event);
	tab.inputs.event.setAttribute('data-value', state.event);
	tab.inputs.event.disabled = !(state.show in kinds) || !kinds[state.show].event;
	tab.inputs.search.value = state.search || '';
}

function update() {
	({ cdn_root, versionParameter } = gui.getGenerator());
	const state = getState();
	allEvents = Object.values(gui.getFile('events')).map(event => {
		const info = gui.getEventInfo(event);
		return { id: event.def_id, year: info.year };
	}).sort((a, b) => b.year - a.year);
	let lastYearText = '';
	let htm = Html`<option value="">${gui.getMessage('gui_all')}</option>`;
	for (const event of allEvents) {
		const yearText = event.year < 1325372400 ? gui.getMessage('map_unknown') : Locale.formatYear(event.year);
		if (lastYearText != yearText) {
			if (lastYearText) htm += '</optgroup>';
			lastYearText = yearText;
			htm += Html`<optgroup label="${gui.getMessageAndValue('events_year', yearText)}">`;
		}
		htm += Html`<option value="${event.id}">${gui.getObjectName('event', event.id)}</option>`;
	}
	if (lastYearText) htm += '</optgroup>';
	Html.set(tab.inputs.event, htm);
	setState(state);

	setTimeout(refresh, 100);
}

async function refresh() {
	gui.updateTabState(tab);
	const state = getState();
	if (state.show != type) {
		type = state.show;
		allItems = {};
		const kind = kinds[type];
		const data = type.startsWith('locations') ? null : await bgp.Data.getFile(kind.type || type);
		const hashes = {};
		const folder = kind.folder || 'all/';
		const $name = kind.name || 'name_loc';
		const $asset = kind.asset || 'mobile_asset';
		const $event = kind.event;
		const getAssetUrl = (asset, base) => cdn_root + (base || 'mobile/graphics/') + folder + encodeURIComponent(asset) + '.png' + versionParameter;
		const addItem = (id, asset, item) => {
			if (!item.url) item.url = getAssetUrl(asset);
			const oldId = hashes[asset], old = oldId && allItems[oldId];
			if (old && (old.name || !item.name)) return;
			delete hashes[oldId];
			hashes[asset] = id;
			allItems[id] = item;
		};
		const addNormalItems = (data) => {
			for (const [id, item] of Object.entries(data)) {
				const asset = item[$asset];
				if (!asset || asset == 'default' || asset == 'map_x_default') continue;
				addItem(id, asset, { id, name: item[$name] && gui.getString(item[$name]), title: item.desc, eid: $event ? +item[$event] : 0 });
			}
		};
		if (type == 'locations_mobile') {
			const numRegions = bgp.Data.getMaxRegion();
			for (let rid = 0; rid <= numRegions; rid++) {
				const data = await bgp.Data.getFile('locations_' + rid);
				addNormalItems(data);
			}
		} else if (type == 'locations_webgl') {
			const numRegions = bgp.Data.getMaxRegion();
			for (let rid = 0; rid <= numRegions; rid++) {
				const data = await bgp.Data.getFile('locations_' + rid);
				for (const [id, item] of Object.entries(data)) {
					if (!item.gr_library || !item.gr_clip) continue;
					const asset = item.gr_library + '_' + item.gr_clip;
					addItem(id, asset, { id, name: item[$name] && gui.getString(item[$name]), title: item.desc, eid: $event ? +item[$event] : 0 });
				}
			}
		} else if (type == 'infos') {
			for (const item of Object.values(data)) {
				const id = item.pic, asset = id && ('news_item_' + id);
				if (!id) continue;
				addItem(id, asset, { id, name: item.name, title: item.desc, eid: 0, url: getAssetUrl(asset, 'mobile/img/news/') });
			}
		} else if (type == 'tiles') {
			for (const item of Object.values(data)) {
				item.subtypes && item.subtypes.forEach(sub => {
					const id = sub.sub_id, asset = sub[$asset];
					if (!asset || asset == 'default' || asset == 'map_x_default') return;
					addItem(id, asset, { id });
				});
			}
		} else if (type == 'photo_albums_photos') {
			for (const item of Object.values(data)) {
				const id = item.def_id, asset = item[$asset];
				if (!asset || asset == 'default' || asset == 'map_x_default') break;
				const url = cdn_root + 'mobile/' + (item.asset_path || 'graphics/all/') + encodeURIComponent(asset) + '.png' + versionParameter;
				addItem(id, asset, { id, name: item[$name] && gui.getString(item[$name]), url })
			}
		} else {
			addNormalItems(data);
		}
	}

	let htm = '';
	const fnSearch = gui.getSearchFilter(state.search);
	const eid = kinds[type].event ? +state.event : 0;
	function isVisible(item) {
		if (fnSearch && !fnSearch(item.name)) return false;
		if (eid && item.eid != eid) return false;
		return true;
	}
	const values = Object.values(allItems);
	const items = values.filter(isVisible);
	for (const item of items) {
		htm += Html`<div data-id="${item.id}" class="item" data-lazy></div>`;
	}
	const grid = container.querySelector('.grid');
	gui.removeLazyElements(grid);
	Html.set(grid, htm);
	Array.from(container.querySelectorAll('.totals')).forEach(cell => {
		cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(values.length));
	});
	gui.collectLazyElements(grid);
	smartTable.syncLater();
}

function updateItem(el) {
	const id = el.getAttribute('data-id');
	const item = allItems[id];
	if (!item) return;
	if (item.name) el.setAttribute('data-name', item.name);
	const title = item.title && gui.getString(item.title);
	el.title = [item.name, gui.getWrappedText(title)].filter(t => t).join('\n');
	const htm = Html`<img class="tooltip-event" src="${item.url}">`;
	Html.set(el, htm);
}

function onTooltip(event) {
	const element = event.target;
	const htm = Html.br`<div class="artwork-tooltip"><img src="${element.src}"/></div>`;
	Tooltip.show(element, htm);
}
