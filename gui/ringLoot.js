/*global gui HtmlBr Html Locale*/

export default ringLoot;

function ringLoot(kind) {

    let floors, tokenId;

    if (kind == 'red') {
        floors = [880, 1717, 1718];
        tokenId = 1642;
    } else if (kind == 'green') {
        floors = [185, 1535, 1932, 2193];
        tokenId = 32;
    } else throw 'Invalid kind "' + kind + '"';

    let tab, container, floorData, checkMinMax, inputLevel, swDoubleDrop;
    let checkState = {};

    function init() {
        tab = this;
        container = tab.container;

        checkMinMax = container.querySelector('[name=minmax]');
        checkMinMax.addEventListener('click', onInput);

        inputLevel = container.querySelector('[name=level]');
        inputLevel.addEventListener('input', onInput);
        inputLevel.addEventListener('blur', onBlur);

        container.querySelector('[name=resetlevel]').addEventListener('click', function() {
            inputLevel.value = +gui.getGenerator().level;
            onInput();
        });

        let parent = container.querySelector('.scrollable-content');
        for (let lid of floors) {
            let mine = getMine(lid);
            let htm = '';
            htm += HtmlBr `<input type="checkbox" id="loot_${lid}">`;
            htm += HtmlBr `<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${gui.getRegionImg(mine.region_id)}<span>${gui.getString(mine.name_loc)}</span></label>`;
            htm += HtmlBr `<div></div>`;
            let div = document.createElement('div');
            div.className = 'card rings';
            div.innerHTML = htm;
            parent.appendChild(div);
            let input = div.querySelector('input');
            input.addEventListener('click', function() {
                setRotate(this);
                gui.updateTabState(tab);
            });
        }
    }

    function getState() {
        let getCheck = (id, c) => checkState[id] ? c : '';
        let level = parseInt(inputLevel.value) || 0;
        return {
            minmax: checkMinMax.checked,
            level: level >= 1 && level <= 999 && level != +gui.getGenerator().level ? level : null,
            h: floors.map((lid, index) => getCheck('loot_' + lid, index + 1)).filter(v => v).join(',')
        };
    }

    function setState(state) {
        let h = String(state.h || '').toLowerCase();
        let setCheck = (id, c) => {
            checkState[id] = h.indexOf(c) >= 0;
            let input = document.getElementById(id);
            if (input) {
                input.checked = checkState[id];
                setRotate(input);
            }
        };
        let level = parseInt(state.level) || 0;
        inputLevel.value = level >= 1 && level <= 999 ? level : +gui.getGenerator().level;
        floors.forEach((lid, index) => setCheck('loot_' + lid, index + 1));
        checkMinMax.checked = !!state.minmax;
    }

    function onInput() {
        gui.updateTabState(tab);
        refresh();
    }

    function onBlur() {
        let level = parseInt(inputLevel.value) || 0;
        if (level < 1 || level > 999) {
            inputLevel.value = +gui.getGenerator().level;
            onInput();
        }
    }

    function update() {
        let img = gui.getObjectImg('token', tokenId, 24, true);
        let qty = gui.getGenerator().tokens[tokenId] || 0;
        container.querySelector('.stats').innerHTML = HtmlBr `${img}${gui.getMessage('rings_stats', Locale.formatNumber(qty), gui.getObjectName('token', tokenId))}`;

        if (kind == 'green') {
            let specialWeeks = gui.getActiveSpecialWeeks();
            swDoubleDrop = specialWeeks.doubleDrop;
        }
        let divWarning = container.querySelector('.toolbar .warning');
        if (swDoubleDrop) {
            divWarning.innerHTML = HtmlBr `${swDoubleDrop.name}: ${swDoubleDrop.ends}`;
            divWarning.style.display = '';
        } else {
            divWarning.style.display = 'none';
        }

        floorData = {};
        for (let lid of floors) {
            let mine = getMine(lid);
            let floors = gui.getFile('floors_' + lid);
            let allLoots = [];
            let chest = 0;
            for (let floor of floors.floor) {
                let lootAreas = floor.loot_areas && floor.loot_areas.loot_area;
                lootAreas = Array.isArray(lootAreas) ? lootAreas : [];
                let loots = [];
                for (let lootArea of lootAreas) {
                    if (lootArea.type == 'token') continue;
                    let tle = lootArea.tiles;
                    if (typeof tle != 'string') continue;
                    tle = tle.split(';');
                    for (let t of tle) {
                        t = t.split(',').map(n => n.padStart(2, '0')).join(',');
                        // skip spurious Orichalcum in "Temple of Fortune"
                        if (lid == 2193 && t.substr(0, 3) == '30,' && lootArea.type == 'material' && lootArea.object_id == 148) continue;
                        let copy = Object.assign({}, lootArea);
                        copy.tle = t;
                        loots.push(copy);
                    }
                }
                loots.sort((a, b) => a.tle.localeCompare(b.tle));

                let last = null;
                for (let lootArea of loots) {
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
            let div = container.querySelector('#loot_' + lid).parentNode;
            div.style.display = +mine.region_id > +gui.getGenerator().region ? 'none' : '';
        }
        setState(getState());
        refresh();
    }

    function setRotate(input) {
        let div = input.parentNode;
        checkState[input.id] = input.checked;
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

    function refresh() {
        let state = getState();
        container.classList.toggle('rings-no-minmax', !state.minmax);
        let level = inputLevel.value;
        if (level < 1 || level > 999) level = +gui.getGenerator().level;
        for (let lid of floors) showLoot(level, lid);
    }

    function getMine(lid) {
        let maxRegion = gui.getMaxRegion();
        for (let rid = 0; rid <= maxRegion; rid++) {
            let mine = gui.getFile('locations_' + rid)[lid];
            if (mine) return mine;
        }
        return null;
    }

    function showLoot(level, lid) {
        let htm = '';
        htm += HtmlBr `<table><thead><tr>`;
        htm += HtmlBr `<th><img src="/img/gui/chest.png"/></th>`;
        htm += HtmlBr `<th>${gui.getMessage('gui_loot')}</th>`;
        htm += HtmlBr `<th class="min"><img src="/img/gui/min.png" title="${gui.getMessage('gui_minimum')}"/></th>`;
        htm += HtmlBr `<th class="avg"><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
        htm += HtmlBr `<th class="max"><img src="/img/gui/max.png" title="${gui.getMessage('gui_maximum')}"/></th>`;
        htm += HtmlBr `</tr></thead>`;
        htm += HtmlBr `<tbody>`;
        let lastChest = 0;
        let odd = false;
        let multiplier = swDoubleDrop ? 2 : 1;
        let tdAvg = Html `<td class="avg">`;
        let tdNotDependent = Html `<td class="avg not-dependent" title="${gui.getMessage('rings_notdependent')}">`;
        for (let lootArea of floorData[lid].loots) {
            let coef = lootArea.coef;
            let min = lootArea.min;
            let max = lootArea.max;
            let notRandom = min == max;
            min = min + (coef != 0.0 ? Math.floor((level * coef) * min) : 0);
            max = max + (coef != 0.0 ? Math.floor((level * coef) * max) : 0);
            let avg = Math.floor((min + max) / 2);
            if (lootArea.chest != lastChest) odd = !odd;
            htm += HtmlBr `<tr class="${odd ? 'odd' : ''}">`;
            if (lootArea.chest != lastChest) {
                lastChest = lootArea.chest;
                htm += HtmlBr `<td class="chest" rowspan="${lootArea.numRows}">${Locale.formatNumber(lootArea.chest)}</td>`;
            }
            let type = lootArea.type;
            let oid = lootArea.object_id;
            htm += HtmlBr `<td class="material" style="background-image:url(${gui.getObjectImage(type, oid, true)})">${gui.getObjectName(type, oid)}</td>`;
            htm += HtmlBr `<td class="min">${notRandom ? '' : Locale.formatNumber(multiplier * Math.max(0, min))}</td>`;
            htm += HtmlBr `${coef == 0 ? tdNotDependent : tdAvg}${Locale.formatNumber(multiplier * Math.max(0, avg))}</td>`;
            htm += HtmlBr `<td class="max">${notRandom ? '' : Locale.formatNumber(multiplier * Math.max(0, max))}</td>`;
            htm += HtmlBr `</tr>`;
        }
        htm += HtmlBr `</tbody>`;
        htm += HtmlBr `</table>`;
        let parent = container.querySelector('#loot_' + lid);
        parent = parent.parentNode.querySelector('div');
        parent.innerHTML = htm;
    }

    return {
        init: init,
        update: update,
        refresh: refresh,
        getState: getState,
        setState: setState,
        requires: (function() {
            let requires = ['materials', 'usables', 'tokens'];
            if (kind == 'green') requires.push('special_weeks');
            for (let rid = gui.getMaxRegion(); rid >= 0; rid--) requires.push('locations_' + rid);
            for (let lid of floors) requires.push('floors_' + lid);
            return requires;
        })()
    };
}