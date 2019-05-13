/*global gui HtmlBr Locale*/

export default ringLoot;

function ringLoot(floors) {

    function init() {}

    function getState() {
        return {};
        // var getCheck = (id, c) => document.getElementById(id).checked ? c : '';
        // return {
        //     h: floors.map((lid, index) => getCheck('loot_' + lid, index)).join(',')
        // };
    }
    
    function setState(state) {
        // var h = String(state.h || '').toLowerCase();
        // var setCheck = (id, c) => document.getElementById(id).checked = h.indexOf(c) >= 0;
        // floors.forEach((lid,index) => setCheck('loot_' + lid, index));
    }

    function update() {
        let parent = this.container.querySelector('.scrollable-content');
        parent.innerHTML = '';
        for (let lid of floors) showLoot(lid, parent);
    }

    function getMine(lid) {
        let maxRegion = gui.getMaxRegion();
        for (let rid = 0; rid <= maxRegion; rid++) {
            let mine = gui.getFile('locations_' + rid)[lid];
            if (mine) return mine;
        }
        return null;
    }

    function showLoot(lid, parent) {
        let level = +gui.getGenerator().level;
        let mine = getMine(lid);
        let htm = '';
        htm += HtmlBr `<input type="checkbox" id="loot_${lid}">`;
        htm += HtmlBr `<label for="loot_${lid}" data-i18n-title="gui_card_clicker">${gui.getRegionImg(mine.region_id)}<span>${gui.getString(mine.name_loc)}</span></label>`;
        htm += HtmlBr `<div>`;

        htm += HtmlBr `<table><thead><tr>`;
        htm += HtmlBr `<th><img src="/img/gui/chest.png"/></th>`;
        htm += HtmlBr `<th>${gui.getMessage('gui_loot')}</th>`;
        htm += HtmlBr `<th><img src="/img/gui/min.png" title="${gui.getMessage('gui_minimum')}"/></th>`;
        htm += HtmlBr `<th><img src="/img/gui/avg.png" title="${gui.getMessage('gui_average')}"/></th>`;
        htm += HtmlBr `<th><img src="/img/gui/max.png" title="${gui.getMessage('gui_maximum')}"/></th>`;
        htm += HtmlBr `</tr></thead>`;
        htm += HtmlBr `<tbody>`;

        let floors = gui.getFile('floors_' + lid);
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
                    let coef = lootArea.coef;
                    let min = lootArea.min;
                    let max = lootArea.max;
                    copy.minimum = min + (coef != 0.0 ? Math.floor((level * coef) * min) : 0);
                    copy.maximum = max + (coef != 0.0 ? Math.floor((level * coef) * max) : 0);
                    copy.average = Math.floor((copy.minimum + copy.maximum) / 2);
                    loots.push(copy);
                }
            }
            loots.sort((a, b) => a.tle.localeCompare(b.tle));

            let chest = 0;
            let last = null;
            for (let lootArea of loots) {
                if (last != lootArea.tle) {
                    last = lootArea.tle;
                    chest = chest + 1;
                }
                lootArea.chest = chest;
            }

            for (let lootArea of loots) {
                htm += HtmlBr `<tr>`;
                htm += HtmlBr `<td>${Locale.formatNumber(lootArea.chest)}</td>`;
                htm += HtmlBr `<td>${gui.getObjectName(lootArea.type, lootArea.object_id)}</td>`;
                htm += HtmlBr `<td>${Locale.formatNumber(lootArea.minimum)}</td>`;
                htm += HtmlBr `<td>${Locale.formatNumber(lootArea.average)}</td>`;
                htm += HtmlBr `<td>${Locale.formatNumber(lootArea.maximum)}</td>`;
                htm += HtmlBr `</tr>`;
            }
        }

        htm += HtmlBr `</tbody>`;
        htm += HtmlBr `</table>`;

        htm += HtmlBr `</div>`;
        let div = document.createElement('div');
        div.className = 'card rings';
        div.innerHTML = htm;
        parent.appendChild(div);
    }

    return {
        init: init,
        update: update,
        getState: getState,
        setState: setState,
        requires: (function() {
            let requires = ['materials', 'usables'];
            for (let rid = gui.getMaxRegion(); rid >= 0; rid--) requires.push('locations_' + rid);
            for (let lid of floors) requires.push('floors_' + lid);
            return requires;
        })()
    };
}