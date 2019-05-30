/*global chrome gui HtmlBr Html HtmlRaw*/
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

    function beginSection(id) {
        htm += HtmlBr `
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
        htm += HtmlBr `</tbody></table></div>`;
    }

    function option(prefName, features, options) {
        let messageId = 'options_' + prefName.toLowerCase();
        let text = gui.getMessage(messageId);
        let i = text.indexOf('\n');
        let title = i >= 0 ? text.substr(0, i) : text;
        let info = i >= 0 ? text.substr(i + 1) : '';
        let warning = '';
        let className = '';
        features = features || '';
        if (features.indexOf(CRITICAL) >= 0) className += ' critical';
        if (features.indexOf(WITHSUBOPTIONS) >= 0) className += ' hassuboptions';
        if (features.indexOf(SUBOPTION) >= 0) className += ' suboption';
        if (features.indexOf(WARNING) >= 0) warning = gui.getMessage(messageId + '_warning');
        if (info.indexOf('@SILENT@') >= 0) {
            info = HtmlRaw(String(HtmlBr(info)).replace('@SILENT@', '<a href="chrome://flags/#silent-debugger-extension-api" class="open_href">Silent Debugging</a>'));
        }

        htm += HtmlBr `<tr${className ? Html ` class="${className}"` : ''}>`;
        htm += HtmlBr `<td${options ? HtmlRaw(' colspan="2"') : ''}><h3>${title}</h3><p>${info}</p>${warning ? HtmlBr `<div class="warning">${warning}</div>` : ''}`;
        if (options) {
            htm += HtmlBr `<select data-pref="${prefName}">`;
            for (let option of options) {
                htm += HtmlBr `<option value="${option[0]}">${option[1]}</option>`;
            }
            htm += HtmlBr `</select></td></tr>`;
        } else {
            htm += HtmlBr `</td><td><input data-pref="${prefName}" type="checkbox"></td></tr>`;
        }
    }

    beginSection('ingame');
    option('injectGame', CRITICAL);
    option('fullWindow', WITHSUBOPTIONS);
    option('fullWindowHeader', SUBOPTION);
    option('fullWindowSide', SUBOPTION);
    option('fullWindowLock', SUBOPTION);
    option('resetFullWindow', SUBOPTION + WARNING);
    option('gcTable', WITHSUBOPTIONS);
    option('gcTableCounter', SUBOPTION);
    option('gcTableRegion', SUBOPTION);
    option('autoClick');
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
    let optionsKey = [
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
    beginSection('general');
    option('autoLogin');
    option('keepDebugging', WARNING);
    endSection();

    container.querySelector('.scrollable-content').innerHTML = htm;

    for (let item of container.querySelectorAll('.open_href')) {
        item.addEventListener('click', function(event) {
            event.preventDefault();
            chrome.tabs.create({
                url: item.href
            });
        });
    }

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => refresh());

    for (let input of container.querySelectorAll('[data-pref]')) {
        if (input.tagName == 'SELECT') {
            input.addEventListener('input', function() {
                gui.setPreference(input.getAttribute('data-pref'), input.value);
            });
        } else if (input.type == 'checkbox') {
            input.addEventListener('click', function() {
                gui.setPreference(input.getAttribute('data-pref'), input.checked);
            });
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

    let search = searchInput.value.toUpperCase();
    for (let table of container.querySelectorAll('.options table')) {
        let count = 0;
        let parent = null;
        for (let row of table.tBodies[0].rows) {
            if (row.classList.contains('hassuboptions')) parent = row;
            let visible = true;
            if (search) visible = row.textContent.toUpperCase().indexOf(search) > 0;
            row.style.display = visible ? '' : 'none';
            if (visible) {
                count++;
                if (row.classList.contains('suboption')) parent.style.display = '';
            }
        }
        table.style.display = count > 0 ? '' : 'none';
    }
    for (let input of container.querySelectorAll('[data-pref]')) {
        let name = input.getAttribute('data-pref');
        let value = gui.getPreference(name);
        if (value !== undefined) {
            if (input.tagName == 'SELECT') input.value = value;
            if (input.type == 'checkbox') input.checked = value === true;
        }
    }
}