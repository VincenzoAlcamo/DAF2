/*global bgp gui Locale Html HtmlBr HtmlRaw*/
export default {
    hasCSS: true,
    init: init,
    update: update,
    getState: getState,
    setState: setState,
    actions: {
        'visit_camp': actionVisitCamp
    },
    requires: ['configs', 'materials', 'buildings', 'lines']
};

const NUM_SLOTS = 24;

var tab, container, neighborEnabled, checkWebGL;

function init() {
    tab = this;
    container = tab.container;
    neighborEnabled = true; //bgp.Data.isDeveloper();
    checkWebGL = container.querySelector('[name=webgl]');
    checkWebGL.addEventListener('click', toggleWebGL);

    ['camp-player', 'camp-neighbor'].forEach(className => {
        var div = tab.container.querySelector('.' + className);
        div.addEventListener('render', function(_event) {
            updateCamp(this);
        });

        // For now hide the neighbour card, as feature is not live
        // Need to consider implications of this feature a bit more
        if (className == 'camp-neighbor' && !neighborEnabled) div.style.display = 'none';

        var input = div.querySelector('input');
        input.addEventListener('click', () => gui.updateTabState(tab));

        div = div.querySelector('div');
        div.addEventListener('mouseover', onmousemove);
        div.addEventListener('mouseout', onmousemove);
        div.addEventListener('mouseleave', onmousemove);
    });
}

function update() {
    markToBeRendered(container.querySelector('.camp-player'));
    markToBeRendered(container.querySelector('.camp-neighbor'));
}

function actionVisitCamp() {
    markToBeRendered(container.querySelector('.camp-neighbor'));
}

function markToBeRendered(div) {
    updateCamp(div, true);
    div = div.querySelector('div');
    div.setAttribute('lazy-render', '');
    gui.collectLazyImages(container);
}

function getState() {
    var getCheck = (id, c) => document.getElementById(id).checked ? c : '';
    return {
        webgl: checkWebGL.checked,
        h: [neighborEnabled ? getCheck('camp_neighbor', 'n') : '', getCheck('camp_player', 'p')].join('')
    };
}

function setState(state) {
    var h = String(state.h || '').toLowerCase();
    var setCheck = (id, c) => document.getElementById(id).checked = h.indexOf(c) >= 0;
    setCheck('camp_player', 'p');
    setCheck('camp_neighbor', 'n');
    checkWebGL.checked = !!state.webgl;
}

function toggleWebGL() {
    gui.updateTabState(tab);
    update();
}

function onmousemove(event) {
    var el = event.target;
    var bid = 0;
    while (!el.classList.contains('card')) {
        if (el.hasAttribute('bid')) bid = el.getAttribute('bid');
        el = el.parentNode;
    }
    el.querySelectorAll('.item.building').forEach(el => {
        var flag = el.getAttribute('bid') === bid;
        el.classList.toggle('selected', flag);
        el.classList.toggle('selected-first', flag && (!el.previousElementSibling || el.previousElementSibling.getAttribute('bid') !== bid));
        el.classList.toggle('selected-last', flag && (!el.nextElementSibling || el.nextElementSibling.getAttribute('bid') !== bid));
    });
}

