/*global gui*/
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

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => refresh());

    for (let input of container.querySelectorAll('input[data-pref]')) {
        if (input.type == 'checkbox') {
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
    for (let input of container.querySelectorAll('input[data-pref]')) {
        let name = input.getAttribute('data-pref');
        let value = gui.getPreference(name);
        if (value !== undefined) {
            if (input.type == 'checkbox') input.checked = value === true;
        }
    }
}