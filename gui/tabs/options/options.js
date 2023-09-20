/*global bgp chrome gui Html Locale*/
import ThemeEditor from '../../themeEditor.js';

export default {
	init, update: refresh, getState, setState, onPrefChange: refresh, events: {
		search: refresh
	}
};

let tab, container, inputs;
const theme = new ThemeEditor();

function getThemeDefaults() {
	const CSS = { /*css: true*/ };
	const COL = (value) => ThemeEditor.Color(value, CSS);
	const defaults = Object.assign({},
		{
			'vm.brcol': COL('#000'),
			'vm.bgcol': COL('#999'),
			'vm.item.bgcol': COL('#CCC'),
			'vm.item.fgcol': COL('#333'),
			'vm.item.hov.bgcol': COL('#EE9'),
			'vm.item.hov.fgcol': COL('#006'),
			'vm.item.sel.bgcol': COL('#E7E7E7'),
			'vm.item.sel.fgcol': COL('#000'),
			'ssb.thumb.hov.bgcol': COL('#FF0'),
			'tb.brcol': COL('#368'),
			'tb.fgcol': COL('#000'),
			'tb.hlcol': COL('#FF0'),
			'tb.hlfgcol': COL('#000'),
			'th.fgcol': COL('#FFF'),
			'th.bgcol': COL('#28B'),
			'td.brcol': COL('#AAA'),
			'tr.bgcol': COL('#F5F5F5'),
			'tr.bgcol2': COL('#E7E7E7'),
			'crd.fgcol': COL('#FFF'),
			'crd.brcol': COL('#777'),
			'crd.bgcol': COL('#A6A6A6'),
			'crd.bgcol2': COL('#E7E7E7'),
			'tt.fgcol': COL('#FFF'),
			'tt.bgcol': COL('#378'),
			'tt.button.bgcol': COL('#9CE'),
			'tt.button.fgcol': COL('#000'),
			'tt.button.hlcol': COL('#4F4'),
			'tt.outline': COL('#000'),
			'tt.outlined.fgcol': COL('#FFA'),
			'tt.input.bgcol': COL('#FFF'),
			'tt.input.fgcol': COL('#000'),
			'tt.input.brcol': COL('#000'),
			'pb.brcol': COL('#000'),
			'pb.bgcol': COL('#678'),
			'pb.fgcol': COL('#AE8'),
			'pb.fgcol2': COL('#EE8'),
			'pb.fgcol3': COL('#8EE'),
			'outline.color': COL('#000'),
			'warn.bgcol': COL('#F40'),
			'warn.fgcol': COL('#FFF'),
			'success.bgcol': COL('#0A0'),
			'success.fgcol': COL('#FFF'),
		},
	);
	return defaults;
}

function setTheme(obj) {
	theme.applySettings(obj);
	// const newValue = JSON.stringify(theme.settings);
	// if (newValue != gui.getPreference('mapSettings')) {
	//     gui.setPreference('mapSettings', newValue);
	//     queue.add(processMine);
	// }
}
//#endregion

