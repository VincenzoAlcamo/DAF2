/*global bgp gui Locale Html Dialog Tooltip*/
export default {
    hasCSS: true,
    init,
    update,
    getState,
    setState,
    actions: {
        'visit_camp': actionVisitCamp
    },
    requires: ['configs', 'materials', 'buildings', 'lines', 'special_weeks', 'sales', 'diggy_skins', 'usables']
};

const NUM_SLOTS = 24;

let tab, container, checkDay, checkNight, checkExtra, checkNeighbor, checkSetup, inputRegen;
let regBuildings, capBuildings, campNames;

const addonsMeta = [
    { name: 'diggy_skin', title: 'GUI3178', type: '', id: 0, desc: '' },
    { name: 'golem', title: 'EXT06', type: 'extension', id: 1, desc: 'EXT07' },
    { name: 'professor_switch', title: 'EXT11', type: 'extension', id: 2, desc: 'EXT12' },
    { name: 'gc_one_click', title: 'EXT20', type: 'extension', id: 3, desc: 'EXT21' },
    { name: 'last_tile_finder', title: 'EXT56', type: 'extension', id: 4, desc: 'EXT58' },
    { name: 'hollander', title: 'ABNA004', type: 'addon_building', id: 6, desc: 'EXT09' },
    { name: 'rotor', title: 'ABNA005', type: 'addon_building', id: 7, desc: ['EXT18', 'EXT08', 'EXT23', 'EXT25', 'EXT27', 'EXT29', 'EXT31', 'EXT33', 'EXT35', 'EXT37', 'EXT39', 'EXT41', 'EXT43', 'EXT45', 'EXT47', 'EXT49'] },
    { name: 'potion_double_exp', title: 'EXT81', type: 'passive_effect_extension', id: 1, desc: ['EXT61', 'EXT61', 'EXT62', 'EXT63', 'EXT64', 'EXT65', 'EXT66', 'EXT67', 'EXT68', 'EXT69', 'EXT70'] },
    { name: 'potion_energy_back', title: 'EXT82', type: 'passive_effect_extension', id: 2, desc: ['EXT71', 'EXT71', 'EXT72', 'EXT73', 'EXT74', 'EXT75', 'EXT76', 'EXT77', 'EXT78', 'EXT79', 'EXT80'] },
    { name: 'speedpotion', title: 'USNA025', type: '', id: 0, desc: '' },
];

function init() {
    tab = this;
    container = tab.container;

    campNames = [gui.getMessage('camp_day_mode'), gui.getMessage('camp_night_mode'), gui.getMessage('camp_setup_mode')];

    checkDay = container.querySelector('[name=day]');
    checkNight = container.querySelector('[name=night]');
    checkExtra = container.querySelector('[name=extra]');
    checkNeighbor = container.querySelector('[name=neighbor]');
    checkSetup = container.querySelector('[name=setup]');
    [checkDay, checkNight, checkExtra, checkNeighbor, checkSetup].forEach(input => input.addEventListener('click', toggleFlags));

    inputRegen = container.querySelector('[name=regen]');
    inputRegen.addEventListener('change', rebuildSetup);

    ['camp-player', 'camp-neighbor'].forEach(className => {
        let div = tab.container.querySelector('.' + className);
        div.addEventListener('render', function (_event) {
            updateCamp(this);
        });

        const input = div.querySelector('input');
        input.addEventListener('click', () => gui.updateTabState(tab));

        div = div.querySelector('div');
        div.addEventListener('mouseover', onmousemove);
        div.addEventListener('mouseout', onmousemove);
        div.addEventListener('mouseleave', onmousemove);
    });

    container.addEventListener('tooltip', onTooltip);
}

function update() {
    markToBeRendered(container.querySelector('.camp-player'));
    markToBeRendered(container.querySelector('.camp-neighbor'));
    const divWeeks = container.querySelector('.toolbar .weeks');
    const specialWeeks = gui.getActiveSpecialWeeks();
    const htm = [];
    for (const sw of specialWeeks.items) {
        if (sw.name) htm.push(Html.br`<div class="warning">${sw.name}: ${sw.ends}</div>`);
    }
    Dialog.htmlToDOM(divWeeks, htm.join(''));
    const buildings = gui.getFile('buildings');
    regBuildings = [];
    capBuildings = [];
    for (const [id, qty] of Object.entries(gui.getOwnedActive('building').owned)) {
        const building = buildings[id];
        if (building) {
            const reg = +building.stamina_reg;
            const cap = +building.max_stamina;
            const height = +building.rows;
            const width = +building.columns;
            const value = (reg > 0 ? reg : cap) / width;
            const item = { building, qty, width, height, value };
            if (reg > 0) regBuildings.push(item);
            else if (cap > 0) capBuildings.push(item);
        }
    }
    // Sort by slot value descending, then width descending
    const fnSort = (a, b) => (b.value - a.value) || (b.widht - a.width);
    regBuildings.sort(fnSort);
    capBuildings.sort(fnSort);
    divWeeks.style.display = htm.length ? '' : 'none';
}

