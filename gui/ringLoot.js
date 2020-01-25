/*global bgp gui Html Locale*/

export default ringLoot;

function ringLoot(kind) {

    let tokenId, locations;
    let requires = ['materials', 'usables', 'tokens', 'sales'];
    const christmasMines = {
        1987: 5605,
        2284: 6844,
        2640: 7833
    };

    if (kind == 'green') {
        tokenId = 32;
        let maxRId = gui.getMaxRegion();
        locations = [];
        for (let rid = 1; rid <= maxRId; rid++) locations.push('locations_' + rid);
        requires.push('special_weeks');
    } else if (kind == 'red') {
        tokenId = 1642;
        locations = ['locations_0'];
    } else if (kind == 'christmas') {
        tokenId = 0;
        locations = ['locations_0'];
    } else throw 'Invalid kind "' + kind + '"';
    requires = requires.concat(locations);

    let tab, container, floorData, checkMinMax, inputLevel, swDoubleDrop, checkLevel, checkXp, selectRegion;
    let checkState = {};
    let selectState = [];

    function init() {
        tab = this;
        container = tab.container;

        selectRegion = container.querySelector('[name=region]');
        if (selectRegion) {
            selectRegion.addEventListener('change', onInput);
            selectRegion.innerHTML = '';
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
        let setCheck = (id, c) => {
            let input = document.getElementById(id);
            if (input) {
                input.checked = !!checkState[c];
                setRotate(input);
            }
        };
        if (selectRegion) {
            state.region = gui.setSelectState(selectRegion, state.region);
        }
        checkXp.checked = !!state.xp;
        if (checkLevel) {
            checkLevel.checked = 'level' in state;
            let level = parseInt(state.level || state['no-level']) || 0;
            inputLevel.value = level >= 1 && level <= 999 ? level : +gui.getGenerator().level;
        }
        for (const data of Object.values(floorData || {})) setCheck('loot_' + data.mine.def_id, data.index);
        checkMinMax.checked = !!state.minmax;
        selectState = String(state.selected).split(',').map(n => toInt(n));
    }

    function onInput(event) {
        updateTabState();
        let name = event.srcElement.name;
        if (name == 'xp' || name == 'minmax' || name == 'showlevel') setStateFlags();
        else refresh();
    }

    function onBlur() {
        let level = parseInt(inputLevel.value) || 0;
        if (level < 1 || level > 999) {
            inputLevel.value = +gui.getGenerator().level;
            onInput();
        }
    }

    async function update() {
        bgp.Data.getPillarsInfo();
        if (tokenId) {
            let img = gui.getObjectImg('token', tokenId, 24, true);
            let qty = gui.getGenerator().tokens[tokenId] || 0;
            container.querySelector('.stats').innerHTML = Html.br`${img}${gui.getMessage('rings_stats', Locale.formatNumber(qty), gui.getObjectName('token', tokenId))}`;
        }

        if (kind == 'green') {
            let specialWeeks = gui.getActiveSpecialWeeks();
            swDoubleDrop = specialWeeks.doubleDrop;
        }
        let divWarning = container.querySelector('.toolbar .warning');
        if (swDoubleDrop) {
            divWarning.innerHTML = Html.br`${swDoubleDrop.name}: ${swDoubleDrop.ends}`;
            divWarning.style.display = '';
        } else {
            divWarning.style.display = 'none';
        }

        let seconds = (kind == 'green' ? 168 : 2) * 3600;
        let eid = kind == 'green' ? 0 : 20;
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
        let parent = container.querySelector('.scrollable-content');
        parent.innerHTML = '';
        let index = 0;
        for (const mine of mines) {
            let lid = mine.def_id;
            if (+mine.region_id > +gui.getGenerator().region) continue;
            let floors = await bgp.Data.getFile('floors_' + lid);
            let allLoots = [];
            let chest = 0;
            let hasCandy = false;
            for (const floor of floors.floor) {
                let lootAreas = floor.loot_areas && floor.loot_areas.loot_area;
                lootAreas = Array.isArray(lootAreas) ? lootAreas : [];
                let loots = [];
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
                        // skip spurious Orichalcum in "Temple of Fortune"
                        if (lid == 2193 && t.substr(0, 3) == '30,' && lootArea.type == 'material' && lootArea.object_id == 148) continue;
                        let copy = Object.assign({}, lootArea);
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
                let qty = gui.getGenerator().tokens[tokenId] || 0;
                htm += Html.br`<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${gui.getObjectImg('token', tokenId, 32, true)}<span>${gui.getString(mine.name_loc)}<br>${gui.getMessageAndValue('rings_rings', Locale.formatNumber(qty))}</span></label>`;
            } else {
                htm += Html.br`<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${kind == 'green' ? gui.getRegionImg(mine.region_id) : Html`<img src="/img/gui/redrings.png">`}<span>${gui.getString(mine.name_loc)}</span></label>`;
            }
            htm += Html.br`<div></div>`;
            let div = document.createElement('div');
            div.className = 'card rings';
            div.innerHTML = htm;
            parent.appendChild(div);
            let input = div.querySelector('input');
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
        let div = input.parentNode;
        const lid = input.id.substr(5);
        const data = floorData[lid];
        if (!data) return;
        let index = data.index;
        if (input.checked) checkState[index] = true;
        else delete checkState[index];
        if (input.checked) {
            let width = div.offsetWidth;
            let height = div.offsetHeight;
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
        let parent = container.querySelector('#loot_' + lid);
        const data = floorData[lid];
        if (!parent || !data) return;
        const cardIndex = data.index;
        const chestState = toInt(selectState[cardIndex - 1]);
        let level = +gui.getGenerator().level;
        let htm = '';
        htm += Html.br`<table><thead><tr>`;
        if (kind == 'christmas') {
            htm += Html.br`<th><img src="/img/gui/chest.png"/></th>`;
            htm += Html.br`<th>${gui.getMessage('gui_loot')}</th>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/min.png" title="${gui.getMessage('gui_minimum')}"/></th>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
            htm += Html.br`<th class="minmax"><img src="/img/gui/max.png" title="${gui.getMessage('gui_maximum')}"/></th>`;
            htm += Html.br`<th class="no-minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
            htm += Html.br`<th class="level">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(otherLevel) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
        } else {
            htm += Html.br`<th rowspan="2"><img src="/img/gui/chest.png"/></th>`;
            htm += Html.br`<th rowspan="2">${gui.getMessage('gui_loot')}</th>`;
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
        let tdAvg = Html`<td class="avg">`;
        let tdNotDependent = Html`<td class="avg dot" title="${gui.getMessage('rings_notdependent')}">`;
        let showXp = (exp) => {
            return exp ? Html`<div class="xp">${Locale.formatNumber(exp)} ${gui.getMessage('gui_xp')}</div>` : '';
        };
        let totalExp, totalExp2, countExp;
        totalExp = totalExp2 = countExp = 0;
        let checked = true;

        let last = null;
        let chest = 0;
        let loots = [];
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
            const loot = gui.calculateLoot(lootArea, level, swDoubleDrop);
            if (lootArea.additional) {
                for (const lootArea2 of lootArea.additional) {
                    const loot2 = gui.calculateLoot(lootArea2, level, swDoubleDrop);
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

        for (const lootArea of loots) {
            const type = lootArea.type;
            const oid = lootArea.object_id;
            const matXp = gui.getXp(type, oid);

            const loot = calculateLoot(lootArea, level);
            const loot2 = gui.calculateLoot(lootArea, otherLevel);
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
                    checkbox = Html`<input type="checkbox" class="xp" data-chest-id="${lootArea.chest}"${checked ? ' checked' : ''}>`;
                    if (checked) countExp++;
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
        parent.innerHTML = htm;
        for (const input of parent.querySelectorAll('input[type=checkbox].xp')) {
            input.addEventListener('click', onChestClick);
        }
    }

    function onChestClick(event) {
        const input = event.srcElement;
        const card = input.closest('.card');
        if (!card) return;
        const toggler = card.querySelector('input');
        const lid = toggler.id.substr(5);
        const data = floorData[lid];
        if (!data) return;
        const checked = input.checked;
        const chestId = parseInt(input.getAttribute('data-chest-id'));
        for (const lootArea of data.curLoots) {
            if (lootArea.chest == chestId || event.ctrlKey) {
                lootArea.checked = checked;
                if (lootArea.chest != chestId) {
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