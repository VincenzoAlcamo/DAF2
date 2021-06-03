/*global bgp gui Dialog*/
export default {
    init: init,
    update: update,
    requires: ['materials', 'decorations', 'usables', 'windmills', 'buildings', 'tokens']
};

let tab, container;

function init() {
    tab = this;
    container = tab.container;

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
    const dp = gui.getDateParts();
    const filename = `DAF_inventory_${dp.date}_${dp.time.replace(/:/g, '')}.csv`;
    let data = [];
    const generator = gui.getGenerator();
    data.push('LEVEL\t' + generator.level);
    data.push('REGION\t' + generator.region);
    data.push('DATE\t' + dp.date + ' ' + dp.time);
    data.push('XP\t' + generator.exp);
    data.push('CARAVANS\t' + generator.caravans.length);
    data.push('POTS\t' + generator.pots.length);
    data.push('ANVILS\t' + (generator.anvils ? generator.anvils.length : 1));
    data.push('');
    data.push('MAT_ID\tMAT_NAME\tQTY');
    const addRow = (key, name, qty) => {
        if (+qty > 0) data.push(key + '\t' + name + '\t' + qty);
    };
    const addList = (list, collection, keyPrefix) => {
        Object.keys(list).forEach(key => {
            const obj = collection[key];
            if (obj && (keyPrefix != 'T' || +obj.visibility)) {
                let name = gui.getString(obj.name_loc);
                if (keyPrefix == 'U' && obj.action == 'add_stamina') name += ' (+' + +obj.value + ')';
                addRow(keyPrefix + key, name, list[key]);
            }
        });
    };
    addList(generator.materials, gui.getFile('materials'), '');
    addList(generator.tokens, gui.getFile('tokens'), 'T');
    addList(generator.stored_windmills, gui.getFile('windmills'), 'W');
    addList(gui.getOwnedActive('decoration').owned, gui.getFile('decorations'), 'D');
    addList(gui.getOwnedActive('building').owned, gui.getFile('buildings'), 'B');
    addList(generator.usables, gui.getFile('usables'), 'U');

    data = data.join('\n');
    gui.downloadData({ data, filename });
}

function exportDebug() {
    const data = gui.getGenerator();
    gui.downloadData({ data, filename: 'DAF_diagnostics_<date>_<time>.json' });
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
    gui.downloadData({ data, filename: 'DAF_data_<date>_<time>.json' });
}

function importData() {
    gui.chooseFile(function (file) {
        gui.readFile(file).then(function (data) {
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
    });
}