function actionVisitCamp() {
    markToBeRendered(container.querySelector('.camp-neighbor'));
}

function markToBeRendered(div) {
    updateCamp(div, true);
    gui.setLazyRender(div.querySelector('div'));
}

function getState() {
    const getCheck = (id, c) => document.getElementById(id).checked ? c : '';
    const hide = [checkDay, checkNight, checkExtra, checkNeighbor, checkSetup].filter(check => !check.checked).map(check => check.name).join(',');
    return { hide, regen: inputRegen.value, h: [getCheck('camp_neighbor', 'n'), getCheck('camp_player', 'p')].join('') };
}

function getSetupRegen(state) {
    return Math.min(144, Math.max(0, parseInt(state.regen) || 0));
}

function setState(state) {
    const h = String(state.h || '').toLowerCase();
    const setCheck = (id, c) => document.getElementById(id).checked = h.indexOf(c) >= 0;
    setCheck('camp_player', 'p');
    setCheck('camp_neighbor', 'n');
    const hide = (state.hide || '').split(',');
    // compatibilty
    if ('no-neighbour' in state) hide.push('neighbor');
    if ('no-addons' in state) hide.push('extra');
    if (!('regen' in state)) {
        hide.push('setup');
        if (state.show == 'day') hide.push('night');
        if (state.show == 'night') hide.push('day');
    }
    [checkDay, checkNight, checkExtra, checkNeighbor, checkSetup].forEach(input => input.checked = !hide.includes(input.name));
    inputRegen.value = getSetupRegen(state);
    container.querySelector('.camp-neighbor').style.display = checkNeighbor.checked ? '' : 'none';
    const campPlayer = container.querySelector('.camp-player');
    campPlayer.classList.toggle('no-addons', !checkExtra.checked);
    campPlayer.classList.toggle('no-camp-1', !checkDay.checked);
    campPlayer.classList.toggle('no-camp-2', !checkNight.checked);
    campPlayer.classList.toggle('no-camp-3', !checkSetup.checked);
}

function toggleFlags() {
    gui.updateTabState(tab);
    setState(getState());
}

function rebuildSetup() {
    gui.updateTabState(tab);
    const generator = gui.getGenerator();
    const camp = generator.camp;
    let campResult = calculateCamp(camp, []);
    campResult = calculateCamp(camp, fillCamp(campResult.lines, getSetupRegen(getState())));
    Dialog.htmlToDOM(container.querySelector('.camp-player .camp-summary.camp-3'), getCampSummary(campResult, campNames[2]));
    let htm = '';
    htm += Html.br`<table class="camp-caption"><thead><tr><th>${campNames[2]}</th></tr></thead></table>`;
    htm += renderCamp(campResult);
    Dialog.htmlToDOM(container.querySelector('.camp-player .camp-container.camp-3'), htm);
}

function onmousemove(event) {
    let el = event.target;
    let bid = [];
    while (!el.classList.contains('card')) {
        if (el.hasAttribute('bid')) bid = el.getAttribute('bid').split(',');
        el = el.parentNode;
    }
    let selected = Array.from(el.querySelectorAll('.item.building')).filter(el => {
        el.classList.remove('selected', 'selected-first', 'selected-last');
        return bid.includes(el.getAttribute('bid'));
    });
    if ((bid == 'camp-1' || bid == 'camp-2') && checkSetup.checked) {
        const setupItems = Array.from(el.querySelectorAll(`.camp-container.camp-3 .item.building`));
        selected = Array.from(el.querySelectorAll(`.camp-container.${bid} .item.building`)).filter(el => {
            const bid = el.getAttribute('bid');
            const foundAt = setupItems.findIndex(el => el.getAttribute('bid') == bid);
            if (foundAt >= 0) setupItems.splice(foundAt, 1);
            return foundAt < 0;
        });
        selected = selected.concat(setupItems);
    }
    selected.forEach(el => el.classList.add('selected'));
    selected.forEach(el => {
        if (!el.previousElementSibling || !el.previousElementSibling.classList.contains('selected')) el.classList.add('selected-first');
        if (!el.nextElementSibling || !el.nextElementSibling.classList.contains('selected')) el.classList.add('selected-last');
    });
}

