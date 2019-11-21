/*global bgp gui Html Locale*/

export default ringLoot;

function ringLoot(kind) {

    let mines, tokenId, locations;
    let requires = ['materials', 'usables', 'tokens', 'sales'];

    if (kind == 'green') {
        tokenId = 32;
        let maxRId = gui.getMaxRegion();
        locations = [];
        for (let rid = 1; rid <= maxRId; rid++) locations.push('locations_' + rid);
        requires.push('special_weeks');
    } else if (kind == 'red') {
        tokenId = 1642;
        locations = ['locations_0'];
    } else throw 'Invalid kind "' + kind + '"';
    requires = requires.concat(locations);

    let tab, container, floorData, checkMinMax, inputLevel, swDoubleDrop, checkLevel, checkXp;
    let checkState = {};
    let selectState = [];

    function init() {
        tab = this;
        container = tab.container;

        checkMinMax = container.querySelector('[name=minmax]');
        checkMinMax.addEventListener('click', onInput);

        checkXp = container.querySelector('[name=xp]');
        checkXp.addEventListener('click', onInput);

        inputLevel = container.querySelector('[name=level]');
        inputLevel.addEventListener('input', onInput);
        inputLevel.addEventListener('blur', onBlur);

        checkLevel = container.querySelector('[name=showlevel]');
        checkLevel.addEventListener('click', onInput);
    }

    function toInt(value) {
        const n = parseInt(value);
        return isFinite(n) && n > 0 ? n : 0;
    }

    function getState() {
        const level = parseInt(inputLevel.value) || 0;
        let selected = '';
        for (let i = 0; i < selectState.length; i++) {
            selected += ',' + (toInt(selectState[i]) || '');
        }
        selected = selected.substr(1).replace(/,+$/, '');
        return {
            minmax: checkMinMax.checked,
            xp: checkXp.checked,
            [checkLevel.checked ? 'level' : 'no-level']: (level >= 1 && level <= 999 ? level : +gui.getGenerator().level),
            h: Object.keys(checkState).join(','),
            selected
        };
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
        checkXp.checked = !!state.xp;
        checkLevel.checked = 'level' in state;
        let level = parseInt(state.level || state['no-level']) || 0;
        inputLevel.value = level >= 1 && level <= 999 ? level : +gui.getGenerator().level;
        for (const [index, mine] of (mines || []).entries()) setCheck('loot_' + mine.def_id, index + 1);
        checkMinMax.checked = !!state.minmax;
        selectState = String(state.selected).split(',').map(n => toInt(n));
    }

    function onInput(event) {
        gui.updateTabState(tab);
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
        let img = gui.getObjectImg('token', tokenId, 24, true);
        let qty = gui.getGenerator().tokens[tokenId] || 0;
        container.querySelector('.stats').innerHTML = Html.br `${img}${gui.getMessage('rings_stats', Locale.formatNumber(qty), gui.getObjectName('token', tokenId))}`;

        if (kind == 'green') {
            let specialWeeks = gui.getActiveSpecialWeeks();
            swDoubleDrop = specialWeeks.doubleDrop;
        }
        let divWarning = container.querySelector('.toolbar .warning');
        if (swDoubleDrop) {
            divWarning.innerHTML = Html.br `${swDoubleDrop.name}: ${swDoubleDrop.ends}`;
            divWarning.style.display = '';
        } else {
            divWarning.style.display = 'none';
        }

        let seconds = (kind == 'green' ? 168 : 2) * 3600;
        let eid = kind == 'green' ? 0 : 20;
        mines = [];
        for (const loc of locations) mines = mines.concat(Object.values(gui.getFile(loc)).filter(mine => {
            return +mine.test == 0 && +mine.event_id == eid && +mine.reset_cd == seconds;
        }));

        floorData = {};
        let parent = container.querySelector('.scrollable-content');
        parent.innerHTML = '';
        for (const [index, mine] of mines.entries()) {
            let lid = mine.def_id;
            if (+mine.region_id > +gui.getGenerator().region) continue;
            let floors = await bgp.Data.getFile('floors_' + lid);
            let allLoots = [];
            let chest = 0;
            for (const floor of floors.floor) {
                let lootAreas = floor.loot_areas && floor.loot_areas.loot_area;
                lootAreas = Array.isArray(lootAreas) ? lootAreas : [];
                let loots = [];
                for (const lootArea of lootAreas) {
                    if (lootArea.type == 'token') continue;
                    let tle = lootArea.tiles;
                    if (typeof tle != 'string') continue;
                    tle = tle.split(';');
                    for (let t of tle) {
                        t = t.split(',').map(n => parseInt(n));
                        if (kind == 'red') {
                            t[0] = 99 - t[0];
                        }
                        t = t.map(n => String(n).padStart(3, '0')).join(',');
                        // skip spurious Orichalcum in "Temple of Fortune"
                        if (lid == 2193 && t.substr(0, 3) == '30,' && lootArea.type == 'material' && lootArea.object_id == 148) continue;
                        let copy = Object.assign({}, lootArea);
                        copy.tle = t;
                        loots.push(copy);
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
                mine: mine,
                loots: allLoots
            };
            if (+gui.getGenerator().region >= +mine.region_id) {
                let htm = '';
                htm += Html.br `<input type="checkbox" id="loot_${lid}" data-index="${index + 1}">`;
                htm += Html.br `<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${kind == 'green' ? gui.getRegionImg(mine.region_id) : Html `<img src="/img/gui/redrings.png">`}<span>${gui.getString(mine.name_loc)}</span></label>`;
                htm += Html.br `<div></div>`;
                let div = document.createElement('div');
                div.className = 'card rings';
                div.innerHTML = htm;
                parent.appendChild(div);
                let input = div.querySelector('input');
                input.addEventListener('click', function () {
                    setRotate(this);
                    gui.updateTabState(tab);
                });
            }
        }
        setState(getState());
        refresh();
    }

    function setRotate(input) {
        let div = input.parentNode;
        let index = input.getAttribute('data-index');
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

    function refresh() {
        setStateFlags();
        let level = inputLevel.value;
        if (level < 1 || level > 999) level = +gui.getGenerator().level;
        for (const mine of mines) showLoot(level, mine.def_id);
    }

    function showLoot(otherLevel, lid) {
        let parent = container.querySelector('#loot_' + lid);
        if (!parent) return;
        const cardIndex = parseInt(parent.getAttribute('data-index'));
        const chestState = toInt(selectState[cardIndex - 1]);
        let level = +gui.getGenerator().level;
        let htm = '';
        htm += Html.br `<table><thead><tr>`;
        htm += Html.br `<th rowspan="2"><img src="/img/gui/chest.png"/></th>`;
        htm += Html.br `<th rowspan="2">${gui.getMessage('gui_loot')}</th>`;
        htm += Html.br `<th colspan="3" class="minmax">${gui.getMessage('gui_level') + ' ' + Locale.formatNumber(level)}</th>`;
        htm += Html.br `<th rowspan="2" class="no-minmax">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(level) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
        htm += Html.br `<th rowspan="2" class="level">${gui.getMessage('gui_level') + '\n' + Locale.formatNumber(otherLevel) + '\n(' + gui.getMessage('gui_average') + ')'}</th>`;
        htm += Html.br `</tr><tr>`;
        htm += Html.br `<th class="minmax"><img src="/img/gui/min.png" title="${gui.getMessage('gui_minimum')}"/></th>`;
        htm += Html.br `<th class="minmax"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
        htm += Html.br `<th class="minmax"><img src="/img/gui/max.png" title="${gui.getMessage('gui_maximum')}"/></th>`;
        htm += Html.br `</tr></thead>`;
        htm += Html.br `<tbody>`;
        let lastChest = 0;
        let odd = false;
        let multiplier = swDoubleDrop ? swDoubleDrop.coeficient : 1;
        let tdAvg = Html `<td class="avg">`;
        let tdNotDependent = Html `<td class="avg dot" title="${gui.getMessage('rings_notdependent')}">`;
        let expByMaterial = bgp.Data.pillars.expByMaterial;
        let getXp = (type, oid) => {
            let exp = 0;
            if (type == 'material') exp = expByMaterial[oid] || 0;
            if (type == 'usable') {
                const usable = gui.getObject(type, oid);
                exp = usable ? +usable.value : 0;
            }
            if (type == 'system' && (oid == 1 || oid == 2)) exp = 1;
            return exp;
        };
        let showXp = (exp) => {
            return exp ? Html `<div class="xp">${Locale.formatNumber(exp)} ${gui.getMessage('gui_xp')}</div>` : '';
        };
        let totalExp, totalExp2, countExp;
        totalExp = totalExp2 = countExp = 0;
        let checked = true;
        for (const lootArea of floorData[lid].loots) {
            let coef = lootArea.coef;
            let notRandom = lootArea.min == lootArea.max;
            let min, max, avg, exp;
            min = lootArea.min + (coef != 0.0 ? Math.floor((level * coef) * lootArea.min) : 0);
            max = lootArea.max + (coef != 0.0 ? Math.floor((level * coef) * lootArea.max) : 0);
            avg = Math.floor((min + max) / 2);
            if (lootArea.chest != lastChest) odd = !odd;
            htm += Html.br `<tr class="${(odd ? 'odd' : '') + (notRandom ? ' not-random' : '')}">`;
            if (lootArea.chest != lastChest) {
                lastChest = lootArea.chest;
                let checkbox = '';
                if (kind == 'red') {
                    checked = (chestState & (2 ** (lootArea.chest - 1))) > 0;
                    checkbox = Html `<input type="checkbox" class="xp" data-chest-id="${lootArea.chest}"${checked ? ' checked' : ''}>`;
                }
                htm += Html.br `<td class="chest" rowspan="${lootArea.numRows}">${checkbox}<span class="chest-id">${Locale.formatNumber(lootArea.chest)}</span></td>`;
                if (checked) countExp++;
            }
            lootArea.checked = checked;
            let type = lootArea.type;
            let oid = lootArea.object_id;
            htm += Html.br `<td class="material" style="background-image:url(${gui.getObjectImage(type, oid, true)})">${gui.getObjectName(type, oid)}</td>`;
            min = multiplier * Math.max(0, min);
            max = multiplier * Math.max(0, max);
            avg = multiplier * Math.max(0, avg);
            exp = avg * getXp(type, oid);
            lootArea.exp = exp;
            if (lootArea.checked) totalExp += exp;
            htm += Html.br `<td class="min">${notRandom ? '' : Locale.formatNumber(min)}</td>`;
            htm += Html.br `${coef == 0 ? tdNotDependent : tdAvg}${Locale.formatNumber(avg)}${showXp(exp)}</td>`;
            htm += Html.br `<td class="max">${notRandom ? '' : Locale.formatNumber(max)}</td>`;

            min = lootArea.min + (coef != 0.0 ? Math.floor((otherLevel * coef) * lootArea.min) : 0);
            max = lootArea.max + (coef != 0.0 ? Math.floor((otherLevel * coef) * lootArea.max) : 0);
            avg = Math.floor((min + max) / 2);
            min = multiplier * Math.max(0, min);
            max = multiplier * Math.max(0, max);
            avg = multiplier * Math.max(0, avg);
            exp = avg * getXp(type, oid);
            lootArea.exp2 = exp;
            if (lootArea.checked) totalExp2 += exp;
            htm += Html.br `<td class="level">${Locale.formatNumber(avg)}${showXp(exp)}</td>`;
            htm += Html.br `</tr>`;
        }
        htm += Html.br `</tbody>`;
        htm += Html.br `<tfoot class="xp"><tr class="not-random"><th colspan="2">${gui.getMessage('rings_averageperring')}</th><th class="min"></th>`;
        htm += Html.br `<th class="avg">${Locale.formatNumber(Math.floor(totalExp / countExp))}</th>`;
        htm += Html.br `<th class="max"></th><th class="level">${Locale.formatNumber(Math.floor(totalExp2 / countExp))}</th>`
        htm += Html.br `</tfoot>`;
        htm += Html.br `</table>`;
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
        const cardIndex = parseInt(toggler && toggler.getAttribute('data-index'));
        if (!cardIndex) return;
        const checked = input.checked;
        const lid = toggler.id.substr(5);
        const chestId = parseInt(input.getAttribute('data-chest-id'));
        const chestBit = 2 ** (chestId - 1);
        let chestState = toInt(selectState[cardIndex - 1]);
        chestState = chestState & (-chestBit - 1) | (checked ? chestBit : 0);
        selectState[cardIndex - 1] = chestState;
        let lastChest = 0;
        let totalExp, totalExp2, countExp;
        totalExp = totalExp2 = countExp = 0;
        for (const lootArea of floorData[lid].loots) {
            if (lootArea.chest == chestId) lootArea.checked = checked;
            if (lootArea.chest != lastChest) {
                lastChest = lootArea.chest;
                if (lootArea.checked) countExp++;
            }
            if (lootArea.checked) {
                totalExp += lootArea.exp;
                totalExp2 += lootArea.exp2;
            }
        }
        card.querySelector('tfoot th.avg').innerText = Locale.formatNumber(Math.floor(totalExp / countExp));
        card.querySelector('tfoot th.level').innerText = Locale.formatNumber(Math.floor(totalExp2 / countExp));
        gui.updateTabState(tab);
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