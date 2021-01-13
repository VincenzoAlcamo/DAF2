/*global bgp gui Dialog Locale Html*/
export default {
    hasCSS: true,
    init,
    update,
    getState,
    setState,
    actions: { 'daf_mine_action': markToBeRendered },
    requires: (function () {
        const requires = ['addons', 'backgrounds', 'draggables', 'npcs', 'childs', 'tiles', 'extensions', 'events', 'usables', 'materials', 'tokens', 'achievements', 'quests', 'map_filters'];
        for (let rid = gui.getMaxRegion(); rid >= 0; rid--) requires.push('locations_' + rid);
        return requires;
    })()
};

function asArray(t) {
    return t ? [].concat(t) : [];
}
function splitString(v, char) {
    return typeof v == 'number' ? ['' + v] : (typeof v === 'string' && v !== '' ? v.split(char) : []);
}

function arrayToBase64(array) {
    return btoa(String.fromCharCode.apply(null, array));
}
function arrayFromBase64(text) {
    return Uint8Array.from(atob(text).split('').map(c => c.charCodeAt(0)));
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
function getViewed(tileDefs) {
    const length = Math.ceil(tileDefs.length / 8);
    const a = new Uint8Array(length);
    for (const tileDef of tileDefs.filter(t => t.viewed)) {
        const index = tileDef.tileIndex;
        a[Math.floor(index / 8)] |= 1 << (index % 8);
    }
    return arrayToBase64(a);
}

const TILE_SIZE = 62;
const IMG_DIGGY = '/img/gui/diggy.png';
const IMG_DEFAULT_GC = '/img/gui/default_gc.png';
const IMG_SHADOWS = '/img/gui/shadows.png';
const IMG_BEAMS = '/img/gui/beams.png';

let tab, container, map, table, canvas, zoom, cdn_root, versionParameter, checks, tableTileInfo;
const images = {};
let addons, backgrounds, draggables, npcs, childs, tiles, subtiles, specialDrops, allQuestDrops, allQuestDropsFlags, mapFilters;
let playerLevel, playerUidRnd, effects, beamsLoaded;
let currentData;
let showBackground, showBeacon, showTeleport, showDiggy, showDebug, showAll, showTiles, showViewed, showBonus, showNotableLoot, showOpaque;

const lightColors = [gui.getMessage('map_unknown'), gui.getMessage('map_yellow'), gui.getMessage('map_red'), gui.getMessage('map_blue'), gui.getMessage('map_green')];
const getLightColorName = (id) => lightColors[id] || lightColors[0];

const orientations = [gui.getMessage('map_unknown'), gui.getMessage('map_right'), gui.getMessage('map_down'), gui.getMessage('map_left'), gui.getMessage('map_up')];
const getOrientationName = (status) => orientations[status] || orientations[0];

function getLocationName(lid, location) {
    const name = location && location.name_loc;
    return name ? gui.getString(name) : '#' + lid;
}

function init() {
    tab = this;
    container = tab.container;

    tableTileInfo = container.querySelector('.tile-info table');

    const slider = container.querySelector('.scrollable-content');
    map = slider.querySelector('.map');
    canvas = slider.querySelector('canvas');
    table = slider.querySelector('table');
    canvas.width = 1;
    canvas.height = 1;
    zoom = 5;

    let isDown = false;
    let startX, startY, scrollLeft, scrollTop;

    slider.addEventListener('mousedown', e => {
        isDown = true;
        startX = e.pageX - slider.offsetLeft;
        startY = e.pageY - slider.offsetTop;
        scrollLeft = slider.scrollLeft;
        scrollTop = slider.scrollTop;
    });
    slider.addEventListener('mouseleave', () => {
        isDown = false;
    });
    slider.addEventListener('mouseup', () => {
        isDown = false;
    });
    slider.addEventListener('mousemove', e => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const y = e.pageY - slider.offsetTop;
        slider.scrollLeft = scrollLeft - (x - startX);
        slider.scrollTop = scrollTop - (y - startY);
    });
    slider.addEventListener('wheel', e => {
        e.preventDefault();
        zoom -= Math.sign(e.deltaY);
        zoom = Math.min(Math.max(1, zoom), 10);
        gui.updateTabState(tab);
        setCanvasZoom();
    });
    setCanvasZoom();

    checks = Array.from(container.querySelectorAll('.toolbar input[type=checkbox][data-flag]'));
    checks.forEach(el => {
        if (el.previousSibling && el.previousSibling.nodeType == Node.TEXT_NODE) el.previousSibling.remove();
        el.title = gui.getMessage('map_button_' + el.getAttribute('data-flag').toLowerCase());
        el.addEventListener('click', e => {
            const state = getState();
            if ('LBE'.includes(e.target.getAttribute('data-flag'))) {
                updateTableFlags(state);
                return;
            }
            drawMine();
        });
    });

    container.querySelector('[data-id="lid"]').addEventListener('change', e => {
        const lid = +e.target.value;
        const mine = bgp.Data.mineCache.find(t => t.id == lid);
        processMine(mine);
    });

    container.querySelector('button[data-action="save"]').addEventListener('click', _ => {
        if (currentData && canvas) {
            const fileName = `${getLocationName(currentData.lid, currentData.location)}_floor${currentData.fid}.png`;
            canvas.toBlob(blob => gui.downloadData(blob, fileName), 'image/png');
        }
    });

    container.addEventListener('render', function () {
        container.querySelector('.toolbar .warning').textContent = gui.getMessage('dialog_pleasewait');
        setTimeout(processMine, 0);
    });
}

function addQuestDrop(lid, type, id, value) {
    let h = allQuestDrops[lid];
    if (!h) h = allQuestDrops[lid] = {};
    const key = type + '_' + id;
    if (!(key in h)) h[key] = value;
}

