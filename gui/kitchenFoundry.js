/*global bgp gui Locale SmartTable HtmlBr Html*/
export default kitchenFoundry;

function kitchenFoundry(type) {
    var tab, container, productions, smartTable, oldState, searchHandler, searchInput, selectShow, selectFrom;

    function init() {
        tab = this;
        container = tab.container;

        selectShow = container.querySelector('[name=show]');
        selectShow.addEventListener('change', refresh);
        selectFrom = container.querySelector('[name=from]');
        selectFrom.addEventListener('change', refresh);
        searchInput = container.querySelector('[name=search]');
        searchInput.addEventListener('input', () => triggerSearchHandler(true));

        smartTable = new SmartTable(container.querySelector('.data'));
        smartTable.onSort = refresh;

        setState({});
    }

    function getState() {
        var getSort = (sortInfo, defaultValue) => sortInfo && (sortInfo.name != defaultValue || !sortInfo.ascending) ? smartTable.sortInfo2string(sortInfo) : '';
        return {
            show: selectShow.value,
            from: selectFrom.style.display == 'none' ? '' : selectFrom.value,
            search: searchInput.value,
            sort: getSort(smartTable.sort, 'name'),
            sort2: getSort(smartTable.sortSub, 'ingredient')
        };
    }

    function setState(state) {
        searchInput.value = state.search || '';
        selectShow.value = state.show == 'possible' ? state.show : '';
        selectFrom.value = state.from == 'region' || state.from == 'event' ? state.from : '';
        [false, true].forEach(isSub => {
            var sortInfo = smartTable.checkSortInfo(smartTable.string2sortInfo(isSub ? state.sort2 : state.sort), isSub);
            if (!sortInfo.name) {
                sortInfo.name = isSub ? 'ingredient' : 'name';
                sortInfo.ascending = true;
            }
            smartTable.setSortInfo(sortInfo, isSub);
        });
    }

    function update() {
        Array.from(container.querySelectorAll('[sort-name="total_time"]')).forEach(el => el.innerHTML = HtmlBr(gui.getMessage(el.getAttribute('data-i18n-text'), getNumSlots())));
        productions = getProductions();
        selectFrom.style.display = productions.find(p => p.eid != 0) ? '' : 'none';
        oldState = {};
        refresh();
    }

    function triggerSearchHandler(flag) {
        if (searchHandler) clearTimeout(searchHandler);
        searchHandler = flag ? setTimeout(refresh, 500) : 0;
    }

    function getNumSlots() {
        var generator = bgp.Data.generator;
        if (type == 'recipe') return (generator.pots && generator.pots.length) || 4;
        if (type == 'alloy') return (generator.anvils && generator.anvils.length) || 4;
        return 4;
    }

    function getProductions() {
        var usables = bgp.Data.files.usables;
        var materials = bgp.Data.files.materials;
        var tokens = bgp.Data.files.tokens;
        var productions = bgp.Data.files.productions;
        var events = bgp.Data.files.events;
        var slots = getNumSlots();
        var unlocked = type == 'recipe' ? bgp.Data.generator.pot_recipes :
            type == 'alloy' ? bgp.Data.generator.alloys : null;

        unlocked = [].concat(unlocked || []).map(id => +id);
        productions = Object.values(productions).filter(item => +item.hide == 0 && item.type == type && (+item.unlocked == 1 || unlocked.includes(+item.def_id)));

        var cdn = bgp.Data.generator.cdn_root;
        if (cdn) cdn += 'mobile/graphics/all/';

        var result = [];
        for (var item of productions) {
            var cargo = item.cargo.find(item => item.type == 'usable' || item.type == 'material' || (item.type == 'token' && tokens[item.object_id].name_loc != ''));
            if (!cargo) return;
            var p = {};
            p.id = item.def_id;
            p.level = Math.max(+item.req_level, 1);
            p.region = Math.max(+item.region_id, 1);
            p.cargo = cargo;
            p.name = bgp.Data.getString(item.name_loc);
            // qty is not specified for usables, and it has equal min/max for other types
            // we just get the max, assuming that either it is equal to min or it is undefined
            p.qty = +cargo.max || 1;
            var c = null;
            if (cargo.type == 'usable') c = usables[cargo.object_id];
            else if (cargo.type == 'material') c = materials[cargo.object_id];
            else if (cargo.type == 'token') c = tokens[cargo.object_id];
            p.cname = (c && c.name_loc && bgp.Data.getString(c.name_loc)) || '';
            if (c && c.mobile_asset) p.cimg = cdn + c.mobile_asset + '_small.png';
            p.energy = (cargo.type == 'usable' && c && c.action == 'add_stamina' && +c.value) || 0;
            p.eid = +item.event_id;
            var event = p.eid ? events && events[p.eid] : null;
            p.ename = (event && bgp.Data.getString(event.name_loc)) || '';
            p.eimg = event && cdn + event.shop_icon_graphics + '.png';
            p.time = +item.duration;
            p.energy_per_hour = p.time ? Math.round(p.energy / p.time * 3600) : 0;
            p.ingredients = [];
            var numProd = 0,
                maxProd = 0;
            for (var req of item.requirements) {
                var matId = req.material_id;
                var ingredient = {
                    id: matId,
                    required: +req.amount,
                    available: bgp.Data.generator.materials[matId] || 0,
                    name: bgp.Data.getMaterialName(matId)
                };
                ingredient.qty = Math.floor(ingredient.available / ingredient.required);
                maxProd = Math.max(maxProd, ingredient.qty);
                numProd = p.ingredients.length == 0 ? ingredient.qty : Math.min(numProd, ingredient.qty);
                p.ingredients.push(ingredient);
            }
            p.ingredients.forEach(ingredient => ingredient.scarcity = (maxProd ? (maxProd - ingredient.qty) / maxProd : 1) / 8);
            p.output = numProd * p.qty;
            p.total_energy = p.energy * p.output;
            p.total_time = p.time * Math.floor((numProd + slots - 1) / slots);
            result.push(p);
        }

        // For each production, register the maximum region associated with that production's name
        var hash = {};
        for(let item of result) {
            hash[item.name] = Math.max(hash[item.name] || 0, item.region);
        }
        // Get only the max region for each distinct name
        result = result.filter(item => item.region == hash[item.name]);

        return result;
    }

    function getHtml() {
        var htm = '';
        var hasQty = type == 'alloy';
        var hasEnergy = type == 'recipe';
        var hasEvent = type == 'recipe';

        function getIngredient(ingredient) {
            return HtmlBr `<td class="scarcity">${Locale.formatNumber(ingredient.required)}</td><td class="scarcity">${ingredient.name}</td><td class="scarcity right">${Locale.formatNumber(ingredient.available)}</td>`;
        }
        productions.forEach(p => {
            var rspan = p.ingredients.length;
            var title = p.cname;
            htm += HtmlBr `<tr id="prod-${p.id}" style="--scarcity:${p.ingredients[0].scarcity.toFixed(3)}">`;
            htm += HtmlBr `<td rowspan="${rspan}"><img lazy-src="${p.cimg}" width="32" height="32" title="${Html(title)}"/></td>`;
            htm += HtmlBr `<td rowspan="${rspan}">${p.name}</td>`;
            htm += HtmlBr `<td rowspan="${rspan}">${gui.getRegionImage(p.region)}</td>`;
            if (hasEvent) {
                var eimage = '';
                if (p.eid != 0) {
                    var wikiPage = ''; // wikiEvents[p.eid]
                    eimage = HtmlBr `<img class="wiki" data-wiki-page="${wikiPage || 'Events'}" lazy-src="${p.eimg}" width="32" height="32" title="${Html(p.ename)}"/>`;
                }
                htm += HtmlBr `<td rowspan="${rspan}">${eimage}</td>`;
            }
            htm += HtmlBr `<td rowspan="${rspan}">${Locale.formatNumber(p.level)}</td>`;
            htm += HtmlBr `<td rowspan="${rspan}">${gui.getDuration(p.time)}</td>`;
            if (hasQty) {
                htm += HtmlBr `<td rowspan="${rspan}">${Locale.formatNumber(p.qty)}</td>`;
            }
            if (hasEnergy) {
                htm += HtmlBr `<td rowspan="${rspan}">${Locale.formatNumber(p.energy)}</td>`;
                htm += HtmlBr `<td rowspan="${rspan}">${Locale.formatNumber(p.energy_per_hour)}</td>`;
            }
            htm += getIngredient(p.ingredients[0]);
            htm += HtmlBr `<td rowspan="${rspan}">${Locale.formatNumber(p.output)}</td>`;
            if (hasEnergy) {
                htm += HtmlBr `<td rowspan="${rspan}">${Locale.formatNumber(p.total_energy)}</td>`;
            }
            htm += HtmlBr `<td rowspan="${rspan}">${gui.getDuration(p.total_time)}</td>`;
            htm += HtmlBr `</tr>`;
            htm += p.ingredients.map((ingredient, index) => index > 0 ? HtmlBr `<tr class="ingredient" style="--scarcity:${ingredient.scarcity.toFixed(3)}">${getIngredient(ingredient)}</tr>` : '').join('');
        });
        return htm;
    }

    function refresh() {
        var flagRecreate = false;
        var sort;

        triggerSearchHandler(false);
        gui.updateTabState(tab);
        let state = getState();
        state.search = (state.search || '').toUpperCase();

        smartTable.showFixed(false);

        sort = smartTable.sortInfo2string(smartTable.sort);
        if (sort != oldState.sort) {
            oldState.sort = sort;
            let name = smartTable.sort.name;
            productions.sort((a, b) => (name != 'name' ? a[name] - b[name] : 0) || a.name.localeCompare(b.name));
            if (!smartTable.sort.ascending) productions.reverse();
        }

        sort = smartTable.sortInfo2string(smartTable.sortSub);
        if (sort && sort != oldState.sortSub) {
            oldState.sortSub = sort;
            let name = smartTable.sortSub.name;
            productions.forEach(p => {
                p.ingredients.sort((a, b) => (name != 'ingredient' ? a[name] - b[name] : 0) || a.name.localeCompare(b.name));
                if (!smartTable.sortSub.ascending) p.ingredients.reverse();
            });
            flagRecreate = true;
        }

        if (flagRecreate) {
            smartTable.tbody[0].innerHTML = '';
            smartTable.tbody[1].innerHTML = getHtml(productions);
            productions.forEach(p => {
                var row = document.getElementById('prod-' + p.id);
                p.rows = [row];
                p.visible = false;
                while ((row = row.nextElementSibling) && !row.hasAttribute('id')) p.rows.push(row);
            });
        }

        var level = +bgp.Data.generator.level;
        var region = +bgp.Data.generator.region;

        function isVisible(p) {
            if (state.show == 'possible' && (p.output == 0 || level < p.level || region < p.region)) return false;
            if (state.from == 'region' && p.eid > 0) return false;
            if (state.from == 'event' && p.eid == 0) return false;
            if (state.search && (p.name + '\t' + p.ingredients.map(i => i.name).join('\t')).toUpperCase().indexOf(state.search) < 0) return false;
            return true;
        }

        var isOdd = false;
        productions.forEach(p => {
            var oldVisible = p.visible;
            p.visible = isVisible(p);
            if (p.visible && (isOdd = !isOdd) != p.rows[0].classList.contains('odd')) p.rows.forEach(row => row.classList.toggle('odd', isOdd));
            if (p.visible || oldVisible != p.visible) {
                var tbody = smartTable.tbody[p.visible ? 0 : 1];
                p.rows.forEach(row => tbody.appendChild(row));
            }
        });

        gui.collectLazyImages(smartTable.container);
        smartTable.syncLater();
    }

    return {
        hasCSS: true,
        init: init,
        update: update,
        getState: getState,
        setState: setState,
        requires: ['materials', 'usables', 'tokens', 'productions', 'events']
    };
}