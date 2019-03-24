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

var tab, container, neighborEnabled;

function init() {
    tab = this;
    container = tab.container;
    neighborEnabled = bgp.Data.isDeveloper();
    ['camp-player', 'camp-neighbor'].forEach(className => {
        var div = tab.container.querySelector('.' + className);
        div.addEventListener('render', function(event) {
            updateCamp(this);
        });

        // For now hide the neighbour card, as feature is not live
        // Need to consider implications of this feature a bit more
        if (className == 'camp-neighbor' && !neighborEnabled) div.style.display = 'none';

        var input = div.querySelector('input');
        input.addEventListener('click', () => updateTabState(tab));

        div = div.querySelector('div');
        div.addEventListener('mouseover', onmousemove);
        div.addEventListener('mouseout', onmousemove);
        div.addEventListener('mouseleave', onmousemove);
    })
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
    lazyObserver.observe(div);
}

function getState() {
    var getCheck = (id, c) => document.getElementById(id).checked ? c : '';
    return {
        h: [neighborEnabled ? getCheck('camp_neighbor', 'n') : '', getCheck('camp_player', 'p')].join('')
    };
}

function setState(state) {
    var h = String(state.h || '').toLowerCase(),
        setCheck = (id, c) => document.getElementById(id).checked = h.indexOf(c) >= 0;
    setCheck('camp_player', 'p');
    setCheck('camp_neighbor', 'n');
}

function onmousemove(event) {
    var el = event.target,
        isOut = event.type == 'mouseout' || event.type == 'mouseleave',
        bid = 0;
    while (!el.classList.contains('card')) {
        if (el.hasAttribute('bid')) bid = el.getAttribute('bid');
        el = el.parentNode;
    }
    el.querySelectorAll('.item.building').forEach(el => {
        var flag = el.getAttribute('bid') === bid;
        el.classList.toggle('selected', flag);
        el.classList.toggle('selected-first', flag && (!el.previousElementSibling || el.previousElementSibling.getAttribute('bid') !== bid));
        el.classList.toggle('selected-last', flag && (!el.nextElementSibling || el.nextElementSibling.getAttribute('bid') !== bid));
    })
}