function updateCamp(div, flagHeaderOnly = false) {
    var generator, camp, campName, isPlayer, isPublic, pal, level, started, cdn;

    generator = gui.getGenerator();

    isPlayer = div.classList.contains('camp-player');
    if (isPlayer) {
        isPublic = true;
        camp = generator.camp;
        pal = {
            name: generator.name,
            surname: generator.surname,
            id: generator.player_name,
            fb_id: generator.fb_id
        };
        level = +generator.level;
        ['region', 'windmill_limit', 'windmill_reg'].forEach(key => camp[key] = +generator[key]);
        campName = pal ? gui.getMessage('camp_player_name', gui.getPlayerNameFull(pal)) : gui.getMessage('camp_your_camp');
        started = new Date(+generator.registered_on * 1000);
    } else {
        camp = bgp.Data.lastVisitedCamp;
        let neighbourId = camp && camp.neigh_id;
        pal = neighbourId ? bgp.Data.getNeighbour(neighbourId) : null;
        level = pal ? +pal.level : 1;
        campName = (neighbourId ? gui.getMessage('camp_player_name', pal ? gui.getPlayerNameFull(pal) : '#' + neighbourId) : gui.getMessage('camp_no_player'));
        isPublic = true; //neighbourId == 1 || bgp.Data.isDev;
    }

    div.querySelector('img').setAttribute('src', pal ? (pal.id == 1 ? pal.pic_square : gui.getFBFriendAvatarUrl(pal.fb_id)) : '/img/gui/anon.png');
    div.querySelector('span').textContent = campName;
    div.querySelector('div').innerHTML = '';
    if (flagHeaderOnly || !camp) return;

    var windmillExpiryTime = bgp.Data.getConfigValue('windmill_lifespan', 7 * 86400);
    var campResult = calculateCamp(camp, true);
    var camps = [campResult];
    var htm = '';

    if (isPlayer) {
        var campResult2 = calculateCamp(camp, false);
        if (campResult2.reg_base != campResult2.reg_tot || campResult2.cap_base != campResult2.cap_tot) {
            camps.push(campResult2);
            if (campResult2.reg_tot > campResult.reg_tot) camps.reverse();
        }
    }

    htm += HtmlBr `<table class="camp-tables"><tr>`;

    // table Player
    htm += HtmlBr `<td><table class="camp-data camp-player row-coloring">`;
    htm += HtmlBr `<thead><tr><th colspan="2">${gui.getMessage('camp_player')}</th></tr></thead>`;
    htm += HtmlBr `<tbody>`;
    htm += HtmlBr `<tr><td>${gui.getMessage('gui_level')}</td><td>${Locale.formatNumber(level)}</td></tr>`;
    htm += HtmlBr `<tr><td>${gui.getMessage('gui_region')}</td><td>${gui.getObjectName('region', camp.region)}</td></tr>`;
    htm += HtmlBr `<tr><td>${gui.getMessage('gui_theme')}</td><td>${gui.getObjectName('skin', camp.skin)}</td></tr>`;
    htm += HtmlBr `</tbody>`;
    if (started && !isNaN(started.getFullYear())) {
        htm += HtmlBr `<tbody>`;
        htm += HtmlBr `<tr><td colspan="2">${gui.getMessage('camp_start_date', Locale.formatDateTime(started))}</td></tr>`;
        htm += HtmlBr `</tbody>`;
    }
    htm += HtmlBr `</table><div class="screenshot"></div></td>`;

    if (isPublic) {
        camps.forEach(function(campResult, index) {
            var cap_total = campResult.cap_tot;
            var reg_total = campResult.reg_tot;
            var fillTime = Math.ceil(cap_total / reg_total * 3600);
            var time;
            if (fillTime) {
                time = [];
                time.unshift(String(fillTime % 60).padStart(2, '0'));
                fillTime = Math.floor(fillTime / 60);
                time.unshift(String(fillTime % 60).padStart(2, '0'));
                time.unshift(Math.floor(fillTime / 60));
            }

            // table Regeneration
            htm += HtmlBr `<td><table class="camp-data row-coloring">`;
            var caption = camps.length == 1 ? '' : gui.getMessage(index == 0 ? 'camp_day_mode' : 'camp_night_mode');
            htm += HtmlBr `<thead><tr class="energy_capacity"><th>${caption}</th><th><img src="/img/gui/camp_energy.png" title="${gui.getMessage('camp_regen')}"></th><th><img src="/img/gui/camp_capacity.png" title="${gui.getMessage('camp_capacity')}"></th></tr></thead>`;
            htm += HtmlBr `<tbody>`;
            htm += HtmlBr `<tr><td>${gui.getMessage('camp_total')}</td><td>${Locale.formatNumber(reg_total)}</td><td>${Locale.formatNumber(cap_total)}</td></tr>`;
            htm += HtmlBr `<tr><td>${gui.getMessage('camp_avg_value')}</td><td>${Locale.formatNumber(campResult.reg_avg)}</td><td>${Locale.formatNumber(campResult.cap_avg)}</td></tr>`;
            htm += HtmlBr `<tr><td>${gui.getMessage('camp_min_value')}</td><td>${Locale.formatNumber(campResult.reg_min)}</td><td>${Locale.formatNumber(campResult.cap_min)}</td></tr>`;
            htm += HtmlBr `<tr><td>${gui.getMessage('camp_max_value')}</td><td>${Locale.formatNumber(campResult.reg_max)}</td><td>${Locale.formatNumber(campResult.cap_max)}</td></tr>`;
            htm += HtmlBr `</tbody>`;
            if (time) {
                htm += HtmlBr `<tbody>`;
                htm += HtmlBr `<tr><td>${gui.getMessage('camp_fill_time')}</td><td colspan="2">${time.join(':')}</td></tr>`;
                htm += HtmlBr `</tbody>`;
            }
            htm += HtmlBr `</table></td>`;
        });
    }

    var wind_count = 0;
    var wind_expiry = Infinity;
    if (camp.windmills) {
        (Array.isArray(camp.windmills) ? camp.windmills : [camp.windmills]).forEach(windmill => {
            var st = parseInt(windmill.activated);
            var et = st + windmillExpiryTime;
            wind_count++;
            wind_expiry = Math.min(et, wind_expiry);
        });
    }
    // table Windmills
    htm += HtmlBr `<td><table class="camp-data row-coloring">`;
    htm += HtmlBr `<thead><tr><th colspan="2">${gui.getMessage('camp_windmills')}</th></tr></thead>`;
    htm += HtmlBr `<tbody>`;
    htm += HtmlBr `<tr><td>${gui.getMessage('camp_windmill_num')}</td><td>${Locale.formatNumber(wind_count) + ' / ' + Locale.formatNumber(camp.windmill_limit)}</td></tr>`;
    if (isPublic && camp.windmill_reg) {
        htm += HtmlBr `<tr><td>${gui.getMessage('camp_windmill_regen')}</td><td>${Locale.formatNumber(camp.windmill_reg)}</td></tr>`;
        htm += HtmlBr `<tr><td>${gui.getMessage('camp_windmill_regen_total')}</td><td>${Locale.formatNumber(camp.windmill_reg * Math.min(wind_count, camp.windmill_limit))}</td></tr>`;
    }
    htm += HtmlBr `</tbody>`;
    if (wind_count) {
        htm += HtmlBr `<tbody>`;
        htm += HtmlBr `<tr><td colspan="2">${gui.getMessage('camp_windmill_expiry', Locale.formatDateTime(wind_expiry))}</td></tr>`;
        htm += HtmlBr `</tbody>`;
    }
    htm += HtmlBr `</table></td>`;

    if (campResult.blocks[2].blocked || campResult.blocks[3].blocked || campResult.blocks[4].blocked) {
        var mat = {};
        Object.values(campResult.blocks).forEach(block => {
            for (var i = NUM_SLOTS * 2 - block.blocked; i < NUM_SLOTS * 2; i++) {
                for (var req of (block.slots[i] && block.slots[i].requirements)) {
                    mat[req.material_id] = (mat[req.material_id] || 0) + +req.amount;
                }
            }
        });
        htm += HtmlBr `<td><table class="camp-data">`;
        htm += HtmlBr `<thead><tr><th colspan="3">${gui.getMessage('camp_unlock_materials')}</th></tr></thead>`;

        var materials = gui.getFile('materials');

        // Show materials
        for (var matId of [1, 7, 22, 32, 8]) {
            var material = materials[matId];
            var img = material ? gui.getObjectImg('material', matId, 24, true) : '';
            if (matId in mat) htm += HtmlBr `<tr class="material"><td>${img}</td><td>${gui.getObjectName('material', matId)}</td><td>${Locale.formatNumber(mat[matId])}</td></tr>`;
        }
        htm += HtmlBr `<tbody>`;
        htm += HtmlBr `</table></td>`;
    }

    htm += HtmlBr `</tr></table>`;

    camps.forEach(function(campResult, index) {
        if (camps.length > 1)
            htm += HtmlBr `<table class="camp-caption"><thead><tr><th>${gui.getMessage(index == 0 ? 'camp_day_mode' : 'camp_night_mode')}</th></tr></thead></table>`;
        htm += renderCamp(campResult, isPublic, cdn);
    });

    div.querySelector('div').innerHTML = htm;

    gui.setupScreenshot(div, campName + '.png');
}

