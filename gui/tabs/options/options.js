/*global bgp chrome gui Html Dialog Locale*/
export default {
    hasCSS: true,
    init: init,
    update: refresh,
    getState: getState,
    setState: setState,
    onPrefChange: refresh
};

let tab, container, searchInput;

function init() {
    tab = this;
    container = tab.container;

    let htm = '';

    const CRITICAL = 'C';
    const WITHSUBOPTIONS = 'P';
    const SUBOPTION = 'S';
    const WARNING = 'W';
    const TEXT = 'T';
    const CHECKBOX = '1';
    const SELECT = '2';

    function beginSection(id) {
        htm += Html.br`
<div class="options">
    <table>
        <thead>
            <tr>
                <td colspan="2">${gui.getMessage('options_section_' + id)}</td>
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
                <td colspan="2">${gui.getMessage('options_section_' + id)}</td>
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
        const text = gui.getMessage(messageId);
        const i = text.indexOf('\n');
        const title = i >= 0 ? text.substr(0, i) : text;
        let info = i >= 0 ? text.substr(i + 1) : '';
        let warning = '';
        let className = '';
        features = features || '';
        if (features.indexOf(CRITICAL) >= 0) className += ' critical';
        if (features.indexOf(WITHSUBOPTIONS) >= 0) className += ' hassuboptions';
        if (features.indexOf(SUBOPTION) >= 0) className += ' suboption';
        if (features.indexOf(WARNING) >= 0) warning = gui.getMessage(messageId + '_warning');
        if (info.indexOf('@SILENT@') >= 0) {
            info = info.split('\n')[0];
            // info = Html.raw(String(Html.br(info)).replace('@SILENT@', '<a href="chrome://flags/#silent-debugger-extension-api" class="open_href">Silent Debugging</a>'));
        }

        const type = Array.isArray(options) ? SELECT : (features.indexOf(TEXT) >= 0 ? TEXT : CHECKBOX);

        htm += Html.br`<tr${className ? Html` class="${className}"` : ''}>`;
        htm += Html.br`<td${type == SELECT || type == TEXT ? Html.raw(' colspan="2"') : ''}><h3>${title}</h3><p class="${prefName.endsWith('Offset') ? 'time' : ''}">${info}</p>`;
        if (type == SELECT) {
            htm += Html.br`<select data-pref="${prefName}">`;
            for (const option of options) {
                htm += Html.br`<option value="${option[0]}">${option[1]}</option>`;
            }
            htm += Html.br`</select>`;
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
        if (type == CHECKBOX) htm += Html.br`<td><input data-pref="${prefName}" type="checkbox"></td>`;
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

    const sounds = `
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
    function optionEffect(prefName) {
        option(`${prefName}Offset`, TEXT + SUBOPTION, { min: 0, max: 9999, class: 'time' });
        let extra = Html.br`<select data-pref="${prefName}SoundName">`;
        extra += sounds.split('\n').sort(gui.sortTextAscending).map(n => n.trim() ? Html.br`<option value="${n}">${n.toLowerCase()}</option>` : '').join('');
        extra += Html.br`</select><button class="play_sound" data-name="${prefName}">\u25B6</button>`;
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
    const gameLanguages = languages.map(item => [item.gameId, item.name + ' - ' + item.nameLocal]);
    if (bgp.Data.generator) option('gameLanguage', SUBOPTION, gameLanguages);
    option('darkTheme');
    option('autoLogin');
    option('disableAltGuard', WARNING);
    continueSection('badges');
    option('badgeGcCounter');
    option('badgeGcEnergy');
    option('badgeRepeatables', WITHSUBOPTIONS);
    optionEffect('badgeRepeatables');
    option('badgeLuckyCards', WITHSUBOPTIONS);
    optionEffect('badgeLuckyCards');
    endSection();
    beginSection('ingame');
    option('fullWindow', WITHSUBOPTIONS);
    option('fullWindowHeader', SUBOPTION);
    option('fullWindowSide', SUBOPTION);
    option('fullWindowLock', SUBOPTION);
    option('resetFullWindow', SUBOPTION + WARNING);
    const options = [
        [0, gui.getMessage('dialog_no')],
        [1, gui.getMessage('dialog_yes')],
    ];
    for (let num = 5; num <= 20; num += 5) options.push([num, gui.getMessage('options_fullwindowtimeout_seconds', num)]);
    option('fullWindowTimeout', SUBOPTION, options);
    option('gcTable', WITHSUBOPTIONS);
    option('gcTableCounter', SUBOPTION);
    option('gcTableRegion', SUBOPTION);
    // option('autoClick');
    option('noGCPopup');
    option('autoGC');
    endSection();
    beginSection('rewardlinks');
    option('rewardsClose', WITHSUBOPTIONS);
    option('rewardsCloseExceptGems', SUBOPTION);
    option('rewardsCloseExceptErrors', SUBOPTION);
    option('rewardsSummary', SUBOPTION);
    option('linkGrabEnabled', CRITICAL);
    option('linkGrabButton', SUBOPTION, [
        [0, gui.getMessage('options_button_left')],
        [1, gui.getMessage('options_button_middle')],
        [2, gui.getMessage('options_button_right')]
    ]);
    const optionsKey = [
        [0, gui.getMessage('options_modifier_none')],
        [16, gui.getMessage('options_modifier_shift')],
        [17, gui.getMessage('options_modifier_ctrl')],
        [18, gui.getMessage('options_modifier_alt')]
    ];
    for (let i = 65; i <= 90; i++) {
        optionsKey.push([i, String.fromCharCode(i)]);
    }
    option('linkGrabKey', SUBOPTION, optionsKey);
    option('linkGrabSort', SUBOPTION, [
        [0, gui.getMessage('options_sort_none')],
        [1, gui.getMessage('options_sort_ascending')],
        [2, gui.getMessage('options_sort_descending')]
    ]);
    option('linkGrabConvert', SUBOPTION, [
        [0, gui.getMessage('rewardlinks_noconversion')],
        [3, 'Facebook'],
        [2, 'Portal']
    ]);
    endSection();

    Dialog.htmlToDOM(container.querySelector('.scrollable-content'), htm);

    for (const item of container.querySelectorAll('.open_href')) {
        item.addEventListener('click', function (event) {
            event.preventDefault();
            chrome.tabs.create({
                url: item.href
            });
        });
    }

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => refresh());

    let handler = null;
    let changes = {};

    function applyChanges() {
        if (handler) clearTimeout(handler);
        handler = null;
        for (const [name, value] of Object.entries(changes)) {
            gui.setPreference(name, value);
            if (name == 'darkTheme') gui.setTheme();
        }
        changes = {};
        refresh();
    }

    function getPrefInChanges(name) {
        return name in changes ? changes[name] : gui.getPreference(name);
    }

    let audio, audioPref;
    function stopSound() {
        if (audio) try { audio.pause(); } catch (e) { }
        audio = null;
    }
    function playSound() {
        stopSound();
        if (audioPref) {
            const enabled = getPrefInChanges(audioPref + 'Sound');
            const name = getPrefInChanges(audioPref + 'SoundName');
            const volume = parseInt(getPrefInChanges(audioPref + 'Volume'));
            if (enabled && volume > 0) {
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
        audioPref = event.target.getAttribute('data-name');
        playSound();
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
        if (input.type == 'range') input.nextElementSibling.textContent = Locale.formatNumber(value);
        if (handler) clearTimeout(handler);
        handler = setTimeout(applyChanges, name == 'darkTheme' ? 0 : 500);
        changes[name] = value;
        if (name.endsWith('Sound') || name.endsWith('SoundName') || name.endsWith('Volume')) {
            stopSound();
            if (delayedAudio) clearTimeout(delayedAudio);
            audioPref = name.replace(/(Sound|SoundName|Volume)$/, '');
            delayedAudio = setTimeout(playSound, 300);
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
        search: searchInput.value
    };
}

function setState(state) {
    searchInput.value = state.search || '';
    refresh();
}

function refresh() {
    gui.updateTabState(tab);

    const fnSearch = gui.getSearchFilter(searchInput.value);
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
                input.nextElementSibling.textContent = Locale.formatNumber(value);
            }
        }
    }
}