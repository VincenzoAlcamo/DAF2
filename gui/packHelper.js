/*global gui Html Locale*/

let last_login;
let matCache = {};
let backpack = {};

function getRequirements(requirements) {
    return Array.isArray(requirements) ? requirements.map(req => {
        const result = {};
        result.material_id = +req.material_id;
        result.amount = +req.amount;
        result.stored = backpack[result.material_id] || 0;
        return result;
    }).sort((a, b) => a.material_id - b.material_id) : null;
}

function getOutlinedText(text, extraClass = '') {
    return Html.br`<span class="outlined-text ${extraClass}">${text}</span>`;
}

function getItem({ type, object_id, amount, portal, limit, requirements }) {
    const oid = +object_id;
    amount = +amount || 0;
    portal = +portal || 0;
    limit = +limit || 0;
    let kind = type;
    let value = oid;
    let sort = 0;
    let caption;
    let title;
    const obj = (type == 'building' || type == 'material' || type == 'usable') ? gui.getObject(type, oid) : null;
    const item = { type, oid, amount, portal, limit, obj, reqs: getRequirements(requirements) };
    // type can be: "system", "building", "decoration", "usable", "material", "token", "camp_skin"
    if (type == 'building' && obj) {
        const cap = +obj.max_stamina;
        const reg = +obj.stamina_reg;
        value = cap || reg;
        kind = cap ? 'capacity' : 'regen';
        sort = cap ? 2 : 1;
        title = cap ? gui.getString('GUI2921') : gui.getString('GUI2920');
        caption = Html`${getOutlinedText(Locale.formatNumber(value))} <img width="40" src="/img/gui/${cap ? 'camp_capacity' : 'camp_energy'}.png">`;
        item.width = +obj.columns;
        item.height = +obj.rows;
    } else if (type == 'material' && obj) {
        if (oid == 2) {
            kind = 'gem';
            sort = 0;
        } else {
            sort = 3;
            title = gui.getString('GUI0010');
        }
        value = amount;
    } else if (type == 'usable' && obj) {
        sort = 4;
        value = +obj.value;
        if (obj.action == 'speedup_ctrl') {
            caption = getOutlinedText(gui.getDuration(value), 'with-time');
        } else {
            caption = getOutlinedText(Locale.formatNumber(value), 'with-energy');
        }
        if (amount > 1) caption = Html`${getOutlinedText(Locale.formatNumber(amount) + ' \xd7 ', 'qty')}${caption}`;
        title = gui.getString('GUI0008');
    } else if (type == 'token') {
        sort = 5;
    } else if (type == 'decoration') {
        sort = 6;
        caption = getOutlinedText(Locale.formatNumber(amount), 'with-deco');
    } else if (type == 'system') {
        sort = 7;
        kind = oid == 2 ? 'energy' : 'xp';
        caption = getOutlinedText(Locale.formatNumber(amount), 'with-' + kind);
    } else {
        return null;
    }
    if (!caption) caption = getOutlinedText(Locale.formatNumber(amount));
    if (!title) title = gui.getObjectName(type, oid);
    return Object.assign(item, { kind, value, sort, caption, title });
}

function getMaterialImg(req) {
    const id = req.material_id;
    let result = matCache[id];
    if (!result) {
        result = {};
        result.url = gui.getObjectImage('material', id, true);
        const item = gui.getObject('material', id);
        const name_loc = item && item.name_loc;
        result.name = name_loc ? gui.getString(name_loc) : '#' + id;
        result.title = (item && item.desc ? '\n' + gui.getWrappedText(gui.getString(item.desc)) : '');
        matCache[id] = result;
    }
    const img = result.url ? Html`<img src="${result.url}">` : '';
    let title = result.name + ' (' + Locale.formatNumber(req.amount) + ' / ' + Locale.formatNumber(req.stored) + ')';
    const xp = gui.getXp('material', id);
    const totXp = req.amount * xp;
    if (totXp) {
        const textXp = ((xp == 1 || req.amount == 1) ? '' : Locale.formatNumber(req.amount) + ' \xd7 ' + Locale.formatNumber(xp) + ' = ') + Locale.formatNumber(totXp);
        title += '\n' + gui.getMessageAndValue('gui_xp', textXp);
    }
    title += result.title;
    return Html`<span class="material-img ${req.amount > req.stored ? 'locked' : ''}" title="${title}">${Locale.formatNumber(req.amount)}${img}</span>`;
}

function getHtml(item) {
    let htm = '';
    htm += Html.br`<div class="pack-item ${item.kind}" title="${Html(gui.getObjectName(item.type, item.oid, 'info+desc'))}">`;
    htm += Html.br`<div class="title"><span>${item.title.toUpperCase()}</span></div>`;
    htm += Html.br`<div class="image">${gui.getObjectImg(item.type, item.oid, 0, false, 'none')}</div>`;
    if (item.type == 'building') htm += Html.br`<div class="mask"><div class="equipment_mask" style="--w:${item.width};--h:${item.height}"></div></div>`;
    if (item.limit) htm += Html.br`<div class="limit outlined-text">${gui.getMessageAndValue('gui_maximum', Locale.formatNumber(item.limit))}</div>`;
    if (item.portal) htm += Html.br`<div class="bonus">${packHelper.getOutlinedText(gui.getString('GUI3065'))}</div>`;
    htm += Html.br`<div class="caption"><div>${item.caption}</div></div>`;
    if (item.reqs) {
        htm += Html.br`<div class="cost">`;
        let first = true;
        for (const req of item.reqs) {
            if (!first) htm += `<br>`;
            first = false;
            htm += getMaterialImg(req);
        }
        htm += Html.br`</div>`;
    }
    htm += Html.br`</div>`;
    return Html.raw(htm);
}

function onUpdate() {
    const generator = gui.getGenerator();
    if (last_login != generator.last_login) {
        last_login = generator.last_login;
        matCache = {};
        backpack = generator.materials || {};
    }
}

const packHelper = { onUpdate, getRequirements, getOutlinedText, getItem, getHtml, getMaterialImg };

export default packHelper;