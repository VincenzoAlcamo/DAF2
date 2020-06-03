/*global chrome Locale Dialog UrlInfo Html Tooltip imported_tabs*/
const bgp = chrome.extension.getBackgroundPage();

let currentTab = null;
const tabs = (function () {
    const tabs = {};

    function addTab(id, enabled = true) {
        tabs[id] = {
            id: id,
            icon: '/img/gui/' + id + '.png',
            generator: id != 'about' && id != 'options' && id != 'game',
            enabled: enabled
        };
    }
    addTab('game');
    addTab('about');
    addTab('progress');
    addTab('camp');
    addTab('neighbors');
    addTab('friendship');
    addTab('godchild');
    addTab('equipment');
    addTab('events');
    addTab('kitchen');
    addTab('foundry');
    addTab('pillars');
    // addTab('locations', false);
    addTab('repeat');
    addTab('greenrings');
    addTab('redrings');
    addTab('christmasrings');
    addTab('rewardlinks');
    addTab('dailyreward');
    addTab('options');
    // addTab('help', false);
    addTab('export');
    return tabs;
})();

const gui = {
    dialog: Dialog(),
    wait: Dialog(Dialog.WAIT),
    toast: Dialog(Dialog.TOAST),
    setPreference: function (name, value) {
        bgp.Preferences.setValue(name, value);
    },
    getPreference: function (name) {
        return bgp.Preferences.getValue(name);
    },
    getGenerator: function () {
        return bgp.Data.generator;
    },
    hasValidGenerator: function () {
        const generator = gui.getGenerator();
        return generator && generator.player_id;
    },
    getFile: function (name) {
        return bgp.Data.files[name];
    },
    getPillarsInfo: function () {
        return bgp.Data.getPillarsInfo();
    },
    getString: function (id) {
        return bgp.Data.getString(id);
    },
    getMessage: function () {
        return bgp.getMessage.apply(null, arguments);
    },
    getMessageAndValue: function (id, value) {
        return gui.getMessage(id) + ': ' + value;
    },
    getMessageAndFraction: function (id, numerator, denominator) {
        return gui.getMessage(id) + ': ' + numerator + ' / ' + denominator;
    },
    getUnixTime: function () {
        return Math.floor(Date.now() / 1000);
    },
    getWrappedText: function (text, max = 60) {
        text = text === null || text === undefined ? '' : String(text);
        return text.split('\n').map(text => {
            let s = '';
            let c = 0;
            for (let p of text.split(/\s+/)) {
                const l = p.length;
                if (!l) continue;
                if (c > 0) {
                    if (c + l > max) {
                        c = 0;
                        p = '\n' + p;
                    } else {
                        c++;
                        p = ' ' + p;
                    }
                }
                s += p;
                c += l;
            }
            return s;
        }).join('\n');
    },
    getPlayerNameFull: function (pal) {
        return pal.name ? (pal.surname ? pal.name + ' ' + pal.surname : pal.name) : 'Player ' + pal.id;
    },
    FB_ANON_MALE_IMG: 'data:image/webp;base64,UklGRrIAAABXRUJQVlA4IKYAAACQBwCdASoyADIAPm0qkUWkIqGYDf2AQAbEtIBp7Ay0G/WSUM7JlLizCyxMfDWO4GTZsZ3rW/OD7o4ZrD5+BT08hIdEQYAA/voQZ4IvItpppdVXQWuubgHZ7Hz5ClT98CfXGkCeTZrhstMPkFiBPgl23Ssn29LDaI8GTQEsEUH2eeI8S7rLcNeX3hT74sAvZ2QAc9yDKh3vCDZXO6AcSFxINezC50AA',
    FB_ANON_FEMALE_IMG: 'data:image/webp;base64,UklGRr4AAABXRUJQVlA4ILIAAABwBwCdASoyADIAPm0sk0WkIqGYDP0AQAbEtIBpOAqR8vvvO+zCp3M5F/ypDPVcAFo8VaiTamuvfoNQ/F5jaFiClqnYAAD++hBpI/d9yd90D8hRGlQZaLknz1bhjUBHwA03kCUnr+UZrKEK7H/RvtF2vwwgGNTfo5enYKkJ23075Nyi25PsFHIttUiGOfXnjtuOyT6lisDClpVR4YKW7iP+LCUUBF1yzvTUONcxCYqsEAAA',
    getFBFriendAvatarUrl: function (fb_id, url, size) {
        fb_id = String(fb_id || '');
        if (fb_id == '' || fb_id.startsWith('/')) {
            return url || gui.FB_ANON_MALE_IMG;
        }
        return Html.raw('https://graph.facebook.com/v3.2/' + fb_id + '/picture' + (size ? '?width=' + size + '&height=' + size : ''));
    },
    getFBFriendAnchor: function (fb_id, uri) {
        uri = uri || ('https://www.facebook.com/' + fb_id);
        return Html`<a target="_blank" href="${uri}" class="limit-width" translate="no">`;
    },
    getFriendAnchor: function (friend) {
        return Html`<a target="_blank" href="${friend.uri}" translate="no" title="${friend.name}">`;
    },
    getObject: function (type, id) {
        return bgp.Data.getObject(type, id);
    },
    getObjectName: function (type, id, options = '') {
        let name = bgp.Data.getObjectName(type, id);
        if (options.includes('info')) {
            if (type == 'building') {
                const building = gui.getObject(type, id);
                if (building) {
                    name += ` (${+building.columns} \xd7 ${+building.rows})`;
                    if (+building.stamina_reg > 0) name += '\n' + gui.getMessageAndValue('camp_regen', Locale.formatNumber(+building.stamina_reg));
                    if (+building.max_stamina > 0) name += '\n' + gui.getMessageAndValue('camp_capacity', Locale.formatNumber(+building.max_stamina));
                }
            }
            if (type == 'usable') {
                const usable = gui.getObject(type, id);
                if (usable) {
                    if (usable.action == 'add_stamina') name += '\n' + gui.getMessageAndValue('gui_energy', Locale.formatNumber(+usable.value));
                }
            }
        }
        if (options.includes('desc')) {
            const desc = bgp.Data.getObjectDesc(type, id);
            if (desc) name += '\n' + gui.getWrappedText(desc);
        }
        return name;
    },
    getObjectImage: function (type, id, small = false) {
        return bgp.Data.getObjectImage(type, id, small);
    },
    getObjectImg: function (type, id, displaySize = 32, small = false, options = '') {
        const url = bgp.Data.getObjectImage(type, id, small);
        if (!url) return '';
        const title = options != 'none' ? Html` title="${gui.getObjectName(type, id, options)}"` : '';
        const size = displaySize ? Html` height="${displaySize}"` : '';
        return Html`<img src="${url}"${size}${title}>`;
    },
    getRegionImg: function (rid, forceEgypt = false, size = 32) {
        if (rid == 0 && forceEgypt) rid = 1;
        if (rid < 0 || rid > 6) rid = 0;
        return Html.br`<img src="${rid == 0 ? '/img/gui/events.png' : bgp.Data.getObjectImage('region', rid)}" width="${size}" height="${size}" title="${rid > 0 ? gui.getObjectName('region', rid) : ''}"/>`;
    },
    getRegionFromSkin: function (skin) {
        return bgp.Data.getRegionFromSkin(skin);
    },
    getSkinFromRegion: function (region) {
        return bgp.Data.getSkinFromRegion(region);
    },
    getSkinImg: function (skin, size = 32) {
        const rid = bgp.Data.getRegionFromSkin(skin);
        return rid > 0 ? this.getRegionImg(rid, false, size) : Html.br`<img src="/img/map.png" width="${size}" height="${size}" title="${gui.getObjectName('skin', skin)}"/>`;
    },
    getLocationImg: function (location) {
        const img = `${gui.getGenerator().cdn_root}mobile/graphics/map/${location.mobile_asset}.png`;
        return Html.br`<div class="location_icon"><img src="${img}" title="${Html(gui.getString(location.name_loc))}"></div>`;
    },
    getLocProg: function (lid) {
        const prog = bgp.Data.loc_prog[lid];
        if (prog) return prog;
        const generator = gui.getGenerator();
        return generator && generator.loc_prog && generator.loc_prog[lid];
    },
    getCurrentTab: function () {
        return currentTab;
    },
    getDuration: function (drn, flagReduced) {
        drn = Math.floor(drn);
        if (drn <= 90) return Locale.formatNumber(drn) + 's';
        // A longer duration will round the seconds
        const ss = drn % 60;
        drn += (ss < 30 ? -ss : 60 - ss);
        drn /= 60;
        // If duration is in days, minutes are ignored (but added to hours)
        let mm = drn % 60;
        if (drn >= 1440) {
            drn += (mm < 30 ? -mm : 60 - mm);
            mm = 0;
        }
        drn = (drn - mm) / 60;
        let hh = drn % 24;
        let dd = (drn - hh) / 24;
        if (flagReduced) {
            if (dd >= 3) {
                if (hh >= 12) dd++;
                hh = 0;
            } else {
                hh += dd * 24;
                dd = 0;
            }
        }
        const list = [];
        if (dd > 0) list.push(Locale.formatNumber(dd) + 'd');
        if (hh > 0) list.push(Locale.formatNumber(hh) + 'h');
        if (mm > 0) list.push(Locale.formatNumber(mm) + 'm');
        return Locale.formatList(list);
    },
    getArray: function (value) {
        return Array.isArray(value) ? value : [];
    },
    getArrayOfInt: function (value) {
        return String(value || '').split(',').map(o => parseInt(o)).filter(n => isFinite(n));
    },
    getChildrenMax: function (realNeighbours) {
        const max = Math.floor(Math.sqrt(realNeighbours)) + 3;
        return max > realNeighbours ? realNeighbours : max;
    },
    getChildrenNext: function (realNeighbours) {
        if (realNeighbours < 5) return 1;
        const next = Math.floor(Math.sqrt(realNeighbours)) + 1;
        const goal = next * next;
        // Facebook hard limit of 5000 friends
        return goal > 5000 ? 0 : goal - realNeighbours;
    },
    getMaxRegion: function () {
        return bgp.Data.getMaxRegion();
    },
    getXp: function (type, oid) {
        const expByMaterial = bgp.Data.pillars.expByMaterial;
        if (!expByMaterial) return 0;
        if (type == 'material') return expByMaterial[oid] || 0;
        if (type == 'usable') {
            const usable = gui.getObject(type, oid);
            return usable && usable.action == 'add_stamina' ? +usable.value || 0 : 0;
        }
        if (type == 'decoration' || type == 'windmill') {
            const o = bgp.Data.getObject(type, oid);
            return o ? +o.sell_price || 0 : 0;
        }
        if (type == 'system' && (oid == 1 || oid == 2)) return 1;
        return 0;
    },
    getBackpackFood: function () {
        let total = 0;
        for (const [key, qty] of Object.entries(bgp.Data.generator.usables)) {
            total += (qty * gui.getXp('usable', key));
        }
        return total;
    },
    getRepeatables: function () {
        return bgp.Data.getRepeatables();
    },
    getSearchFilter: function (terms) {
        if (terms === null || terms === undefined || terms === '') return null;
        const fn = String(terms).toUpperCase().split('|').map(function (term) {
            return term.split('+').reduce(function (prevFn, curr) {
                const searchNotes = curr.charAt(0) === ':';
                if (searchNotes) curr = curr.substring(1);
                const isExcluding = curr.charAt(0) === '^';
                if (isExcluding) curr = curr.substring(1);
                if (curr == '' && !searchNotes) return prevFn;
                let currFn = (value) => (value.indexOf(curr) < 0) == isExcluding;
                if (searchNotes) {
                    currFn = (value) => {
                        let note = '';
                        const i = value.indexOf('\n') + 1;
                        if (i > 0) {
                            const j = value.indexOf('\t', i);
                            note = j > 0 ? value.substring(i, j) : value.substring(i);
                        }
                        return curr == '' ? (note == '') == isExcluding : (note.indexOf(curr) < 0) == isExcluding && note != '';
                    };
                }
                return prevFn ? (value) => currFn(value) && prevFn(value) : currFn;
            }, null);
        }).reduce(function (prevFn, currFn) {
            if (!currFn) return prevFn;
            if (!prevFn) return currFn;
            return (value) => currFn(value) || prevFn(value);
        }, null);
        return fn ? (value) => fn(String(value === null || value === undefined ? '' : value).toUpperCase()) : null;
    },
    setSelectState: function (select, value, defaultIndex) {
        select.value = value || '';
        if (select.selectedIndex < 0 || select.options[select.selectedIndex].disabled) {
            select.selectedIndex = defaultIndex || 0;
        }
        return select.value;
    },
    // Lazy load images using an IntersectionObserver
    lazyElements: [],
    lazyElementsTimeout: 0,
    lazyElementsHandler: function () {
        gui.lazyElementsTimeout = 0;
        let maxItemsAtOnce = 20;
        while (maxItemsAtOnce-- && gui.lazyElements.length) {
            const element = gui.lazyElements.pop();
            if (element.hasAttribute('lazy-src')) {
                element.setAttribute('src', element.getAttribute('lazy-src'));
                element.removeAttribute('lazy-src');
            }
            if (element.hasAttribute('lazy-render')) {
                const event = new Event('render', {
                    bubbles: true
                });
                element.dispatchEvent(event);
                element.removeAttribute('lazy-render');
            }
        }
        if (gui.lazyElements.length && !gui.lazyElementsTimeout) gui.lazyElementsTimeout = requestIdleCallback(gui.lazyElementsHandler);
    },
    lazyObserver: new IntersectionObserver(function (entries) {
        for (const entry of entries) {
            if (entry.intersectionRatio <= 0 && !entry.isIntersecting) continue;
            const element = entry.target;
            gui.lazyElements.push(element);
            gui.lazyObserver.unobserve(element);
        }
        if (gui.lazyElements.length && !gui.lazyElementsTimeout) gui.lazyElementsTimeout = requestIdleCallback(gui.lazyElementsHandler);
    }),
    collectLazyElements: function (container) {
        if (container) Array.from(container.querySelectorAll('img[lazy-src],*[lazy-render]')).forEach(item => this.lazyObserver.observe(item));
    },
    setLazyRender: function (element) {
        if (element) {
            element.setAttribute('lazy-render', '');
            gui.lazyObserver.observe(element);
        }
    },
    updateTabState: function (tab) {
        if (tab.isLoaded && typeof tab.getState == 'function') tab.state = tab.getState();
        const text = JSON.stringify(tab.state);
        if (text != 'null' && text != '{}') localStorage.setItem('state_' + tab.id, text);
        if (tab !== currentTab) return;
        let location = '?tab=' + encodeURIComponent(tab.id);
        if (tab.state) Object.keys(tab.state).forEach(key => {
            const value = tab.state[key];
            if (value === undefined || value === null || value === '' || value === false) return;
            if (value === true) location += '&' + encodeURIComponent(key);
            else location += '&' + encodeURIComponent(key) + '=' + String(value).split(',').map(t => encodeURIComponent(t)).join(',');
        });
        history.replaceState(null, null, location);
    },
    getSortInfoText: function (sortInfo) {
        return sortInfo ? sortInfo.name + (sortInfo.ascending ? '(asc)' : '(desc)') : '';
    },
    getSortState: function (smartTable, _defaultSort, _defaultSortSub) {
        let result = '';
        if (smartTable) {
            let sortInfo = smartTable.sort;
            if (sortInfo && sortInfo.name) result += gui.getSortInfoText(sortInfo);
            sortInfo = smartTable.sortSub;
            if (sortInfo && sortInfo.name) result += ',' + gui.getSortInfoText(sortInfo);
        }
        return result;
    },
    setSortState: function (value, smartTable, defaultSort, defaultSortSub) {
        if (!smartTable) return;
        const arr = String(value || '').split(',');
        smartTable.sort = smartTable.sort || {};
        smartTable.sortSub = smartTable.sortSub || {};
        for (let i = 0; i < 2; i++) {
            const sortInfo = i == 0 ? smartTable.sort : smartTable.sortSub;
            sortInfo.name = i == 0 ? defaultSort : defaultSortSub;
            sortInfo.ascending = true;
            let name = i < arr.length ? arr[i] : '';
            let ascending = true;
            const j = name.lastIndexOf('(');
            if (j >= 0) {
                ascending = name.substr(j) != '(desc)';
                name = name.substr(0, j);
            }
            if (smartTable.isValidSortName(name, i == 1)) {
                sortInfo.name = name;
                sortInfo.ascending = ascending;
            }
        }
        smartTable.setSortInfo();
    },
    getNaturalComparer: function () {
        const collator = new Intl.Collator(undefined, {
            numeric: true,
            sensitivity: 'base'
        });
        return collator.compare;
    },
    sortTextAscending: function (a, b) {
        if (a === null) return b === null ? 0 : 1;
        return b === null ? -1 : a.localeCompare(b);
    },
    sortTextDescending: function (a, b) {
        if (a === null) return b === null ? 0 : 1;
        return b === null ? -1 : -a.localeCompare(b);
    },
    sortNumberAscending: function (a, b) {
        if (isNaN(a)) return isNaN(b) ? 0 : 1;
        return isNaN(b) ? -1 : a - b;
    },
    sortNumberDescending: function (a, b) {
        if (isNaN(a)) return isNaN(b) ? 0 : 1;
        return isNaN(b) ? -1 : b - a;
    },
    getSortFunctionBySample(sample, isAscending) {
        if (sample === null || typeof sample == 'string') return isAscending ? gui.sortTextAscending : gui.sortTextDescending;
        return isAscending ? gui.sortNumberAscending : gui.sortNumberDescending;
    },
    getSortFunction: function (getSortValueFunctions, smartTable, defaultSortName) {
        const arr = [];

        function addSortBy(sortInfo) {
            if (!sortInfo || !sortInfo.name) return;
            const name = sortInfo.name;
            const fn = getSortValueFunctions ? getSortValueFunctions[name] : (item => item[name]);
            if (!fn) return;
            arr.push({
                fn: fn,
                ascending: sortInfo.ascending
            });
        }
        addSortBy(smartTable.sort);
        addSortBy(smartTable.sortSub);
        addSortBy({
            name: defaultSortName,
            ascending: true
        });
        if (arr.length > 2) arr.length = 2;
        const fn1 = arr[0] && arr[0].fn;
        const fn2 = (arr[1] && arr[1].fn) || (() => 0);

        return function (items) {
            function getSortFn(index) {
                const sample = items[0][index];
                const isAscending = arr[index - 1] && arr[index - 1].ascending;
                return gui.getSortFunctionBySample(sample, isAscending);
            }
            if (items.length) {
                items = items.map(item => [item, fn1(item), fn2(item)]);
                const sort1 = getSortFn(1);
                const sort2 = getSortFn(2) || (() => 0);
                const sort = (a, b) => sort1(a[1], b[1]) || sort2(a[2], b[2]);
                items = items.sort(sort).map(item => item[0]);
            }
            return items;
        };
    },
    getTabMenuItem: function (tabId) {
        return tabId && document.querySelector('.vertical-menu li[data-tabid="' + tabId + '"]');
    },
    markNeighborsTab: function () {
        tabs.friendship.mustBeUpdated = true;
        tabs.neighbors.mustBeUpdated = true;
    },
    updateNeighborFriendName: function (pal, friend) {
        pal.extra.fn = friend.name.replace(/\s+/g, ' ');
    },
    updateNeighborFriendNames: function (save = false) {
        const friendsByUid = {};
        Object.values(bgp.Data.getFriends()).forEach(friend => friendsByUid[friend.uid] = friend);
        const list = Object.values(bgp.Data.getNeighbours()).filter(pal => {
            const friend = friendsByUid[pal.id];
            if (!friend || pal.extra.fn === friend.name) return false;
            gui.updateNeighborFriendName(pal, friend);
            return true;
        });
        if (save) bgp.Data.saveNeighbour(list);
        return list;
    },
    getActiveSpecialWeeks: function () {
        // requires special_weeks
        const result = {};
        result.items = [];
        result.types = {};
        // Drop in repeatables  :   refresh_drop (multiplier = coeficient)
        //                          double_drop (obsolete, multiplier = 2)
        // Double gifts         :   gifts
        //                          double_gifts (obsolete)
        // Double production    :   production
        //                          double_prod (obsolete)
        // Half production time :   prod_time (coeficient = multiplier)
        //                          half_prod_time (obsolete)
        // Postcards            :   postcards (location.reward_postcard is the amount)
        // Merchant             :   material_seller
        // Free premium event   :   free_premium_event
        // Mystery box          :   mystery_box
        // Debris discount      :   debris_discount (coeficient is not used, discount is 20%)
        // Discount offer       :   discount_so (shows badge)
        // Double usable offer  :   double_usable_so (shows badge)
        // camp_particle_effect
        // camp_snow_skin
        const now = gui.getUnixTime();
        for (const sw of Object.values(gui.getFile('special_weeks'))) {
            const start = +sw.start;
            const finish = +sw.finish;
            const isActive = start <= now && now <= finish;
            // if ([154, 156, 158, 162, 170, 174, 175, 176, 177].includes(+sw.def_id)) isActive = true;
            if (isActive) {
                const item = {
                    id: sw.def_id,
                    type: sw.type,
                    coeficient: +sw.coeficient,
                    priority: +sw.priority || 0,
                    start: start,
                    finish: finish
                };

                // Checks for obsolete values (this check may be obsolete as well)
                if (item.type == 'double_drop') {
                    item.type = 'refresh_drop';
                    item.coeficient = 2;
                }
                if (item.type == 'double_gifts') {
                    item.type = 'gifts';
                }
                if (item.type == 'double_prod') {
                    item.type = 'production';
                }
                if (item.type == 'half_prod_time') {
                    item.type = 'prod_time';
                    item.coeficient = 0.5;
                }

                const old = result.types[item.type];
                if (old && old.priority >= item.priority) continue;
                if (old) result.items = result.items.filter(item => item != old);
                result.items.push(item);
                result.types[item.type] = item;
                if (item.type == 'debris_discount') {
                    // the coeficient may be right, but the game uses this fixed value
                    item.coeficient = 0.8;
                    const percent = 100 - Math.round(item.coeficient * 100);
                    item.name = gui.getMessage('specialweek_' + item.type, percent);
                } else if (item.type == 'refresh_drop') {
                    item.name = `${gui.getMessage('specialweek_double_drop')} (${gui.getMessage('gui_loot')} \xd7 ${Locale.formatNumber(item.coeficient)})`;
                } else if (item.type == 'prod_time') {
                    item.name = gui.getMessage('specialweek_half_prod_time');
                    if (item.coeficient != 0.5) item.name = `${item.name} (\xd7 ${Locale.formatNumber(item.coeficient)})`;
                } else {
                    item.name = gui.getMessage('specialweek_' + item.type);
                }
                item.ends = gui.getMessage('specialweek_end', Locale.formatDateTime(item.finish));
            }
        }
        result.debrisDiscount = result.types['debris_discount'];
        result.doubleProduction = result.types['production'];
        result.halfTimeProduction = result.types['prod_time'];
        result.doubleDrop = result.types['refresh_drop'];
        result.postcards = result.types['postcards'];
        return result;
    },
    calculateLoot: function (lootArea, level, swDoubleDrop) {
        const min = +lootArea.min || 0;
        const max = +lootArea.max || 0;

        // If the range is invalid, the amount is fixed to 1
        if (min > max) return { notRandom: true, coef: 0, min: 1, max: 1, avg: 1 };

        // Value is randomly picked between min and max, but negative values are coerced to 0
        let minValue = Math.max(0, min);
        let maxValue = Math.max(0, max);
        let avgValue = minValue;
        // If we have a range of values, compute the average
        if (minValue < maxValue) {
            // We compute the average value for range [0, max]
            const avgPositive = (maxValue + minValue) / 2;
            // The cumulative value for the positive range
            const cumPositive = avgPositive * (maxValue - minValue + 1);
            // The real average is over the range [min, max]
            avgValue = cumPositive / (max - min + 1);
        }

        // Loot depends on level by the coef value
        const coef = +lootArea.coef || 0;
        if (coef) {
            minValue += Math.floor(minValue * coef * level);
            maxValue += Math.floor(maxValue * coef * level);
            avgValue += Math.floor(avgValue * coef * level);
        }

        // The coefficient for double drop special week is applied on the resulting values
        const doubleDropCoeff = swDoubleDrop ? swDoubleDrop.coeficient : 1;
        return {
            notRandom: min == max,
            coef: coef,
            min: minValue * doubleDropCoeff,
            max: maxValue * doubleDropCoeff,
            avg: avgValue * doubleDropCoeff
        };
    },
    setupScreenshot: function (element, fileName = 'screenshot.png', screenshot) {
        screenshot = screenshot || element.querySelector('.screenshot');
        if (!screenshot) return;
        if (!fileName.endsWith('.png')) fileName += '.png';
        const shot = document.createElement('img');
        shot.src = '/img/gui/screenshot.png';
        shot.className = 'shot';
        shot.title = gui.getMessage('gui_screenshot_shot');
        screenshot.appendChild(shot);
        const target = document.createElement('img');
        target.className = 'target';
        target.title = gui.getMessage('gui_screenshot_target');
        screenshot.appendChild(target);
        shot.addEventListener('click', function () {
            screenshot.style.display = 'none';
            target.classList.remove('ready');
            setTimeout(function () {
                gui.captureElement(element).then(function (data) {
                    target.src = data;
                    target.classList.toggle('ready', !!data);
                    if (!data) {
                        let htm = Html.br`${gui.getMessage('gui_screenshot_errorinfo')}`;
                        htm = String(htm).replace(/@DAF2@/g, '<img src="' + bgp.Badge.currentIcon + '" width="16" align="center">');
                        gui.dialog.show({
                            title: gui.getMessage('gui_screenshot_error'),
                            html: htm,
                            style: [Dialog.OK, Dialog.CRITICAL]
                        });
                    }
                }).finally(function () {
                    screenshot.style.display = '';
                });
            }, 100);
        });
        target.addEventListener('click', function () {
            if (!target.classList.contains('ready')) return;
            const canvas = document.createElement('canvas');
            canvas.width = target.naturalWidth;
            canvas.height = target.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(target, 0, 0);
            canvas.toBlob(blob => gui.downloadData(blob, fileName), 'image/png');
        });
    },
    copyToClipboard: function (str, mimeType = 'text/plain') {
        function oncopy(event) {
            event.clipboardData.setData(mimeType, str);
            event.preventDefault();
        }
        document.addEventListener('copy', oncopy);
        document.execCommand('copy', false, null);
        document.removeEventListener('copy', oncopy);
    },
    downloadData: function (data, fileName) {
        const a = document.createElement('a');
        a.style.display = 'none';
        document.body.appendChild(a);
        const blob = data instanceof Blob ? data : new Blob([typeof data == 'string' ? data : JSON.stringify(data)], {
            type: 'text/plain; charset=utf-8'
        });
        const url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(function () {
            window.URL.revokeObjectURL(url);
            a.parentNode.removeChild(a);
        }, 2000);
    },
    captureElement: function (element) {
        return new Promise(function (resolve, reject) {
            const rect = element.getBoundingClientRect();
            chrome.runtime.sendMessage({
                action: 'capture'
            }, function (dataUrl) {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                if (!dataUrl) return resolve(dataUrl);
                const image = new Image();
                image.setAttribute('crossOrigin', 'anonymous');
                image.src = dataUrl;
                image.onload = function () {
                    const ratio = window.devicePixelRatio;
                    const sx = Math.floor(rect.left * ratio);
                    const sy = Math.floor(rect.top * ratio);
                    const sw = Math.ceil(rect.width * ratio);
                    const sh = Math.ceil(rect.height * ratio);
                    const canvas = document.createElement('canvas');
                    canvas.width = sw;
                    canvas.height = sh;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
                    dataUrl = canvas.toDataURL('image/png');
                    resolve(dataUrl);
                };
            });
        });
    }
};