function updateCamp(div, flagHeaderOnly = false) {
    var generator, camp, campName, isPlayer, isPublic, level, started, cdn;

    generator = bgp.Data.generator;

    cdn = generator.cdn_root;
    if (cdn) cdn += 'mobile/graphics/all/';

    isPlayer = div.classList.contains('camp-player');
    if (isPlayer) {
        isPublic = true;
        camp = generator.camp;
        level = +generator.level;
        ['region', 'windmill_limit', 'windmill_reg'].forEach(key => camp[key] = +generator[key]);
        campName = getMessage('camp_your_camp');
        started = new Date(+generator.registered_on * 1000);
    } else {
        camp = bgp.Data.lastVisitedCamp;
        let neighbourId = camp && camp.neigh_id;
        let pal = neighbourId ? bgp.Data.getNeighbour(neighbourId) : null;
        campName = (neighbourId ? getMessage('camp_player_name', pal ? pal.name : '#' + neighbourId) : getMessage('camp_no_player'));
        level = pal && pal.level;
        isPublic = true; //neighbourId == 1 || bgp.Data.isDev;
    }

    div.querySelector('img').setAttribute('src', (camp ? '/img/regions/' + camp.region : '/img/gui/camp') + '.png');
    div.querySelector('span').textContent = campName;
    div.querySelector('div').innerHTML = '';
    if (flagHeaderOnly || !camp) return;

    var windmillExpiryTime = bgp.Data.getConfigValue('windmill_lifespan', 7 * 86400),
        campResult = calculateCamp(camp, true),
        camps = [campResult],
        htm = '';

    if (isPlayer) {
        var campResult2 = calculateCamp(camp, false);
        if (campResult2.reg_base != campResult2.reg_tot || campResult2.cap_base != campResult2.cap_tot) {
            camps.push(campResult2);
            if (campResult2.reg_tot > campResult.reg_tot) camps.reverse();
        }
    }

    htm += htmlBr `<table class="camp-tables"><tr>`;

    // table Player
    htm += htmlBr `<td><table class="camp-data row-coloring">`;
    htm += htmlBr `<thead><tr><th colspan="2">${getMessage('camp_player')}</th></tr></thead>`;
    htm += htmlBr `<tbody>`;
    htm += htmlBr `<tr><td>${getMessage('gui_region')}</td><td>${bgp.Data.getRegionName(camp.region)}</td></tr>`;
    htm += htmlBr `<tr><td>${getMessage('gui_level')}</td><td>${formatNumber(level)}</td></tr>`;
    htm += htmlBr `<tr><td>${getMessage('gui_theme')}</td><td>${bgp.Data.getSkinName(camp.skin)}</td></tr>`;
    htm += htmlBr `</tbody>`;
    if (started && !isNaN(started.getFullYear())) {
        htm += htmlBr `<tbody>`;
        htm += htmlBr `<tr><td colspan="2">${getMessage('camp_start_date', formatDateTime(started))}</td></tr>`;
        htm += htmlBr `</tbody>`;
    }
    htm += htmlBr `</table></td>`;

    if (isPublic) {
        camps.forEach(function(campResult, index) {
            var cap_total = campResult.cap_tot,
                reg_total = campResult.reg_tot,
                fillTime = Math.ceil(cap_total / reg_total * 3600),
                time;
            if (fillTime) {
                time = [];
                time.unshift(String(fillTime % 60).padStart(2, '0'));
                fillTime = Math.floor(fillTime / 60);
                time.unshift(String(fillTime % 60).padStart(2, '0'));
                time.unshift(Math.floor(fillTime / 60));
            }

            // table Regeneration
            htm += htmlBr `<td><table class="camp-data row-coloring">`;
            var caption = camps.length == 1 ? '' : getMessage(index == 0 ? 'camp_day_mode' : 'camp_night_mode');
            htm += htmlBr `<thead><tr class="energy_capacity"><th>${caption}</th><th><img src="/img/camp/energy.png" title="${getMessage('camp_regen')}"></th><th><img src="/img/camp/capacity.png" title="${getMessage('camp_capacity')}"></th></tr></thead>`;
            htm += htmlBr `<tbody>`;
            htm += htmlBr `<tr><td>${getMessage('camp_total')}</td><td>${formatNumber(reg_total)}</td><td>${formatNumber(cap_total)}</td></tr>`;
            htm += htmlBr `<tr><td>${getMessage('camp_avg_value')}</td><td>${formatNumber(campResult.reg_avg)}</td><td>${formatNumber(campResult.cap_avg)}</td></tr>`;
            htm += htmlBr `<tr><td>${getMessage('camp_min_value')}</td><td>${formatNumber(campResult.reg_min)}</td><td>${formatNumber(campResult.cap_min)}</td></tr>`;
            htm += htmlBr `<tr><td>${getMessage('camp_max_value')}</td><td>${formatNumber(campResult.reg_max)}</td><td>${formatNumber(campResult.cap_max)}</td></tr>`;
            htm += htmlBr `</tbody>`;
            if (time) {
                htm += htmlBr `<tbody>`;
                htm += htmlBr `<tr><td>${getMessage('camp_fill_time')}</td><td colspan="2">${time.join(':')}</td></tr>`;
                htm += htmlBr `</tbody>`;
            }
            htm += htmlBr `</table></td>`;
        });
    }

    if (true) {
        var wind_count = 0,
            wind_expiry = Infinity;
        if (camp.windmills) {
            (Array.isArray(camp.windmills) ? camp.windmills : [camp.windmills]).forEach(windmill => {
                var st = parseInt(windmill.activated),
                    et = st + windmillExpiryTime;
                wind_count++;
                wind_expiry = Math.min(et, wind_expiry);
            });
        }
        // table Windmills
        htm += htmlBr `<td><table class="camp-data row-coloring">`;
        htm += htmlBr `<thead><tr><th colspan="2">${getMessage('camp_windmills')}</th></tr></thead>`;
        htm += htmlBr `<tbody>`;
        htm += htmlBr `<tr><td>${getMessage('camp_windmill_num')}</td><td>${formatNumber(wind_count) + ' / ' + formatNumber(camp.windmill_limit)}</td></tr>`;
        if (isPublic && camp.windmill_reg) {
            htm += htmlBr `<tr><td>${getMessage('camp_windmill_regen')}</td><td>${formatNumber(camp.windmill_reg)}</td></tr>`;
            htm += htmlBr `<tr><td>${getMessage('camp_windmill_regen_total')}</td><td>${formatNumber(camp.windmill_reg * Math.min(wind_count, camp.windmill_limit))}</td></tr>`;
        }
        htm += htmlBr `</tbody>`;
        if (wind_count) {
            htm += htmlBr `<tbody>`;
            htm += htmlBr `<tr><td colspan="2">${getMessage('camp_windmill_expiry', formatDateTime(wind_expiry))}</td></tr>`;
            htm += htmlBr `</tbody>`;
        }
        htm += htmlBr `</table></td>`;
    }

    if (campResult.blocks[2].blocked || campResult.blocks[3].blocked || campResult.blocks[4].blocked) {
        var mat = {};
        Object.values(campResult.blocks).forEach(block => {
            for (var i = NUM_SLOTS * 2 - block.blocked; i < NUM_SLOTS * 2; i++) {
                for (var req of (block.slots[i] && block.slots[i].requirements)) {
                    mat[req.material_id] = (mat[req.material_id] || 0) + +req.amount;
                }
            }
        });
        htm += htmlBr `<td><table class="camp-data">`;
        htm += htmlBr `<thead><tr><th colspan="3">${getMessage('camp_unlock_materials')}</th></tr></thead>`;

        var materials = bgp.Data.files.materials;
        var cdn = bgp.Data.generator.cdn_root;
        if (cdn) cdn += 'mobile/graphics/all/';

        // Show materials
        for (var matId of [1, 7, 22, 32, 8]) {
            var material = materials[matId];
            var img = material && material.mobile_asset ? htmlBr `<img width="24" height="24" src="${cdn + material.mobile_asset + '_small.png'}">` : '';
            if (matId in mat) htm += htmlBr `<tr class="material"><td>${img}</td><td>${bgp.Data.getMaterialName(matId)}</td><td>${formatNumber(mat[matId])}</td></tr>`;
        }
        htm += htmlBr `<tbody>`;
        htm += htmlBr `</table></td>`;
    }

    htm += htmlBr `</tr></table>`;

    camps.forEach(function(campResult, index) {
        if (camps.length > 1)
            htm += htmlBr `<table class="camp-caption"><thead><tr><th>${getMessage(index == 0 ? 'camp_day_mode' : 'camp_night_mode')}</th></tr></thead></table>`;
        htm += renderCamp(campResult, isPublic, cdn);
    });

    div.querySelector('div').innerHTML = htm;
}