function calculateCamp(camp, current = true) {
    var lines_ids = gui.getArrayOfInt(camp.lines_ids);
    var lines_blocked = gui.getArrayOfInt(camp.lines_blocked);
    var buildings = gui.getFile('buildings');
    var lines = {};
    var blocks = {};
    var reg_min, reg_max, reg_cnt, reg_avg, cap_min, cap_max, cap_cnt, cap_avg, reg_tot, cap_tot, reg_base, cap_base;

    // setup blocks
    [2, 3, 4].forEach(height => {
        blocks[height] = {
            blocked: 0,
            slots: []
        };
    });
    Object.values(gui.getFile('lines')).forEach(line => {
        var height = +line.height;
        var order = +line.order + (height == 2 ? 3 : 0);
        if (height >= 2 && height <= 4 && order >= 1 && order <= NUM_SLOTS * 2)
            blocks[height].slots[order - 1] = line;
    });

    // setup lines
    [1, 2, 3, 5, 7, 9].forEach((lid, index) => {
        var height = Math.floor(index / 2) + 2;
        var slots = [];
        var emptySlot = {
            kind: 'empty',
            title: gui.getMessage('camp_slot_empty'),
            width: 1,
            height: height
        };
        var blocked, i;
        i = lines_ids.indexOf(lid);
        blocked = i >= 0 ? parseInt(lines_blocked[i]) || 0 : NUM_SLOTS;
        for (i = 0; i < NUM_SLOTS; i++) slots[i] = emptySlot;
        if (blocked > 0) {
            var slot = {
                kind: 'block',
                title: gui.getMessage('camp_slot_blocked'),
                width: blocked,
                height: height
            };
            for (i = 0; i < blocked; i++) slots[index % 2 ? NUM_SLOTS - 1 - i : i] = slot;
        }
        lines[lid] = {
            lid: lid,
            height: height,
            slots: slots,
            blocked: blocked
        };
        blocks[height].blocked += blocked;
    });

    reg_base = bgp.Data.getConfigValue('stamina_reg', 60) + Math.min((camp.windmills && camp.windmills.length) || 0, camp.windmill_limit || 5) * (parseInt(camp.windmill_reg) || 5);
    cap_base = bgp.Data.getConfigValue('starting_stamina', 200);

    // position buildings
    reg_min = reg_max = cap_min = cap_max = reg_tot = cap_tot = reg_cnt = cap_cnt = 0;

    var blds = current ? camp.buildings : camp.inactive_b;
    blds = blds ? (Array.isArray(blds) ? blds : [blds]) : [];
    blds.forEach(building => {
        var lid = building.line_id;
        var line = lines[lid];
        if (line) {
            var bid = +building.def_id;
            var slot = +building.slot;
            building = buildings[bid];
            if (building) {
                var regen = +building.stamina_reg;
                var capacity = +building.max_stamina;
                var width = +building.columns;
                var value = Math.floor((regen || capacity) / width);
                if (capacity > 0) {
                    if (cap_min == 0 || value < cap_min) cap_min = value;
                    if (cap_max == 0 || value > cap_max) cap_max = value;
                    cap_tot += capacity;
                    cap_cnt += width;
                }
                if (regen > 0) {
                    if (reg_min == 0 || value < reg_min) reg_min = value;
                    if (reg_max == 0 || value > reg_max) reg_max = value;
                    reg_tot += regen;
                    reg_cnt += width;
                }
                var data = {
                    kind: 'building',
                    bid: bid,
                    capacity: capacity,
                    regen: regen,
                    value: value,
                    width: +building.columns,
                    height: +building.rows,
                    region_id: building.region_id || 0,
                    title: gui.getObjectName('building', bid)
                };
                for (let i = 0; i < data.width; i++) line.slots[slot + i] = data;
            }
        }
    });

    reg_avg = reg_cnt && Math.floor(reg_tot / reg_cnt);
    cap_avg = cap_cnt && Math.floor(cap_tot / cap_cnt);
    reg_tot += reg_base;
    cap_tot += cap_base;

    return {
        lines: lines,
        blocks: blocks,
        reg_min: reg_min,
        reg_max: reg_max,
        reg_avg: reg_avg,
        cap_min: cap_min,
        cap_max: cap_max,
        cap_avg: cap_avg,
        reg_base: reg_base,
        cap_base: cap_base,
        reg_tot: reg_tot,
        cap_tot: cap_tot
    };
}