window.addEventListener('load', onLoad);

function notifyVisibility(tab, visible) {
    if (tab && typeof tab.visibilityChange == 'function') tab.visibilityChange(!document.hidden && visible);
}

function onLoad() {
    gui.isFirefox = getComputedStyle(document.body.querySelector('.mozTest')).textDecorationStyle === 'wavy';
    const currentLanguage = gui.getPreference('language');
    const currentLocale = gui.getPreference('locale');
    Dialog.language = currentLanguage;
    Locale.setLocale(currentLocale ? currentLanguage + '-' + currentLocale : chrome.i18n.getUILanguage());
    let htm = '';
    const hasValidGenerator = gui.hasValidGenerator();
    for (const tab of Object.values(tabs)) {
        const text = gui.getMessage('tab_' + tab.id) || tab.id;
        const disabled = !tab.enabled || (tab.generator && !hasValidGenerator);
        htm += Html`<li title="${text + (tab.enabled ? '' : '\nNOT YET IMPLEMENTED!')}" style="background-image:url(${tab.icon})" class="${disabled ? 'disabled' : ''}" data-tabid="${tab.id}"><span>${text}</span></li>`;
    }
    htm += Html`<li class="last"></li>`;
    let div = document.querySelector('.vertical-menu');
    Dialog.htmlToDOM(div, htm);
    div.addEventListener('click', clickMenu, true);

    document.body.addEventListener('click', function (e) {
        if (e.target && e.target.hasAttribute('data-wiki-page')) openWiki(e.target.getAttribute('data-wiki-page'));
    }, true);

    chrome.runtime.onMessage.addListener(function onMessage(request, _sender, _sendResponse) {
        const action = request.action;
        const data = request.data;
        if (action == 'generator') {
            const hasValidGenerator = gui.hasValidGenerator();
            for (const tab of Object.values(tabs)) {
                tab.mustBeUpdated = true;
                const div = gui.getTabMenuItem(tab.id);
                const disabled = !tab.enabled || (tab.generator && !hasValidGenerator);
                div.classList.toggle('disabled', disabled);
            }
            updateCurrentTab();
        } else if (action == 'account_mismatch') {
            tabs.about.mustBeUpdated = true;
            setCurrentTab('about');
        } else {
            for (const tab of Object.values(tabs)) {
                if (tab.isLoaded && tab.actions && action in tab.actions) {
                    try {
                        tab.actions[action](data);
                    } catch (e) { }
                }
            }
        }
    });

    Tooltip.init();

    chrome.storage.onChanged.addListener(function onStorageChanged(changes, area) {
        if (area != 'local') return;
        for (const tab of Object.values(tabs)) {
            if (tab.isLoaded && typeof tab.onPrefChange == 'function') {
                try {
                    tab.onPrefChange(changes);
                } catch (e) { }
            }
        }
    });

    document.addEventListener('visibilitychange', () => notifyVisibility(currentTab, true));

    const urlInfo = new UrlInfo(location.href);
    let tabId = urlInfo.parameters.tab;
    if (tabId == 'game') tabId = 'about';
    div = gui.getTabMenuItem(tabId);
    if (div && !div.classList.contains('disabled')) {
        const state = Object.assign({}, urlInfo.parameters);
        delete state.tab;
        localStorage.setItem('state_' + tabId, JSON.stringify(state));
    } else {
        tabId = localStorage.getItem('tab');
        div = gui.getTabMenuItem(tabId);
    }
    if (!div || div.classList.contains('disabled') || bgp.Data.alternateAccountDetected) tabId = 'about';
    setCurrentTab(tabId);
}