function update() {
    ({ cdn_root, versionParameter } = gui.getGenerator());
    if (bgp.Data.lastVisitedMine) gui.setLazyRender(map);
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
        token_505: true,    // CODED FATHER'S NORDIC JOURNAL 1
        token_802: true,    // CODED FATHER'S NORDIC JOURNAL 2
        token_818: true,    // CODED FATHER'S NORDIC JOURNAL 3
        token_1470: true,   // CHINESE JOURNAL
    };
    Object.values(gui.getFile('achievements')).filter(a => +a.event_id > 0 && a.action == 'collect' && a.type == 'material').forEach(a => {
        const key = a.type + '_' + a.object_id;
        specialDrops[key] = true;
    });

    allQuestDrops = {};
    allQuestDropsFlags = {};
    // Quests -> steps -> objectives -> location_type can be:
    // camp, floor, city, bill, map, global_contract_popup, create_mine, crafting_popup
    const materials = gui.getFile('materials');
    for (const quest of Object.values(gui.getFile('quests'))) {
        for (const step of asArray(quest.steps)) {
            for (const obj of asArray(step.objectives)) {
                if (obj.type == 'get' && obj.location_type == 'floor' && +obj.amount > 0 && obj.object_type != 'create_mine') {
                    const { location_id: lid, object_type: type, object_id: id } = obj;
                    if (type == 'material') {
                        const m = materials[id];
                        if (!m || +m.event_id == 0) continue;
                    }
                    addQuestDrop(lid, type, id, quest.def_id);
                }
            }
        }
    }

    mapFilters = {};
    for (const filter of Object.values(gui.getFile('map_filters'))) {
        mapFilters[filter.filter] = gui.getString(filter.name_loc);
    }

    const generator = gui.getGenerator();
    playerLevel = generator.level;
    const uid = generator.player_id;
    playerUidRnd = parseInt(uid.length > 0 ? uid.substring(uid.length - 6) : uid);
    const boughtEffects = asArray(generator.passive_effect_extension && generator.passive_effect_extension.item);
    effects = Object.values(gui.getFile('extensions')).map(e => {
        const id = +e.def_id;
        const effect = boughtEffects.find(t => +t.extension_def_id == id);
        let chance = 0, bonus = 0, level = 0;
        if (effect) {
            level = +effect.extension_level;
            const item = asArray(e.levels).find(t => +t.level == level);
            asArray(item && item.attributes).forEach(a => {
                if (a.attribute_type == 'chance') chance = +a.attribute_value;
                if (a.attribute_type == 'bonus_in_percent') bonus = +a.attribute_value;
            });
        }
        return bonus > 0 && chance > 0 ? ({ id, type: e.type, level, chance, bonus }) : null;
    }).filter(t => t);
}

function markToBeRendered() {
    gui.setLazyRender(map);
    delete bgp.Data.lastViewedMine;
}

function getState() {
    const flagAdmin = bgp.Data.isAdmin();
    return {
        show: checks.map(check => check.checked && (!check.classList.contains('for-admin') || flagAdmin) ? check.getAttribute('data-flag') : '').sort().join('').toLowerCase(),
        zoom: zoom
    };
}

function setState(state) {
    const flags = String(state.show || '').toUpperCase();
    checks.forEach(check => check.checked = flags.includes(check.getAttribute('data-flag')));
    zoom = Math.min(Math.max(2, Math.round(+state.zoom || 5)), 10);
    setCanvasZoom();
}