function getCampSummary(campResult, campName) {
    const cap_total = campResult.cap_tot;
    const reg_total = campResult.reg_tot;
    const fillTime = Math.ceil(cap_total / reg_total * 3600);
    const time = fillTime ? gui.getDuration(fillTime, 2) : '';

    // table Regeneration
    let htm = '';
    htm += Html.br`<table class="camp-data camp-summary row-coloring">`;
    htm += Html.br`<thead><tr class="energy_capacity"><th>${campName}</th><th><img src="/img/gui/camp_energy.png" title="${gui.getMessage('camp_regen')}"></th><th><img src="/img/gui/camp_capacity.png" title="${gui.getMessage('camp_capacity')}"></th></tr></thead>`;
    htm += Html.br`<tbody>`;
    htm += Html.br`<tr><td>${gui.getMessage('camp_total')}</td><td>${Locale.formatNumber(reg_total)}</td><td>${Locale.formatNumber(cap_total)}</td></tr>`;
    htm += Html.br`<tr><td>${gui.getMessage('camp_min_value')}</td><td bid="${campResult.stat.reg.min.join(',')}">${Locale.formatNumber(campResult.reg_min)}</td>`;
    htm += Html.br`<td bid="${campResult.stat.cap.min.join(',')}">${Locale.formatNumber(campResult.cap_min)}</td></tr>`;
    htm += Html.br`<tr><td>${gui.getMessage('camp_max_value')}</td><td bid="${campResult.stat.reg.max.join(',')}">${Locale.formatNumber(campResult.reg_max)}</td>`;
    htm += Html.br`<td bid="${campResult.stat.cap.max.join(',')}">${Locale.formatNumber(campResult.cap_max)}</td></tr>`;
    htm += Html.br`<tr><td>${gui.getMessage('camp_num_slots')}</td><td>${Locale.formatNumber(campResult.stat.numRegSlots)}</td><td>${Locale.formatNumber(campResult.stat.numCapSlots)}</td></tr>`;
    htm += Html.br`<tr><td>${gui.getMessage('camp_avg_value')}</td><td>${Locale.formatNumber(campResult.reg_avg)}</td><td>${Locale.formatNumber(campResult.cap_avg)}</td></tr>`;
    htm += Html.br`</tbody>`;
    if (time) {
        htm += Html.br`<thead title="${gui.getMessage('camp_fill_time_info')}">`;
        htm += Html.br`<tr><td>${gui.getMessage('camp_fill_time')}</td><td colspan="2">${time}</td></tr>`;
        htm += Html.br`</thead>`;
    }
    htm += Html.br`</table>`;
    return htm;
}