async function loadTab(tab) {
    const container = tab.container;
    try {
        tab.state = JSON.parse(localStorage.getItem('state_' + tab.id));
    } catch (e) {
        tab.state = null;
    }
    let resource_count = 0;
    let resource_value = 0;
    const advanceProgress = () => gui.wait.show({
        text: gui.getMessage('gui_loadingresources', ++resource_value, resource_count)
    });
    try {
        container.style.display = 'none';
        const tabBasePath = '/gui/tabs/' + tab.id + '/' + tab.id;
        Object.assign(tab, imported_tabs[tab.id]);
        if (tab.hasCSS) {
            const link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('type', 'text/css');
            link.setAttribute('href', tabBasePath + '.css');
            document.head.appendChild(link);
        }
        tab.requires = tab.requires || [];
        if (tab.requires.includes('xp') && !tab.requires.includes('sales')) tab.requires.push('sales');
        tab.requires = tab.requires.filter(name => name && name != 'xp');
        const requires = (tab.requires || []).filter(name => {
            const file = bgp.Data.checkFile(name);
            return !file.data;
        });
        resource_count += requires.length;
        const response = await fetch(tabBasePath + '.html');
        const text = await response.text();
        Dialog.htmlToDOM(container, text);
        for (const name of requires) {
            advanceProgress();
            await bgp.Data.getFile(name);
        }
        if (tab.requires.includes('sales')) gui.getPillarsInfo();
        tab.init();
        tab.isLoaded = true;
        tab.mustBeUpdated = true;
    } catch (e) {
        Dialog.htmlToDOM(container, Html.br`Error: ${e}`);
        console.error(e);
    } finally {
        container.style.display = '';
        gui.wait.hide();
    }
    if (tab.isLoaded && typeof tab.setState == 'function' && tab.state && typeof tab.state == 'object') tab.setState(tab.state);
}

