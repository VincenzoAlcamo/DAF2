/*global bgp gui*/
export default {
    hasCSS: true,
    init: init,
    getState: getState,
    setState: setState,
    onPrefChange: refresh
};

var tab, container, searchInput;

function init() {
    tab = this;
    container = tab.container;

    searchInput = container.querySelector('[name=search]');
    searchInput.addEventListener('input', () => refresh());

    for (let input of container.querySelectorAll('input[data-pref]')) {
        if (input.type == 'checkbox') {
            input.addEventListener('click', function() {
                gui.sendPreference(input.getAttribute('data-pref'), input.checked);
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

    var search = searchInput.value.toUpperCase();
    for (var table of container.querySelectorAll('.options table')) {
        var count = 0;
        for (var row of table.tBodies[0].rows) {
            var visible = true;
            if (search) visible = row.textContent.toUpperCase().indexOf(search) > 0;
            row.style.display = visible ? '' : 'none';
            if (visible) {
                count++;
                row.classList.toggle('odd', count % 2);
            }
        }
        table.style.display = count > 0 ? '' : 'none';
    }
    for (var input of container.querySelectorAll('input[data-pref]')) {
        var name = input.getAttribute('data-pref');
        var value = bgp.Preferences.getValue(name);
        if (value !== undefined) {
            if (input.type == 'checkbox') input.checked = value === true;
        }
    }
}