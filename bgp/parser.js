/*global Data*/
const FORMATS = {
	JSON: 'JSON',
	XML: 'XML',
	TEXT: 'TEXT'
};

// eslint-disable-next-line no-var
var Parser = {
	detectFormat(text) {
		switch (text && text.charAt(0)) {
			case '{':
				return FORMATS.JSON;
			case '<':
				return FORMATS.XML;
			default:
				return FORMATS.TEXT;
		}
	},
	parse(kind, text) {
		let data;
		try {
			const fn = Parser['parse_' + kind];
			if (typeof fn != 'function') throw Error('Parser function not found for "' + kind + '"');
			const format = Parser.detectFormat(text);
			data = fn(text, format);
			if (!data) throw Error('Format not supported "' + format + '"');
		} catch (e) {
			console.error('Parser error:', e);
		}
		return data || {};
	},
	isXmlElement(value) {
		if (!value) return false;
		const nodeType = value.nodeType;
		if (nodeType !== 1 && nodeType !== 9) return false;
		const kind = Object.prototype.toString.call(value);
		return kind == '[object XMLDocument]' || kind == '[object Element]';
	},
	parseXml(str) {
		if (!Parser.parserXml) Parser.parserXml = new DOMParser();
		return str ? (Parser.isXmlElement(str) ? str : Parser.parserXml.parseFromString(str, 'text/xml')) : null;
	},
	parse_xml(source) {
		let root = Parser.parseXml(source);
		if (root && root.nodeType == 9) root = root.documentElement;
		return parse(root);

		function parse(parent) {
			const item = {};

			function add(name, value) {
				if (name in item) {
					const old = item[name];
					if (Array.isArray(old)) old.push(value);
					else item[name] = [old, value];
				} else item[name] = value;
			}
			for (let child = parent.firstElementChild; child; child = child.nextElementSibling) {
				add(child.nodeName, child.firstElementChild ? parse(child) : child.textContent);
			}
			return item;
		}
	},
	parse_any(text, format) {
		if (format == FORMATS.JSON) return JSON.parse(text);
		if (format == FORMATS.XML) return Parser.parse_xml(text);
	},
	parse_generator(text, format) {
		const data = Parser.parse_any(text, format);
		if (!data) return;

		// Neighbours
		let arr = (data.neighbours && data.neighbours.item) || [];
		delete data.neighbours;
		const neighbours = {};
		const time = +data.time;
		const oldNeighbours = Data.neighbours || {};
		const reFBId = /\/(\d+)\/picture/;
		let spawned = false;
		const spawnList = [];
		let countMismatch = 0;
		function add(pal, id) {
			id = id && id.substring(1);
			if (!id || id === '0' || id === pal.fb_id || id === pal.fb_id2) return;
			if (!pal.fb_id) pal.fb_id = id;
			else if (!pal.fb_id2) pal.fb_id2 = id;
		}
		arr = arr.map((o, index) => {
			const id = o.uid;
			// Keep only the needed data
			const pal = {};
			pal.id = id;
			pal.index = index;
			pal.spawned = +o.spawned || 0;
			pal.region = +o.region;
			pal.level = +o.level;
			pal.name = String(o.name);
			pal.surname = String(o.surname || '').trim();
			pal.c_list = +o.c_list || 0;
			const match = o.pic_square.match(reFBId);
			pal.fb_id = (match && match[1]) || '';
			add(pal, o.escaped_fb_id);
			add(pal, o.escaped_portal_fb_id);
			pal.pic_square = o.pic_square;
			// Retrieve extra info for neighbor
			const old = oldNeighbours[id];
			pal.extra = (old && old.extra) || {};
			if (old && old.name && !pal.name) {
				pal.name = old.name;
				pal.surname = old.surname;
			}
			if (old && old.level != pal.level) {
				pal.extra.lastLevel = old.level;
				pal.extra.timeLevel = time;
			}
			if (pal.spawned) {
				spawnList.push(pal.id);
				if (!old || !old.spawned) spawned = true;
			}
			pal.extra.timeCreated = +pal.extra.timeCreated || time;
			pal.extra.lastGift = Math.max(+pal.extra.lastGift || 0, +o.rec_gift || 0);
			neighbours[id] = pal;
		});
		if (countMismatch) console.log('Total number mismatched id is', countMismatch);
		data.neighbours = neighbours;
		const pal = neighbours[1];
		if (pal) {
			// Store spawn time on Mr.Bill
			const old = oldNeighbours[pal.id];
			pal.spawn_time = spawned ? time : (old && +old.spawn_time) || 0;
			pal.spawn_list = spawned ? spawnList : (old && old.spawn_list) || [];
		}

		// File changes
		let to_version = undefined;
		try {
			if (data.file_changes) {
				const parsed = JSON.parse(data.file_changes);
				to_version = parsed.to_version;
				arr = parsed.file_changes;
			}
		} catch (e) {
			arr = [];
			console.error('File changes parsing error', e);
		}
		const file_changes = {};
		const reNonDigits = /[^\d]+/g;
		arr.forEach(item => {
			const path = item.file_path;
			const i = path.lastIndexOf('.');
			const ext = i >= 0 ? path.substr(i + 1) : '';
			if (ext == 'json' || ext == 'erik' || ext == 'csv' || ext == 'xml') {
				file_changes[path] = item.file_modified.replace(reNonDigits, '');
			}
		});
		data.file_changes = file_changes;
		data.to_version = to_version;

		let accumulator = {};
		const accumulate = (array, fn) => {
			accumulator = {};
			Array.isArray(array) && array.forEach(fn);
			return accumulator;
		};
		for (const key of ['materials', 'tokens', 'usables', 'stored_buildings', 'stored_decorations', 'stored_windmills']) {
			data[key] = accumulate(data[key] && data[key].item, item => accumulator[item.def_id] = +item.amount);
		}
		data.events_region = accumulate(data.events_region && data.events_region.item, item => accumulator[item.event_id] = +item.region_id);
		data.loc_prog = accumulate(data.loc_prog, item => accumulator[item.id] = item);
		data.achievs = accumulate(data.achievs, item => accumulator[item.def_id] = item);
		data.events = accumulate(data.events, item => accumulator[item.event.def_id] = item.event);

		return data;
	},
	parse_localization_revision: 9,
	requiresFullLanguage: false,
	parse_localization(text, format) {
		const wanted = {
			'ABNA': 'Addon building',
			'EXT': 'Extension',
			'ACNA': 'Achievement',
			'BUNA': 'Building',
			'CAOV': 'Caravan',
			'COL': 'Treasure',
			'DENA': 'Decoration',
			'EVN': 'Event',
			'STDE': 'Event',
			'JOST': 'Journals Sub Title',
			'JOPT': 'Journals Pic Title',
			'LONA': 'Location',
			'MANA': 'Material',
			'MAP': 'Map',
			'NPCN': 'NPC',
			'PHONA': 'Photo Album',
			'QINA': 'Quest Item',
			'QUHE': 'Quest heading text',
			//'TRNA': 'Pieces',
			'USNA': 'Usable',
			'WINA': 'Windmill',
			'CT': 'Theme',
			'DC': 'Diggy Costumes',
			'SPP': 'Special Packs',
			'ACDE': 'Achievement description',
			'MADE': 'Material description',
			'QIDE': 'Quest Item description',
			'USDE': 'Usable description',
			'GUI': 'GUI'
			//'GIP': 'GiftInterface'
			//'MOB': 'Mobile'
		};

		function getFirstAlpha(s) {
			let i = 0;
			for (; i < 5; i++) {
				const c = s.charAt(i);
				if (c < 'A' || c > 'Z') break;
			}
			return s.substr(0, i);
		}
		const isFull = Parser.requiresFullLanguage;
		const data = { isFull };
		const reNewline = /@@@/g;
		if (format == FORMATS.TEXT) {
			const arr = text.split(/[\n\u0085\u2028\u2029]|\r\n?/g);
			arr.forEach(s => {
				const i = s.indexOf('*#*');
				if (i < 0) return;
				if (isFull || (getFirstAlpha(s) in wanted)) {
					const name = s.substr(0, i);
					let value = s.substr(i + 3);
					value = value.replace(reNewline, '\n');
					data[name] = value;
				}
			});
			return data;
		} else if (format == FORMATS.XML) {
			const root = Parser.parseXml(text);
			for (const parent of root.getElementsByTagName('category')) {
				let child = parent.firstElementChild;
				const s = (child && child.getAttribute('index')) || '';
				const key = getFirstAlpha(s);
				if (isFull || (key in wanted)) {
					for (; child; child = child.nextElementSibling) {
						const name = child.getAttribute('index');
						if (name) data[name] = child.textContent.replace(reNewline, '\n');
					}
				}
			}
			return data;
		}
	},
	parse_json(text, format) {
		if (format != FORMATS.JSON) return;
		const result = JSON.parse(text);
		return result;
	},
	parse_erik(text, format) {
		if (format != FORMATS.TEXT) return;
		const arr = text.split(/[\n\u0085\u2028\u2029]|\r\n?/g);
		const keys = arr.length > 0 ? arr.shift().split(/\|/) : [];
		const id = keys.indexOf('def_id') >= 0 ? 'def_id' : (keys.indexOf('override_id') >= 0 ? 'override_id' : null);
		const result = id ? {} : [];
		arr.forEach(s => {
			if (s == '') return;
			const t = s.split(/\|/);
			const o = {};
			const len = Math.min(keys.length, t.length);
			for (let i = 0; i < len; i++) {
				o[keys[i]] = t[i];
			}
			if (id) result[o[id]] = o;
			else result.push(o);
		});
		result.__keys = keys;
		return result;
	},
	fix_buildings(data) {
		const regPrefixes = ['eg|egy|egypt', 'val|valhalla', 'ch|chi|china', 'atl|alt', 'gre', 'nwo'],
			reRegion = new RegExp('_(' + regPrefixes.join('|') + ')([12]?|_(L|reg|stor)?\\d|_(strong|stor|mid|weak))$', 'i'),
			regions = {},
			dictByNId = {};
		regPrefixes.forEach((list, index) => list.split('|').forEach(prefix => regions[prefix] = index + 1));
		for (const building of Object.values(data)) {
			const nid = building.name_loc;
			if (!nid) continue;
			const old = dictByNId[nid];
			if (old) {
				let match;
				// multiple instances of the same name
				if (old[1]) {
					if ((match = old[0].match(reRegion))) old[1].region_id = regions[match[1].toLowerCase()];
					old[1] = null;
				}
				if ((match = building.gr_clip.match(reRegion))) building.region_id = regions[match[1].toLowerCase()];
			} else dictByNId[nid] = [building.gr_clip, building];
		}
	},
	fix_levelups(data) {
		const levelups = Object.values(data);
		for (const levelup of levelups) {
			levelup.def_id = +levelup.def_id;
			levelup.xp = +levelup.xp;
			levelup.boost = levelup.coins = 0;
			for (const reward of levelup.reward) {
				reward.amount = +reward.amount;
				if (reward.type == 'system' && reward.object_id == 2) levelup.boost += reward.amount;
				if (reward.type == 'material' && reward.object_id == 1) levelup.coins += reward.amount;
			}
		}
		levelups.sort((a, b) => a.def_id - b.def_id);
		return levelups;
	}
};