function renderCamp(campResult, isPublic) {
    var {
        lines,
        blocks,
        reg_min,
        reg_max,
        cap_min,
        cap_max
    } = campResult;

    // render the camp and calculate some values
    var reg_range = reg_max - reg_min;
    var cap_range = cap_max - cap_min;
    var opacity_min = 0.4;
    var opacity_range = 1 - opacity_min;
    var htm = '';
    var state = getState();

    htm += HtmlBr `<div class="camp${isPublic ? ' public' : ''}">`;

    function getStrength(value, min, range) {
        return range ? (value - min) / range * opacity_range + opacity_min : 1;
    }
    [1, 2, 3, 5, 7, 9].forEach((lid, index) => {
        var line = lines[lid];
        var slots = line.slots;
        htm += HtmlBr `<div class="line" style="--lw:24;--lh:${line.height}">`;
        var isReversed = (index % 2) == 0 && state.webgl;
        var getSlot = function(index) {
            return slots[isReversed ? NUM_SLOTS - 1 - index : index];
        };
        for (var i = 0; i < NUM_SLOTS;) {
            var slot = getSlot(i);
            var title = slot.title;
            var width = slot.width;
            var kind = slot.kind;
            var colValues = '';
            var strength = 0;
            var bid = 0;
            var exStyle = '';
            while (kind == 'empty' && i + width < NUM_SLOTS && getSlot(i + width).kind == kind) width++;
            if (width > 1 && (kind == 'empty' || kind == 'block')) title += ' x ' + width;
            if (kind == 'block') {
                var block = blocks[line.height].slots[NUM_SLOTS * 2 - blocks[line.height].blocked];
                if (block) {
                    title += '\n' + gui.getMessage('camp_unlock_one', Locale.formatNumber(+block.exp));
                    title += '\n' + gui.getMessage('camp_unlock_cost', Locale.formatNumber(+block.gems));
                    for (var req of block.requirements) {
                        title += '\n    ' + gui.getObjectName('material', req.material_id) + ' \xd7 ' + Locale.formatNumber(+req.amount);
                    }
                }
            }
            if (kind == 'building') {
                title += ' (' + width + '\xd7' + slot.height + ')';
                bid = slot.bid;
                var url = gui.getObjectImage('building', bid);
                if (url) {
                    kind += ' img';
                    exStyle = ';background-image:url(' + url + ')';
                }
                if (slot.capacity > 0) {
                    kind += ' capacity';
                    if (isPublic) title += '\n' + gui.getMessage('camp_slot_capacity', slot.capacity);
                    strength = getStrength(slot.value, cap_min, cap_range);
                }
                if (slot.regen > 0) {
                    kind += ' regen';
                    if (isPublic) title += '\n' + gui.getMessage('camp_slot_regen', slot.regen);
                    strength = getStrength(slot.value, reg_min, reg_range);
                }
                if (slot.region_id > 0) {
                    kind += ' reg' + slot.region_id;
                    title += '\n' + gui.getMessage('camp_slot_region', gui.getObjectName('region', slot.region_id));
                }
                colValues = HtmlRaw(isPublic ? String(HtmlBr `<div class="value">${slot.value}</div>`).repeat(width) : '');
                strength = Math.round(strength * 1000) / 1000;
            }
            htm += HtmlBr `<div class="item ${kind}" style="--w:${width};--h:${slot.height};--v:${strength}${exStyle}" title="${Html(title)}"`;
            if (bid) htm += HtmlBr ` bid="${bid}"`;
            htm += HtmlBr `>${colValues}</div>`;
            i += width;
        }
        htm += HtmlBr `</div>`;
    });
    htm += HtmlBr `</div>`;
    return htm;
}