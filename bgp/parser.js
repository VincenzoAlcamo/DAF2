/*global Data*/
const FORMATS = {
    JSON: 'JSON',
    XML: 'XML',
    TEXT: 'TEXT'
};

var Parser = {
    detectFormat: function(text) {
        switch (text && text.charAt(0)) {
            case '{':
                return FORMATS.JSON;
            case '<':
                return FORMATS.XML;
            default:
                return FORMATS.TEXT;
        }
    },
    parse: function(kind, text) {
        var data;
        try {
            var fn = Parser['parse_' + kind];
            if (typeof fn != 'function') throw Error('Parser function not found for "' + kind + '"');
            var format = Parser.detectFormat(text);
            data = fn(text, format);
            if (!data) throw Error('Format not supported "' + format + '"');
        } catch (e) {
            console.error('Parser error:', e);
        }
        return data || {};
    },
    isXmlElement: function(value) {
        if (!value) return false;
        var nodeType = value.nodeType;
        if (nodeType !== 1 && nodeType !== 9) return false;
        var kind = Object.prototype.toString.call(value);
        return kind == '[object XMLDocument]' || kind == '[object Element]';
    },
    parseXml: function(str) {
        if (!Parser.parserXml) Parser.parserXml = new DOMParser();
        return str ? (Parser.isXmlElement(str) ? str : Parser.parserXml.parseFromString(str, 'text/xml')) : null;
    },
    parse_xml: function(source) {
        var root = Parser.parseXml(source);
        if (root && root.nodeType == 9) root = root.documentElement;
        return parse(root);

        function parse(parent) {
            var item = {};

            function add(name, value) {
                if (name in item) {
                    var old = item[name];
                    if (Array.isArray(old)) old.push(value);
                    else item[name] = [old, value];
                } else item[name] = value;
            }
            for (var child = parent.firstElementChild; child; child = child.nextElementSibling) {
                add(child.nodeName, child.firstElementChild ? parse(child) : child.textContent);
            }
            return item;
        }
    },
    parse_any: function(text, format) {
        if (format == FORMATS.JSON) return JSON.parse(text);
        if (format == FORMATS.XML) return Parser.parse_xml(text);
    },
    parse_generator: function(text, format) {
        var data = Parser.parse_any(text, format);
        if (!data) return;

        // Neighbours
        let arr = (data.neighbours && data.neighbours.item) || [];
        delete data.neighbours;
        let neighbours = {};
        let time = data.time;
        let oldNeighbours = Data.neighbours || {};
        let reFBId = /\/(\d+)\/picture/;
        arr.forEach((pal, index) => {
            var id = pal.uid;
            pal.id = id;
            pal.index = index;
            pal.spawned = +pal.spawned || 0;
            // Remove useless data
            delete pal.uid;
            delete pal.pic_square_108;
            // Detect the correct Facebook ID to use
            var match = pal.pic_square.match(reFBId);
            if (match) {
                var fb_id = match[1];
                delete pal.pic_square;
                if(pal.escaped_fb_id && pal.escaped_fb_id != '#' + fb_id) console.log('mismatch', pal.escaped_fb_id, fb_id);
                delete pal.escaped_fb_id;
                pal.fb_id = fb_id;
            }
            // Retrieve extra info for neighbor
            var old = oldNeighbours[id];
            pal.extra = (old && old.extra) || {
                timeCreated: time
            };
            if (old && old.level != pal.level) {
                pal.extra.lastLevel = old.level;
                pal.extra.timeLevel = time;
            }
            pal.extra.lastGift = Math.max(pal.extra.lastGift || 0, pal.rec_gift || 0);
            neighbours[id] = pal;
        });
        data.neighbours = neighbours;

        // File changes
        try {
            if (data.file_changes) arr = JSON.parse(data.file_changes).file_changes;
        } catch (e) {
            arr = [];
            console.error('File changes parsing error', e);
        }
        var file_changes = {};
        let reNonDigits = /[^\d]+/g;
        arr.forEach(item => {
            var path = item.file_path;
            var i = path.lastIndexOf('.');
            var ext = i >= 0 ? path.substr(i + 1) : '';
            if (ext == 'json' || ext == 'erik' || ext == 'csv' || ext == 'xml') {
                file_changes[path] = item.file_modified.replace(reNonDigits, '');
            }
        });
        data.file_changes = file_changes;

        // materials
        for (let key of ['materials', 'tokens', 'usables', 'events_region', 'stored_buildings', 'stored_decorations', 'stored_windmills']) {
            let arr = data[key] && data[key].item;
            let result = {};
            if (Array.isArray(arr)) {
                for (let item of arr) {
                    result[item.def_id] = +item.amount;
                }
            }
            data[key] = result;
        }

        // events
        for (let key of ['events']) {
            let arr = data[key];
            let result = {};
            if (Array.isArray(arr)) {
                for (let item of arr) {
                    item = item.event;
                    result[item.def_id] = item;
                }
            }
            data[key] = result;
        }

        return data;
    },
    parse_localization_revision: 1,
    parse_localization: function(text, format) {
        var wanted = {
            //'ABNA': '',
            'ACNA': 'Achievement',
            'BUNA': 'Building',
            //'CAOV': 'Caravan',
            'COL': 'Treasure',
            'DENA': 'Decoration',
            'EVN': 'Event',
            //'JOST': 'Journals',
            'LONA': 'Location',
            'MANA': 'Material',
            'MAP': 'Map',
            'NPCN': 'NPC',
            'QINA': 'Quest Item',
            //'TRNA': 'Pieces',
            'USNA': 'Usable',
            'WINA': 'Windmill',
            'CT': 'Theme',
            'MADE': 'Material description',
            'QIDE': 'Quest Item description',
            'USDE': 'Usable description',
            'GUI': 'GUI'
            //'GIP': 'GiftInterface'
            //'MOB': 'Mobile'
        };

        function getFirstAlpha(s) {
            for (var i = 0; i < 4; i++) {
                var c = s.charAt(i);
                if (c < 'A' || c > 'Z') break;
            }
            return s.substr(0, i);
        }
        var data = {};
        var reNewline = /@@@/g;
        if (format == FORMATS.TEXT) {
            var arr = text.split(/[\n\u0085\u2028\u2029]|\r\n?/g);
            arr.forEach(s => {
                var i = s.indexOf('*#*');
                if (i < 0) return;
                var key = getFirstAlpha(s);
                if (key in wanted) {
                    var name = s.substr(0, i);
                    var value = s.substr(i + 3);
                    value = value.replace(reNewline, '\n');
                    data[name] = value;
                }
            });
            return data;
        } else if (format == FORMATS.XML) {
            var root = Parser.parseXml(text);
            for (var parent of root.getElementsByTagName('category')) {
                var child = parent.firstElementChild,
                    s = (child && child.getAttribute('index')) || '',
                    key = getFirstAlpha(s);
                if (!(key in wanted)) continue;
                for (; child; child = child.nextElementSibling) {
                    var name = child.getAttribute('index');
                    if (name) data[name] = child.textContent.replace(reNewline, '\n');
                }
            }
            return data;
        }
    },
    parse_erik: function(text, format) {
        if (format != FORMATS.TEXT) return;
        var arr = text.split(/[\n\u0085\u2028\u2029]|\r\n?/g);
        var keys = arr.length > 0 ? arr.shift().split(/\|/) : [];
        var id = keys.indexOf('def_id') >= 0 ? 'def_id' : null;
        var result = id ? {} : [];
        arr.forEach(s => {
            if (s == '') return;
            var t = s.split(/\|/);
            var o = {};
            var len = Math.min(keys.length, t.length);
            for (var i = 0; i < len; i++) {
                o[keys[i]] = t[i];
            }
            if (id) result[o[id]] = o;
            else result.push(o);
        });
        result.__keys = keys;
        return result;
    },
    fix_buildings: function(data) {
        var regPrefixes = ['eg|egy|egypt', 'val|valhalla', 'ch|chi|china', 'atl|alt', 'gre', 'nwo'],
            reRegion = new RegExp('_(' + regPrefixes.join('|') + ')([12]?|_(L|reg|stor)?\\d|_(strong|stor|mid|weak))$', 'i'),
            regions = {},
            dictByNId = {};
        regPrefixes.forEach((list, index) => list.split('|').forEach(prefix => regions[prefix] = index + 1));
        for (var building of Object.values(data)) {
            var nid = building.name_loc;
            if (!nid) continue;
            var old = dictByNId[nid];
            var match;
            if (old) {
                // multiple instances of the same name
                if (old[1]) {
                    if ((match = old[0].match(reRegion))) old[1].region_id = regions[match[1].toLowerCase()];
                    old[1] = null;
                }
                if ((match = building.gr_clip.match(reRegion))) building.region_id = regions[match[1].toLowerCase()];
            } else dictByNId[nid] = [building.gr_clip, building];
        }
    },
    fix_levelups: function(data) {
        var levelups = Object.values(data);
        for (var levelup of levelups) {
            levelup.def_id = +levelup.def_id;
            levelup.xp = +levelup.xp;
            levelup.boost = levelup.coins = 0;
            for (var reward of levelup.reward) {
                reward.amount = +reward.amount;
                if (reward.type == 'system' && reward.object_id == 2) levelup.boost += reward.amount;
                if (reward.type == 'material' && reward.object_id == 1) levelup.coins += reward.amount;
            }
        }
        levelups.sort((a, b) => a.def_id - b.def_id);
        return levelups;
    }
};