function clickMenu(e) {
    let li = null;
    for (let el = e.target; el.tagName != 'UL'; el = el.parentNode)
        if (el.tagName == 'LI') li = el;
    if (!li || li.classList.contains('selected') || li.classList.contains('disabled') || li.classList.contains('last')) return;
    const tabId = li.getAttribute('data-tabid');
    setCurrentTab(tabId);
}

async function setCurrentTab(tabId) {
    if (tabId == 'game') {
        chrome.runtime.sendMessage({
            action: 'reloadGame',
            value: 'keep'
        });
        return;
    }
    Array.from(document.querySelectorAll('.left-panel ul li')).forEach(item => {
        item.classList.toggle('selected', item.getAttribute('data-tabid') == tabId);
    });
    const tab = tabs[tabId];
    if (!tab.container) {
        tab.container = document.querySelector('.main-container').appendChild(document.createElement('div'));
        tab.container.classList.add('tab_' + tabId);
        await loadTab(tab);
    }
    notifyVisibility(currentTab, false);
    currentTab = tab;
    localStorage.setItem('tab', currentTab.id);
    gui.updateTabState(currentTab);
    Object.values(tabs).forEach(t => t.container && (t.container.style.display = t == currentTab ? '' : 'none'));
    updateCurrentTab();
}

