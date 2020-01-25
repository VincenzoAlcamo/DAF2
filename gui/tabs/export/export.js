/*global bgp gui Dialog*/
export default {
    init: init,
    update: update,
    requires: ['materials', 'decorations', 'usables', 'windmills', 'buildings', 'tokens']
};

var tab, container, form, fileChooser, callback;

function init() {
    tab = this;
    container = tab.container;

    fileChooser = document.createElement('input');
    fileChooser.type = 'file';
    fileChooser.addEventListener('change', function () {
        if (callback) {
            let file = fileChooser.files[0];
            try {
                callback(file);
            } finally {
                callback = null;
            }
        }
        form.reset();
    });
    form = document.createElement('form');
    form.appendChild(fileChooser);

    for (let button of container.querySelectorAll('.toolbar button')) {
        button.addEventListener('click', onClick);
    }
}

function update() { }

function onClick(_event) {
    let target = this;
    let action = target.getAttribute('data-action');
    if (action == 'exportinventory') exportInventory();
    if (action == 'exportdata') exportData();
    if (action == 'importdata') importData();
    if (action == 'exportdebug') exportDebug();
}

function exportInventory() {
    let data = [];
    let generator = gui.getGenerator();
    let materials = generator.materials;
    let tokens = generator.tokens;
    data.push('LEVEL\t' + generator.level);
    data.push('REGION\t' + generator.region);
    data.push('XP\t' + generator.exp);
    data.push('CARAVANS\t' + generator.caravans.length);
    data.push('POTS\t' + generator.pots.length);
    data.push('ANVILS\t' + (generator.anvils ? generator.anvils.length : 1));
    data.push('');
    data.push('MAT_ID\tMAT_NAME\tQTY');
    Object.keys(materials).forEach(key => {
        if (materials[key] > 0) data.push(key + '\t' + gui.getObjectName('material', key) + '\t' + materials[key]);
    });
    Object.keys(tokens).forEach(key => {
        if (tokens[key] > 0) {
            const name = gui.getObjectName('token', key);
            if (!name.startsWith('#')) data.push('T' + key + '\t' + name + '\t' + tokens[key]);
        }
    });
    Object.keys(generator.stored_windmills).forEach(key => {
        data.push('W' + key + '\t' + gui.getObjectName('windmill', key) + '\t' + generator.stored_windmills[key]);
    });

    function inventory(prefix, in_use, not_in_use, stored, type) {
        function collect(list) {
            let result = {};
            (list ? [].concat(list) : []).forEach(item => result[item.def_id] = (result[item.def_id] || 0) + 1);
            return result;
        }
        let list = Object.assign({}, stored);
        let active = collect(in_use);
        let inactive = collect(not_in_use);
        Object.keys(inactive).forEach(id => active[id] = Math.max(active[id] || 0, inactive[id]));
        Object.keys(active).forEach(id => list[id] = (list[id] || 0) + active[id]);
        Object.keys(list).forEach(key => {
            let id = prefix + key;
            let item = gui.getObject(type, key);
            var name = (item && gui.getString(item.name_loc)) || id;
            data.push(id + '\t' + name + '\t' + list[key]);
        });
    }
    inventory('D', generator.camp.decorations, null, generator.stored_decorations, 'decoration');
    inventory('B', generator.camp.buildings, generator.camp.inactive_b, generator.stored_buildings, 'building');

    data = data.join('\n');
    gui.downloadData(data, 'DAF_inventory.csv');
}

function exportDebug() {
    let data = gui.getGenerator();
    gui.downloadData(data, 'DAF_diagnostics.json');
}

function exportData() {
    let data = {};
    let generator = gui.getGenerator();
    data.schema = 1;
    data.player_id = generator.player_id;
    let extras = data.extras = {};
    for (let pal of Object.values(bgp.Data.neighbours)) {
        extras[pal.id] = pal.extra;
    }
    delete extras[1];
    Object.assign(data.preferences = {}, bgp.Preferences.values);
    gui.downloadData(data, 'DAF_data.json');
}

function importData() {
    callback = function (file) {
        new Promise(function (resolve, _reject) {
            if (!file.name.toLowerCase().endsWith('.json') && file.type != 'application/json') throw new Error(gui.getMessage('export_invalidexportdata'));
            let reader = new FileReader();
            reader.onload = function () {
                let data = JSON.parse(reader.result);
                resolve(data);
            };
            reader.readAsText(file);
        }).then(function (data) {
            if (data.player_id != bgp.Data.generator.player_id) throw new Error(gui.getMessage('export_invalidexportdata'));
            let extras = data.extras || {};
            let neighbours = bgp.Data.getNeighbours();
            let toSave = [];
            for (let palId of Object.keys(extras)) {
                let pal = neighbours[palId];
                if (pal) {
                    pal.extra = extras[palId];
                    bgp.Data.convertNeighbourExtra(pal.extra);
                    toSave.push(pal);
                }
            }
            if (toSave.length) bgp.Data.saveNeighbour(toSave);
            bgp.Preferences.setValues(data.preferences);
            gui.markNeighborsTab();
            gui.dialog.show({
                title: gui.getMessage('export_importdata'),
                text: gui.getMessage('export_importsuccess')
            });
        }).catch(function (error) {
            gui.dialog.show({
                title: gui.getMessage('export_importdata'),
                text: error.message || error,
                style: [Dialog.CRITICAL, Dialog.OK]
            });
        });
    };
    fileChooser.click();
}