function updateCamp(div, flagHeaderOnly = false) {
    let camp, campName, pal, level, started;

    const generator = gui.getGenerator();

    const isPlayer = div.classList.contains('camp-player');
    if (isPlayer) {
        camp = generator.camp;
        pal = {
            name: generator.name,
            surname: generator.surname,
            id: generator.player_id,
            fb_id: generator.fb_id
        };
        level = +generator.level;
        ['region', 'windmill_limit', 'windmill_reg'].forEach(key => camp[key] = +generator[key]);
        const time = Locale.formatDateTime(+generator.time);
        campName = pal && pal.name ? gui.getMessage('camp_player_name', gui.getPlayerNameFull(pal), time) : `${gui.getMessage('camp_your_camp')} (${time})`;
        started = new Date(+generator.registered_on * 1000);
    } else {
        camp = bgp.Data.lastVisitedCamp;
        const neighbourId = camp && camp.neigh_id;
        pal = neighbourId ? bgp.Data.getNeighbour(neighbourId) : null;
        level = pal ? +pal.level : 1;
        campName = (neighbourId ? gui.getMessage('camp_player_name', pal ? gui.getPlayerNameFull(pal) : '#' + neighbourId, Locale.formatDateTime(+camp.time)) : gui.getMessage('camp_no_player'));
    }

    div.querySelector('img').setAttribute('src', pal ? gui.getNeighborAvatarUrl(pal) : '/img/gui/anon.png');
    // div.querySelector('span').textContent = campName;
    Dialog.htmlToDOM(div.querySelector('span'), Html`${campName}<span class="screenshot"></span>`);
    gui.setupScreenshot(div, campName);
    Dialog.htmlToDOM(div.querySelector('div'), '');
    if (flagHeaderOnly || !camp) return;

    const campResult = calculateCamp(camp, true);
    const camps = [campResult];

    // add secondary camp setup if Professor's Switch was bought
    if (isPlayer && gui.getArrayOfInt(generator.extensions).includes(2)) camps.push(calculateCamp(camp, false));
    // sorts camps by total regeneration descending (day first, night last)
    camps.sort((a, b) => b.reg_tot - a.reg_tot);

    if (isPlayer) {
        if (camps.length < 2) camps.push(null);
        camps.push(calculateCamp(camp, fillCamp(campResult.lines, getSetupRegen(getState()))));
    }

    const addons = calculateAddons(camp, isPlayer ? generator : null);
    addons.empty = addons.blocked = 0;
    camps.forEach(campResult => {
        if (!campResult) return;
        let slots = [];
        Object.values(campResult.lines).forEach(line => slots = slots.concat(line.slots));
        addons.empty = Math.max(addons.empty, slots.filter(slot => slot.kind === 'empty').length);
        addons.blocked = Math.max(addons.blocked, slots.filter(slot => slot.kind === 'block').length);
    });

    let htm = '';
    htm += Html.br`<table class="camp-tables"><tr>`;

    // table Player
    htm += Html.br`<td><table class="camp-data camp-player-info row-coloring">`;
    htm += Html.br`<thead><tr><th colspan="2">${gui.getMessage('camp_player')}</th></tr></thead>`;
    htm += Html.br`<tbody>`;
    htm += Html.br`<tr><td>${gui.getMessage('gui_level')}</td><td>${Locale.formatNumber(level)}</td></tr>`;
    htm += Html.br`<tr><td>${gui.getMessage('gui_region')}</td><td>${gui.getObjectName('region', camp.region)}</td></tr>`;
    htm += Html.br`<tr><td>${gui.getMessage('gui_theme')}</td><td>${gui.getObjectName('skin', camp.skin)}</td></tr>`;
    htm += Html.br`</tbody>`;
    if (started && !isNaN(started.getFullYear())) {
        htm += Html.br`<tbody>`;
        htm += Html.br`<tr><td colspan="2">${gui.getMessage('camp_start_date', Locale.formatDateTime(started))}</td></tr>`;
        htm += Html.br`</tbody>`;
    }
    htm += Html.br`</table><div class="screenshot"></div></td>`;

    camps.forEach(function (campResult, index) {
        if (!campResult) return;
        htm += Html.br`<td class="camp-summary camp-${index + 1}">` + getCampSummary(campResult, isPlayer ? campNames[index] : '') + Html.br`</td>`;
    });

    const wind_count = (camp && Array.isArray(camp.windmills) && camp.windmills.length) || 0;
    const wind_expiry = bgp.Data.getCampWindmillTime(camp);
    // table Windmills
    htm += Html.br`<td><table class="camp-data row-coloring">`;
    htm += Html.br`<thead><tr><th colspan="2">${gui.getMessage('camp_windmills')}</th></tr></thead>`;
    htm += Html.br`<tbody>`;
    htm += Html.br`<tr><td>${gui.getMessage('camp_windmill_num')}</td><td>${Locale.formatNumber(wind_count) + ' / ' + Locale.formatNumber(camp.windmill_limit)}</td></tr>`;
    if (camp.windmill_reg) {
        htm += Html.br`<tr><td>${gui.getMessage('camp_windmill_regen')}</td><td>${Locale.formatNumber(camp.windmill_reg)}</td></tr>`;
        htm += Html.br`<tr><td>${gui.getMessage('camp_windmill_regen_total')}</td><td>${Locale.formatNumber(camp.windmill_reg * Math.min(wind_count, camp.windmill_limit))}</td></tr>`;
    }
    htm += Html.br`</tbody>`;
    if (wind_expiry) {
        htm += Html.br`<tbody>`;
        htm += Html.br`<tr><td colspan="2">${gui.getMessage('camp_windmill_expiry', Locale.formatDateTime(wind_expiry))}</td></tr>`;
        htm += Html.br`</tbody>`;
    }
    htm += Html.br`</table></td>`;

    if (campResult.blocks[2].blocked || campResult.blocks[3].blocked || campResult.blocks[4].blocked) {
        const swDiscount = gui.getActiveSpecialWeeks().debrisDiscount;
        const mat = {};
        const matDiscount = {};
        Object.values(campResult.blocks).forEach(block => {
            for (let i = NUM_SLOTS * 2 - block.blocked; i < NUM_SLOTS * 2; i++) {
                for (const req of (block.slots[i] && block.slots[i].requirements)) {
                    const matId = req.material_id;
                    mat[matId] = (mat[matId] || 0) + +req.amount;
                    if (swDiscount) matDiscount[matId] = (matDiscount[matId] || 0) + Math.ceil(+req.amount * swDiscount.coeficient);
                }
            }
        });
        htm += Html.br`<td><table class="camp-data">`;
        htm += Html.br`<thead><tr><th colspan="3">${gui.getMessage('camp_unlock_materials')}</th>`;
        if (swDiscount) htm += Html.br`<th>${gui.getMessage('camp_discounted')}</th>`;
        htm += Html.br`</tr></thead>`;

        const materials = gui.getFile('materials');

        // Show materials
        for (const matId of [1, 7, 22, 32, 8]) {
            const material = materials[matId];
            const img = material ? gui.getObjectImg('material', matId, 24, true) : '';
            if (matId in mat) {
                htm += Html.br`<tr class="material"><td>${img}</td><td>${gui.getObjectName('material', matId)}</td><td>${Locale.formatNumber(mat[matId])}</td>`;
                if (swDiscount) htm += Html.br`<td>${Locale.formatNumber(matDiscount[matId])}</td>`;
                htm += Html.br`</tr>`;
            }
        }
        htm += Html.br`<tbody>`;
        if (swDiscount) {
            htm += Html.br`<tfoot><tr><th colspan="4" class="warning">${swDiscount.name}<br>${swDiscount.ends}</th></tfoot>`;
        }
        htm += Html.br`</table></td>`;
    }

    htm += Html.br`</tr></table>`;

    if (Object.keys(addons).length > 0) {
        htm += Html`<div class="camp_addons">`;
        for (const addon of addonsMeta) {
            const name = addon.name;
            if (name in addons) {
                let value = addons[name];
                let title = gui.getString(addon.title);
                if (addon.desc) {
                    const msg = Array.isArray(addon.desc) ? addon.desc[value] : addon.desc;
                    if (msg) title += '\n' + gui.getString(msg);
                }
                const cost = getCostForAddon(name, value);
                if (cost) title += `\n${cost}`;
                let img = `/img/gui/${name}.png`;
                let extraClass = '';
                if (addon.name == 'diggy_skin') {
                    extraClass = addon.name;
                    img = gui.getObjectImage('diggy_skin', addons.costume.def_id);
                    title += `\n${gui.getString(addons.costume.name_loc)}`;
                }
                if (addon.name == 'speedpotion') {
                    extraClass = addon.name;
                    title += addons.speedpotion_title;
                    img = addons.speedpotion_img;
                }
                htm += Html`<div class="camp_addon ${value ? 'camp_addon_on' : ''}" title="${title}">`;
                htm += Html`<div class="camp_addon_img ${extraClass}"><img src="${img}"></div>`;
                if (typeof value === 'number') value = Locale.formatNumber(value);
                if (typeof value === 'string' && value != '') htm += Html.br`<div class="camp_addon_level">${value}</div>`;
                htm += Html`</div>`;
            }
        }
        if (addons.empty) {
            htm += Html`<div class="camp_addon camp_addon_empty" title="${gui.getMessage('camp_slot_empty')}">`;
            htm += Html`<div class="camp_addon_img"><img src="/img/gui/mill.png"></div>`;
            htm += Html.br`<div class="camp_addon_level">${Locale.formatNumber(addons.empty)}</div>`;
            htm += Html`</div>`;
        }
        if (addons.blocked) {
            htm += Html`<div class="camp_addon camp_addon_blocked" title="${gui.getMessage('camp_slot_blocked')}">`;
            htm += Html`<div class="camp_addon_img"><img src="/img/gui/bomb.png"></div>`;
            htm += Html.br`<div class="camp_addon_level">${Locale.formatNumber(addons.blocked)}</div>`;
            htm += Html`</div>`;
        }
        htm += Html`</div>`;
    }

    camps.forEach(function (campResult, index) {
        if (!campResult) return;
        htm += Html.br`<div class="camp-container camp-new camp-${index + 1}">`;
        if (camps.length > 1)
            htm += Html.br`<table class="camp-caption"><thead><tr><th bid="camp-${index + 1}">${campNames[index]}</th></tr></thead></table>`;
        htm += renderCamp(campResult);
        htm += Html.br`</div>`;
    });

    Dialog.htmlToDOM(div.querySelector('div'), htm);
}

