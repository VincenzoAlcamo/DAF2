/*global bgp gui Html Locale Dialog*/

export default ringLoot;

function ringLoot(kind) {

    let tokenId, locations;
    let requires = ['materials', 'usables', 'tokens', 'xp'];
    const christmasMines = {
        1987: 5605,
        2284: 6844,
        2640: 7833
    };

    if (kind == 'green') {
        tokenId = 32;
        const maxRId = gui.getMaxRegion();
        locations = [];
        for (let rid = 1; rid <= maxRId; rid++) locations.push('locations_' + rid);
        requires.push('special_weeks');
    } else if (kind == 'red') {
        tokenId = 1642;
        locations = ['locations_0'];
    } else if (kind == 'christmas') {
        tokenId = 0;
        locations = ['locations_0'];
        requires.push('special_weeks');
    } else throw 'Invalid kind "' + kind + '"';
    requires = requires.concat(locations);

    let tab, container, floorData, checkMinMax, inputLevel, swDoubleDrop, checkLevel, checkXp, selectRegion, selectDMW;
    let checkState = {};
    let selectState = [];

    function init() {
        tab = this;
        container = tab.container;

        selectRegion = container.querySelector('[name=region]');
        if (selectRegion) {
            selectRegion.addEventListener('change', onInput);
            Dialog.htmlToDOM(selectRegion, '');
            for (let rid = 1, maxRid = gui.getMaxRegion(); rid <= maxRid; rid++) {
                const option = document.createElement('option');
                option.value = '' + rid;
                option.innerText = gui.getObjectName('region', rid);
                selectRegion.appendChild(option);
            }
        }

        checkMinMax = container.querySelector('[name=minmax]');
        checkMinMax.addEventListener('click', onInput);

        checkXp = container.querySelector('[name=xp]');
        checkXp.addEventListener('click', onInput);

        selectDMW = container.querySelector('[name=dmw]');
        if (selectDMW) selectDMW.addEventListener('change', refresh);

        inputLevel = container.querySelector('[name=level]');
        if (inputLevel) {
            inputLevel.addEventListener('input', onInput);
            inputLevel.addEventListener('blur', onBlur);
        }

        checkLevel = container.querySelector('[name=showlevel]');
        if (checkLevel) {
            checkLevel.addEventListener('click', onInput);
        }
    }

    function toInt(value) {
        const n = parseInt(value);
        return isFinite(n) && n > 0 ? n : 0;
    }

    function getState() {
        const level = inputLevel ? parseInt(inputLevel.value) || 0 : 0;
        let selected = '';
        for (let i = 0; i < selectState.length; i++) {
            selected += ',' + (toInt(selectState[i]) || '');
        }
        selected = selected.substr(1).replace(/,+$/, '');
        const result = {
            region: selectRegion ? selectRegion.value : '',
            minmax: checkMinMax.checked,
            xp: checkXp.checked,
            dmw: selectDMW ? selectDMW.value : undefined,
            h: Object.keys(checkState).join(','),
            selected
        };
        if (checkLevel) {
            result[checkLevel.checked ? 'level' : 'no-level'] = (level >= 1 && level <= 999 ? level : +gui.getGenerator().level);
        }
        return result;
    }

    function setState(state) {
        checkState = {};
        for (const index of gui.getArrayOfInt(state.h)) checkState[index] = true;
        const setCheck = (id, c) => {
            const input = document.getElementById(id);
            if (input) {
                input.checked = !!checkState[c];
                setRotate(input);
            }
        };
        if (selectRegion) {
            state.region = gui.setSelectState(selectRegion, state.region);
        }
        checkXp.checked = !!state.xp;
        state.dmw = selectDMW ? gui.setSelectState(selectDMW, state.dmw) : undefined;
        if (checkLevel) {
            checkLevel.checked = 'level' in state;
            const level = parseInt(state.level || state['no-level']) || 0;
            inputLevel.value = level >= 1 && level <= 999 ? level : +gui.getGenerator().level;
        }
        for (const data of Object.values(floorData || {})) setCheck('loot_' + data.mine.def_id, data.index);
        checkMinMax.checked = !!state.minmax;
        selectState = String(state.selected).split(',').map(n => toInt(n));
    }

    function onInput(event) {
        updateTabState();
        const name = event.srcElement.name;
        if (name == 'xp' || name == 'minmax' || name == 'showlevel') setStateFlags();
        else refresh();
    }

    function onBlur() {
        const level = parseInt(inputLevel.value) || 0;
        if (level < 1 || level > 999) {
            inputLevel.value = +gui.getGenerator().level;
            onInput();
        }
    }

    async function update() {
        if (tokenId) {
            const img = gui.getObjectImg('token', tokenId, 24, true);
            const qty = gui.getGenerator().tokens[tokenId] || 0;
            Dialog.htmlToDOM(container.querySelector('.stats'), Html.br`${img}${gui.getMessage('rings_stats', Locale.formatNumber(qty), gui.getObjectName('token', tokenId))}`);
        }

        if (kind == 'green' || kind == 'christmas') {
            const specialWeeks = gui.getActiveSpecialWeeks();
            swDoubleDrop = specialWeeks.doubleDrop;
        }
        const divWarning = container.querySelector('.toolbar .warning');
        if (swDoubleDrop) {
            Dialog.htmlToDOM(divWarning, Html.br`${swDoubleDrop.name}: ${swDoubleDrop.ends}`);
            divWarning.style.display = '';
        } else {
            divWarning.style.display = 'none';
        }
        if (selectDMW) selectDMW.querySelector('option[value=""]').textContent = '(' + gui.getMessage(swDoubleDrop ? 'dialog_yes' : 'dialog_no').toLowerCase() + ')';

        const seconds = (kind == 'green' ? 168 : 2) * 3600;
        const eid = kind == 'green' ? 0 : 20;
        let mines = [];
        if (kind == 'christmas') {
            for (const loc of locations) mines = mines.concat(Object.values(gui.getFile(loc)).filter(mine => {
                return +mine.test == 0 && +mine.def_id in christmasMines;
            }));
        } else {
            for (const loc of locations) mines = mines.concat(Object.values(gui.getFile(loc)).filter(mine => {
                return +mine.test == 0 && +mine.event_id == eid && +mine.reset_cd == seconds;
            }));
        }

        floorData = {};
        const parent = container.querySelector('.scrollable-content');
        Dialog.htmlToDOM(parent, '');
        let index = 0;
        for (const mine of mines) {
            const lid = mine.def_id;
            if (+mine.region_id > +gui.getGenerator().region) continue;
            const floors = await bgp.Data.getFile('floors_' + lid);
            const allLoots = [];
            let chest = 0;
            let hasCandy = false;
            for (const floor of floors.floor) {
                let lootAreas = floor.loot_areas && floor.loot_areas.loot_area;
                lootAreas = Array.isArray(lootAreas) ? lootAreas : [];
                const loots = [];
                let gemTle = '';
                let candyTle = '';
                for (const lootArea of lootAreas) {
                    if (lootArea.type == 'token') continue;
                    let tle = lootArea.tiles;
                    if (typeof tle != 'string') continue;
                    tle = tle.split(';');
                    for (let t of tle) {
                        t = t.split(',').map(n => parseInt(n));
                        if (kind == 'red' || kind == 'christmas') {
                            t[0] = 99 - t[0];
                        }
                        t = t.map(n => String(n).padStart(3, '0')).join(',');
                        // skip spurious Orichalcum in "Temple of Fortune" (no more necessary as the file has been fixed)
                        if (lid == 2193 && t.substr(0, 3) == '030,' && lootArea.type == 'material' && lootArea.object_id == 148) continue;
                        const copy = Object.assign({}, lootArea);
                        copy.tle = t;
                        const type = copy.type;
                        const oid = copy.object_id;
                        if (type == 'material' && oid == 2) gemTle = copy.tle;
                        if (type == 'usable' && oid == 19) candyTle = copy.tle;
                        loots.push(copy);
                    }
                }
                for (const lootArea of loots) {
                    if (lootArea.tle == candyTle) {
                        lootArea.tle = 'z' + lootArea.tle;
                        hasCandy = true;
                    } else if (lootArea.tle == gemTle) {
                        lootArea.tle = 'g' + lootArea.tle;
                    }
                }
                loots.sort((a, b) => a.tle.localeCompare(b.tle));

                let last = null;
                for (const lootArea of loots) {
                    if (last == null || last.tle != lootArea.tle) {
                        last = lootArea;
                        chest = chest + 1;
                        lootArea.numRows = 1;
                    } else {
                        last.numRows++;
                    }
                    lootArea.chest = chest;
                    allLoots.push(lootArea);
                }
            }
            floorData[lid] = {
                index: ++index,
                mine: mine,
                chests: chest,
                hasCandy: hasCandy,
                loots: allLoots
            };
            let htm = '';
            htm += Html.br`<input type="checkbox" id="loot_${lid}">`;
            if (kind == 'christmas') {
                const tokenId = christmasMines[lid];
                const qty = gui.getGenerator().tokens[tokenId] || 0;
                htm += Html.br`<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${gui.getObjectImg('token', tokenId, 32, true)}<span>${gui.getString(mine.name_loc)}<br>${gui.getMessageAndValue('rings_rings', Locale.formatNumber(qty))}</span></label>`;
            } else {
                htm += Html.br`<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${kind == 'green' ? gui.getRegionImg(mine.region_id) : Html`<img src="/img/gui/redrings.png">`}<span>${gui.getString(mine.name_loc)}</span></label>`;
            }
            htm += Html.br`<div></div>`;
            const div = document.createElement('div');
            div.className = 'card rings';
            Dialog.htmlToDOM(div, htm);
            parent.appendChild(div);
            const input = div.querySelector('input');
            input.addEventListener('click', function () {
                setRotate(this);
                updateTabState();
            });
        }
        setState(getState());
        updateTabState();
        refresh();
    }

    function setRotate(input) {
        const div = input.parentNode;
        const lid = input.id.substr(5);
        const data = floorData[lid];
        if (!data) return;
        const index = data.index;
        if (input.checked) checkState[index] = true;
        else delete checkState[index];
        if (input.checked) {
            const width = div.offsetWidth;
            const height = div.offsetHeight;
            div.style.transform = 'rotate(-90deg) translateY(' + (-Math.floor((width - height) / 2)) + 'px) translateX(' + (-Math.floor((width - height) / 2)) + 'px)';
            div.style.marginRight = (-Math.floor(width - height - 3)) + 'px';
            div.querySelector('label').style.cursor = 'ew-resize';
        } else {
            div.style.transform = '';
            div.style.marginRight = '';
            div.querySelector('label').style.cursor = '';
        }
    }

    function setStateFlags() {
        const state = getState();
        container.classList.toggle('rings-minmax', state.minmax);
        container.classList.toggle('rings-no-minmax', !state.minmax);
        container.classList.toggle('rings-no-level', !('level' in state));
        container.classList.toggle('rings-no-xp', !state.xp);
    }

    function updateTabState() {
        selectState.length = Object.values(floorData).length;
        for (const data of Object.values(floorData)) {
            const max = data.chests + (data.hasCandy ? -1 : 0);
            const mask = (2 ** max) - 1;
            selectState[data.index - 1] = selectState[data.index - 1] & mask;
        }
        gui.updateTabState(tab);
    }

    function refresh() {
        setStateFlags();
        let level = inputLevel ? inputLevel.value : 0;
        if (level < 1 || level > 999) level = +gui.getGenerator().level;
        const rid = selectRegion ? +selectRegion.value : 0;
        for (const data of Object.values(floorData)) showLoot(level, data.mine.def_id, rid);
    }

    function showLoot(otherLevel, lid, rid) {
        const state = getState();
        const isDMW = state.dmw ? state.dmw === 'yes' : !!swDoubleDrop;
        const doubleDrop = isDMW ? swDoubleDrop || { coeficient: 2 } : null;
        let parent = container.querySelector('#loot_' + lid);
        const data = floorData[lid];
        if (!parent || !data) return;
        const cardIndex = data.index;
        const chestState = toInt(selectState[cardIndex - 1]);
        const level = +gui.getGenerator().level;
        let htm = '';
        htm += Html.br`<table><thead><tr>`;
        if (kind == 'christmas') {
            htm += Html.br`<th><img src="/img/gui/chest.png"/></th>`;
            htm += Html.br`<th><button class="loot">${gui.getMessage('gui_loot')}</button></th>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/min.png" title="${gui.getMessage('gui_minimum')}"/></th>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/max.png" title="${gui.getMessage('gui_maximum')}"/></th>`;
            htm += Html.br`<th class="no-minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
            htm += Html.br`<th class="level">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(otherLevel) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
        } else {
            htm += Html.br`<th rowspan="2"><img src="/img/gui/chest.png"/></th>`;
            htm += Html.br`<th rowspan="2"><button class="loot">${gui.getMessage('gui_loot')}</button></th>`;
            htm += Html.br`<th colspan="3" class="minmax">${gui.getMessage('gui_level') + ' ' + Locale.formatNumber(level)}</th>`;
            htm += Html.br`<th rowspan="2" class="no-minmax">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(level) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
            htm += Html.br`<th rowspan="2" class="level">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(otherLevel) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
            htm += Html.br`</tr><tr>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/min.png" title="${gui.getMessage('gui_minimum')}"/></th>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/max.png" title="${gui.getMessage('gui_maximum')}"/></th>`;
        }
        htm += Html.br`</tr></thead>`;
        htm += Html.br`<tbody>`;
        let lastChest = 0;
        let odd = false;
        const tdAvg = Html`<td class="avg">`;
        const tdNotDependent = Html`<td class="avg dot" title="${gui.getMessage('rings_notdependent')}">`;
        const showXp = (exp) => {
            return exp ? Html`<div class="xp">${Locale.formatNumber(exp)} ${gui.getMessage('gui_xp')}</div>` : '';
        };
        let totalExp, totalExp2, countExp;
        totalExp = totalExp2 = countExp = 0;

        let last = null;
        let chest = 0;
        const loots = [];
        for (const lootArea of floorData[lid].loots.filter(lootArea => lootArea.region_id == rid || (lootArea.region_id || 0) == 0)) {
            if (last == null || last.tle != lootArea.tle) {
                last = lootArea;
                chest = chest + 1;
                lootArea.numRows = 1;
                delete lootArea.additional;
            } else {
                // Merge material
                const existing = loots.find(l => l.chest == chest && l.type == lootArea.type && l.object_id == lootArea.object_id);
                if (existing) {
                    if (!existing.additional) existing.additional = [];
                    existing.additional.push(lootArea);
                    continue;
                }
                last.numRows++;
            }
            loots.push(lootArea);
        }
        floorData[lid].curLoots = loots;

        const calculateLoot = (lootArea, level) => {
            const loot = gui.calculateLoot(lootArea, level, doubleDrop);
            if (lootArea.additional) {
                for (const lootArea2 of lootArea.additional) {
                    const loot2 = gui.calculateLoot(lootArea2, level, doubleDrop);
                    loot.notRandom = loot.notRandom && loot2.notRandom;
                    loot.coef = loot.coef || loot2.coef;
                    loot.min += loot2.min;
                    loot.max += loot2.max;
                    loot.avg += loot2.avg;
                }
            }
            loot.avg = Math.floor(loot.avg);
            return loot;
        };

        let checked = true;
        for (const lootArea of loots) {
            const type = lootArea.type;
            const oid = lootArea.object_id;
            const matXp = gui.getXp(type, oid);

            const loot = calculateLoot(lootArea, level);
            const loot2 = calculateLoot(lootArea, otherLevel);
            lootArea.exp = loot.avg * matXp;
            lootArea.exp2 = loot2.avg * matXp;

            if (lootArea.chest != lastChest) odd = !odd;
            htm += Html.br`<tr class="${(odd ? 'odd' : '') + (loot.notRandom ? ' not-random' : '')}">`;
            if (lootArea.chest != lastChest) {
                lastChest = lootArea.chest;
                let checkbox = '';
                if (kind == 'christmas' && lootArea.tle.startsWith('z')) {
                    checkbox = Html`<input type="checkbox" class="xp" data-chest-id="${lootArea.chest}" checked disabled>`;
                } else if (kind == 'red' || kind == 'christmas') {
                    checked = (chestState & (2 ** (lootArea.chest - 1))) > 0;
                    checkbox = Html`<input type="checkbox" class="xp" data-chest-id="${lootArea.chest}"${checked ? ' checked' : ''} title="${gui.getMessage('gui_ctrlclick')}">`;
                    if (checked) countExp++;
                } else if (kind == 'green') {
                    countExp++;
                }
                htm += Html.br`<td class="chest" rowspan="${lootArea.numRows}">${checkbox}<span class="chest-id">${Locale.formatNumber(lootArea.chest)}</span></td>`;
            }

            lootArea.checked = checked;
            if (lootArea.checked || lootArea.tle.startsWith('z')) totalExp += lootArea.exp;
            if (lootArea.checked || lootArea.tle.startsWith('z')) totalExp2 += lootArea.exp2;

            htm += Html.br`<td class="material" style="background-image:url(${gui.getObjectImage(type, oid, true)})">${gui.getObjectName(type, oid)}</td>`;
            htm += Html.br`<td class="min">${loot.notRandom ? '' : Locale.formatNumber(loot.min)}</td>`;
            htm += Html.br`${loot.coef == 0 && kind != 'christmas' ? tdNotDependent : tdAvg}${Locale.formatNumber(loot.avg)}${showXp(lootArea.exp)}</td>`;
            htm += Html.br`<td class="max">${loot.notRandom ? '' : Locale.formatNumber(loot.max)}</td>`;
            htm += Html.br`<td class="level">${Locale.formatNumber(loot2.avg)}${showXp(lootArea.exp2)}</td>`;
            htm += Html.br`</tr>`;
        }
        htm += Html.br`</tbody>`;
        htm += Html.br`<tfoot class="xp"><tr class="not-random"><th colspan="2">${gui.getMessage('rings_averageperring')}</th><th class="min"></th>`;
        htm += Html.br`<th class="avg">${Locale.formatNumber(Math.floor(totalExp / countExp))}</th>`;
        htm += Html.br`<th class="max"></th><th class="level">${Locale.formatNumber(Math.floor(totalExp2 / countExp))}</th>`;
        htm += Html.br`</tfoot>`;
        htm += Html.br`</table>`;
        parent = parent.parentNode.querySelector('div');
        Dialog.htmlToDOM(parent, htm);
        for (const input of parent.querySelectorAll('input[type=checkbox].xp,button.loot')) {
            input.addEventListener('click', onChestClick);
        }
    }

    function showDetailedLoot(lid, isDMW) {
        const data = floorData[lid];
        const level = +gui.getGenerator().level;
        const chests = {};
        const lootAreas = data.curLoots.filter(lootArea => {
            if (lootArea.tle.startsWith('z')) return true;
            if (lootArea.checked) chests[lootArea.chest] = true;
            return lootArea.checked;
        });
        let rings = 0;
        if (tokenId) rings = gui.getGenerator().tokens[tokenId] || 0;
        if (kind == 'christmas') {
            const tokenId = christmasMines[lid];
            rings = gui.getGenerator().tokens[tokenId] || 0;
        }
        const numChests = Object.keys(chests).length;
        let max = Math.floor(rings / numChests);

        let totals, totalXp;
        const recomputeTotals = () => {
            const doubleDrop = isDMW ? swDoubleDrop || { coeficient: 2 } : null;
            totals = {};
            for (const lootArea of lootAreas) {
                const loot = gui.calculateLoot(lootArea, level, doubleDrop);
                const type = lootArea.type;
                const oid = lootArea.object_id;
                const key = type + '_' + oid;
                let total = totals[key];
                if (!total) totals[key] = total = { type, oid, avg: 0, xp: gui.getXp(type, oid) };
                total.avg += loot.avg;
            }
            totals = Object.values(totals);
            for (const total of totals) {
                total.avg = Math.floor(total.avg);
                total.txp = total.avg * total.xp;
            }
            totals.sort((a, b) => b.txp - a.txp);
            let txp = +data.mine.reward_exp || 0;
            if (gui.getActiveSpecialWeeks().postcards) txp *= 10;
            totals.push({ type: 'system', oid: 1, txp, name: gui.getMessage('events_clearbonus').toUpperCase() });
            totalXp = 0;
            for (const total of totals) totalXp += total.txp;
        };

        const getTBody = () => {
            let htm = '';
            for (const total of totals) {
                htm += Html.br`<tr>`;
                htm += Html.br`<td class="material" style="background-image:url(${gui.getObjectImage(total.type, total.oid, true)})">${total.name ? total.name : gui.getObjectName(total.type, total.oid)}</td>`;
                htm += Html.br`<td class="avg">${Locale.formatNumber(total.avg)}</td>`;
                htm += Html.br`<td class="avg">${total.txp ? Locale.formatNumber(total.txp) : ''}</td>`;
                htm += Html.br`<td class="avg">${Locale.formatNumber(max * total.avg)}</td>`;
                htm += Html.br`<td class="avg">${total.txp ? Locale.formatNumber(max * total.txp) : ''}</td>`;
                htm += Html.br`</tr>`;
            }
            return htm;
        };

        let htm = '';
        if (selectDMW) {
            htm += Html`<label style="display:block;margin-bottom:8px;" for="r_dmw"><b>${gui.getMessage('specialweek_double_drop')}</b> <input id="r_dmw" name="dmw" type="checkbox" style="vertical-align:middle" ${isDMW ? 'checked' : ''} data-method="dmw"></label>`;
        }
        htm += Html.br`<table class="rings daf-table">`;
        htm += Html.br`<thead>`;
        htm += Html.br`<tr>`;
        htm += Html.br`<th colspan="5"><div class="title">${gui.getString(data.mine.name_loc)}</div>`;
        htm += Html.br`${gui.getMessage('gui_level')} ${Locale.formatNumber(level)} (${gui.getMessage('gui_average')})</th>`;
        htm += Html.br`</tr>`;
        htm += Html.br`<tr>`;
        htm += Html.br`<th rowspan="2">${gui.getMessage('gui_loot')}</th>`;
        htm += Html.br`<th colspan="2">1 &times; (${gui.getMessageAndValue('rings_rings', Locale.formatNumber(numChests))})</th>`;
        htm += Html.br`<th colspan="2"><input type="number" name="max" value="${Locale.formatNumber(max)}" data-method="max" style="width:60px" min="1" max="9999"> &times; (<span class="num-rings">${gui.getMessageAndValue('rings_rings', Locale.formatNumber(max * numChests))}</span>)</th>`;
        htm += Html.br`</tr>`;
        htm += Html.br`<tr>`;
        htm += Html.br`<th>${gui.getMessage('gui_qty')}</th>`;
        htm += Html.br`<th>${gui.getMessage('gui_xp')}</th>`;
        htm += Html.br`<th>${gui.getMessage('gui_qty')}</th>`;
        htm += Html.br`<th>${gui.getMessage('gui_xp')}</th>`;
        htm += Html.br`</tr>`;
        htm += Html.br`</thead>`;
        htm += Html.br`<tbody class="row-coloring loot-data">`;
        htm += Html.br`</tbody>`;
        htm += Html.br`<tfoot><tr><th>${gui.getMessage('events_total')}</td>`;
        htm += Html.br`<th colspan="2" class="avg total1"></td>`;
        htm += Html.br`<th colspan="2" class="avg total2"></td>`;
        htm += Html.br`</table>`;
        gui.dialog.show({ html: htm, style: [Dialog.CLOSE, Dialog.AUTORUN] }, (method, params) => {
            if (method === 'dmw' || method === 'max' || method == Dialog.AUTORUN) {
                isDMW = params.dmw == 'on';
                max = Math.max(1, Math.min(9999, params.max));
                if (max != params.max) gui.dialog.element.querySelector('[name=max]').value = max;
                recomputeTotals();
                Dialog.htmlToDOM(gui.dialog.element.querySelector('.loot-data'), getTBody());
                gui.dialog.element.querySelector('.num-rings').textContent = gui.getMessageAndValue('rings_rings', Locale.formatNumber(max * numChests));
                gui.dialog.element.querySelector('.total1').textContent = Locale.formatNumber(totalXp);
                gui.dialog.element.querySelector('.total2').textContent = Locale.formatNumber(max * totalXp);
                // showDetailedLoot(lid, params.dmw);
            }
        });
    }

    function onChestClick(event) {
        const input = event.srcElement;
        const card = input.closest('.card');
        if (!card) return;
        const toggler = card.querySelector('input');
        const lid = toggler.id.substr(5);
        const data = floorData[lid];
        if (!data) return;
        if (input.classList.contains('loot')) {
            const state = getState();
            return showDetailedLoot(lid, state.dmw ? state.dmw === 'yes' : !!swDoubleDrop);
        }
        const checked = input.checked;
        const chestId = parseInt(input.getAttribute('data-chest-id'));
        for (const lootArea of data.curLoots) {
            if (lootArea.chest == chestId || event.ctrlKey) {
                lootArea.checked = checked;
                if (lootArea.chest != chestId && !lootArea.tle.startsWith('z')) {
                    const other = card.querySelector(`[data-chest-id="${lootArea.chest}"]`);
                    if (other) other.checked = checked;
                }
            }
        }
        let lastChest = 0;
        let totalExp, totalExp2, countExp;
        totalExp = totalExp2 = countExp = 0;
        let chestState = 0;
        for (const lootArea of data.curLoots) {
            if (lootArea.chest != lastChest) {
                lastChest = lootArea.chest;
                if (lootArea.checked) {
                    if (!lootArea.tle.startsWith('z')) countExp++;
                    chestState += (2 ** (lootArea.chest - 1));
                }
            }
            if (lootArea.checked || lootArea.tle.startsWith('z')) {
                totalExp += lootArea.exp;
                totalExp2 += lootArea.exp2;
            }
        }
        selectState[data.index - 1] = chestState;
        card.querySelector('tfoot th.avg').innerText = Locale.formatNumber(Math.floor(totalExp / countExp));
        card.querySelector('tfoot th.level').innerText = Locale.formatNumber(Math.floor(totalExp2 / countExp));
        updateTabState();
    }

    return {
        init,
        update,
        refresh,
        getState,
        setState,
        requires
    };
}