function init() {
	tab = this;
	({ container, inputs } = tab);

	let htm = '';

	theme.init({
		defaults: getThemeDefaults(),
		settings: null,
		table: container.querySelector('.properties .table'),
		tableCallback: setTheme,
		tableDelay: 1000,
		replacements: {
			vm: 'vertical menu',
			pb: 'progress bar',
			crd: 'card',
			tt: 'toolbar',
			tb: 'table',
			td: 'table cell',
			th: 'table heading',
			tr: 'table row',
			hov: 'hover',
			sel: 'selected',
			bgcol: 'back color',
			bgcol2: 'back color 2',
			brcol: 'border color',
			fgcol: 'fore color',
			fgcol2: 'fore color 2',
			fgcol3: 'fore color 3',
			hlcol: 'highlight',
			hlfgcol: 'highlight fore'
		}
	});
	theme.createSettingsTable();

	const CRITICAL = 'C';
	const WITHSUBOPTIONS = 'P';
	const SUBOPTION = 'S';
	const WARNING = 'W';
	const TEXT = 'T';
	const CHECKBOX = '1';
	const SELECT = '2';

	function getTitle(id) {
		if (id === 'hMain') {
			const title = gui.getMessage('options_' + id);
			return title.substring(0, title.indexOf('\n'));
		}
		return gui.getMessage('options_section_' + id);
	}

	function beginSection(id) {
		htm += Html.br`
<div class="options">
    <table>
        <thead>
            <tr>
                <td colspan="2">${getTitle(id)}</td>
            </tr>
        </thead>
        <tbody class="row-coloring">
`;
	}

	function continueSection(id) {
		htm += Html.br`
        </tbody>
    </table>
    <table style="margin-top:4px">
        <thead>
            <tr>
                <td colspan="2">${getTitle(id)}</td>
            </tr>
        </thead>
        <tbody class="row-coloring">
`;
	}

	function endSection() {
		htm += Html.br`</tbody></table></div>`;
	}

	function option(prefName, features, options, extraHtml) {
		let messageId = 'options_' + prefName.toLowerCase();
		if (prefName.endsWith('Sound')) messageId = 'options_badgesound';
		if (prefName.endsWith('Volume')) messageId = 'options_badgevolume';
		if (prefName.endsWith('Offset')) messageId = 'options_badgetimeoffset';
		if (prefName == 'badgeCaravan') messageId = 'tab_caravan';
		if (prefName == 'badgeKitchen') messageId = 'tab_kitchen';
		if (prefName == 'badgeFoundry') messageId = 'tab_foundry';
		if (prefName == 'linkGrabBadge') messageId = 'options_section_badges';
		if (prefName == 'hFlashAdSound') messageId = 'options_hflashad';
		let text = gui.getMessage(messageId);
		const i = text.indexOf('\n');
		let title = i >= 0 ? text.substr(0, i) : text;
		let info = i >= 0 ? text.substr(i + 1) : '';
		if (prefName == 'linkGrabBadge') info = '';
		if (prefName == 'linkGrabKey') {
			const s = gui.getMessage('options_linkGrabButton');
			const i = s.indexOf('\n');
			title += ' + ' + s.substr(0, i);
			info += s.substr(i);
			options = [
				[0, gui.getMessage('options_modifier_none')],
				[16, gui.getMessage('options_modifier_shift')],
				[17, gui.getMessage('options_modifier_ctrl')],
				[18, gui.getMessage('options_modifier_alt')]
			];
			for (let i = 65; i < 90; i++) options.push([i, String.fromCharCode(i)]);
		}
		let warning = '';
		let className = '';
		features = features || '';
		if (features.indexOf(CRITICAL) >= 0) className += ' critical';
		if (features.indexOf(WITHSUBOPTIONS) >= 0) className += ' hassuboptions';
		if (features.indexOf(SUBOPTION) >= 0) className += ' suboption';
		if (features.indexOf(WARNING) >= 0) warning = gui.getMessage(messageId + '_warning');

		const type = Array.isArray(options) ? SELECT : (features.indexOf(TEXT) >= 0 ? TEXT : CHECKBOX);

		let hasCheckBox = type == CHECKBOX || prefName == 'hFood';
		let hasSelect = type == SELECT;
		let selectPrefName = prefName;
		if (prefName == 'hFood') {
			hasCheckBox = true;
			hasSelect = true;
			selectPrefName = 'hFoodNum';
		}

		htm += Html.br`<tr${className ? Html` class="${className}"` : ''}>`;
		htm += Html.br`<td${!hasCheckBox ? Html.raw(' colspan="2"') : ''}><h3>${title}</h3><p class="${prefName.endsWith('Offset') ? 'time' : ''}">${info}</p>`;
		if (hasSelect) {
			htm += Html.br`<select data-pref="${selectPrefName}">`;
			for (const option of options) {
				htm += Html.br`<option value="${option[0]}">${option[1]}</option>`;
			}
			htm += Html.br`</select>`;
			if (prefName == 'linkGrabKey') {
				options = ['left', 'middle', 'right'].map((n, i) => [i, gui.getMessage('options_button_' + n)]);
				htm += Html.br` + <select data-pref="linkGrabButton">`;
				for (const option of options) htm += Html.br`<option value="${option[0]}">${option[1]}</option>`;
				htm += Html.br`</select>`;
				htm += Html.br`<br>`;
				htm += Html.br`<h3 style="margin-top:4px">Hot Key</h3>`;
				htm += Html.br`${gui.getMessage('options_modifier_alt')} + <select data-pref="linkGrabHotKey">`;
				const hotkeys = [];
				for (let i = 65; i < 90; i++) hotkeys.push([String.fromCharCode(i), String.fromCharCode(i)]);
				for (const option of hotkeys) htm += Html.br`<option value="${option[0]}">${option[1]}</option>`;
				htm += Html.br`</select>`;
			}
		} else if (type == TEXT) {
			if (options && typeof options == 'object' && (options.min || options.max)) {
				if (options.type == 'range') htm += Html.br`<label>`;
				htm += Html.br`<input data-pref="${prefName}" type="${options.type || 'number'}" min="${options.min}" max="${options.max}" class="${options.class}">`;
				if (options.type == 'range') htm += Html.br`<span></span></label>`;
			} else {
				htm += Html.br`<input data-pref="${prefName}" type="text" maxlength="200" style="width:100%">`;
			}
		}
		if (warning) htm += Html.br`<div class="warning">${warning}</div>`;
		htm += Html.br`${extraHtml}</td>`;
		if (hasCheckBox) htm += Html.br`<td><input data-pref="${prefName}" type="checkbox"></td>`;
		htm += Html.br`</tr>`;
	}

	function determineLocales() {
		const currentLanguage = gui.getPreference('language');
		let currentLocale = gui.getPreference('locale');
		let locales = [];
		locales.push(['', gui.getMessage('options_locale_browser')]);
		for (const item of bgp.Data.languages) {
			if (item.id == currentLanguage) {
				let newLocale = currentLocale;
				const pLocales = gui.getPreference('locales') || '';
				const arr = pLocales.split(',').filter(l => !!l);
				const index = arr.findIndex(l => l.startsWith(currentLanguage + '-'));
				if (index >= 0) newLocale = arr[index].substring(currentLanguage.length + 1);
				if (newLocale && !item.locales.includes(newLocale)) newLocale = item.preferredLocale;
				if (newLocale != currentLocale) {
					currentLocale = newLocale;
					gui.setPreference('locale', currentLocale);
				}
				const fullLocale = currentLanguage + '-' + currentLocale;
				if (index >= 0) arr[index] = fullLocale; else arr.push(currentLanguage + '-' + currentLocale);
				if (arr.join(',') != pLocales) gui.setPreference('locales', arr.join(','));
				locales = locales.concat(item.locales.map(v => [v, v]));
			}
		}
		return locales;
	}

	const uiSounds = `
ui_button
ui_tab
ui_button_2
ui_pop
mirror_rotate
snd_beacon
ui_celebrate
ui_construction
ui_usable_eat
ui_buy
tele_in
tele_out
ui_map
tile_basic
walk_solid
museum_enter
museum_done
kitchen_enter
caravan_enter
workshop_enter
ui_claim
ui_level
caravan_done
kitchen_done
workshop_done
ui_buy_gems
enter_location
whoosh
puzzle_done
Idle_idle_normal_01
Idle_idle_normal_02
Idle_idle_normal_03
Idle_idle_normal_01
idle_tired_01
idle_tired_02
idle_tired_01
diggy_drill_01
diggy_ladder_01
diggy_pick_axe_01
diggy_pick_axe_02
diggy_pick_axe_03
diggy_showel_01
diggy_showel_02
diggy_showel_03
diggy_use_01
diggy_use_02
UI_buy_01
UI_buy_02
UI_claim_item_01
UI_claim_item_02
UI_confirm
UI_consume_potion_01
UI_consume_potion_02
UI_foundry_sound_01
UI_foundry_sound_02
UI_hover_01
UI_hover_02
UI_journal_01
UI_journal_02
UI_journal_03
UI_kitchen_sound_01
UI_kitchen_sound_02
UI_negative_feedback_01
UI_next_page_01
UI_next_page_02
UI_next_tab_01
UI_next_tab_02
UI_out_of_energy_popup
UI_place_building_energy_cave_01
UI_place_building_energy_cave_02
UI_place_decoration_01
UI_place_decoration_02
UI_put_item_in_inventory_01
UI_put_item_in_inventory_02
UI_quest_finished
UI_quest_start_01
UI_quest_start_02
UI_sell_item_01
UI_sell_item_02
UI_speed_up_production_01
UI_speed_up_production_02
UI_swipe_shop_inventory_01
UI_swipe_shop_inventory_02
UI_unlock_equipment_slot_01
UI_unlock_equipment_slot_02
UI_unlock_equipment_slot_03
UI_use_eat_item_01
UI_use_eat_item_02
UI_gods_hover
UI_map_manager_level_enter
UI_claim_coin_multiple_fast_01
UI_claim_coin_multiple_fast_02
UI_claim_coin_multiple_fast_03
UI_claim_coin_multiple_slow_01
UI_claim_coin_multiple_slow_02
UI_claim_coin_multiple_slow_03
UI_claim_coin_single_fast_01
UI_claim_coin_single_fast_02
UI_claim_coin_single_slow_01
UI_claim_coin_single_slow_02
`;
	const hash = {};
	uiSounds.split('\n').forEach(t => hash[t.trim()] = true);
	delete hash[''];
	const sounds = Object.keys(hash).map(key => ({ key, label: (key.startsWith('@') ? key.substring(1) : key).toLowerCase() }));
	sounds.sort((a,b) => gui.sortTextAscending(a.label, b.label));
	const soundOptions = Html.raw(sounds.map(n => Html.br`<option value="${n.key}">${n.label}</option>`).join(''));
	function optionEffect(prefName, hasOffset) {
		if (hasOffset) option(`${prefName}Offset`, TEXT + SUBOPTION, { min: 0, max: 9999, class: 'time' });
		let extra = Html.br`<select data-pref="${prefName}SoundName">${soundOptions}</select><button class="play_sound" data-name="${prefName}">\u25B6</button>`;
		extra += Html.br`<br><label><h3>${gui.getMessage('options_badgevolume').split('\n')[0]}</h3>`;
		extra += Html.br`<input data-pref="${prefName}Volume" type="range" min="0" max="100" step="5" class="percent"><span></span></label>`;
		option(`${prefName}Sound`, SUBOPTION, null, Html.raw(extra));
	}

	beginSection('general');
	const languages = bgp.Data.languages;
	languages.sort((a, b) => a.name.localeCompare(b.name));
	const guiLanguages = languages.filter(item => bgp.Data.guiLanguages.includes(item.id)).map(item => [item.id, item.name + ' - ' + item.nameLocal]);
	option('language', CRITICAL + WITHSUBOPTIONS, guiLanguages);
	const optionLocales = determineLocales();
	let extra = '';
	extra += Html`<ul style="margin-left:24px">`;
	extra += Html`<li>${Locale.formatNumber(123456.78)}`;
	extra += Html`<li>${Locale.formatDateTimeFull(gui.getUnixTime())}`;
	extra += Html`<li>${gui.getDuration(1 * 86400 + 2 * 3600 + 3 * 60 + 4, 2)}`;
	extra += Html`<li>${Locale.formatList([Locale.formatDaysNum(1), Locale.formatDaysNum(-1), Locale.formatDaysNum(-3)])}`;
	extra += Html`</ul>`;
	option('locale', SUBOPTION, optionLocales, Html.raw(extra));
	const gameLanguages = languages.filter(item => item.gameId).map(item => [item.gameId, item.name + ' - ' + item.nameLocal]);
	if (bgp.Data.generator) option('gameLanguage', SUBOPTION, gameLanguages);
	option('darkTheme');
	option('shrinkMenu', '', [0, 1, 2].map((n, i) => [i, gui.getMessage('options_shrinkmenu_' + n)]));
	// option('autoLogin');
	option('disableAltGuard', WARNING);
	continueSection('rewardlinks');
	option('rewardsClose', WITHSUBOPTIONS);
	option('rewardsCloseExceptGems', SUBOPTION);
	option('rewardsCloseExceptErrors', SUBOPTION);
	option('rewardsSummary', SUBOPTION);
	option('linkGrabEnabled', CRITICAL);
	option('linkGrabKey', SUBOPTION);
	option('linkGrabBadge', SUBOPTION);
	endSection();
	beginSection('ingame');
	option('fullWindow', WITHSUBOPTIONS);
	option('fullWindowHeader', SUBOPTION);
	option('fullWindowSide', SUBOPTION);
	option('fullWindowLock', SUBOPTION);
	// option('resetFullWindow', SUBOPTION + WARNING);
	// const options = [[0, gui.getMessage('dialog_no')], [1, gui.getMessage('dialog_yes')],];
	// for (let num = 5; num <= 20; num += 5) options.push([num, gui.getMessage('options_fullwindowtimeout_seconds', num)]);
	// option('fullWindowTimeout', SUBOPTION, options);
	option('gcTable', WITHSUBOPTIONS);
	option('gcTableCounter', SUBOPTION);
	option('gcTableRegion', SUBOPTION);
	// option('autoClick');
	option('noGCPopup');
	option('autoGC');
	continueSection('hMain');
	option('hMain', WITHSUBOPTIONS);
	optionEffect('hFlashAd');
	option('hReward', SUBOPTION);
	option('hGCCluster', SUBOPTION);
	option('hScroll', SUBOPTION);
	option('hLootCount', SUBOPTION);
	option('hLootZoom', SUBOPTION);
	option('hLootFast', SUBOPTION);
	const foodOptions = [
		['avg', gui.getMessage('gui_average')],
		['min', gui.getMessage('gui_minimum')],
		[0, '1 = ' + gui.getMessage('gui_maximum')],
		...[...Array(19).keys()].map(i => [i + 1, Locale.formatNumber(i + 2)])
	];
	option('hFood', SUBOPTION, foodOptions);
	option('hSpeed', SUBOPTION);
	option('hQueue', SUBOPTION);
	option('hLockCaravan', SUBOPTION);
	endSection();
	beginSection('badges');
	// option('badgeServerEnergy');
	option('badgeGcCounter');
	option('badgeGcEnergy');
	option('badgeProductions', WITHSUBOPTIONS);
	option('badgeCaravan', SUBOPTION);
	option('badgeKitchen', SUBOPTION);
	option('badgeFoundry', SUBOPTION);
	optionEffect('badgeProductions');
	option('badgeRepeatables', WITHSUBOPTIONS);
	optionEffect('badgeRepeatables', true);
	option('badgeLuckyCards', WITHSUBOPTIONS);
	optionEffect('badgeLuckyCards', true);
	option('badgeWindmills', WITHSUBOPTIONS);
	optionEffect('badgeWindmills');
	endSection();

	Html.set(container.querySelector('.scrollable-content'), htm);

	for (const item of container.querySelectorAll('.open_href')) {
		item.addEventListener('click', function (event) {
			event.preventDefault();
			chrome.tabs.create({
				url: item.href
			});
		});
	}

	let handler = null;
	let changes = {};

	function applyChanges() {
		if (handler) clearTimeout(handler);
		handler = null;
		for (const [name, value] of Object.entries(changes)) {
			gui.setPreference(name, value);
			if (name == 'darkTheme') gui.setTheme();
			if (name == 'shrinkMenu') gui.setShrinkMenu();
		}
		changes = {};
		refresh();
	}

	function getPrefInChanges(name) {
		return name in changes ? changes[name] : gui.getPreference(name);
	}

	let audio;
	function stopSound() {
		if (audio) try { audio.pause(); } catch (e) { }
		audio = null;
	}
	function playSound(audioPref, force) {
		stopSound();
		if (audioPref) {
			const enabled = getPrefInChanges(audioPref + 'Sound');
			const name = getPrefInChanges(audioPref + 'SoundName');
			const volume = parseInt(getPrefInChanges(audioPref + 'Volume'));
			if ((enabled || force) && volume > 0) {
				const sound = bgp.Data.getSound(name);
				if (sound) {
					audio = new Audio(sound);
					audio.volume = volume / 100;
					audio.play().then(_ => 0);
				}
			}
		}
	}

	Array.from(container.querySelectorAll('.play_sound')).forEach(el => el.addEventListener('click', event => {
		playSound(event.target.getAttribute('data-name'), true);
	}));

	let delayedAudio;
	function onInput() {
		const input = this;
		const name = input.getAttribute('data-pref');
		let value = input.type == 'checkbox' ? input.checked : input.value;
		if (input.type == 'number' || input.type == 'range') {
			const min = parseInt(input.min, 10) || 0;
			const max = parseInt(input.max, 10) || 0;
			value = parseInt(value, 10) || 0;
			value = String(Math.max(min, Math.min(max, value)));
		}
		if (input.type == 'range') Html.set(input.nextElementSibling, Html(Locale.formatNumber(value)));
		if (handler) clearTimeout(handler);
		handler = setTimeout(applyChanges, name == 'darkTheme' ? 0 : 500);
		changes[name] = value;
		if (name.endsWith('Sound') || name.endsWith('SoundName') || name.endsWith('Volume')) {
			stopSound();
			if (delayedAudio) clearTimeout(delayedAudio);
			const force = name.endsWith('SoundName') || name.endsWith('Volume');
			const audioPref = name.replace(/(Sound|SoundName|Volume)$/, '');
			delayedAudio = setTimeout(() => playSound(audioPref, force), 300);
		}
		if (name == 'locale') {
			const currentLanguage = gui.getPreference('language');
			const pLocales = gui.getPreference('locales') || '';
			const arr = pLocales.split(',').filter(l => l && !l.startsWith(currentLanguage + '-'));
			arr.push(currentLanguage + '-' + value);
			changes['locales'] = arr.join(',');
		}
		if (name == 'language' || name == 'locale') {
			applyChanges();
			determineLocales();
			document.location.reload();
		} else if (name == 'gameLanguage') {
			gui.wait.show({
				text: gui.getMessage('gui_loadingresources', 1, 1)
			});
			applyChanges();
			determineLocales();
			const promise = bgp.Data.checkLocalization() || Promise.resolve(0);
			promise.then(() => document.location.reload());
		}
	}

	for (const input of container.querySelectorAll('[data-pref]')) {
		if (input.tagName == 'SELECT') {
			input.addEventListener('input', onInput);
		} else if (input.type == 'text' || input.type == 'number' || input.type == 'range') {
			input.addEventListener('input', onInput);
		} else if (input.type == 'checkbox') {
			input.addEventListener('click', onInput);
		}
	}
}