function calculateCamp(camp, current = true) {
    const lines_ids = gui.getArrayOfInt(camp.lines_ids);
    const lines_blocked = gui.getArrayOfInt(camp.lines_blocked);
    const buildings = gui.getFile('buildings');
    const lines = {};
    const blocks = {};
    let reg_min, reg_max, reg_cnt, cap_min, cap_max, cap_cnt, reg_tot, cap_tot;

    // setup blocks
    [2, 3, 4].forEach(height => {
        blocks[height] = {
            blocked: 0,
            slots: []
        };
    });
    Object.values(gui.getFile('lines')).forEach(line => {
        const height = +line.height;
        const order = +line.order + (height == 2 ? 3 : 0);
        if (height >= 2 && height <= 4 && order >= 1 && order <= NUM_SLOTS * 2)
            blocks[height].slots[order - 1] = line;
    });

    // setup lines
    [1, 2, 3, 5, 7, 9].forEach((lid, index) => {
        const height = Math.floor(index / 2) + 2;
        const slots = [];
        const emptySlot = {
            kind: 'empty',
            title: gui.getMessage('camp_slot_empty'),
            width: 1,
            height: height
        };
        const pos = lines_ids.indexOf(lid);
        const blocked = pos >= 0 ? parseInt(lines_blocked[pos]) || 0 : NUM_SLOTS;
        for (let i = 0; i < NUM_SLOTS; i++) slots[i] = emptySlot;
        if (blocked > 0) {
            const slot = {
                kind: 'block',
                title: gui.getMessage('camp_slot_blocked'),
                width: blocked,
                height: height
            };
            for (let i = 0; i < blocked; i++) slots[index % 2 ? NUM_SLOTS - 1 - i : i] = slot;
        }
        lines[lid] = {
            lid: lid,
            isReversed: (index % 2) == 0,
            height: height,
            slots: slots,
            blocked: blocked
        };
        blocks[height].blocked += blocked;
    });

    const reg_base = bgp.Data.getConfigValue('stamina_reg', 60) + Math.min((camp.windmills && camp.windmills.length) || 0, camp.windmill_limit || 5) * (parseInt(camp.windmill_reg) || 5);
    const cap_base = bgp.Data.getConfigValue('starting_stamina', 200);

    // position buildings
    reg_min = reg_max = cap_min = cap_max = reg_tot = cap_tot = reg_cnt = cap_cnt = 0;

    const stat = {};
    stat.cap = { min: [], max: [] };
    stat.reg = { min: [], max: [] };

    let blds = Array.isArray(current) ? current : (current ? camp.buildings : camp.inactive_b);
    blds = blds ? (Array.isArray(blds) ? blds : [blds]) : [];
    blds.forEach(building => {
        const lid = building.line_id;
        const line = lines[lid];
        if (line) {
            const bid = +building.def_id;
            const slot = +building.slot;
            building = buildings[bid];
            if (building) {
                const regen = +building.stamina_reg;
                const capacity = +building.max_stamina;
                const width = +building.columns;
                const value = Math.floor((regen || capacity) / width);
                if (capacity > 0) {
                    if (cap_min == 0 || value < cap_min) {
                        cap_min = value;
                        stat.cap.min = [bid];
                    } else if (value == cap_min) {
                        stat.cap.min.push(bid);
                    }
                    if (cap_max == 0 || value > cap_max) {
                        cap_max = value;
                        stat.cap.max = [bid];
                    } else if (value == cap_max) {
                        stat.cap.max.push(bid);
                    }
                    cap_tot += capacity;
                    cap_cnt += width;
                }
                if (regen > 0) {
                    if (reg_min == 0 || value < reg_min) {
                        reg_min = value;
                        stat.reg.min = [bid];
                    } else if (value == reg_min) {
                        stat.reg.min.push(bid);
                    }
                    if (reg_max == 0 || value > reg_max) {
                        reg_max = value;
                        stat.reg.max = [bid];
                    } else if (value == reg_max) {
                        stat.reg.max.push(bid);
                    }
                    reg_tot += regen;
                    reg_cnt += width;
                }
                const data = {
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

    stat.numRegSlots = stat.numCapSlots = stat.numEmptySlots = 0;
    Object.values(lines).forEach(line => line.slots.forEach(slot => {
        if (slot.kind == 'empty') stat.numEmptySlots++;
        if (slot.kind == 'building' && slot.regen) stat.numRegSlots++;
        if (slot.kind == 'building' && !slot.regen) stat.numCapSlots++;
    }));

    const reg_avg = reg_cnt && Math.floor(reg_tot / reg_cnt);
    const cap_avg = cap_cnt && Math.floor(cap_tot / cap_cnt);
    reg_tot += reg_base;
    cap_tot += cap_base;

    return {
        lines,
        blocks,
        stat,
        reg_min,
        reg_max,
        reg_avg,
        cap_min,
        cap_max,
        cap_avg,
        reg_base,
        cap_base,
        reg_tot,
        cap_tot
    };
}

function calculateAddons(camp, generator) {
    const addons = {};
    const getItems = (arr, map) => {
        const items = {};
        arr && arr.filter(o => o).map(map).forEach(o => items[o.id] = o);
        return items;
    };
    if (camp.addon_buildings) {
        const items = getItems(camp.addon_buildings, o => { return { id: +o.def_id, level: +o.level }; });
        addons.hollander = items[6] ? 8 : 5;
        addons.rotor = items[7] ? items[7].level : 0;
    }
    if (generator) {
        const items = getItems([].concat(generator.passive_effect_extension && generator.passive_effect_extension.item), o => { return { id: +o.extension_def_id, level: +o.extension_level }; });
        addons.potion_double_exp = items[1] ? items[1].level : 0;
        addons.potion_energy_back = items[2] ? items[2].level : 0;

        const ext = getItems(gui.getArrayOfInt(generator.extensions), o => { return { id: o }; });
        addons.golem = !!ext[1];
        addons.professor_switch = !!ext[2];
        addons.gc_one_click = !!ext[3];
        addons.last_tile_finder = !!ext[4];

        const costumes = Object.values(gui.getFile('diggy_skins'));
        addons.diggy_skin = gui.getArrayOfInt(generator.diggy_skins).length + costumes.filter(c => +c.free).length;
        addons.costume = costumes.find(c => +c.def_id == +generator.diggy_skins_active) || costumes[0];

        const usables = gui.getFile('usables');
        const potions = [];
        let total = 0;
        for (const [id, qty] of Object.entries(generator.usables)) {
            const usable = usables[id];
            if (usable && usable.action == 'speedup_ctrl') {
                const value = +usable.value;
                const tot = qty * value;
                total += tot;
                potions.push({ id, qty, value, tot });
            }
        }
        if (potions.length) {
            addons.speedpotion = gui.getDuration(total);
            potions.sort((a, b) => b.tot - a.tot);
            addons.speedpotion_img = gui.getObjectImage('usable', potions[0].id, true);
            addons.speedpotion_title = '\n' + potions.map(p => `${gui.getObjectName('usable', p.id)} \xd7 ${Locale.formatNumber(p.qty)} = ${gui.getDuration(p.tot, 2)}`).join('\n');
            addons.speedpotion_title += '\n' + gui.getMessageAndValue('camp_total', gui.getDuration(total, 2));
        }

    }
    return addons;
}

function findSales(type, id) {
    return Object.values(gui.getFile('sales')).filter(sale => sale.type == type && +sale.hide == 0 && +sale.object_id == id);
}

function getCostForAddon(name, value) {
    let cost = '';
    let sales;
    const addon = addonsMeta.find(o => o.name == name);
    if (addon && addon.type) {
        sales = findSales(addon.type, addon.id);
        if (name == 'rotor') {
            if (sales.length && value != +sales[sales.length - 1].object_level) value++;
            sales = sales.filter(sale => +sale.object_level == value);
        }
    }
    const isPotion = name == 'potion_double_exp' || name == 'potion_energy_back';
    if (sales && sales.length) {
        sales.sort((a, b) => (+a.object_level - +b.object_level) || (+a.level - +b.level));
        let prefix = sales.length > 1 ? '\u2022 ' : '';
        cost = sales.map(sale => {
            if (isPotion) prefix = `${gui.getMessage('gui_level')} ${Locale.formatNumber(+sale.object_level)}: `;
            let text = sale.requirements.map(req => gui.getObjectName('material', req.material_id) + ' \xd7 ' + Locale.formatNumber(req.amount)).join(', ');
            if (+sale.level > 1) text = `${text} (${gui.getMessage('gui_level')} ${Locale.formatNumber(sale.level)})`;
            return prefix + text;
        }).join('\n');
        if (name == 'rotor') cost = '\n' + gui.getMessage('gui_cost') + ' [' + gui.getMessage('gui_level').toUpperCase() + ' ' + Locale.formatNumber(value) + ']:\n' + cost;
        else cost = '\n' + gui.getMessage('gui_cost') + ':\n' + cost;
    }
    return cost;
}

function renderCamp(campResult) {
    const {
        lines,
        blocks,
        reg_min,
        reg_max,
        cap_min,
        cap_max
    } = campResult;

    // render the camp and calculate some values
    const reg_range = reg_max - reg_min;
    const cap_range = cap_max - cap_min;
    const opacity_min = 0.4;
    const opacity_range = 1 - opacity_min;
    let htm = '';

    htm += Html.br`<div class="camp public">`;

    function getStrength(value, min, range) {
        return range ? (value - min) / range * opacity_range + opacity_min : 1;
    }
    [1, 2, 3, 5, 7, 9].forEach((lid) => {
        const line = lines[lid];
        const slots = line.slots;
        htm += Html.br`<div class="line" style="--lw:24;--lh:${line.height}">`;
        const getSlot = function (index) {
            return slots[line.isReversed ? NUM_SLOTS - 1 - index : index];
        };
        for (let i = 0; i < NUM_SLOTS;) {
            const slot = getSlot(i);
            let title = slot.title;
            let width = slot.width;
            let kind = slot.kind;
            let colValues = '';
            let strength = 0;
            let bid = 0;
            let exStyle = '';
            while (kind == 'empty' && i + width < NUM_SLOTS && getSlot(i + width).kind == kind) width++;
            if (width > 1 && (kind == 'empty' || kind == 'block')) title += ' \xd7 ' + width;
            if (kind == 'block') {
                const block = blocks[line.height].slots[NUM_SLOTS * 2 - blocks[line.height].blocked];
                if (block) {
                    title += '\n' + gui.getMessage('camp_unlock_one', Locale.formatNumber(+block.exp));
                    title += '\n' + gui.getMessage('camp_unlock_cost', Locale.formatNumber(+block.gems));
                    for (const req of block.requirements) {
                        title += '\n    ' + gui.getObjectName('material', req.material_id) + ' \xd7 ' + Locale.formatNumber(+req.amount);
                    }
                }
            }
            if (kind == 'building') {
                title += ' (' + width + '\xd7' + slot.height + ')';
                bid = slot.bid;
                const url = gui.getObjectImage('building', bid);
                if (url) {
                    kind += ' img tooltip-event';
                    exStyle = ';background-image:url(' + url + ')';
                }
                if (slot.capacity > 0) {
                    kind += ' capacity';
                    title += '\n' + gui.getMessageAndValue('camp_capacity', slot.capacity);
                    strength = getStrength(slot.value, cap_min, cap_range);
                }
                if (slot.regen > 0) {
                    kind += ' regen';
                    title += '\n' + gui.getMessageAndValue('camp_regen', slot.regen);
                    strength = getStrength(slot.value, reg_min, reg_range);
                }
                if (slot.region_id > 0) {
                    kind += ' reg' + slot.region_id;
                    title += '\n' + gui.getMessageAndValue('gui_region', gui.getObjectName('region', slot.region_id));
                }
                colValues = Html.raw(String(Html.br`<div class="value">${slot.value}</div>`).repeat(width));
                strength = Math.round(strength * 1000) / 1000;
            }
            htm += Html.br`<div class="item ${kind}" style="--w:${width};--h:${slot.height};--v:${strength}${exStyle}" title="${Html(title)}"`;
            if (bid) htm += Html.br` bid="${bid}"`;
            htm += Html.br`>${colValues}</div>`;
            i += width;
        }
        htm += Html.br`</div>`;
    });
    htm += Html.br`</div>`;
    return htm;
}

function fillCamp(campLines, numRegSlots, regFirst = true) {
    const blds = [];
    let numSlots = 0;
    const lines = Object.values(campLines).map(line => {
        const copy = Object.assign({}, line);
        copy.empty = line.slots.length - line.blocked;
        copy.first = line.isReversed ? line.blocked : 0;
        copy.last = line.isReversed ? line.slots.length : copy.empty;
        numSlots += copy.empty;
        return copy;
    }).sort((a, b) => a.height - b.height);
    numRegSlots = Math.min(numSlots, Math.max(0, numRegSlots));
    let numCapSlots = numSlots - numRegSlots;
    const regBuildingsRest = regBuildings.map(item => Object.assign({}, item));
    const capBuildingsRest = capBuildings.map(item => Object.assign({}, item));
    const tryFind = (num, buildings, atFirst) => {
        if (num <= 0) return 0;
        const index = buildings.findIndex(item => {
            const { height, width } = item;
            if (width > num) return false;
            const line = lines.find(line => line.height >= height && line.empty >= width);
            if (!line) return false;
            const fromStart = line.isReversed ? !atFirst : atFirst;
            const placed = { def_id: item.building.def_id, line_id: line.lid, slot: fromStart ? line.first : line.last - width };
            blds.push(placed);
            line.empty -= width;
            if (fromStart) line.first += width; else line.last -= width;
            return true;
        });
        if (index < 0) return 0;
        const item = buildings[index];
        if (--item.qty <= 0) buildings.splice(index, 1);
        return item.width;
    };
    let switched = false;
    for (; ;) {
        const regPlaced = tryFind(numRegSlots, regBuildingsRest, regFirst);
        const capPlaced = tryFind(numCapSlots, capBuildingsRest, !regFirst);
        numRegSlots -= regPlaced;
        numCapSlots -= capPlaced;
        numSlots -= (regPlaced + capPlaced);
        // Cannot add any building
        if (regPlaced == 0 && capPlaced == 0) {
            if (switched || numSlots == 0) break;
            // Switch the quantities, so we try to fill the remaining slots
            switched = true;
            [numRegSlots, numCapSlots] = [numCapSlots, numRegSlots];
        }
    }
    return blds;
}

function onTooltip(event) {
    const element = event.target;
    const bid = parseInt(element.getAttribute('bid'));
    const htm = Html.br`<div class="camp-tooltip"><img src="${gui.getObjectImage('building', bid)}"}"/></div>`;
    Tooltip.show(element, htm, 'bb');
}