function addImage(asset, url) {
    if (asset && !(asset in images)) {
        const item = { loaded: false };
        images[asset] = item;
        item.promise = new Promise((resolve, _reject) => {
            if (!url) url = asset.startsWith('/') ? asset : cdn_root + 'mobile/graphics/all/' + encodeURIComponent(asset) + '.png' + versionParameter;
            const img = new Image();
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
    }
}

const zoomFactors = [0.25, 0.375, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.4];
function setCanvasZoom() {
    const width = canvas.width;
    const height = canvas.height;
    const zoomFactor = zoomFactors[zoom - 1];
    canvas.style.transform = `scale(${zoomFactor})`;
    table.style.transform = `scale(${zoomFactor})`;
    map.style.width = `${Math.floor(width * zoomFactor)}px`;
    map.style.height = `${Math.floor(height * zoomFactor)}px`;
}

function addTitle(x, y, text, isBlockTitle) {
    try {
        const cell = table.rows[y].cells[x];
        cell.title = (cell.title ? cell.title + '\n' + (isBlockTitle ? '\n' : '') : `(${x}, ${y})\n`) + text;
    } catch (e) { }
}

function changeLevel(e) {
    if (!currentData || e.target.disabled) return;
    const lid = currentData.lid;
    const fid = +e.target.getAttribute('data-flag');
    const found = bgp.Data.mineCache.find(m => m.id == lid && m.level_id == fid);
    if (found) processMine(found);
}

async function calcMine(mine, flagAddImages) {
    if (!mine) return;
    mine.processed = gui.getUnixTime();
    const flagAdmin = bgp.Data.isAdmin();
    const { id: lid, level_id: fid, columns: cols, rows } = mine;

    let rid = mine.region;

    const generator = gui.getGenerator();
    const locProg = bgp.Data.getLocProg(lid);
    const resetCount = (locProg && locProg.reset) || 0;

    const locations = gui.getFile('locations_' + rid);
    const location = locations[lid];
    const eid = mine.region == 0 && +location.event_id;
    if (eid) rid = generator.events_region[eid] || generator.region;

    const isInvalidCoords = (x, y) => y < 0 || y >= rows || x < 0 || x >= cols;
    const addAsset = (item) => flagAddImages && item && addImage(item.mobile_asset);

    const data = { mine, lid, fid, eid, rid, cols, rows, resetCount, location };

    let floors = await bgp.Data.getFile(`floors_${lid}`);
    data.floors = floors = asArray(floors && floors.floor);
    const floor = data.floor = floors.find(floor => floor.def_id == fid);
    if (!floor) return;
    data.floorNumbers = floors.map(f => f.def_id).filter(n => n > 0).sort((a, b) => a - b);

    const defaultBgId = floor.bg_id;
    addAsset(backgrounds[defaultBgId]);

    const computeTile = tileDef => {
        const { x, y } = tileDef;
        let { tileId, tileSubtype } = tileDef;
        let tile = null;
        if (tileId > 0) {
            const pTileId = tileId;
            tile = tiles[tileId];
            if (rid != 0 && tile && tile.overrides) {
                const item = tile.overrides.find(o => +o.region_id == rid);
                if (item) {
                    tileId = +item.override_tile_id;
                    tile = tiles[tileId];
                }
            }
            if (tileId != pTileId && tile.subtypes && tile.subtypes.length) {
                const subtypes = tile.subtypes.filter(st => +st.frames == 0 || +st.breakup == 0);
                if (subtypes.length) {
                    tileSubtype = +subtypes[CustomRandomRND(x * 1000 + y * 100) % subtypes.length | 0].def_id;
                }
            }
        }
        tileDef.tileId = tileId;
        tileDef.tileSubtype = tileSubtype;
        const item = subtiles[tileDef.tileSubtype];
        addAsset(item);
        tileDef.stamina = tile ? +tile.stamina : 0;
        tileDef.shadow = tile ? +tile.shadow : 0;
        delete tileDef.toDo;
        delete tileDef.staminaLoot;
        if (tileDef.stamina > 0) {
            tileDef.staminaLoot = [{ type: 'system', id: 1, amount: tileDef.stamina }];
            for (const effect of (flagAdmin ? effects : [])) {
                let rnd = CustomRandomRND(playerUidRnd + 10000 * lid + 1000 * fid + 100 * y + 10 * x + effect.id + resetCount);
                rnd = rnd % 10001 / 100;
                if (rnd <= effect.chance) {
                    const amount = Math.floor(tileDef.stamina * effect.bonus / 100);
                    if (amount > 0) {
                        if (effect.type == 'stamina_bonus_passive_effect') {
                            tileDef.staminaLoot.push({ type: 'system', id: 2, amount, forAdmin: true });
                            tileDef.isBonusEnergy = true;
                        }
                        if (effect.type == 'xp_bonus_passive_effect') {
                            tileDef.staminaLoot.push({ type: 'system', id: 1, amount, forAdmin: true });
                            tileDef.isBonusXp = true;
                        }
                    }
                }
            }
        }
    };

    // Build tileDefs
    const tileDefs = data.tileDefs = [];
    mine.tiles.split(';').forEach((tileData, tileIndex) => {
        const x = tileIndex % cols;
        const y = Math.floor(tileIndex / cols);
        const tileDef = tileDefs[tileIndex] = { x, y, tileIndex };
        tileDef.bgId = defaultBgId;
        // eslint-disable-next-line prefer-const
        let [tileId, tileStatus, , tileSubtype, visible] = tileData.split(',').map(v => +v || 0);
        tileDef.tileStatus = tileStatus;
        tileDef.visible = visible == 1;
        if (tileDef.visible) tileDef.show = tileDef.viewed = true;
        tileDef.tileId = tileId;
        tileDef.tileSubtype = tileSubtype;
        computeTile(tileDef);
    });
    applyViewed(tileDefs, mine._v);

    // Loot
    const filterByRegion = a => {
        const regionId = +a.region_id || 0;
        return regionId == rid || regionId == 0;
    };
    for (const area of asArray(floor.loot_areas && floor.loot_areas.loot_area).filter(filterByRegion)) {
        const { area_id, min, max, random, type } = area;
        const tiles = typeof area.tiles == 'string' ? area.tiles.split(';') : [];
        const indexes = random > 0 ? lootIndex(mine.key, area_id, tiles.length, random) : null;
        tiles.forEach((tile, index) => {
            if (!indexes || indexes.indexOf(index) >= 0) {
                const [y, x] = tile.split(',').map(v => +v);
                let coef = 0, amount;
                if (min > max) {
                    amount = 1;
                } else {
                    amount = min == max ? min : Math.floor(Math.max(CustomRandomTileRND(mine.key, x, y, area_id * 10000) % (max - min + 1) + min, 0));
                    coef = area.coef;
                }
                if (type == 'chest' || type == 'artifact') {
                    // Do nothing
                } else {
                    if (coef > 0) amount = amount + Math.floor(amount * coef * playerLevel);
                    if (amount > 0) {
                        const tileDef = tileDefs[y * cols + x];
                        if (!tileDef.loot) tileDef.loot = [];
                        tileDef.loot.push({ type, id: area.object_id, amount });
                    }
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
                const [y, x] = tile.split(',').map(v => +v);
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
            obj.tiles.split(';').forEach(tile => {
                const [y, x] = tile.split(',').map(v => +v);
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
    const max_child = (generator.camp.max_child || 0) + 1;
    const child_charges = 15;
    const setNpc = (tileDef, npcId) => {
        const item = npcs[npcId];
        if (item) {
            addAsset(item);
            tileDef.npcId = npcId;
            if (+item.pick_child > 0) {
                const child = childs[item.pick_child];
                let energy = Math.floor(CustomRandomRND(playerUidRnd + (100 * max_child + child_charges + 1) + 20000) % (child.max_stamina - child.min_stamina + 1) + child.min_stamina);
                tileDef.npcLoot = [];
                for (const obj of asArray(child.drops).filter(t => +t.region_id == rid)) {
                    const value = Math.floor(CustomRandomRND(playerUidRnd + (100 * max_child + child_charges + 1) + 20000) % (+obj.max - +obj.min + 1) + +obj.min);
                    if (obj.type == 'system' && +obj.object_id == 2) {
                        energy += value;
                    } else {
                        tileDef.npcLoot.push({ type: obj.type, id: +obj.object_id, amount: value * 15 });
                    }
                }
                tileDef.npcLoot.push({ type: 'system', id: 2, amount: energy * 15 });
            } else if (item.pick_token && item.pick_token != '0') {
                const pickTokens = item.pick_token.split(',').map(v => +v);
                const pickAmounts = item.pick_amount.split(',').map(v => +v);
                tileDef.npcLoot = pickTokens.map((t, i) => ({ type: 'token', id: t, amount: pickAmounts[i] })).filter(l => l.amount > 0);
            }
        }
    };
    for (const obj of asArray(mine.npcs)) {
        const { def_id: id, column: x, row: y } = obj;
        setNpc(tileDefs[y * cols + x], id);
    }

    // Hints
    const hints = data.hints = {};
    for (const hint of asArray(floor.hints && floor.hints.hint)) {
        hints[hint.hint_id] = hint;
    }
    for (const obj of asArray(mine.hints)) {
        const { def_id: id, row: y, column: x } = obj;
        const item = hints[id];
        if (item) {
            addAsset(item);
            const tileDef = tileDefs[y * cols + x];
            tileDef.miscId = id;
            tileDef.miscType = 'H';
        }
    }

    // Entrances
    const entrances = data.entrances = {};
    for (const entrance of asArray(floor.entrances && floor.entrances.entrance)) {
        entrances[entrance.entrance_id] = entrance;
    }
    for (const obj of asArray(floor.hide_entrance == 0 ? mine.entrances : null)) {
        const { def_id: id, row: y, column: x } = obj;
        const item = entrances[id];
        if (item) {
            addAsset(item);
            const tileDef = tileDefs[y * cols + x];
            tileDef.miscId = id;
            tileDef.miscType = 'N';
        }
    }

    // Exits
    const exits = data.exits = {};
    for (const exit of asArray(floor.exits && floor.exits.exit)) {
        exits[exit.exit_id] = exit;
    }
    for (const obj of asArray(mine.exits)) {
        const { def_id: id, row: y, column: x } = obj;
        const item = exits[id];
        if (item) {
            addAsset(item);
            const tileDef = tileDefs[y * cols + x];
            tileDef.miscId = id;
            tileDef.miscType = 'X';
        }
    }

    // Draggables
    for (const obj of asArray(mine.drags)) {
        const { def_id: id, row: y, column: x, state } = obj;
        const item = draggables[id];
        if (item) {
            addAsset(item);
            const tileDef = tileDefs[y * cols + x];
            tileDef.draggableId = id;
            tileDef.draggableStatus = state;
        }
    }

    // Beacons
    const beacons = data.beacons = {};
    const beaconParts = data.beaconParts = {};
    const getBeaconPart = (beaconId, partId) => beaconParts[`${beaconId}_${partId}`];
    for (const beacon of asArray(floor.beacons && floor.beacons.beacon)) {
        const id = beacon.beacon_id;
        const copy = Object.assign({}, beacon);
        beacons[id] = copy;
        copy.parts = {};
        copy.parts.part = asArray(beacon.parts && beacon.parts.part).map(beaconPart => {
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
        for (const action of asArray(beacon.actions.action).filter(a => a.layer == 'vision')) {
            const values = splitString(action.values, ',');
            if (values.length == 1 && +values[0] != 1) continue;
            for (const tile of splitString(action.tiles, ';')) {
                const [y, x] = tile.split(',').map(v => +v);
                if (!isInvalidCoords(x, y)) tileDefs[y * cols + x].show = true;
            }
        }
    }
    for (const obj of asArray(mine.beacons)) {
        const { def_id: id, row: y, column: x, part, state } = obj;
        const beaconPart = getBeaconPart(id, part);
        if (beaconPart) {
            const tileDef = tileDefs[y * cols + x];
            tileDef.miscId = id;
            tileDef.miscType = 'B';
            tileDef.beaconPart = part;
            beaconPart.active = state == 1;
            if (beaconPart.frames > 0) addAsset(beaconPart);
        }
    }

    // Teleports
    const teleports = data.teleports = {};
    for (const teleport of asArray(floor.teleports && floor.teleports.teleport)) teleports[teleport.teleport_id] = teleport;
    for (const teleport of asArray(mine.teleports)) teleports[teleport.def_id] = Object.assign(teleports[teleport.def_id], teleport);
    for (const teleport of Object.values(teleports)) {
        const { row: y, column: x } = teleport;
        const tileDef = tileDefs[y * cols + x];
        tileDef.teleportId = teleport.teleport_id;
    }

    // Execute all queued actions
    const isRequiredOrientation = (beaconPart, status) => {
        const v = beaconPart.req_drag_rotation;
        return v === 'none' || v === ['', 'right', 'down', 'left', 'up'][status];
    };
    const removeBeacon = tileDef => {
        delete tileDef.miscId;
        delete tileDef.miscType;
        delete tileDef.beaconPart;
    };
    const layerFns = {
        'misc': (tileDef, value, _values) => {
            // 0 = remove
            // B_beaconid_partid_active = set active
            // else toggle active
            if (value == '0') {
                removeBeacon(tileDef);
            } else {
                const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
                if (!beaconPart) return false;
                beaconPart.active = value ? value.split('_')[3] == '1' : !beaconPart.active;
            }
        },
        'drag': (tileDef, _value, values) => {
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
                addAsset(draggables[asArray(draggable.overrides).filter(o => +o.region_id == rid).map(o => o.override_drag_id)[0]]);
                if (v.length > 1) tileDef.draggableStatus = +v[1];
                tileDef.draggableStatus = tileDef.draggableStatus || 1;
            }
        },
        'npc': (tileDef, value, _values) => {
            if (value == '0') {
                delete tileDef.npcId;
                delete tileDef.npcLoot;
            } else {
                const npc = npcs[value];
                if (!npc) return false;
                setNpc(tileDef, +value);
                removeBeacon(tileDef);
            }
        },
        'id': (tileDef, value, values) => {
            tileDef.tileId = values.length > 1 && tileDef.tileId == +value ? +values[1] : +value;
            tileDef.toDo = true;
        },
        'subtype': (tileDef, value, values) => {
            tileDef.tileSubtype = values.length > 1 && tileDef.tileSubtype == +value ? +values[1] : +value;
            tileDef.toDo = true;
        },
        'status': (tileDef, value, values) => {
            tileDef.tileStatus = values.length > 1 && tileDef.tileStatus == +value ? +values[1] : +value;
        },
        'vision': (tileDef, value, values) => {
            tileDef.visible = values.length == 1 ? +value == 1 : !tileDef.visible;
            if (tileDef.visible) tileDef.viewed = true;
        }
    };
    layerFns['drag_swap'] = layerFns['drag'];
    const executeBeaconActions = beacon => {
        for (const action of asArray(beacon.actions.action)) {
            const layer = action.layer;
            if (layer == 'delay' || layer == 'focus' || layer == 'force_focus' || layer == 'force_idle_text' || layer == 'loot') continue;
            const fn = layerFns[action.layer];
            if (!fn) {
                console.log('unknown layer', action);
                return false;
            }
            const values = splitString(action.values, ',');
            const value = values.length == 1 ? values[0] : undefined;
            const tiles = splitString(action.tiles, ';');
            for (const tile of tiles) {
                const [y, x] = tile.split(',').map(v => +v);
                if (isInvalidCoords(x, y)) return false;
                if (fn(tileDefs[y * cols + x], value, values) === false) return false;
            }
        }
        return true;
    };
    const setBeaconPartActive = (tileDef, beacon, beaconPart, flag) => {
        beaconPart.active = flag;
        if (!beacon) return false;
        if (beaconPart.active) {
            // if (beaconPart.type == 'one-way') removeBeacon(tileDef);
            if (!asArray(beacon.parts.part).find(p => !p.active)) return executeBeaconActions(beacon);
        }
        return true;
    };
    const executeAction = action => {
        const { x, y } = action;
        let { cx, cy } = action;
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
            cx = target.column;
            cy = target.row;
        } else if (action.action == 'leave_mine') {
            if (action.loc_id != lid || action.level != fid) return false;
        } else if (action.action == 'pick_child' || action.action == 'pick_npc') {
            delete tileDef.npcId;
            delete tileDef.npcLoot;
        } else if (action.action == 'manipulate_object') {
            tileDef.draggableStatus = (tileDef.draggableStatus - 1 + (action.direction == 'right' ? 1 : 3)) % 4 + 1;
        } else if (action.action == 'change_level') {
            const id = action.exit_id;
            const obj = asArray(action.direction == 'down' ? mine.exits : mine.entrances).find(e => e.def_id == id);
            if (!obj) return false;
            cx = obj.column;
            cy = obj.row;
        } else if (action.action == 'drag_object') {
            const draggableId = tileDef.draggableId;
            const draggable = draggables[draggableId];
            if (!draggable) return false;
            const { direction, type } = action;
            let dx = x, dy = y;
            const applyDirection = _ => {
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
            dest.draggableStatus = +draggable.rotate == 1 && (action.direction == 'right' || action.direction == 'left') ? (tileDef.draggableStatus - 1 + (action.direction == 'right' ? 1 : 3)) % 4 + 1 : tileDef.draggableStatus;
            delete tileDef.draggableId;
            delete tileDef.draggableStatus;
            // check pit
            const beaconPart = dest.miscType == 'B' && getBeaconPart(dest.miscId, dest.beaconPart);
            if (beaconPart && !beaconPart.active && (beaconPart.activation == 'pit' || beaconPart.activation == 'push')) {
                if (beaconPart.req_drag == 0 || (beaconPart.req_drag == draggableId && isRequiredOrientation(beaconPart, dest.draggableStatus))) {
                    beaconPart.active = true;
                    executeBeaconActions(beacons[dest.miscId]);
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
    const wrongAction = asArray(mine.actions).find(action => !executeAction(action));
    if (wrongAction) console.log(wrongAction);
    for (const tileDef of tileDefs.filter(t => t.toDo)) computeTile(tileDef);

    // Add beacon requirements as quest loot
    for (const beacon of Object.values(beaconParts).filter(b => !b.active && b.req_material > 0)) {
        addQuestDrop(lid, 'token', beacon.req_material, 'beacon');
    }
    allQuestDropsFlags[`${lid}_${fid}`] = Object.keys(allQuestDrops[lid] || {}).length;

    // Check loot
    let numTiles = 0;
    let cost = 0;
    let numSpecial = 0;
    let numQuest = 0;
    const isRepeatable = +location.reset_cd > 0;
    const questDrops = (!isRepeatable && allQuestDrops[mine.id]) || {};
    const checkLoot = (tileDef, loot) => {
        for (const drop of loot) {
            const key = drop.type + '_' + drop.id;
            if (key in specialDrops) { tileDef.isSpecial = true; numSpecial++; }
            if (key in questDrops) { tileDef.isQuest = true; numQuest++; }
        }
    };
    for (const tileDef of tileDefs) {
        tileDef.isSpecial = tileDef.isQuest = false;
        tileDef.isTile = tileDef.tileSubtype && tileDef.tileSubtype in subtiles && tileDef.stamina >= 0 && tileDef.tileStatus == 0;
        let hasLoot = false;
        if (tileDef.isTile) {
            numTiles++;
            cost += tileDef.stamina;
            if (tileDef.staminaLoot) {
                tileDef.loot = tileDef.staminaLoot.concat(tileDef.loot || []);
                delete tileDef.staminaLoot;
            }
            hasLoot = true;
        } else if (tileDef.miscType == 'B') {
            const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
            if (!beaconPart.active && beaconPart.activation == 'use') hasLoot = true;
        }
        if (hasLoot && tileDef.loot) {
            tileDef.hasLoot = true;
            checkLoot(tileDef, tileDef.loot);
        }
        if (tileDef.npcLoot) checkLoot(tileDef, tileDef.npcLoot);
    }
    mine.numTiles = numTiles;
    mine.cost = cost;
    mine.numSpecial = numSpecial;
    mine.numQuest = numQuest;

    // Transparency
    for (const tileDef of tileDefs) tileDef.solid = 0;
    for (const tileDef of tileDefs) {
        const { x, y } = tileDef;
        if (tileDef.draggableId) tileDef.solid |= 1;
        if (tileDef.miscType == 'B') {
            const beaconPart = getBeaconPart(tileDef.miscId, tileDef.beaconPart);
            const activation = beaconPart && beaconPart.activation;
            if (activation == 'pit' && beaconPart.active) tileDef.solid |= 1;
            if ((activation == 'use' || activation == 'sensor') || ((activation == 'door_r' || activation == 'door') && !beaconPart.active)) tileDef.solid |= 16;
        }
        if (tileDef.backgroundAddonId) {
            const addon = addons[tileDef.backgroundAddonId];
            if (addon && +addon.solid) {
                const height = +addon.rows;
                const width = +addon.columns;
                let index = y * cols + x;
                for (let dy = 0; dy < height; dy++) {
                    for (let dx = 0; dx < width; dx++) tileDefs[index + dx].solid |= 2;
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

    mine._v = getViewed(tileDefs);

    return data;
}

async function addExtensionImages() {
    addImage(IMG_DIGGY);
    addImage(IMG_DEFAULT_GC);
    addImage(IMG_SHADOWS);
    addImage(IMG_BEAMS);

    if (!beamsLoaded) {
        await images[IMG_BEAMS].promise;
        const img = images[IMG_BEAMS].img;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
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

async function processMine(selectedMine) {
    currentData = await calcMine(selectedMine || bgp.Data.lastViewedMine || bgp.Data.lastVisitedMine, true);
    if (!currentData) return;

    bgp.Data.lastViewedMine = currentData.mine;

    // Create location combo
    const options = {};
    const addOption = (id, rid) => {
        if (id in options) return;
        const locations = gui.getFile('locations_' + rid);
        const name = getLocationName(id, locations[id]);
        options[id] = [name, `<option value="${id}"${currentData.lid == id ? ' selected' : ''}>${name}</option>`];
    };
    addOption(currentData.mine.id, currentData.mine.region);
    for (const m of bgp.Data.mineCache) addOption(m.id, m.region);
    const values = Object.values(options);
    values.sort((a, b) => gui.sortTextAscending(a[0], b[0]));
    Dialog.htmlToDOM(container.querySelector('[data-id="lid"]'), values.map(t => t[1]).join(''));

    const div = container.querySelector('[data-id="eid"]');
    div.textContent = currentData.eid ? gui.getObjectName('event', currentData.eid) : '';
    div.parentNode.style.display = currentData.eid ? '' : 'none';

    let text = gui.getObjectName('region', currentData.rid);
    if (!currentData.eid) {
        const s = mapFilters[currentData.location.filter];
        if (s) text += ' \u2013 ' + s;
    }
    container.querySelector('[data-id="rid"]').textContent = text;

    tableTileInfo.classList.toggle('is-repeatable', +currentData.location.reset_cd > 0);

    await addExtensionImages();
    // for debugging purposes
    window.mineData = currentData;
    window.subtiles = subtiles;
    // window.allQuestDrops = allQuestDrops;
    drawMine();
}

function updateTableFlags(state) {
    if (!map) return;
    showBackground = state.show.includes('k');
    showBeacon = state.show.includes('e');
    showTeleport = state.show.includes('t');
    showDiggy = state.show.includes('d');
    showDebug = state.show.includes('g');
    showAll = state.show.includes('a');
    showTiles = state.show.includes('l');
    showViewed = state.show.includes('v');
    showBonus = state.show.includes('b');
    showNotableLoot = state.show.includes('n');
    showOpaque = state.show.includes('o');
    map.classList.toggle('show_beacon', showBeacon);
    map.classList.toggle('show_tiles', !showBackground && showTiles);
    map.classList.toggle('show_bonus', !showBackground && showBonus);
    map.classList.toggle('show_notable', showNotableLoot);
    map.classList.toggle('show_opaque', showOpaque);
}

async function drawMine() {
    const flagAdmin = bgp.Data.isAdmin();

    gui.updateTabState(tab);
    const state = getState();
    updateTableFlags(state);
    if (!currentData) return;

    const { lid, fid } = currentData;
    const numQuestDrops = Object.keys(allQuestDrops[lid] || {}).length;
    for (const floorId of currentData.floorNumbers) {
        const found = bgp.Data.mineCache.find(m => m.id == lid && m.level_id == floorId);
        if (found && floorId != fid) {
            const recalc = (found.processed || 0) < found.time || numQuestDrops !== allQuestDropsFlags[`${lid}_${floorId}`];
            if (recalc) await calcMine(found, false);
        }
    }
    if (Object.keys(allQuestDrops[lid] || {}).length !== allQuestDropsFlags[`${lid}_${fid}`]) currentData = await calcMine(currentData.mine);

    const { rows, cols, rid, tileDefs, beaconParts, entrances, exits, hints, teleports } = currentData;

    canvas.width = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    setCanvasZoom();
    document.body.classList.add('map-rendered');

    const tbody = table.querySelector('tbody');
    Dialog.htmlToDOM(tbody, '');
    for (let y = 0; y < rows; y++) {
        const row = tbody.insertRow();
        for (let x = 0; x < cols; x++) {
            row.insertCell();
        }
    }
    table.style.width = (cols * TILE_SIZE) + 'px';
    table.style.height = (rows * TILE_SIZE) + 'px';

    bgp.Data.requiresFullLanguage = true;
    await (bgp.Data.checkLocalization() || Promise.resolve(0));
    await Promise.all(Object.values(images).map(i => i.promise));

    const getBeaconPart = (beaconId, partId) => beaconParts[`${beaconId}_${partId}`];
    const getMiscItem = (tileDef) => {
        if (tileDef.miscType == 'N') return entrances[tileDef.miscId];
        if (tileDef.miscType == 'X') return exits[tileDef.miscId];
        if (tileDef.miscType == 'H') return hints[tileDef.miscId];
        if (tileDef.miscType == 'B') return getBeaconPart(tileDef.miscId, tileDef.beaconPart);
    };

    const ctx = canvas.getContext('2d');
    const resetTransformation = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
    const transform = (cx, cy, flipX, flipY, rotation) => {
        ctx.translate(cx, cy);
        if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        if (rotation) ctx.rotate(rotation);
        ctx.translate(-cx, -cy);
    };

    const drawAddon = (x, y, item, img, dx, dy) => {
        if (img) {
            const width = +item.columns;
            const height = +item.rows;
            const isAnimated = +item.animated;
            const sw = isAnimated ? width * TILE_SIZE : img.naturalWidth;
            const sh = isAnimated ? height * TILE_SIZE : img.naturalHeight;
            if (dx === undefined) {
                ctx.drawImage(img, 0, 0, sw, sh, x * TILE_SIZE, y * TILE_SIZE, width * TILE_SIZE, height * TILE_SIZE);
            } else {
                const px = sw / width;
                const py = sh / height;
                ctx.drawImage(img, dx * px, dy * py, px, py, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    };
    const drawFrame = (x, y, img, frame, flipX, flipY, rotation) => {
        const sw = img.naturalWidth;
        const columns = Math.round(sw / TILE_SIZE);
        const xpos = frame % columns;
        const ypos = Math.floor(frame / columns);
        transform((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, flipX, flipY, rotation * Math.PI / 2);
        ctx.drawImage(img, xpos * TILE_SIZE, ypos * TILE_SIZE, TILE_SIZE, TILE_SIZE, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        resetTransformation();
    };
    const drawAll = (items, key, fn) => {
        for (const tileDef of tileDefs) {
            const item = items[tileDef[key]];
            if (item) fn(tileDef.x, tileDef.y, tileDef, item, item.mobile_asset && images[item.mobile_asset].img);
        }
    };
    const addDrop = (x, y, drops) => {
        let s = '';
        for (const drop of drops) {
            if (drop.forAdmin && !flagAdmin) continue;
            s += `\n${Locale.formatNumber(drop.amount)} \xd7 ${gui.getObjectName(drop.type, drop.id)}`;
        }
        addTitle(x, y, gui.getMessageAndValue('gui_loot', s));
    };

    const drawTeleport = (teleport) => {
        const { column: sx, row: sy } = teleport;
        const target = teleports[teleport.target_teleport_id];
        if (!target) return;

        const { column: tx, row: ty } = target;
        const isBidi = target.target_teleport_id == teleport.teleport_id;
        // Show only one arrow for bidirectional teleports
        if (isBidi && sx + sy * cols > tx + ty * cols) return;

        const width = 3;
        const addSegment = (p, angle, length) => [p[0] + length * Math.cos(angle), p[1] + length * Math.sin(angle)];

        const ps = [(sx + 0.5) * TILE_SIZE, (sy + 0.5) * TILE_SIZE];
        const pe = [(tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE];
        const dx = pe[0] - ps[0];
        const dy = pe[1] - ps[1];
        const angle = Math.atan2(dy, dx);

        let length = Math.sqrt(dx * dx + dy * dy);
        let p1 = ps;
        if (!isBidi) {
            length -= TILE_SIZE / 2;
            p1 = addSegment(ps, angle, TILE_SIZE / 6);
        }

        const p2 = addSegment(p1, angle + Math.PI / 2, width);
        const p3 = addSegment(p2, angle, length - 20);
        const p4 = addSegment(p3, angle + Math.PI / 2, width * 2);
        const p5 = addSegment(p1, angle, length);

        const p6 = addSegment(p1, angle - Math.PI / 2, width);
        const p7 = addSegment(p6, angle, length - 20);
        const p8 = addSegment(p7, angle - Math.PI / 2, width * 2);

        let path;
        if (isBidi) {
            const angle2 = angle + Math.PI;
            const p9 = addSegment(p5, angle2 + Math.PI / 2, width);
            const p10 = addSegment(p9, angle2, length - 20);
            const p11 = addSegment(p10, angle2 + Math.PI / 2, width * 2);
            const p12 = addSegment(p5, angle2 - Math.PI / 2, width);
            const p13 = addSegment(p12, angle2, length - 20);
            const p14 = addSegment(p13, angle2 - Math.PI / 2, width * 2);
            path = [p1, p14, p13, p3, p4, p5, p8, p7, p10, p11];
        } else {
            path = [p2, p3, p4, p5, p8, p7, p6];
        }

        ctx.strokeStyle = '#000C';
        ctx.fillStyle = isBidi ? '#FC4C' : '#88FC';
        ctx.beginPath();
        ctx.moveTo(path[0][0], path[0][1]);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
        ctx.lineTo(path[0][0], path[0][1]);
        ctx.fill();
        ctx.stroke();
    };

    // Set visibility
    for (const tileDef of tileDefs) {
        tileDef.isVisible = showAll ? tileDef.show : (showViewed ? tileDef.viewed : tileDef.visible);
    }

    // Backgrounds
    drawAll(backgrounds, 'bgId', (x, y, tileDef, item, img) => {
        if (img) {
            ctx.drawImage(img, (x % 4) * TILE_SIZE, (y % 4) * TILE_SIZE, TILE_SIZE, TILE_SIZE, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    });

    // Background Addons
    for (const tileDef of tileDefs) {
        delete tileDef.bgaDx;
        delete tileDef.bgaDy;
        delete tileDef.bgaIsFull;
    }
    drawAll(addons, 'backgroundAddonId', (x, y, tileDef, item, img) => {
        // If a tile is here
        if (+item.columns == 1 && +item.rows == 1) {
            if (tileDef.tileStatus == 0 && !showBackground && tileDef.stamina >= 0) return;
            if (tileDef.tileStatus == 0 && tileDef.stamina < 0) return;
        }
        if (tileDef.foregroundAddonId && (tileDef.tileStatus == 0 && (!showBackground || tileDef.stamina < 0))) return;
        if (img) {
            tileDef.bgaIsFull = true;
            const width = +item.columns;
            const height = +item.rows;
            for (let dy = 0; dy < height && y + dy < rows; dy++) {
                for (let dx = 0; dx < width && x + dx < cols; dx++) {
                    const tileDef2 = tileDefs[(y + dy) * cols + x + dx];
                    if (tileDef2.bgaDx !== undefined) {
                        // Mark previous background addon as not full
                        tileDefs[(y + dy - tileDef2.bgaDy) * cols + x + dx - tileDef2.bgaDx].bgaIsFull = false;
                    }
                    tileDef2.bgaDx = dx;
                    tileDef2.bgaDy = dy;
                }
            }
        }
    });
    for (const tileDef of tileDefs.filter(t => t.bgaDx !== undefined)) {
        const { x, y, bgaDx: dx, bgaDy: dy } = tileDef;
        const tileDef2 = tileDefs[(y - dy) * cols + x - dx];
        const item = addons[tileDef2.backgroundAddonId];
        const img = images[item.mobile_asset].img;
        if (!tileDef2.bgaIsFull) drawAddon(x, y, item, img, dx, dy);
        else if (dx == 0 && dy == 0) drawAddon(x, y, item, img);
    }

    // Misc
    for (const tileDef of tileDefs.filter(t => t.miscType)) {
        const { x, y } = tileDef;
        const item = getMiscItem(tileDef);
        if (!item) continue;
        const texts = [];
        if (tileDef.miscType == 'N') texts.push(gui.getMessage('map_entrance'));
        if (tileDef.miscType == 'X') texts.push(gui.getMessage('map_exit'));
        if (tileDef.miscType == 'H') {
            const hint = gui.getString(item.localization);
            texts.push(hint ? gui.getWrappedText(gui.getMessageAndValue('map_hint', '\u201c' + hint + '\u201d')) : gui.getMessage('map_hint'));
        }
        if (tileDef.miscType == 'B' && flagAdmin) {
            texts.push(`${gui.getMessage('map_beacon')} (${gui.getMessage(item.active ? 'map_active' : 'map_not_active')})`);
            if (item.req_drag) texts.push(`${gui.getMessage('map_require_draggable')} #${item.req_drag}${item.req_drag_rotation != 'none' ? ` (${getOrientationName(item.req_drag_rotation)})` : ''}`);
            if (item.req_material) {
                const token = gui.getObject('token', item.req_material);
                const name = token.name_loc ? gui.getString(token.name_loc) : '#' + item.req_material;
                texts.push(gui.getMessageAndValue('map_require_item', (item.req_amount > 1 ? Locale.formatNumber(item.req_amount) + ' \xd7 ' : '') + name));
            }
            if (item.req_light) {
                texts.push(gui.getMessageAndValue('map_require_light', getLightColorName(item.req_light)));
            }
        }
        if (texts.length) addTitle(x, y, texts.join('\n'), true);
        const img = item && item.mobile_asset && images[item.mobile_asset].img;
        if (img) {
            if (tileDef.miscType == 'B') {
                drawFrame(x, y, img, item.active ? 0 : item.frames - 1, false, false, item.rotation / 90);
            } else {
                ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE);
            }
        }
    }

    // Tiles
    drawAll(subtiles, 'tileSubtype', (x, y, tileDef, item, img) => {
        if (!tileDef.isVisible) return;
        const cell = table.rows[y].cells[x];
        cell.classList.toggle('tile', tileDef.isTile);
        cell.classList.toggle('special', tileDef.isSpecial);
        cell.classList.toggle('quest', tileDef.isQuest);
        if (tileDef.isTile && tileDef.isBonusXp) cell.classList.add('xp');
        if (tileDef.isTile && tileDef.isBonusEnergy) cell.classList.add('energy');
        if (tileDef.stamina >= 0 && tileDef.tileStatus == 0) {
            addTitle(x, y, `${gui.getMessage('map_tile')} ${tileDef.stamina > 0 ? ` (${gui.getMessageAndValue('gui_cost', Locale.formatNumber(tileDef.stamina))})` : ''}`, true);
        }
        if (img && tileDef.tileStatus == 0 && (!showBackground || tileDef.stamina < 0)) {
            transform((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, false, false, +item.rotation / 90 * Math.PI / 2);
            ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            resetTransformation();
        }
    });

    // Foreground Addons
    drawAll(addons, 'foregroundAddonId', (x, y, tileDef, item, img) => {
        if (tileDef.tileStatus == 0 && (!showBackground || tileDef.stamina < 0)) drawAddon(x, y, item, img);
    });

    // Shadows
    const getShadows = tileDef => {
        const { x, y } = tileDef;
        const index = x + y * cols;
        const checkTop = y > 0;
        const checkRight = x < cols - 1;
        const checkBottom = y < rows - 1;
        const checkLeft = x > 0;
        return 0 +
            (checkTop && tileDefs[index - cols].shadow ? 1 : 0) +
            (checkRight && tileDefs[index + 1].shadow ? 2 : 0) +
            (checkBottom && tileDefs[index + cols].shadow ? 4 : 0) +
            (checkLeft && tileDefs[index - 1].shadow ? 8 : 0) +
            (checkTop && checkLeft && tileDefs[index - cols - 1].shadow ? 16 : 0) +
            (checkTop && checkRight && tileDefs[index - cols + 1].shadow ? 32 : 0) +
            (checkBottom && checkRight && tileDefs[index + cols + 1].shadow ? 64 : 0) +
            (checkBottom && checkLeft && tileDefs[index + cols - 1].shadow ? 128 : 0);
    };
    const shadows = [null,
        [0, 0, 12], [0, 1, 9], [1, 0, 8], [0, 2, 3], [2, 0, 0], [1, 1, 1], [3, 0, 0], [0, 3, 6],
        [1, 3, 4], [2, 1, 0], [3, 3, 0], [1, 2, 2], [3, 2, 0], [3, 1, 0], [4, 0, 0]
    ];
    const imgShadow = images[IMG_SHADOWS].img;
    for (const tileDef of tileDefs.filter(t => t.tileStatus == 2 || (showBackground && t.tileStatus == 0 && t.stamina >= 0))) tileDef.shadow = 0;
    for (const tileDef of tileDefs.filter(t => t.isVisible && (t.solid & !32) == 0 && !(t.shadow > 0 && t.tileStatus == 0))) {
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
    drawAll(addons, 'staticAddonId', (x, y, tileDef, item, img) => {
        drawAddon(x, y, item, img);
    });

    // Draggables
    drawAll(draggables, 'draggableId', (x, y, tileDef, item, img) => {
        if (!tileDef.isVisible) return;
        const override = draggables[asArray(item.overrides).filter(o => +o.region_id == rid).map(o => o.override_drag_id)[0]];
        if (override && override.mobile_asset in images) img = images[override.mobile_asset];
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
        addTitle(x, y, title);
        if (img) {
            transform((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, false, false, (tileDef.draggableStatus - 1) * Math.PI / 2);
            ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE);
            resetTransformation();
        }
    });

    // Npcs
    drawAll(npcs, 'npcId', (x, y, tileDef, item, img) => {
        if (!tileDef.isVisible) return;
        if (+item.pick_child) {
            addTitle(x, y, gui.getMessage('map_godchild'), true);
            if (!img) img = images[IMG_DEFAULT_GC].img;
        } else {
            addTitle(x, y, gui.getMessage('map_npc'), true);
        }
        if (item.idle_text) {
            const hint = gui.getString(item.idle_text);
            if (hint) addTitle(x, y, gui.getMessageAndValue('map_says', gui.getWrappedText('\u201c' + hint + '\u201d')));
        }
        if (img) {
            transform((x + +item.columns / 2) * TILE_SIZE, (y + +item.rows / 2) * TILE_SIZE, item.orientation == 'right', false, 0);
            ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - img.naturalHeight);
            resetTransformation();
        }
        if (tileDef.npcLoot && tileDef.npcLoot.length) {
            addDrop(x, y, tileDef.npcLoot);
        }
    });

    // Diggy
    {
        const { cur_column: x, cur_row: y } = currentData.mine;
        const img = images[IMG_DIGGY].img;
        const sh = img.naturalHeight;
        if (showDiggy) {
            ctx.drawImage(img, x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - sh);
        }
        addTitle(x, y, `Diggy`, true);
    }

    // Beams
    const deltas = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const isInvalidCoords = (x, y) => y < 0 || y >= rows || x < 0 || x >= cols;
    const isTransparent = (x, y) => (tileDefs[y * cols + x].solid & 21) == 0;
    const mirrors = { mirror12: 1, mirror13: 4, mirror23: 2, mirror24: 1, mirror31: 2, mirror34: 3, mirror41: 4, mirror42: 3 };
    drawAll(draggables, 'draggableId', (x, y, tileDef, item, _img) => {
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
    for (const tileDef of tileDefs.filter(t => t.teleportId)) {
        const teleport = teleports[tileDef.teleportId];
        const target = teleport && teleports[teleport.target_teleport_id];
        if (!teleport || !target) continue;
        if (tileDef.isVisible) addTitle(tileDef.x, tileDef.y, gui.getMessage('map_teleport'), true);
        if (showTeleport) {
            const targetTileDef = tileDefs[target.row * cols + target.column];
            if (tileDef.isVisible != targetTileDef.isVisible) drawTeleport(teleport);
        }
    }

    // Hide tiles
    ctx.fillStyle = '#000';
    for (const tileDef of tileDefs.filter(t => !t.isVisible)) {
        const { x, y } = tileDef;
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        const cell = table.rows[y].cells[x];
        Dialog.htmlToDOM(cell, '');
        cell.removeAttribute('title');
        cell.classList.add('hide');
    }

    // Opaque tiles (non transparent)
    for (const tileDef of tileDefs.filter(t => t.isVisible && (t.solid & 21) != 0)) {
        const { x, y } = tileDef;
        table.rows[y].cells[x].classList.add('opaque');
    }
    for (const tileDef of tileDefs.filter(t => t.isVisible && t.solid == 0)) {
        const { x, y } = tileDef;
        table.rows[y].cells[x].classList.add('walkable');
    }

    // Teleports (where both ends are visible)
    for (const tileDef of tileDefs.filter(t => showTeleport && t.isVisible && t.teleportId)) {
        const teleport = teleports[tileDef.teleportId];
        const target = teleport && teleports[teleport.target_teleport_id];
        if (!teleport || !target) continue;
        const targetTileDef = tileDefs[target.row * cols + target.column];
        if (targetTileDef.isVisible) drawTeleport(teleport);
    }

    // Show Beacons
    const beaconColors = { default: 'f00', dig: 'ff0', door: '0f0', door_r: '0ff', pit: '00f', push: 'f0f', sensor: 'fff', use: 'f90', visual: '999' };
    for (const tileDef of tileDefs.filter(t => t.isVisible && t.miscType == 'B')) {
        const { x, y } = tileDef;
        const activation = (tileDef.beaconPart && tileDef.beaconPart.activation) || '';
        const color = '#' + (beaconColors[activation] || beaconColors.default) + '8';
        Dialog.htmlToDOM(table.rows[y].cells[x], `<div class="beacon" style="background-color:${color}"></div>`);
    }

    // Add drop info
    for (const tileDef of tileDefs.filter(t => t.isVisible && t.hasLoot)) {
        const { x, y } = tileDef;
        addDrop(x, y, tileDef.loot);
    }

    // Debug info
    for (const tileDef of (showDebug ? tileDefs : []).filter(t => t.isVisible)) {
        const copy = Object.assign({}, tileDef);
        delete copy.x;
        delete copy.y;
        if (copy.miscId) copy.misc = getMiscItem(copy);

        let title = JSON.stringify(copy, null, 4);
        title = title.replace(/"/g, '');
        title = title.replace(/\n{2,}/g, '\n');
        title = title.replace(/\{\n\s+/g, '{   ');
        addTitle(tileDef.x, tileDef.y, title, true);
    }

    // Floors, Tiles & Loot
    let htm = '';
    let totalTiles = 0, totalCost = 0, totalSpecial = 0, totalQuest = 0, numFound = 0;
    for (const floorId of currentData.floorNumbers) {
        const found = bgp.Data.mineCache.find(m => m.id == lid && m.level_id == floorId);
        if (found) {
            numFound++;
            totalTiles += found.numTiles;
            totalCost += found.cost;
            totalSpecial += found.numSpecial;
            totalQuest += found.numQuest;
        }
        const isCurrent = floorId == fid;
        const title = gui.getMessage(isCurrent ? 'map_floor_current' : (found ? 'map_floor_found' : 'map_floor_not_found'));
        htm += Html`<input type="radio" data-flag="${floorId}"${isCurrent ? ' checked' : ''}${found ? '' : ' disabled'} title="${title}"'}>`;
    }
    const div = container.querySelector('[data-id="fid"]');
    Dialog.htmlToDOM(div, htm);
    Array.from(div.querySelectorAll('input')).forEach(e => e.addEventListener('click', changeLevel));
    const formatNum = num => isNaN(num) ? '?' : Locale.formatNumber(num);
    const setTable = (row, numTiles, cost, numSpecial, numQuest) => {
        row.cells[1].textContent = formatNum(numTiles);
        row.cells[2].textContent = formatNum(cost);
        row.cells[3].textContent = formatNum(numSpecial);
        row.cells[3].style.fontWeight = numSpecial > 0 ? 'bold' : '';
        row.cells[4].textContent = formatNum(numQuest);
        row.cells[4].style.fontWeight = numQuest > 0 ? 'bold' : '';
    };
    tableTileInfo.classList.toggle('has-special', totalSpecial > 0);
    tableTileInfo.classList.toggle('has-quest', totalQuest > 0);
    setTable(tableTileInfo.rows[1], currentData.mine.numTiles, currentData.mine.cost, currentData.mine.numSpecial, currentData.mine.numQuest);
    const allFound = numFound == currentData.floorNumbers.length;
    if (!allFound) totalTiles = totalCost = totalSpecial = totalQuest = NaN;
    setTable(tableTileInfo.rows[2], totalTiles, totalCost, totalSpecial, totalQuest);
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