function getState() {
	return {
		search: inputs.search.value
	};
}

function setState(state) {
	inputs.search.value = state.search || '';
	refresh();
}

function refresh() {
	gui.updateTabState(tab);

	const fnSearch = gui.getSearchFilter(inputs.search.value);
	for (const table of container.querySelectorAll('.options table')) {
		let count = 0;
		let parent = null;
		for (const row of table.tBodies[0].rows) {
			if (row.classList.contains('hassuboptions')) parent = row;
			let visible = true;
			if (fnSearch) visible = fnSearch(row.textContent.toUpperCase());
			row.style.display = visible ? '' : 'none';
			if (visible) {
				count++;
				if (row.classList.contains('suboption')) parent.style.display = '';
			}
		}
		table.style.display = count > 0 ? '' : 'none';
	}
	for (const input of container.querySelectorAll('[data-pref]')) {
		let name = input.getAttribute('data-pref');
		let value = gui.getPreference(name);
		if (name.startsWith('@')) {
			const index = parseInt(name.charAt(1));
			name = name.substr(2);
			value = gui.getPreference(name).split(',')[index];
		}
		if (value !== undefined) {
			if (input.tagName == 'SELECT' || input.type == 'text' || input.type == 'number') input.value = value;
			if (input.type == 'checkbox') input.checked = value === true || value == 1;
			if (input.type == 'range') {
				input.value = value;
				Html.set(input.nextElementSibling, Html(Locale.formatNumber(value)));
			}
		}
	}
}