/*global gui Locale SmartTable HtmlBr Html*/
export default kitchenFoundry;

function kitchenFoundry(type) {
    var tab, container, productions, smartTable, oldState, searchHandler, searchInput, selectShow, selectFrom;
    var swDoubleProduction, swHalfTimeProduction;

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
        return {
            show: selectShow.value,
            from: selectFrom.style.display == 'none' ? '' : selectFrom.value,
            search: searchInput.value,
            sort: gui.getSortState(smartTable, 'name', 'ingredient')
        };
    }

    function setState(state) {
        searchInput.value = state.search || '';
        selectShow.value = state.show == 'possible' ? state.show : '';
        selectFrom.value = state.from == 'region' || state.from == 'event' ? state.from : '';
        gui.setSortState(state.sort, smartTable, 'name', 'ingredient');
    }

    function update() {
        let specialWeeks = gui.getActiveSpecialWeeks();
        swDoubleProduction = specialWeeks.doubleProduction;
        swHalfTimeProduction = specialWeeks.halfTimeProduction;
        let htm = [];
        if (swDoubleProduction) htm.push(HtmlBr `${swDoubleProduction.name}: ${swDoubleProduction.ends}`);
        if (swHalfTimeProduction) htm.push(HtmlBr `${swHalfTimeProduction.name}: ${swHalfTimeProduction.ends}`);
        htm = htm.join('<br>');
        for (let td of smartTable.container.querySelectorAll('tfoot td')) {
            td.parentNode.style.display = htm.length ? '' : 'none';
            td.innerHTML = htm;
        }
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
        var generator = gui.getGenerator();
        if (type == 'recipe') return (generator.pots && generator.pots.length) || 4;
        if (type == 'alloy') return (generator.anvils && generator.anvils.length) || 1;
        return 4;
    }

    function getProductions() {
        var generator = gui.getGenerator();
        var usables = gui.getFile('usables');
        var materials = gui.getFile('materials');
        var tokens = gui.getFile('tokens');
        var productions = gui.getFile('productions');
        var player_events = generator.events || {};
        var events = gui.getFile('events');
        var slots = getNumSlots();
        var unlocked = type == 'recipe' ? generator.pot_recipes :
            type == 'alloy' ? generator.alloys : null;

        unlocked = [].concat(unlocked || []).map(id => +id);
        productions = Object.values(productions).filter(item => {
            if (item.type != type || +item.hide != 0) return false;
            if (+item.event_id > 0 && item.event_id in player_events) return true;
            return +item.unlocked == 1 || unlocked.includes(+item.def_id);
        });

        var result = [];
        for (var item of productions) {
            var cargo = item.cargo.find(item => item.type == 'usable' || item.type == 'material' || (item.type == 'token' && tokens[item.object_id].name_loc != ''));
            if (!cargo) return;
            var p = {};
            p.id = item.def_id;
            p.level = Math.max(+item.req_level, 1);
            p.region = Math.max(+item.region_id, 1);
            p.cargo = cargo;
            p.name = gui.getString(item.name_loc);
            // qty is not specified for usables, and it has equal min/max for other types
            // we just get the max, assuming that either it is equal to min or it is undefined
            p.qty = +cargo.max || 1;
            // Tokens are not doubles (Jade/Obsidian key)
            if (swDoubleProduction && cargo.type != 'token') p.qty *= 2;
            var c = null;
            if (cargo.type == 'usable') c = usables[cargo.object_id];
            else if (cargo.type == 'material') c = materials[cargo.object_id];
            else if (cargo.type == 'token') c = tokens[cargo.object_id];
            p.cname = (c && c.name_loc && gui.getString(c.name_loc)) || '';
            p.cdsc = (c && c.desc && gui.getString(c.desc)) || '';
            p.cimg = gui.getObjectImage(cargo.type, cargo.object_id, true);
            p.energy = (cargo.type == 'usable' && c && c.action == 'add_stamina' && +c.value) || 0;
            p.eid = +item.event_id;
            var event = p.eid ? events && events[p.eid] : null;
            p.ename = (event && gui.getString(event.name_loc)) || '';
            p.eimg = event && gui.getObjectImage('event', p.eid);
            p.time = +item.duration;
            if (swHalfTimeProduction) p.time /= 2;
            p.energy_per_hour = p.time ? Math.round(p.energy / p.time * 3600) : 0;
            p.ingredients = [];
            var numProd = 0,
                maxProd = 0;
            for (var req of item.requirements) {
                var matId = req.material_id;
                var mat = materials[matId];
                var ingredient = {
                    id: matId,
                    img: mat && gui.getObjectImage('material', matId, true),
                    dsc: (mat && mat.desc && gui.getString(mat.desc)) || '',
                    required: +req.amount,
                    available: generator.materials[matId] || 0,
                    name: gui.getObjectName('material', matId)
                };
                ingredient.qty = Math.floor(ingredient.available / ingredient.required);
                maxProd = Math.max(maxProd, ingredient.qty);
                numProd = p.ingredients.length == 0 ? ingredient.qty : Math.min(numProd, ingredient.qty);
                p.ingredients.push(ingredient);
            }
            p.output = numProd * p.qty;
            p.total_energy = p.energy * p.output;
            p.total_time = p.time * Math.floor((numProd + slots - 1) / slots);
            result.push(p);
        }

        // For each production, register the maximum region associated with that production's name
        var hash = {};
        for (let item of result) {
            if (item.eid > 0 && item.region > generator.events_region[item.eid]) continue;
            hash[item.name] = Math.max(hash[item.name] || 1, item.region);
        }
        // Get only the max region for each distinct name
        result = result.filter(item => item.region == hash[item.name]);

        return result;
    }

    function recreateRows() {
        var hasQty = type == 'alloy';
        var hasEnergy = type == 'recipe';
        var hasEvent = type == 'recipe';

        function getIngredient(ingredient) {
            return HtmlBr `<td>${Locale.formatNumber(ingredient.required)}</td><td class="material" style="background-image:url(${ingredient.img})" title="${ingredient.dsc}">${ingredient.name}</td><td class="right">${Locale.formatNumber(ingredient.available)}</td>`;
        }
        for (let p of productions) {
            var rspan = p.ingredients.length;
            var title = p.cname;
            if (p.cdsc) title += '\n' + p.cdsc;
            let htm = '';
            htm += HtmlBr `<td rowspan="${rspan}"><img lazy-src="${p.cimg}" width="32" height="32" title="${Html(title)}"/></td>`;
            htm += HtmlBr `<td rowspan="${rspan}">${p.name}</td>`;
            htm += HtmlBr `<td rowspan="${rspan}">${gui.getRegionImg(p.region)}</td>`;
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
            let row = document.createElement('tr');
            row.innerHTML = htm;
            p.rows = [row];
            for (let i = 1; i < p.ingredients.length; i++) {
                let row = document.createElement('tr');
                row.classList.add('ingredient');
                row.innerHTML = getIngredient(p.ingredients[i]);
                p.rows.push(row);
            }
        }
    }

    function refresh() {
        var flagRecreate = false;
        var sort;

        triggerSearchHandler(false);
        gui.updateTabState(tab);
        let state = getState();
        state.search = (state.search || '').toUpperCase();

        smartTable.showFixed(false);

        sort = gui.getSortInfoText(smartTable.sort);
        if (sort != oldState.sort) {
            oldState.sort = sort;
            let name = smartTable.sort.name;
            if (smartTable.sort.ascending) productions.sort((a, b) => (name != 'name' ? a[name] - b[name] : 0) || a.name.localeCompare(b.name));
            else productions.sort((a, b) => (name != 'name' ? b[name] - a[name] : 0) || a.name.localeCompare(b.name));
        }

        sort = gui.getSortInfoText(smartTable.sortSub);
        if (sort && sort != oldState.sortSub) {
            oldState.sortSub = sort;
            let name = smartTable.sortSub.name;
            productions.forEach(p => {
                p.ingredients.sort((a, b) => (name != 'ingredient' ? a[name] - b[name] : 0) || a.name.localeCompare(b.name));
                if (!smartTable.sortSub.ascending) p.ingredients.reverse();
            });
            flagRecreate = true;
        }

        if (productions[0] && !productions[0].rows) flagRecreate = true;
        if (flagRecreate) recreateRows();

        var generator = gui.getGenerator();
        var level = +generator.level;
        var region = +generator.region;

        function isVisible(p) {
            if (state.show == 'possible' && (p.output == 0 || level < p.level || region < p.region)) return false;
            if (state.from == 'region' && p.eid > 0) return false;
            if (state.from == 'event' && p.eid == 0) return false;
            if (state.search && (p.name + '\t' + p.ingredients.map(i => i.name).join('\t')).toUpperCase().indexOf(state.search) < 0) return false;
            return true;
        }

        var isOdd = false;
        var tbody = smartTable.tbody[0];
        tbody.innerHTML = '';
        for (let p of productions.filter(isVisible)) {
            isOdd = !isOdd;
            let toggleOdd = isOdd != p.rows[0].classList.contains('odd');
            for (let row of p.rows) {
                if (toggleOdd) row.classList.toggle('odd', isOdd);
                tbody.appendChild(row);
            }
        }

        gui.collectLazyElements(smartTable.container);
        smartTable.syncLater();
    }

    return {
        hasCSS: true,
        init: init,
        update: update,
        getState: getState,
        setState: setState,
        requires: ['materials', 'usables', 'tokens', 'productions', 'events', 'special_weeks']
    };
}