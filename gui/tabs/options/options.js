/*global bgp chrome gui Html Dialog*/
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

    function endSection() {
        htm += Html.br`</tbody></table></div>`;
    }

    function option(prefName, features, options) {
        const messageId = 'options_' + prefName.toLowerCase();
        const text = prefName == 'fixes' ? 'Special settings' : gui.getMessage(messageId);
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
        htm += Html.br`<td${type == SELECT || type == TEXT ? Html.raw(' colspan="2"') : ''}><h3>${title}</h3><p>${info}</p>${warning ? Html.br`<div class="warning">${warning}</div>` : ''}`;
        if (type == SELECT) {
            htm += Html.br`<select data-pref="${prefName}">`;
            for (const option of options) {
                htm += Html.br`<option value="${option[0]}">${option[1]}</option>`;
            }
            htm += Html.br`</select></td></tr>`;
        } else if (type == TEXT) {
            htm += Html.br`<input data-pref="${prefName}" type="text" maxlength="200" style="width:100%"></td></tr>`;
        } else {
            htm += Html.br`</td><td><input data-pref="${prefName}" type="checkbox"></td></tr>`;
        }
    }

    function determineLocales(currentLanguage) {
        let currentLocale = gui.getPreference('locale');
        let locales = [];
        locales.push(['', gui.getMessage('options_locale_browser')]);
        for (const item of bgp.Data.languages) {
            if (item.id == currentLanguage) {
                if (currentLocale && !item.locales.includes(currentLocale)) {
                    gui.setPreference('locale', currentLocale = item.preferredLocale);
                }
                locales = locales.concat(item.locales.map(v => [v, v]));
            }
        }
        return locales;
    }

    beginSection('general');
    const languages = bgp.Data.languages;
    languages.sort((a, b) => a.name.localeCompare(b.name));
    const guiLanguages = languages.filter(item => bgp.Data.guiLanguages.includes(item.id)).map(item => [item.id, item.name + ' - ' + item.nameLocal]);
    option('language', CRITICAL + WITHSUBOPTIONS, guiLanguages);
    option('locale', SUBOPTION, determineLocales(gui.getPreference('language')));
    const gameLanguages = languages.map(item => [item.gameId, item.name + ' - ' + item.nameLocal]);
    if (bgp.Data.generator) option('gameLanguage', SUBOPTION, gameLanguages);
    option('autoLogin');
    option('disableAltGuard', WARNING);
    option('fixes', TEXT);
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
        for (const [name, value] of Object.entries(changes)) gui.setPreference(name, value);
        changes = {};
    }

    function onInput() {
        const input = this;
        const name = input.getAttribute('data-pref');
        const value = input.type == 'checkbox' ? input.checked : input.value;
        if (handler) clearTimeout(handler);
        handler = setTimeout(applyChanges, 500);
        changes[name] = value;
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
        } else if (input.type == 'text') {
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
        const name = input.getAttribute('data-pref');
        const value = gui.getPreference(name);
        if (value !== undefined) {
            if (input.tagName == 'SELECT' || input.type == 'text') input.value = value;
            if (input.type == 'checkbox') input.checked = value === true;
        }
    }
}