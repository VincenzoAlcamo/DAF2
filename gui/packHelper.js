/*global gui Html Locale*/

function getRequirements(requirements, backpack) {
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
    const backpack = gui.getGenerator().materials || {};
    const obj = (type == 'building' || type == 'material' || type == 'usable') ? gui.getObject(type, oid) : null;
    const item = { type, oid, amount, portal, limit, obj, reqs: getRequirements(requirements, backpack) };
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

const packHelper = { getRequirements, getOutlinedText, getItem };

export default packHelper;