function calculateCamp(camp, current = true) {
    var lines_ids = camp.lines_ids.split(','),
        lines_blocked = camp.lines_blocked.split(','),
        buildings = bgp.Data.files.buildings,
        lines = {},
        blocks = {},
        reg_min, reg_max, reg_cnt, reg_avg, cap_min, cap_max, cap_cnt, cap_avg, reg_tot, cap_tot, reg_base, cap_base;

    // setup blocks
    [2, 3, 4].forEach(height => {
        blocks[height] = {
            blocked: 0,
            slots: []
        };
    });
    Object.values(bgp.Data.files.lines).forEach(line => {
        var height = +line.height,
            order = +line.order + (height == 2 ? 3 : 0);
        if (height >= 2 && height <= 4 && order >= 1 && order <= NUM_SLOTS * 2)
            blocks[height].slots[order - 1] = line;
    });

    // setup lines
    [1, 2, 3, 5, 7, 9].forEach((lid, index) => {
        var height = Math.floor(index / 2) + 2,
            slots = [],
            emptySlot = {
                kind: 'empty',
                title: getMessage('camp_slot_empty'),
                width: 1,
                height: height
            },
            blocked, i;
        i = lines_ids.indexOf(String(lid));
        blocked = i >= 0 ? parseInt(lines_blocked[i]) || 0 : NUM_SLOTS;
        for (i = 0; i < NUM_SLOTS; i++) slots[i] = emptySlot;
        if (blocked > 0) slots[index % 2 ? NUM_SLOTS - blocked : 0] = {
            kind: 'block',
            title: getMessage('camp_slot_blocked'),
            width: blocked,
            height: height
        };
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
        var lid = building.line_id,
            line = lines[lid];
        if (line) {
            var bid = +building.def_id,
                slot = +building.slot,
                building = buildings[bid];
            if (building) {
                var regen = +building.stamina_reg,
                    capacity = +building.max_stamina,
                    width = +building.columns,
                    value = Math.floor((regen || capacity) / width);
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
                line.slots[slot] = {
                    kind: 'building',
                    bid: bid,
                    capacity: capacity,
                    regen: regen,
                    value: value,
                    width: +building.columns,
                    height: +building.rows,
                    region_id: building.region_id || 0,
                    title: bgp.Data.getString(building.name_loc)
                }
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

function renderCamp(campResult, isPublic, cdn) {
    var {
        lines,
        blocks,
        reg_min,
        reg_max,
        cap_min,
        cap_max
    } = campResult;

    // render the camp and calculate some values
    var reg_range = reg_max - reg_min,
        cap_range = cap_max - cap_min,
        opacity_min = 0.4,
        opacity_range = 1 - opacity_min,
        buildings = bgp.Data.files.buildings,
        htm = '';

    htm += htmlBr `<div class="camp${isPublic ? ' public' : ''}">`;

    function getStrength(value, min, range) {
        return range ? (value - min) / range * opacity_range + opacity_min : 1;
    }
    [1, 2, 3, 5, 7, 9].forEach((lid) => {
        var line = lines[lid],
            slots = line.slots;
        htm += htmlBr `<div class="line" style="--lw:24;--lh:${line.height}">`;
        for (var i = 0; i < NUM_SLOTS;) {
            var slot = slots[i],
                title = slot.title,
                width = slot.width,
                kind = slot.kind,
                colValues = '',
                strength = 0,
                bid = 0,
                exStyle = '';
            while (kind == 'empty' && i + width < NUM_SLOTS && slots[i + width].kind == kind) width++;
            if (width > 1 && (kind == 'empty' || kind == 'block')) title += ' x ' + width;
            if (kind == 'block') {
                var block = blocks[line.height].slots[NUM_SLOTS * 2 - blocks[line.height].blocked];
                if (block) {
                    title += '\n' + getMessage('camp_unlock_one', formatNumber(+block.exp));
                    title += '\n' + getMessage('camp_unlock_cost', formatNumber(+block.gems));
                    for (var req of block.requirements) {
                        title += '\n    ' + bgp.Data.getMaterialName(req.material_id) + ' \xd7 ' + formatNumber(+req.amount);
                    }
                }
            }
            if (kind == 'building') {
                title += ' (' + width + '\xd7' + slot.height + ')';
                bid = slot.bid;
                if (cdn && buildings[bid].mobile_asset) {
                    kind += ' img';
                    exStyle = ';background-image:url(' + cdn + buildings[bid].mobile_asset + '.png)';
                }
                if (slot.capacity > 0) {
                    kind += ' capacity';
                    if (isPublic) title += '\n' + getMessage('camp_slot_capacity', slot.capacity);
                    strength = getStrength(slot.value, cap_min, cap_range);
                }
                if (slot.regen > 0) {
                    kind += ' regen';
                    if (isPublic) title += '\n' + getMessage('camp_slot_regen', slot.regen);
                    strength = getStrength(slot.value, reg_min, reg_range);
                }
                if (slot.region_id > 0) {
                    kind += ' reg' + slot.region_id;
                    title += '\n' + getMessage('camp_slot_region', bgp.Data.getRegionName(slot.region_id));
                }
                colValues = Raw(isPublic ? String(htmlBr `<div class="value">${slot.value}</div>`).repeat(width) : '');
                strength = Math.round(strength * 1000) / 1000;
            }
            htm += htmlBr `<div class="item ${kind}" style="--w:${width};--h:${slot.height};--v:${strength}${exStyle}" title="${html(title)}"`;
            if (bid) htm += htmlBr ` bid="${bid}"`;
            htm += htmlBr `>${colValues}</div>`;
            i += width;
        }
        htm += htmlBr `</div>`;
    });
    htm += htmlBr `</div>`;
    return htm;
}