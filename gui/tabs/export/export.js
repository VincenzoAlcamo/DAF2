/*global bgp gui Dialog*/
export default {
    init: init,
    update: update,
    requires: ['materials', 'decorations', 'usables', 'windmills', 'buildings', 'tokens']
};

let tab, container, form, fileChooser, callback;

function init() {
    tab = this;
    container = tab.container;

    fileChooser = document.createElement('input');
    fileChooser.type = 'file';
    fileChooser.addEventListener('change', function () {
        if (callback) {
            const file = fileChooser.files[0];
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

    for (const button of container.querySelectorAll('.toolbar button')) {
        button.addEventListener('click', onClick);
    }
}

function update() { }

function onClick(_event) {
    const target = this;
    const action = target.getAttribute('data-action');
    if (action == 'exportinventory') exportInventory();
    if (action == 'exportdata') exportData();
    if (action == 'importdata') importData();
    if (action == 'exportdebug') exportDebug();
}

function exportInventory() {
    let data = [];
    const generator = gui.getGenerator();
    const materials = generator.materials;
    const tokens = generator.tokens;
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

    function inventory(prefix, type) {
        const { owned } = gui.getOwnedActive(type);
        Object.keys(owned).forEach(key => {
            const id = prefix + key;
            const item = gui.getObject(type, key);
            const name = (item && gui.getString(item.name_loc)) || id;
            data.push(id + '\t' + name + '\t' + owned[key]);
        });
    }
    inventory('D', 'decoration');
    inventory('B', 'building');

    data = data.join('\n');
    gui.downloadData(data, 'DAF_inventory_%date%_%time%.csv');
}

function exportDebug() {
    const data = gui.getGenerator();
    gui.downloadData(data, 'DAF_diagnostics_%date%_%time%.json');
}

function exportData() {
    const data = {};
    const generator = gui.getGenerator();
    data.schema = 1;
    data.player_id = generator.player_id;
    const extras = data.extras = {};
    for (const pal of Object.values(bgp.Data.neighbours)) {
        extras[pal.id] = pal.extra;
    }
    delete extras[1];
    data.friends = Object.values(bgp.Data.friends).map(friend => Object.assign({}, friend));
    data.friends.forEach(friend => delete friend.img);
    Object.assign(data.preferences = {}, bgp.Preferences.values);
    gui.downloadData(data, 'DAF_data_%date%_%time%.json');
}

function importData() {
    callback = function (file) {
        new Promise(function (resolve, _reject) {
            if (!file.name.toLowerCase().endsWith('.json') && file.type != 'application/json') throw new Error(gui.getMessage('export_invalidexportdata'));
            const reader = new FileReader();
            reader.onload = function () {
                const data = JSON.parse(reader.result);
                resolve(data);
            };
            reader.readAsText(file);
        }).then(function (data) {
            if (data.player_id != bgp.Data.generator.player_id) throw new Error(gui.getMessage('export_invalidexportdata'));
            const extras = data.extras || {};
            const neighbours = bgp.Data.getNeighbours();
            const toSave = [];
            for (const palId of Object.keys(extras)) {
                const pal = neighbours[palId];
                if (pal) {
                    pal.extra = extras[palId];
                    bgp.Data.convertNeighbourExtra(pal.extra);
                    toSave.push(pal);
                }
            }
            if (toSave.length) bgp.Data.saveNeighbour(toSave);
            if (data.friends) {
                const friends = bgp.Data.getFriends();
                const matches = {};
                Object.values(friends).forEach(friend => {
                    if (friend.uid) matches[friend.uid] = friend;
                });
                const toSave = [];
                for (const friend of data.friends) {
                    if (friend.uid && !(friend.uid in neighbours)) {
                        delete friend.uid;
                        delete friend.score;
                    }
                    const oldMatch = matches[friend.uid];
                    if (oldMatch && oldMatch.id != friend.id) {
                        delete oldMatch.uid;
                        delete oldMatch.score;
                    }
                    const oldFriend = friends[friend.id] || friend;
                    if (oldFriend !== friend) Object.assign(oldFriend, friend);
                    toSave.push(oldFriend);
                }
                if (toSave.length) bgp.Data.saveFriend(toSave);
            }
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