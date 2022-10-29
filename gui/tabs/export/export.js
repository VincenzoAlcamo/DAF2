/*global bgp gui Dialog*/
export default {
	css: false,
	init: init,
	update: update,
	requires: ['materials', 'decorations', 'usables', 'windmills', 'buildings', 'tokens'],
	events: {
		export: exportData,
		import: importData
	}
};

function init() { }

function update() { }

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