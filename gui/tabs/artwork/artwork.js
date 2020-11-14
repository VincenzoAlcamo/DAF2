/*global Dialog gui bgp Html Tooltip Locale SmartTable*/
export default {
    hasCSS: true,
    init,
    update,
    getState,
    setState,
    requires: ['events']
};

const kinds = {
    achievements: { event: 'event_id' },
    addons: {},
    artifacts: {},
    atlass: { folder: 'map/' },
    backgrounds: {},
    buildings: {},
    // childs: { folder: 'npc/' },
    collections: { event: 'event_id' },
    decorations: { folder: 'decorations/' },
    diggy_skins: { folder: 'gui/diggy_skin/' },
    draggables: {},
    events: { event: 'def_id' },
    events_bg: { type: 'events', event: 'def_id', asset: 'bg_graphics', folder: 'map/' },
    events_intro: { type: 'events', event: 'def_id', asset: 'intro_graphics', folder: 'news/' },
    events_shelf: { type: 'events', event: 'def_id', asset: 'shelf_graphics', folder: 'map/' },
    events_shelf2: { type: 'events', event: 'def_id', asset: 'shelf_graphics', folder: 'map/webgl_events/' },
    events_shop: { type: 'events', event: 'def_id', asset: 'shop_icon_graphics' },
    journals: { name: 'pic_title' },
    map_filters: { folder: 'map/webgl_filters/' },
    map_filters2: { type: 'map_filters', asset: 'mobile_map_asset', folder: 'map/' },
    materials: { event: 'event_id' },
    npcs: { event: 'event_id' },
    // panteons: { folder: 'panteon/' },
    quests: { event: 'event_id', name: 'heading_text' },
    tablets: {},
    tiles: {},
    tokens: { event: 'event_id' },
    usables: {},
};

let tab, container, smartTable, grid, selectShow, selectEvent, searchInput;
let allEvents, type, allItems, searchHandler, versionParameter;

function init() {
    tab = this;
    container = this.container;

    selectShow = container.querySelector('[name=show]');
    selectShow.addEventListener('change', () => {
        setState(getState());
        refresh();
    });
    Object.keys(kinds).forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.innerText = type.toUpperCase().replace(/[_]/g, ' ');
        selectShow.appendChild(option);
    });

    selectEvent = container.querySelector('[name=event]');
    selectEvent.addEventListener('change', refresh);

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => {
        if (searchHandler) clearTimeout(searchHandler);
        searchHandler = setTimeout(refresh, 500);
    });

    // eslint-disable-next-line no-unused-vars
    smartTable = new SmartTable(container.querySelector('.data'));
    grid = container.querySelector('.grid');
    grid.addEventListener('render', gui.getLazyRenderer(updateItem));
    grid.addEventListener('tooltip', onTooltip);
}

function getState() {
    return {
        show: selectShow.value,
        event: allEvents ? selectEvent.value : selectEvent.getAttribute('data-value'),
        search: searchInput.value
    };
}

function setState(state) {
    state.show = gui.setSelectState(selectShow, state.show);
    if (allEvents) {
        state.event = gui.setSelectState(selectEvent, state.event);
    }
    selectEvent.setAttribute('data-value', state.event);
    selectEvent.disabled = !(state.show in kinds) || !kinds[state.show].event;
    searchInput.value = state.search || '';
}

function update() {
    let toVersion;
    try { toVersion = bgp.Data.generator.file_changes.to_version; } catch (e) { }
    versionParameter = toVersion ? '?ver=' + toVersion : '';
    allEvents = Object.values(gui.getFile('events')).map(event => {
        const info = gui.getEventInfo(event);
        return { id: event.def_id, year: info.year };
    }).sort((a, b) => b.year - a.year);
    let optGroup = null;
    let lastYearText = '';
    Dialog.htmlToDOM(selectEvent, `<option value="0">${gui.getMessage('gui_all')}</option>`);
    for (const event of allEvents) {
        const option = document.createElement('option');
        option.value = '' + event.id;
        option.innerText = gui.getObjectName('event', event.id);
        const yearText = Locale.formatYear(event.year);
        if (!optGroup || lastYearText != yearText) {
            lastYearText = yearText;
            optGroup = document.createElement('optgroup');
            optGroup.label = gui.getMessageAndValue('events_year', yearText);
            selectEvent.appendChild(optGroup);
        }
        optGroup.appendChild(option);
    }

    setTimeout(refresh, 100);
}

async function refresh() {
    gui.updateTabState(tab);
    const state = getState();
    if (state.show != type) {
        type = state.show;
        allItems = {};
        const kind = kinds[type];
        const data = await bgp.Data.getFile(kind.type || type);
        const generator = gui.getGenerator();
        const cdn = generator.cdn_root;
        const hashes = {};
        const folder = kind.folder || 'all/';
        const $name = kind.name || 'name_loc';
        const $asset = kind.asset || 'mobile_asset';
        const $event = kind.event;
        let prog = 0;
        for (const [id, item] of Object.entries(data)) {
            if (type == 'tiles') {
                item.subtypes && item.subtypes.forEach(sub => {
                    const asset = sub[$asset];
                    if (!asset || asset == 'default' || asset == 'map_x_default' || asset in hashes) return;
                    hashes[asset] = true;
                    const url = cdn + 'mobile/graphics/' + folder + encodeURIComponent(asset) + '.png';
                    prog++;
                    allItems[prog] = { id: prog, url };
                });
                continue;
            }
            const asset = item[$asset];
            if (!asset || asset == 'default' || asset == 'map_x_default' || asset in hashes) continue;
            hashes[asset] = true;
            const url = cdn + 'mobile/graphics/' + folder + encodeURIComponent(asset) + '.png';

            const name = item[$name] && gui.getString(item[$name]);
            const title = item.desc;
            const eid = $event ? +item[$event] : 0;
            allItems[id] = { id, name, title, eid, url };
        }
    }

    let htm = '';
    const fnSearch = gui.getSearchFilter(state.search);
    const eid = kinds[type].event ? +state.event : 0;
    function isVisible(item) {
        if (fnSearch && !fnSearch(item.name)) return false;
        if (eid && item.eid != eid) return false;
        return true;
    }
    const values = Object.values(allItems);
    const items = values.filter(isVisible);
    for (const item of items) {
        htm += Html`<div data-id="${item.id}" class="item" lazy-render></div>`;
    }
    const grid = container.querySelector('.grid');
    gui.removeLazyElements(grid);
    Dialog.htmlToDOM(grid, htm);
    Array.from(container.querySelectorAll('.totals')).forEach(cell => {
        cell.innerText = gui.getMessageAndFraction('gui_items_found', Locale.formatNumber(items.length), Locale.formatNumber(values.length));
    });
    gui.collectLazyElements(grid);
    smartTable.syncLater();
}

function updateItem(el) {
    const id = el.getAttribute('data-id');
    const item = allItems[id];
    if (!item) return;
    if (item.name) el.setAttribute('data-name', item.name);
    const title = item.title && gui.getString(item.title);
    el.title = [item.name, gui.getWrappedText(title)].filter(t => t).join('\n');
    const img = document.createElement('img');
    img.classList.add('tooltip-event');
    img.src = item.url + versionParameter;
    el.appendChild(img);
}

function onTooltip(event) {
    const element = event.target;
    const htm = Html.br`<div class="artwork-tooltip"><img src="${element.src}"/></div>`;
    Tooltip.show(element, htm);
}