function updateCurrentTab() {
    if (!currentTab || !currentTab.isLoaded) return;
    if (currentTab.mustBeUpdated) {
        currentTab.mustBeUpdated = false;
        translate(currentTab.container);
        if (typeof currentTab.update == 'function') currentTab.update();
    }
    notifyVisibility(currentTab, true);
}

//#region TEXT INFO
function translate(parent) {
    for (const el of Array.from(parent.querySelectorAll('[data-i18n-title]'))) el.title = el.getAttribute('data-i18n-title').split('+').map(id => gui.getMessage(id)).join('\n');
    for (const el of Array.from(parent.querySelectorAll('[data-i18n-text]'))) Dialog.htmlToDOM(el, Html.br(el.getAttribute('data-i18n-text').split('+').map(id => gui.getMessage(id)).join('\n')));
}
//#endregion

//#region WIKI
const WIKI_URL = 'https://wiki.diggysadventure.com/index.php';

function openWiki(page) {
    const url = page && page.indexOf('://') > 0 ? page : WIKI_URL + (page ? '?title=' + page : '');
    const urlInfo = new UrlInfo(url);

    chrome.tabs.query({}, function (tabs) {
        let tabId = 0,
            windowId = 0;
        tabs.forEach(function (tab) {
            const tabInfo = new UrlInfo(tab.url);
            if (tab.url == url || (!tabId && tabInfo.hostname == urlInfo.hostName)) {
                windowId = tab.windowId;
                tabId = tab.id;
            }
        });

        if (tabId) {
            chrome.windows.update(windowId, {
                focused: true,
                drawAttention: true
            });
            chrome.tabs.update(tabId, {
                url: url,
                active: true
            });
        } else {
            const width = Math.round(window.screen.availWidth * 0.72);
            const height = Math.round(window.screen.availHeight * 0.80);
            const top = Math.round((window.screen.availHeight - height) / 2);
            const left = Math.round((window.screen.availWidth - width) / 2);
            chrome.windows.create({
                url: url,
                left: left,
                top: top,
                width: width,
                height: height,
                focused: true,
                type: 'popup'
            }, function (_w) { });
        }
    });
}
//#endregion

// eslint-disable-next-line no-unused-vars
async function processLanguages() {
    let result = {};
    result.ext_title = result.ext_name = {
        message: ''
    };
    for (const lang of bgp.Data.guiLanguages) {
        const url = chrome.extension.getURL('/._locales/' + lang + '/messages.json');
        const response = await fetch(url);
        const text = await response.text();
        const items = JSON.parse(text);
        for (const [key, item] of Object.entries(items)) {
            let message = item.message;
            const placeholders = item.placeholders;
            if (placeholders) {
                const hash = {};
                for (const [key, item] of Object.entries(placeholders)) hash[key.toLowerCase()] = item.content;
                message = message.replace(/\$([a-z][a-z0-9_]*)\$/gi, (t, name) => hash[name.toLowerCase()]);
            }
            result[lang + '@' + key.toLowerCase()] = {
                message
            };
        }
        if (lang == 'en') {
            result.ext_name = result[lang + '@ext_name'];
            result.ext_title = result[lang + '@ext_title'];
        } else delete result[lang + '@ext_name'];
    }
    result = JSON.stringify(result).replace(/},"/g, '},\n"');
    gui.downloadData(result, 'messages.json');
}