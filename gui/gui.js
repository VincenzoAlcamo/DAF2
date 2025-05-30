/*global chrome Locale Dialog UrlInfo Html Tooltip imported_tabs*/
const bgp = chrome.extension.getBackgroundPage();

let currentTab = null;
const tabs = (function () {
	const tabs = {};

	function addTab(id, icon) {
		tabs[id] = {
			id: id,
			icon: '/img/gui/' + (icon || id) + '.png',
			generator: id != 'about' && id != 'options' && id != 'game',
			forAdmin: false,
			enabled: true
		};
	}
	addTab('game');
	addTab('about');
	addTab('progress');
	addTab('camp');
	addTab('map');
	addTab('neighbors');
	addTab('friendship');
	addTab('godchild', 'gc');
	addTab('equipment', 'shop');
	addTab('events');
	addTab('caravan');
	addTab('kitchen');
	addTab('foundry');
	addTab('pillars');
	addTab('repeat');
	addTab('greenrings');
	addTab('redrings');
	addTab('christmasrings');
	addTab('dailyreward');
	addTab('artwork', 'deco');
	addTab('options');
	// addTab('help');
	addTab('export');
	return tabs;
})();

const gui = {
	dialog: Dialog(),
	wait: Dialog(Dialog.WAIT),
	toast: Dialog(Dialog.TOAST),
	setPreference(name, value) {
		bgp.Preferences.setValue(name, value);
	},
	getPreference(name) {
		return bgp.Preferences.getValue(name);
	},
	getGenerator() {
		return bgp.Data.generator;
	},
	hasValidGenerator() {
		const generator = gui.getGenerator();
		return generator && generator.player_id;
	},
	getFile(name) {
		return bgp.Data.files[name];
	},
	async getFileAsync(name) {
		return bgp.Data.getFile(name);
	},
	getPillarsInfo() {
		const result = bgp.Data.getPillarsInfo();
		gui.expByMaterial = Object.assign({}, result.expByMaterial);
		const estimates = {};
		String(gui.getPreference('pillarsXp') || '').split(',').forEach(t => {
			const [matId, xp] = t.split('=').map(n => +n || 0);
			if (matId > 0 && xp > 0) estimates[matId] = xp;
		});
		gui.expByMaterialEstimated = Object.assign(estimates, result.expByMaterial);
		return result;
	},
	setMaterialsXp(map) {
		const values = [];
		const estimates = {};
		for (const key of Object.keys(map)) {
			const value = +map[key];
			if (value > 0) {
				values.push(`${key}=${value}`);
				estimates[key] = value;
			}
		}
		gui.setPreference('pillarsXp', values.join(','));
		gui.expByMaterialEstimated = Object.assign(estimates, gui.expByMaterial);
	},
	isMaterialXpDefined(id) {
		return id in gui.expByMaterial;
	},
	getString(id) {
		const text = bgp.Data.getString(id);
		return text && text.replace(/<[^>]+>/g, '');
	},
	getMessage() {
		return bgp.getMessage.apply(null, arguments);
	},
	getMessageAndValue(id, value) {
		return gui.getMessage(id) + ': ' + value;
	},
	getMessageAndFraction(id, numerator, denominator) {
		return gui.getMessage(id) + ': ' + numerator + ' / ' + denominator;
	},
	getUnixTime() {
		return Math.floor(Date.now() / 1000);
	},
	getWrappedText(text, max = 60) {
		return String(text ?? '').split('\n').map(line => {
			let c = 0;
			return line.split(/\s+/).map(t => (c && c + t.length + 1 > max) ? (c = t.length, '\n' + t) : (t = (c ? ' ' : '') + t, c = c + t.length, t)).join('');
		}).join('\n');
	},
	getPlayerNameFull(pal) {
		return pal.name ? (pal.surname ? pal.name + ' ' + pal.surname : pal.name) : 'Player ' + pal.id;
	},
	FB_ANON_MALE_IMG: 'data:image/webp;base64,UklGRrIAAABXRUJQVlA4IKYAAACQBwCdASoyADIAPm0qkUWkIqGYDf2AQAbEtIBp7Ay0G/WSUM7JlLizCyxMfDWO4GTZsZ3rW/OD7o4ZrD5+BT08hIdEQYAA/voQZ4IvItpppdVXQWuubgHZ7Hz5ClT98CfXGkCeTZrhstMPkFiBPgl23Ssn29LDaI8GTQEsEUH2eeI8S7rLcNeX3hT74sAvZ2QAc9yDKh3vCDZXO6AcSFxINezC50AA',
	FB_ANON_FEMALE_IMG: 'data:image/webp;base64,UklGRr4AAABXRUJQVlA4ILIAAABwBwCdASoyADIAPm0sk0WkIqGYDP0AQAbEtIBpOAqR8vvvO+zCp3M5F/ypDPVcAFo8VaiTamuvfoNQ/F5jaFiClqnYAAD++hBpI/d9yd90D8hRGlQZaLknz1bhjUBHwA03kCUnr+UZrKEK7H/RvtF2vwwgGNTfo5enYKkJ23075Nyi25PsFHIttUiGOfXnjtuOyT6lisDClpVR4YKW7iP+LCUUBF1yzvTUONcxCYqsEAAA',
	getFBFriendAvatarUrl(fb_id, url, size) {
		fb_id = String(fb_id || '');
		if (fb_id == '' || fb_id.startsWith('/') || fb_id.startsWith('#')) return url || gui.FB_ANON_MALE_IMG;
		return Html.raw('https://graph.facebook.com/v3.2/' + fb_id + '/picture' + (size ? '?width=' + size + '&height=' + size : ''));
	},
	getNeighborAvatarUrl(pal) {
		return pal ? pal.pic_square || gui.getFBFriendAvatarUrl(pal.fb_id) : '';
	},
	getFBFriendAnchor(fb_id, uri) {
		if (!uri && fb_id.startsWith('#')) return Html`<a class="no-link limit-width" translate="no">`;
		uri = uri || ('https://www.facebook.com/' + fb_id);
		return Html`<a data-target="_blank" href="${uri}" class="limit-width" translate="no">`;
	},
	getFriendAnchor(friend) {
		return Html`<a data-target="_blank" href="${friend.uri}" translate="no" title="${friend.name}">`;
	},
	getObject(type, id) {
		return bgp.Data.getObject(type, id);
	},
	getObjectName(type, id, options = '', qty = 1) {
		let name = bgp.Data.getObjectName(type, id);
		if (options) {
			const extra = [];
			const obj = gui.getObject(type, id);
			if (obj) {
				if (type == 'material' && options.includes('xp')) {
					const xp = gui.getXp(type, id);
					if (xp > 0 && qty > 0) {
						const textXp = ((xp == 1 || qty == 1) ? '' : Locale.formatNumber(qty) + ' \xd7 ' + Locale.formatNumber(xp) + ' = ') + Locale.formatNumber(xp * qty);
						extra.push(gui.getMessageAndValue('gui_xp', textXp));
					}
				}
				if (type == 'building' && (options.includes('info') || options.includes('building'))) {
					name += ` (${+obj.columns} \xd7 ${+obj.rows})`;
					if (+obj.stamina_reg > 0) extra.push(gui.getMessageAndValue('camp_regen', Locale.formatNumber(+obj.stamina_reg)));
					if (+obj.max_stamina > 0) extra.push(gui.getMessageAndValue('camp_capacity', Locale.formatNumber(+obj.max_stamina)));
				}
				if (options.includes('event') && +obj.event_id) {
					const eventName = gui.getObjectName('event', obj.event_id);
					if (eventName) extra.push(gui.getMessageAndValue('gui_event', eventName));
				}
				if (type == 'usable' && (options.includes('info') || options.includes('usable'))) {
					if (obj.action == 'add_stamina') extra.push(gui.getMessageAndValue('gui_energy', Locale.formatNumber(+obj.value)));
				}
				if (options.includes('desc')) {
					const desc = bgp.Data.getObjectDesc(type, id);
					if (desc) extra.push(gui.getWrappedText(desc));
				}
			}
			if (!options.includes('-name')) extra.unshift(name);
			name = extra.join('\n');
		}
		return name;
	},
	getObjectImage(type, id, small = false) {
		return bgp.Data.getObjectImage(type, id, small);
	},
	getObjectImg(type, id, displaySize = 32, small = false, options = '') {
		const url = bgp.Data.getObjectImage(type, id, small);
		if (!url) return '';
		const title = options != 'none' ? Html` title="${gui.getObjectName(type, id, options)}"` : '';
		const size = displaySize ? Html` height="${displaySize}"` : '';
		return Html`<img src="${url}"${size}${title}>`;
	},
	getRegionImg(rid, forceEgypt = false, size = 32) {
		if (rid == 0 && forceEgypt) rid = 1;
		if (rid < 0 || rid > gui.getMaxRegion()) rid = 0;
		return Html.br`<img src="${rid == 0 ? '/img/gui/events.png' : bgp.Data.getObjectImage('region', rid)}" data-error="region-error" width="${size}" height="${size}" title="${rid > 0 ? gui.getObjectName('region', rid) : ''}"/>`;
	},
	getRegionFromSkin(skin) {
		return bgp.Data.getRegionFromSkin(skin);
	},
	getSkinFromRegion(region) {
		return bgp.Data.getSkinFromRegion(region);
	},
	getSkinImg(skin, size = 32) {
		const rid = bgp.Data.getRegionFromSkin(skin);
		return rid > 0 ? this.getRegionImg(rid, false, size) : Html.br`<img src="/img/map.png" width="${size}" height="${size}" title="${gui.getObjectName('skin', skin)}"/>`;
	},
	getLocationImg(location) {
		return `${gui.getGenerator().cdn_root}mobile/graphics/map/mobile_locations/${location.gr_library}_${location.gr_clip}.png`;
	},
	getLocationIcon(location, extraClass) {
		const img = this.getLocationImg(location);
		return Html.br`<div class="location_icon ${extraClass}"><img src="${img}" title="${Html(gui.getString(location.name_loc))}"></div>`;
	},
	getEventInfo(event) {
		if (typeof event == 'number') event = bgp.Data.files.events[event];
		const eid = event ? +event.def_id : 0;
		const tutorial = event ? +event.tutorial_event_id > 0 : false;
		const end = (function () {
			const end = (event && +event.end) || 0;
			if (!end && eid == 14) return 1393326000;
			if (!end && eid == 15) return 1395745200;
			if (eid == 113) return 1563321600;   // SUPERHEROES 3
			if (eid == 136) return 1606219200;   // CANDYLAND
			// Fix end date for tutorial events
			if (!end && tutorial) {
				const event2 = gui.getEventInfo(eid - 1);
				if (event2 && event2.eid) return event2.end + 86400;
			}
			// Fix bug in Halloween 2019 end date
			const start = (event && +event.start) || 0;
			if (start > 0 && (end - start) / 86400 > 36) {
				// Except for Christmas events
				const y1 = (new Date(start * 1000)).getFullYear();
				const y2 = (new Date(end * 1000)).getFullYear();
				if (y1 === y2) return start + 14 * 86400;
			}
			return end;
		})();
		// compute the year as END - 14 days
		const year = Math.max(0, end - 14 * 86400);
		return { eid, end, year, tutorial };
	},
	getLocProg(lid) {
		const prog = bgp.Data.loc_prog[lid];
		if (prog) return prog;
		const generator = gui.getGenerator();
		return generator && generator.loc_prog && generator.loc_prog[lid];
	},
	getLootAreas(floor) {
		const lootAreas = floor.loot_areas?.loot_area;
		return lootAreas ? [].concat(lootAreas) : [];
	},
	getSyncOffset() {
		return bgp.Synchronize.offset;
	},
	getCurrentTab() {
		return currentTab;
	},
	async setCurrentTab(tabId) {
		await setCurrentTab(tabId);
	},
	isValidEventForTab(tabId, excludeSelect) {
		if (gui.dialog.visible || gui.wait.visible) return false;
		const el = document.activeElement, tagName = el ? el.tagName : '';
		if (tagName == 'SELECT' && !excludeSelect) return false;
		if (tagName == 'INPUT' && el.name != 'paste' && (el.type == 'text' || el.type == 'number')) return false;
		const current = gui.getCurrentTab();
		return current && current.id == tabId ? true : false;
	},
	getDuration(drn, flagReduced) {
		drn = Math.floor(drn);
		if (drn <= 90) return Locale.formatNumber(drn) + gui.timeParts[3];
		// A longer duration will round the seconds
		let ss = drn % 60;
		if (flagReduced != 2) {
			drn += (ss >= 30 ? 60 : 0) - ss;
			ss = 0;
		}
		drn = (drn - ss) / 60;
		// If duration is in days, minutes are ignored (but added to hours)
		let mm = drn % 60;
		if (drn >= 1440 && flagReduced != 2) {
			drn += (mm < 30 ? -mm : 60 - mm);
			mm = 0;
		}
		drn = (drn - mm) / 60;
		let hh = drn % 24;
		let dd = (drn - hh) / 24;
		if (flagReduced != 2) {
			if (dd >= 3) {
				if (hh >= 12) dd++;
				hh = 0;
			} else {
				hh += dd * 24;
				dd = 0;
			}
		}
		const list = [];
		if (dd > 0) list.push(Locale.formatNumber(dd) + gui.timeParts[0]);
		if (hh > 0) list.push(Locale.formatNumber(hh) + gui.timeParts[1]);
		if (mm > 0) list.push(Locale.formatNumber(mm) + gui.timeParts[2]);
		if (ss > 0) list.push(Locale.formatNumber(ss) + gui.timeParts[3]);
		return Locale.formatList(list);
	},
	getArray(value) {
		return Array.isArray(value) ? value : [];
	},
	getArrayOfInt(value) {
		return String(value || '').split(',').map(o => parseInt(o)).filter(n => isFinite(n));
	},
	getProperCase(value) {
		return String(value || '').replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
	},
	getChildrenMax(realNeighbours) {
		const max = Math.floor(Math.sqrt(realNeighbours)) + 3;
		return max > realNeighbours ? realNeighbours : max;
	},
	getChildrenNext(realNeighbours) {
		if (realNeighbours < 5) return 1;
		const next = Math.floor(Math.sqrt(realNeighbours)) + 1;
		const goal = next * next;
		// Facebook hard limit of 5000 friends
		return goal > 5000 ? 0 : goal - realNeighbours;
	},
	getMaxRegion() {
		return bgp.Data.getMaxRegion();
	},
	getRegionsArray() {
		return Array.from({length: gui.getMaxRegion()}, (_, i) => i + 1);
	},
	getOwnedActive(stored, placed, placed2) {
		const generator = gui.getGenerator();
		if (stored == 'building') [stored, placed, placed2] = [generator.stored_buildings, generator.camp.buildings, generator.camp.inactive_b];
		if (stored == 'decoration') [stored, placed, placed2] = [generator.stored_decorations, generator.camp.decorations, null];
		function collect(list) {
			const result = {};
			for (const item of gui.getArray(list)) result[item.def_id] = (result[item.def_id] || 0) + 1;
			return result;
		}
		const owned = Object.assign({}, stored);
		const active = collect(placed);
		const inactive = collect(placed2);
		Object.keys(inactive).forEach(id => active[id] = Math.max(active[id] || 0, inactive[id]));
		Object.keys(active).forEach(id => owned[id] = (owned[id] || 0) + active[id]);
		return { owned, active };
	},
	getXp(type, oid) {
		if (type == 'material') {
			const expByMaterial = gui.expByMaterialEstimated;
			return (expByMaterial && expByMaterial[oid]) || 0;
		} else if (type == 'usable') {
			const usable = gui.getObject(type, oid);
			return (usable && usable.action == 'add_stamina' && +usable.value) || 0;
		} else if (type == 'decoration' || type == 'windmill') {
			const obj = bgp.Data.getObject(type, oid);
			return (obj && +obj.sell_price) || 0;
		} else if (type == 'system') {
			return (oid == 1 || oid == 2) ? 1 : 0;
		}
		return 0;
	},
	getBackpackFood() {
		let total = 0;
		for (const [key, qty] of Object.entries(bgp.Data.generator.usables)) {
			total += (qty * gui.getXp('usable', key));
		}
		return total;
	},
	getRepeatables() {
		return bgp.Data.getRepeatables();
	},
	getLazyRenderer(fn) {
		const rowsToRender = [];
		let rendererHandle;
		const render = () => {
			rendererHandle = null;
			for (let i = 0, row; i < 10 && (row = rowsToRender.shift()); i++) fn(row);
			rendererHandle = rowsToRender.length && setTimeout(render, 0);
		};
		return function (event) {
			rowsToRender.push(event.target);
			rendererHandle = rendererHandle || setTimeout(render, 0);
		};
	},
	getSearchFilter(terms) {
		if (terms === null || terms === undefined || terms === '') return null;
		const fn = String(terms).toUpperCase().split('|').map(function (term) {
			return term.split('+').reduce(function (prevFn, curr) {
				const searchNotes = curr.charAt(0) === ':';
				if (searchNotes) curr = curr.substring(1);
				const isExcluding = curr.charAt(0) === '^';
				if (isExcluding) curr = curr.substring(1);
				if (curr == '' && !searchNotes) return prevFn;
				let currFn = (value) => (value.indexOf(curr) < 0) == isExcluding;
				if (searchNotes) {
					currFn = (value) => {
						let note = '';
						const i = value.indexOf('\n') + 1;
						if (i > 0) {
							const j = value.indexOf('\t', i);
							note = j > 0 ? value.substring(i, j) : value.substring(i);
						}
						return curr == '' ? (note == '') == isExcluding : (note.indexOf(curr) < 0) == isExcluding && note != '';
					};
				}
				return prevFn ? (value) => currFn(value) && prevFn(value) : currFn;
			}, null);
		}).reduce(function (prevFn, currFn) {
			if (!currFn) return prevFn;
			if (!prevFn) return currFn;
			return (value) => currFn(value) || prevFn(value);
		}, null);
		return fn ? (value) => fn(String(value === null || value === undefined ? '' : value).toUpperCase()) : null;
	},
	setSelectState(select, value, defaultIndex) {
		select.value = value || '';
		if (select.selectedIndex < 0 || select.options[select.selectedIndex].disabled) {
			select.selectedIndex = defaultIndex || 0;
		}
		return select.value;
	},
	// Lazy load images using an IntersectionObserver
	lazyElements: [],
	lazyElementsTimeout: 0,
	lazyElementsHandler() {
		gui.lazyElementsTimeout = 0;
		let maxItemsAtOnce = 20;
		while (maxItemsAtOnce-- && gui.lazyElements.length) {
			const element = gui.lazyElements.pop();
			// if (element.hasAttribute('lazy-src')) {
			//     element.setAttribute('src', element.getAttribute('lazy-src'));
			//     element.removeAttribute('lazy-src');
			// }
			// if (element.hasAttribute('lazy-render')) {
			//     const event = new Event('render', {
			//         bubbles: true
			//     });
			//     element.dispatchEvent(event);
			//     element.removeAttribute('lazy-render');
			// }
			if (element.hasAttribute('data-lazy')) {
				const src = element.getAttribute('data-lazy');
				if (src !== '') {
					element.setAttribute('src', src);
				} else {
					const event = new Event('render', {
						bubbles: true
					});
					element.dispatchEvent(event);
				}
				element.removeAttribute('data-lazy');
			}
		}
		if (gui.lazyElements.length && !gui.lazyElementsTimeout) gui.lazyElementsTimeout = requestIdleCallback(gui.lazyElementsHandler);
	},
	lazyObserver: new IntersectionObserver(function (entries) {
		for (const entry of entries) {
			if (entry.intersectionRatio <= 0 && !entry.isIntersecting) continue;
			const element = entry.target;
			gui.lazyElements.push(element);
			gui.lazyObserver.unobserve(element);
		}
		if (gui.lazyElements.length && !gui.lazyElementsTimeout) gui.lazyElementsTimeout = requestIdleCallback(gui.lazyElementsHandler);
	}),
	collectLazyElements(container) {
		if (container) Array.from(container.querySelectorAll('*[data-lazy]')).forEach(item => this.lazyObserver.observe(item));
	},
	removeLazyElements(container) {
		if (container) Array.from(container.querySelectorAll('*[data-lazy]')).forEach(item => this.lazyObserver.unobserve(item));
	},
	setLazyRender(element) {
		if (element) {
			element.setAttribute('data-lazy', '');
			gui.lazyObserver.observe(element);
		}
	},
	setErrorHandler(parent) {
		parent.querySelectorAll('[data-error]').forEach(img => {
			const errorClass = img.getAttribute('data-error');
			img.removeAttribute('data-error');
			const onError = function() {
				this.removeEventListener('error', onError);
				this.src = '/img/none.png';
				this.classList.add(errorClass);
			}
			img.addEventListener('error', onError)
		});
	},
	updateTabState(tab) {
		const searchInput = tab && tab.container && tab.container.querySelector('.toolbar input[name="search"]');
		if (searchInput) searchInput.classList.toggle('activated', searchInput.value !== '');

		if (tab.isLoaded && typeof tab.getState == 'function') tab.state = tab.getState();
		const text = JSON.stringify(tab.state);
		if (text != 'null' && text != '{}') localStorage.setItem('state_' + tab.id, text);
		if (tab !== currentTab) return;
		let location = '?tab=' + encodeURIComponent(tab.id);
		if (tab.state) Object.keys(tab.state).forEach(key => {
			const value = tab.state[key];
			if (value === undefined || value === null || value === '' || value === false) return;
			if (value === true) location += '&' + encodeURIComponent(key);
			else location += '&' + encodeURIComponent(key) + '=' + String(value).split(',').map(t => encodeURIComponent(t)).join(',');
		});
		history.replaceState(null, null, location);
	},
	getSortInfoText(sortInfo) {
		return sortInfo ? sortInfo.name + (sortInfo.ascending ? '(asc)' : '(desc)') : '';
	},
	getSortState(smartTable, _defaultSort, _defaultSortSub) {
		let result = '';
		if (smartTable) {
			let sortInfo = smartTable.sort;
			if (sortInfo && sortInfo.name) result += gui.getSortInfoText(sortInfo);
			sortInfo = smartTable.sortSub;
			if (sortInfo && sortInfo.name) result += ',' + gui.getSortInfoText(sortInfo);
		}
		return result;
	},
	setSortState(value, smartTable, defaultSort, defaultSortSub) {
		if (!smartTable) return;
		const arr = String(value || '').split(',');
		smartTable.sort = smartTable.sort || {};
		smartTable.sortSub = smartTable.sortSub || {};
		for (let i = 0; i < 2; i++) {
			const sortInfo = i == 0 ? smartTable.sort : smartTable.sortSub;
			sortInfo.name = i == 0 ? defaultSort : defaultSortSub;
			sortInfo.ascending = true;
			let name = i < arr.length ? arr[i] : '';
			let ascending = true;
			const j = name.lastIndexOf('(');
			if (j >= 0) {
				ascending = name.substr(j) != '(desc)';
				name = name.substr(0, j);
			}
			if (smartTable.isValidSortName(name, i == 1)) {
				sortInfo.name = name;
				sortInfo.ascending = ascending;
			}
		}
		smartTable.setSortInfo();
	},
	naturalComparer: (function () {
		const collator = new Intl.Collator(undefined, {
			numeric: true,
			sensitivity: 'base'
		});
		return collator.compare;
	})(),
	getNaturalComparer() {
		return gui.naturalComparer;
	},
	sortTextAscending(a, b) {
		if (a === null) return b === null ? 0 : 1;
		return b === null ? -1 : gui.naturalComparer(a, b);
	},
	sortTextDescending(a, b) {
		if (a === null) return b === null ? 0 : 1;
		return b === null ? -1 : -gui.naturalComparer(a, b);
	},
	sortNumberAscending(a, b) {
		if (isNaN(a)) return isNaN(b) ? 0 : 1;
		return isNaN(b) ? -1 : a - b;
	},
	sortNumberDescending(a, b) {
		if (isNaN(a)) return isNaN(b) ? 0 : 1;
		return isNaN(b) ? -1 : b - a;
	},
	getSortFunctionBySample(sample, isAscending) {
		if (sample === null || typeof sample == 'string') return isAscending ? gui.sortTextAscending : gui.sortTextDescending;
		return isAscending ? gui.sortNumberAscending : gui.sortNumberDescending;
	},
	getSortFunction(getSortValueFunctions, smartTable, defaultSortName) {
		const arr = [];

		function addSortBy(sortInfo) {
			if (!sortInfo || !sortInfo.name) return;
			const name = sortInfo.name;
			const fn = getSortValueFunctions ? getSortValueFunctions[name] : (item => item[name]);
			if (!fn) return;
			arr.push({
				fn: fn,
				ascending: sortInfo.ascending
			});
		}
		addSortBy(smartTable.sort);
		addSortBy(smartTable.sortSub);
		addSortBy({
			name: defaultSortName,
			ascending: true
		});
		if (arr.length > 2) arr.length = 2;
		const fn1 = arr[0] && arr[0].fn;
		const fn2 = (arr[1] && arr[1].fn) || (() => 0);

		return function (items) {
			function getSortFn(index) {
				const sample = items[0][index];
				const isAscending = arr[index - 1] && arr[index - 1].ascending;
				return gui.getSortFunctionBySample(sample, isAscending);
			}
			if (items.length) {
				items = items.map(item => [item, fn1(item), fn2(item)]);
				const sort1 = getSortFn(1);
				const sort2 = getSortFn(2) || (() => 0);
				const sort = (a, b) => sort1(a[1], b[1]) || sort2(a[2], b[2]);
				items = items.sort(sort).map(item => item[0]);
			}
			return items;
		};
	},
	getTabMenuItem(tabId) {
		return tabId && document.querySelector('.vertical-menu li[data-tabid="' + tabId + '"]');
	},
	markNeighborsTab() {
		tabs.friendship.mustBeUpdated = true;
		tabs.neighbors.mustBeUpdated = true;
	},
	updateNeighborFriendName(pal, friend, save = false) {
		const old = pal.extra.fn;
		if (friend) pal.extra.fn = friend.name.replace(/\s+/g, ' ');
		else delete pal.extra.fn;
		if (save && old !== pal.extra.fn) bgp.Data.saveNeighbour(pal);
	},
	updateNeighborFriendNames(save = false) {
		const friendsByUid = {};
		Object.values(bgp.Data.getFriends()).forEach(friend => friendsByUid[friend.uid] = friend);
		const list = Object.values(bgp.Data.getNeighbours()).filter(pal => {
			const friend = friendsByUid[pal.id];
			if (!friend || pal.extra.fn === friend.name) return false;
			gui.updateNeighborFriendName(pal, friend);
			return true;
		});
		if (save) bgp.Data.saveNeighbour(list);
		return list;
	},
	getSpecialWeeks() {
		// Drop in repeatables  :   refresh_drop (multiplier = coeficient)
		//                          double_drop (obsolete, multiplier = 2)
		// Double gifts         :   gifts
		//                          double_gifts (obsolete)
		// Double production    :   production
		//                          double_prod (obsolete)
		// Half production time :   prod_time (coeficient = multiplier)
		//                          half_prod_time (obsolete)
		// Postcards            :   postcards (location.reward_postcard is the amount)
		// Merchant             :   material_seller
		// Free premium event   :   free_premium_event
		// Mystery box          :   mystery_box
		// Debris discount      :   debris_discount (coeficient is not used, discount is 20%)
		// Discount offer       :   discount_so (shows badge)
		// Double usable offer  :   double_usable_so (shows badge)
		// Find the pair        :   find_the_pair
		// camp_particle_effect
		// camp_snow_skin
		const now = gui.getUnixTime();
		class SpecialWeek {
			get name() {
				if (this.type == 'debris_discount') {
					const percent = 100 - Math.round(this.coeficient * 100);
					return gui.getMessage('specialweek_' + this.type, percent);
				} else if (this.type == 'refresh_drop') {
					return `${gui.getMessage('specialweek_double_drop')} (${gui.getMessage('gui_loot')} \xd7 ${Locale.formatNumber(this.coeficient)})`;
				} else if (this.type == 'prod_time') {
					const name = gui.getMessage('specialweek_half_prod_time');
					return this.coeficient != 0.5 ? `${this.name} (\xd7 ${Locale.formatNumber(this.coeficient)})` : name;
				} else if (this.type == 'free_premium_event') {
					return gui.getMessage('specialweek_' + this.type, gui.getObjectName('event', this.info));
				} else {
					return gui.getMessage('specialweek_' + this.type);
				}
			}
			get ends() {
				return gui.getMessage('specialweek_end', Locale.formatDateTime(this.finish));
			}
		}
		const result = { types: {}, active: {} };
		for (const sw of Object.values(gui.getFile('special_weeks'))) {
			const { def_id: id, info } = sw;
			let { type, start, finish, coeficient, priority } = sw;
			[start, finish, coeficient, priority] = [+start, +finish, +coeficient, +priority || 0];
			if (type == 'double_drop') {
				type = 'refresh_drop';
				coeficient = 2;
			} else if (type == 'double_gifts') {
				type = 'gifts';
			} else if (type == 'double_prod') {
				type = 'production';
			} else if (type == 'half_prod_time') {
				type = 'prod_time';
				coeficient = 0.5;
			} else if (type == 'debris_discount') {
				// the coeficient may be right, but the game uses this fixed value
				coeficient = 0.8;
			}
			const active = start <= now && now <= finish;
			// if ([154, 156, 158, 162, 170, 174, 175, 176, 177, 263].includes(+id)) active = true;
			const item = Object.assign(new SpecialWeek(), { id, type, active, start, finish, coeficient, priority, info });
			if (type in result.types) result.types[type].push(item); else result.types[type] = [item];
			if (active && (!(type in result.active) || (result.active[type].priority < item.priority))) result.active[type] = item;
		}
		return result;
	},
	showSpecialWeeks(container, weeks) {
		const toolbar = container.querySelector('.toolbar');
		let divWeeks = toolbar.querySelector('.weeks');
		if (!divWeeks) {
			divWeeks = Html.get('<div class="weeks"></div>')[0];
			toolbar.appendChild(divWeeks);
		}
		const htm = weeks.filter(sw => {
			if (!sw || !sw.name) return false;
			if (sw.type == 'free_premium_event') {
				const event = bgp.Data.generator.events[sw.info];
				if (event && event.started >= sw.start && event.started <= sw.finish) return false;
			}
			return true;
		}).map(sw => Html.br`<div class="warning">${sw.name}: ${sw.ends}</div>`);
		Html.set(divWeeks, htm.join(''));
		divWeeks.style.display = htm.length ? '' : 'none';
	},
	calculateLoot(lootArea, level, swDoubleDrop) {
		const min = +lootArea.min || 0;
		const max = +lootArea.max || 0;

		// If the range is invalid, the amount is fixed to 1
		if (min > max) return { notRandom: true, coef: 0, min: 1, max: 1, avg: 1 };

		// Value is randomly picked between min and max, but negative values are coerced to 0
		let minValue = Math.max(0, min);
		let maxValue = Math.max(0, max);
		let avgValue = minValue;
		// If we have a range of values, compute the average
		if (minValue < maxValue) {
			// We compute the average value for range [0, max]
			const avgPositive = (maxValue + minValue) / 2;
			// The cumulative value for the positive range
			const cumPositive = avgPositive * (maxValue - minValue + 1);
			// The real average is over the range [min, max]
			avgValue = cumPositive / (max - min + 1);
		}

		// Loot depends on level by the coef value
		const coef = +lootArea.coef || 0;
		if (coef) {
			minValue += Math.floor(minValue * coef * level);
			maxValue += Math.floor(maxValue * coef * level);
			avgValue += Math.floor(avgValue * coef * level);
		}

		// The coefficient for double drop special week is applied on the resulting values
		const doubleDropCoeff = lootArea.type === 'material' && swDoubleDrop ? swDoubleDrop.coeficient : 1;
		return {
			notRandom: min == max,
			coef: coef,
			min: minValue * doubleDropCoeff,
			max: maxValue * doubleDropCoeff,
			avg: avgValue * doubleDropCoeff
		};
	},
	createCanvas(width, height, offscreen) {
		if (offscreen && typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
		return Html.get(`<canvas width="${width}" height="${height}"></canvas>`)[0];
	},
	setupScreenshot(element, filename = 'screenshot.png', screenshot) {
		screenshot = screenshot || element.querySelector('.screenshot');
		if (!screenshot) return;
		if (!filename.endsWith('.png')) filename += '.png';
		const htm = Html`<img src="/img/gui/screenshot.png" class="shot" title="${gui.getMessage('gui_screenshot_shot')}"><img class="target" title="${gui.getMessage('gui_screenshot_target')}">`;
		Html.set(screenshot, htm);
		const shot = screenshot.querySelector('.shot');
		const target = screenshot.querySelector('.target');
		shot.addEventListener('click', function (event) {
			event.stopPropagation();
			event.preventDefault();
			screenshot.style.display = 'none';
			target.classList.remove('ready');
			setTimeout(function () {
				gui.captureElement(element).then(function (data) {
					target.src = data;
					target.classList.toggle('ready', !!data);
					if (!data) {
						let htm = Html.br`${gui.getMessage('gui_screenshot_errorinfo')}`;
						htm = String(htm).replace(/@DAF2@/g, '<img src="' + bgp.Badge.currentIcon + '" width="16" align="center">');
						gui.dialog.show({
							title: gui.getMessage('gui_screenshot_error'),
							html: htm,
							style: [Dialog.OK, Dialog.CRITICAL]
						});
					}
				}).finally(function () {
					screenshot.style.display = '';
				});
			}, 100);
		});
		target.addEventListener('click', function () {
			if (!target.classList.contains('ready')) return;
			const canvas = gui.createCanvas(target.naturalWidth, target.naturalHeight);
			const ctx = canvas.getContext('2d');
			ctx.drawImage(target, 0, 0);
			canvas.toBlob(data => gui.downloadData({ data, filename }), 'image/png');
		});
	},
	setTheme() {
		document.firstElementChild.classList.toggle('dark', gui.getPreference('darkTheme'));
	},
	setShrinkMenu() {
		const shrinkMenu = gui.getPreference('shrinkMenu');
		const html = document.firstElementChild;
		html.classList.toggle('shrink-menu', shrinkMenu == 1);
		html.classList.toggle('no-shrink-menu', shrinkMenu == 2);
		const handle = document.querySelector('.shrink-handle');
		handle.title = gui.getMessage('options_shrinkmenu') + '\n' + gui.getMessage('options_shrinkmenu_' + shrinkMenu);
	},
	copyToClipboard(str, mimeType = 'text/plain') {
		function oncopy(event) {
			event.clipboardData.setData(mimeType, str);
			event.preventDefault();
		}
		document.addEventListener('copy', oncopy);
		document.execCommand('copy', false, null);
		document.removeEventListener('copy', oncopy);
	},
	fileChooser: null,
	chooseFile(callback, accept, multiple) {
		let input = gui.fileChooser;
		if (!input) {
			input = gui.fileChooser = document.querySelector('input[type=file]');
			const form = input.parentNode;
			input.addEventListener('change', function () {
				const callback = gui.fileChooserCallback;
				delete gui.fileChooserCallback;
				try {
					const files = Array.from(input.files);
					if (callback) callback(input.multiple ? files : files[0]);
				} finally {
					form.reset();
				}
			});
		}
		gui.fileChooserCallback = callback;
		input.accept = accept || '';
		input.multiple = !!multiple;
		input.click();
	},
	hasRuntimeError(info) {
		// This is necessary to avoid unchecked runtime errors from Chrome
		const hasError = !!chrome.runtime.lastError;
		if (hasError) console.log(`[${info}] RUNTIME error: "${chrome.runtime.lastError.message}"`);
		return hasError;
	},
	getSafeFileName(name) {
		name = String(name || '');
		name = name.replace(/\s+/g, ' ').trim();
		// eslint-disable-next-line no-control-regex
		name = name.replace(/[\u0000-\u001F\u007F"*/:<>?\\|]+/g, '_');
		return name;
	},
	getSafeFilePath(path) {
		path = String(path || '');
		path = path.replace(/[\\/]+/g, '/').replace(/(^\/)|(\/$)/g, '');
		path = path.split('/').map(v => gui.getSafeFileName(v.replace(/(\.$)|(^\.)/g, '_'))).filter(v => v).join('/');
		return path;
	},
	getDateParts(dt) {
		if (dt === undefined) dt = new Date();
		const p2 = n => n.toString().padStart(2, '0');
		return {
			date: `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`,
			time: `${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}`
		};
	},
	downloadData({ data, filename, path, overwrite }) {
		const dp = gui.getDateParts(new Date());
		filename = String(filename || '').replace(/<([a-z]+)>/g, (t, term) => {
			if (term in dp) return dp[term].replace(/:/g, '');
			return t;
		});
		filename = gui.getSafeFileName(filename);
		const getBlob = () => {
			if (data instanceof Blob) return data;
			if (typeof data == 'string') {
				let type = 'text/plain';
				if (filename.endsWith('.json')) type = 'application/json';
				if (filename.endsWith('.csv')) type = 'text/csv';
				return new Blob([data], { type });
			}
			return new Blob([JSON.stringify(data)], { type: 'application/json' });
		};
		let a, url;
		setTimeout(() => {
			if (a) a.remove();
			if (url) window.URL.revokeObjectURL(url);
		}, 2000);
		url = window.URL.createObjectURL(getBlob());
		path = gui.getSafeFilePath(path);
		if (path || overwrite) {
			const conflictAction = overwrite == 'prompt' ? 'prompt' : (overwrite ? 'overwrite' : 'uniquify');
			if (path) filename = path + '/' + filename;
			chrome.downloads.download({ url, filename, conflictAction }, () => gui.hasRuntimeError('downloadData'));
		} else {
			// DOMPurify does not support object urls
			a = Html.get(Html`<a download="${filename}"></a>`)[0];
			a.href = url;
			document.body.appendChild(a);
			a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
		}
	},
	readFile(file) {
		return new Promise(function (resolve, _reject) {
			if (!file.name.toLowerCase().endsWith('.json') && file.type != 'application/json') throw new Error(gui.getMessage('export_invalidexport'));
			const reader = new FileReader();
			reader.onload = function () {
				const data = JSON.parse(reader.result);
				resolve(data);
			};
			reader.readAsText(file);
		});
	},
	captureElement(element) {
		return new Promise(function (resolve, reject) {
			const rect = element.getBoundingClientRect();
			chrome.runtime.sendMessage({
				action: 'capture'
			}, function (dataUrl) {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
					return;
				}
				if (!dataUrl) return resolve(dataUrl);
				const image = new Image();
				image.setAttribute('crossOrigin', 'anonymous');
				image.src = dataUrl;
				image.onload = function () {
					const ratio = window.devicePixelRatio;
					const sx = Math.floor(rect.left * ratio);
					const sy = Math.floor(rect.top * ratio);
					const sw = Math.ceil(rect.width * ratio);
					const sh = Math.ceil(rect.height * ratio);
					const canvas = gui.createCanvas(sw, sh);
					const ctx = canvas.getContext('2d');
					ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
					dataUrl = canvas.toDataURL('image/png');
					resolve(dataUrl);
				};
			});
		});
	}
};

window.addEventListener('load', onLoad);

function notifyVisibility(tab, visible) {
	if (tab && typeof tab.visibilityChange == 'function') tab.visibilityChange(!document.hidden && visible);
}

function onLoad() {
	bgp.Data.requiresFullLanguage = false;
	const divMozTest = document.body.querySelector('.mozTest');
	gui.isFirefox = getComputedStyle(divMozTest).textDecorationStyle === 'wavy';
	divMozTest.remove();
	const currentLanguage = gui.getPreference('language');
	const currentLocale = gui.getPreference('locale');
	gui.timeParts = gui.getMessage('gui_timeparts').split(',');
	Dialog.language = currentLanguage;
	Locale.setLocale(currentLocale ? currentLanguage + '-' + currentLocale : chrome.i18n.getUILanguage());
	let htm = '';
	const hasValidGenerator = gui.hasValidGenerator();
	for (const tab of Object.values(tabs)) {
		const text = gui.getMessage('tab_' + tab.id) || gui.getProperCase(tab.id);
		const classes = [];
		if (!tab.enabled || (tab.generator && !hasValidGenerator)) classes.push('disabled');
		if (tab.forAdmin) classes.push('for-admin');
		htm += Html`<li style="background-image:url(${tab.icon})" class="${classes.join(' ')}" data-tabid="${tab.id}"><span>${text}</span></li>`;
	}
	htm += Html`<li class="last"></li>`;
	let div = document.querySelector('.vertical-menu');
	Html.set(div, htm);
	div.addEventListener('click', clickMenu, true);
	div.addEventListener('scroll', e => e.target.style.setProperty('--scroll-y', (-e.target.scrollTop - 1) + 'px'), true);

	document.querySelector('.shrink-handle').addEventListener('click', _e => {
		const shrinkMenu = gui.getPreference('shrinkMenu');
		gui.setPreference('shrinkMenu', shrinkMenu != 0 ? 0 : window.innerWidth <= 1366 ? 2 : 1);
		gui.setShrinkMenu();
	});

	document.body.addEventListener('click', function (e) {
		if (e.target && e.target.hasAttribute('data-wiki-page')) openWiki(e.target.getAttribute('data-wiki-page'));
	}, true);

	function setAdminLevel() {
		document.body.classList.toggle('is-admin', bgp.Data.isAdmin);
		document.body.classList.toggle('is-mapper', bgp.Data.isMapper);
	}

	chrome.runtime.onMessage.addListener(function onMessage(request, _sender, _sendResponse) {
		const action = request.action;
		const data = request.data;
		if (action == 'generator') {
			const hasValidGenerator = gui.hasValidGenerator();
			for (const tab of Object.values(tabs)) {
				tab.mustBeUpdated = true;
				const div = gui.getTabMenuItem(tab.id);
				const disabled = !tab.enabled || (tab.generator && !hasValidGenerator);
				div.classList.toggle('disabled', disabled);
			}
			setAdminLevel();
			updateCurrentTab();
		} else if (action == 'account_mismatch') {
			tabs.about.mustBeUpdated = true;
			setCurrentTab('about');
		} else {
			for (const tab of Object.values(tabs)) {
				if (tab.isLoaded && tab.actions && action in tab.actions) {
					try {
						tab.actions[action](data);
					} catch (e) { }
				}
			}
		}
	});

	Tooltip.init();

	chrome.storage.onChanged.addListener(function onStorageChanged(changes, area) {
		if (area != 'local') return;
		for (const tab of Object.values(tabs)) {
			if (tab.isLoaded && typeof tab.onPrefChange == 'function') {
				try {
					tab.onPrefChange(changes);
				} catch (e) { }
			}
		}
	});

	document.addEventListener('visibilitychange', () => notifyVisibility(currentTab, true));

	gui.setTheme();
	gui.setShrinkMenu();
	setAdminLevel();

	const urlInfo = new UrlInfo(location.href);
	let tabId = urlInfo.parameters.tab;
	if (tabId == 'game') tabId = 'about';
	div = gui.getTabMenuItem(tabId);
	if (div && !div.classList.contains('disabled') && (!div.classList.contains('for-admin') || bgp.Data.isAdmin)) {
		const state = Object.assign({}, urlInfo.parameters);
		delete state.tab;
		localStorage.setItem('state_' + tabId, JSON.stringify(state));
	} else {
		tabId = localStorage.getItem('tab');
		div = gui.getTabMenuItem(tabId);
	}
	if (!div || div.classList.contains('disabled') || (div.classList.contains('for-admin') && !bgp.Data.isAdmin) || bgp.Data.alternateAccountDetected) tabId = 'about';
	setCurrentTab(tabId);
}

async function loadTab(tab) {
	const container = tab.container;
	let state = null;
	try { state = JSON.parse(localStorage.getItem('state_' + tab.id)); } catch (e) { }
	tab.state = state && typeof state === 'object' ? state : {};
	let resource_count = 0;
	let resource_value = 0;
	const advanceProgress = () => gui.wait.show({ text: gui.getMessage('gui_loadingresources', ++resource_value, resource_count) });
	try {
		container.style.display = 'none';
		const tabBasePath = '/gui/tabs/' + tab.id + '/' + tab.id;
		Object.assign(tab, imported_tabs[tab.id]);
		if (tab.css !== false) await new Promise((resolve) => Html.addStylesheet(tabBasePath + '.css', resolve));
		tab.requires = tab.requires || [];
		if (tab.requires.includes('xp')) {
			if (!tab.requires.includes('sales')) tab.requires.push('sales');
			if (!tab.requires.includes('productions')) tab.requires.push('productions');
		}
		tab.requires = tab.requires.filter(name => name && name != 'xp');
		const requires = (tab.requires || []).filter(name => {
			const file = bgp.Data.checkFile(name);
			return !file.data;
		});
		resource_count += requires.length;
		const promises = [];
		promises.push(fetch(tabBasePath + '.html').then(response => response.text().then(text => Html.set(container, text))));
		for (const name of requires) {
			promises.push(gui.getFileAsync(name).then(_ => advanceProgress()));
		}
		await Promise.all(promises);
		tab.toolbar = tab.container.querySelector('.toolbar');
		tab.inputs = {};
		const getEventName = (input) => {
			const name = input.getAttribute('data-on');
			if (name) return name;
			if (input.tagName == 'BUTTON' || input.getAttribute('type') == 'button') return 'click';
			return input.tagName == 'SELECT' ? 'change' : 'input';
		};
		tab.container.querySelectorAll('button,input,select').forEach(input => {
			const name = input.getAttribute('data-name') || input.getAttribute('name');
			if (name) tab.inputs[name] = input;
			const eventName = getEventName(input);
			let handler = tab.events && (tab.events[input.getAttribute('data-event')] || tab.events[name] || tab.events[input.tagName.toLowerCase()]);
			if (eventName && handler) {
				if (input.hasAttribute('data-debounce')) {
					const original = handler;
					let timeoutId;
					const timeout = +input.getAttribute('data-debounce') || 500;
					handler = function () {
						const self = this, args = arguments;
						clearTimeout(timeoutId);
						timeoutId = setTimeout(function () {
							clearTimeout(timeoutId);
							timeoutId = 0;
							original.apply(self, args);
						}, timeout);
					};
				}
				input.addEventListener(eventName, handler);
			}
		});
		rebuildPillarsInfo(tab);
		tab.init();
		tab.isLoaded = true;
		tab.mustBeUpdated = true;
	} catch (e) {
		Html.set(container, Html.br`Error: ${e}`);
		console.error(e);
	} finally {
		container.style.display = '';
		gui.wait.hide();
	}
	if (tab.isLoaded && typeof tab.setState == 'function' && tab.state && typeof tab.state == 'object') tab.setState(tab.state);
}

function rebuildPillarsInfo(tab) {
	if (tab.requires.includes('sales') && tab.requires.includes('productions')) gui.getPillarsInfo();
}

function clickMenu(e) {
	let li = null;
	for (let el = e.target; el.tagName != 'UL'; el = el.parentNode)
		if (el.tagName == 'LI') li = el;
	if (!li || li.classList.contains('selected') || li.classList.contains('disabled') || li.classList.contains('last')) return;
	const tabId = li.getAttribute('data-tabid');
	setCurrentTab(tabId);
}

async function setCurrentTab(tabId) {
	if (tabId == 'game') {
		chrome.runtime.sendMessage({
			action: 'reloadGame',
			value: 'keep'
		});
		return;
	}
	Array.from(document.querySelectorAll('.left-panel ul li')).forEach(item => {
		item.classList.toggle('selected', item.getAttribute('data-tabid') == tabId);
	});
	const tab = tabs[tabId];
	if (!tab.container) {
		tab.container = Html.get(`<div class="tab_${tab.id}"></div>`)[0];
		document.querySelector('.main-container').appendChild(tab.container);
		await loadTab(tab);
	}
	notifyVisibility(currentTab, false);
	currentTab = tab;
	document.firstElementChild.setAttribute('data-tab', tabId);
	localStorage.setItem('tab', currentTab.id);
	gui.updateTabState(currentTab);
	Object.values(tabs).forEach(t => t.container && (t.container.style.display = t == currentTab ? '' : 'none'));
	updateCurrentTab();
}

function updateCurrentTab() {
	if (!currentTab || !currentTab.isLoaded) return;
	if (currentTab.mustBeUpdated) {
		currentTab.mustBeUpdated = false;
		rebuildPillarsInfo(currentTab);
		translate(currentTab.container);
		if (typeof currentTab.update == 'function') currentTab.update();
	}
	notifyVisibility(currentTab, true);
}

//#region TEXT INFO
function translate(parent) {
	const getText = (value) => {
		return value.replace(/\+/g, '\n').replace(/([A-Za-z][A-Za-z0-9_]+)(:(proper|lower|upper))?/g, function (_, key, _, transform) {
			const text = key[0] >= 'a' ? gui.getMessage(key) : gui.getString(key);
			switch(transform) {
				case 'proper': return gui.getProperCase(text);
				case 'lower': return text.toLowerCase();
				case 'upper': return text.toUpperCase();
			}
			return text;
		});
	};
	for (const el of Array.from(parent.querySelectorAll('[data-i18n-title]'))) el.title = getText(el.getAttribute('data-i18n-title'));
	for (const el of Array.from(parent.querySelectorAll('[data-i18n-text]'))) Html.set(el, Html.br(getText(el.getAttribute('data-i18n-text'))));
}
//#endregion

//#region WIKI
const WIKI_URL = 'https://diggysadventure.fandom.com';

function openWiki(page) {
	const url = page && page.indexOf('://') > 0 ? page : WIKI_URL + (page ? '/wiki/' + page : '');
	const urlInfo = new UrlInfo(url);

	chrome.tabs.query({}, function (tabs) {
		let tabId = 0,
			windowId = 0;
		tabs.forEach(function (tab) {
			const tabInfo = new UrlInfo(tab.url);
			if (tab.url == url || (!tabId && tabInfo.hostname == urlInfo.hostName)) {
				windowId = tab.windowId;
				tabId = tab.id;
			}
		});

		if (tabId) {
			chrome.windows.update(windowId, {
				focused: true,
				drawAttention: true
			});
			chrome.tabs.update(tabId, {
				url: url,
				active: true
			});
		} else {
			const width = Math.round(window.screen.availWidth * 0.72);
			const height = Math.round(window.screen.availHeight * 0.80);
			const top = Math.round((window.screen.availHeight - height) / 2);
			const left = Math.round((window.screen.availWidth - width) / 2);
			chrome.windows.create({
				url: url,
				left: left,
				top: top,
				width: width,
				height: height,
				focused: true,
				type: 'popup'
			}, function (_w) { });
		}
	});
}
//#endregion

/*eslint-disable no-unused-vars*/
async function processLanguages() {
	const langs = {};
	for (const lang of bgp.Data.guiLanguages) {
		const messages = langs[lang] = {};
		const items = JSON.parse(await (await fetch(chrome.runtime.getURL('/._locales/' + lang + '.json'))).text());
		for (const [key, item] of Object.entries(items)) {
			messages[key] = item.message;
			if (item.placeholders) {
				const hash = {};
				for (const [k, i] of Object.entries(item.placeholders)) hash[k.toLowerCase()] = i.content;
				messages[key] = item.message.replace(/\$([a-z][a-z0-9_]*)\$/gi, (t, name) => hash[name.toLowerCase()]);
			}
		}
	}
	const en = langs.en;
	const keys = Object.keys(en).sort();
	const result = { ext_name: { message: en.ext_name }, ext_title: { message: en.ext_title }, keys: { message: keys.join('|') } };
	for (const [lang, messages] of Object.entries(langs)) {
		result[lang] = { message: keys.map(key => (key in messages ? messages[key] : '')).join('|').replace(/\$/g, '^') };
	}
	const data = JSON.stringify(result).replace(/},"/g, '},\n"');
	gui.downloadData({ data, filename: 'messages.json', overwrite: true });
}
function setFeatures(v) { gui.setPreference('features', v); }