/*global Dialog Html gui */

class ThemeEditor {
    constructor(config) {
        this.init(config);
    }

    init(config) {
        if (!config) config = {};
        this.defaults = config.defaults || {};
        this.settings = config.settings || {};
        this.cssPrefix = config.cssPrefix || {};
        this.isAdmin = !!config.isAdmin;
        this.table = config.table;
        this.tableCallback = config.tableCallback;
        this.tableDelay = +config.tableDelay || 500;
    }

    applySettings(obj, value) {
        if (typeof obj == 'string') obj = { [obj]: value };
        const result = {};
        const scan = (prefix, obj) => {
            if (!obj || typeof obj != 'object') return;
            Object.entries(obj).forEach(([key, value]) => {
                if (value && typeof value == 'object') return scan(prefix + key + '.', value);
                const name = prefix + key;
                const def = this.defaults[name], type = def && def.type;
                if (type == 'int') {
                    value = (value === null || value === undefined) ? NaN : +value;
                    value = Math.max(def.min, Math.min(def.max, isNaN(value) ? +def.default || 0 : value));
                } else if (type == 'color') {
                    value = ThemeEditor.toColor(value) || def.default;
                } else return;
                if (typeof value === 'string' || !isNaN(value)) result[name] = value;
            });
        };
        Object.entries(this.defaults).forEach(([key, value]) => result[key] = value.default);
        if (obj !== null) {
            scan('', this.settings);
            scan('', obj);
        }
        this.settings = {};
        Object.keys(result).sort().forEach(key => {
            const value = result[key];
            const isCss = this.defaults[key].css, contrastSuffix = this.defaults[key].contrast;
            const contrastValue = contrastSuffix && ThemeEditor.getColorLuma(value) >= 0.647 ? '#000' : '#fff';
            const cssName = isCss ? '--' + this.cssPrefix + key.replace(/\./g, '-') : key;
            if (isCss) {
                document.documentElement.style.setProperty(cssName, value);
                if (contrastSuffix) document.documentElement.style.setProperty(cssName + contrastSuffix, contrastValue);
            }
            let base = this.settings, i;
            while ((i = key.indexOf('.')) > 0) {
                base = base[key.substr(0, i)] = base[key.substr(0, i)] || {};
                key = key.substr(i + 1);
            }
            base[key] = value;
            if (contrastSuffix) base[key + contrastSuffix] = contrastValue;
        });
    }

    createSettingsTable() {
        const { defaults, settings } = this;
        const keys = Object.keys(defaults).filter(key => {
            return this.isAdmin || defaults[key].admin;
        }).map(s => {
            const i = s.lastIndexOf('.');
            return [s.substr(0, i), s.substr(i + 1)];
        }).sort((a, b) => {
            return gui.sortTextAscending(a[0], b[0]) || gui.sortTextAscending(a[1], b[1]);
        }).map(v => v[0] + '.' + v[1]);
        let htm = '<table style="width:100%">';
        const parts = [];
        let isOdd = false;
        keys.forEach(key => {
            const keyParts = key.split('.');
            let base = settings;
            for (let i = 0; i < keyParts.length - 1; i++) {
                const name = keyParts[i];
                base = base[name];
                const partialKey = keyParts.slice(0, i + 1).join('.');
                if (partialKey != parts[i]) {
                    parts[i] = partialKey;
                    parts.length = i + 1;
                    const text = name.toUpperCase();
                    if (i == 0) isOdd = !isOdd;
                    htm += Html`<tr class="l${i}${isOdd ? ' odd' : ''}"><th colspan="2">${text}</th></tr>`;
                }
            }
            const name = keyParts[keyParts.length - 1];
            const text = name.toLowerCase();
            const value = base[name];
            htm += Html`<tr class="l${keyParts.length - 2}${isOdd ? ' odd' : ''}"><td>${text}</td><td>`;
            const def = defaults[key];
            if (def.type == 'color') {
                const color = ThemeEditor.toColor(value);
                htm += Html`<input name="${key}" type="color" value="${color}">`;
                htm += Html`<img class="${def.default == color ? 'hidden' : ''}" src="/img/gui/check_no.png" title="${gui.getMessage('map_default')}">`;
            } else if (def.type == 'int') {
                const step = Math.max(1, Math.floor((def.max - def.min) / 10));
                htm += Html`<input name="${key}" style="width:50px" type="number" min="${def.min}" max="${def.max}" step="${step}" value="${value}">`;
                htm += Html`<img class="${def.default == value ? 'hidden' : ''}" src="/img/gui/check_no.png" title="${gui.getMessage('map_default')}">`;
            }
            htm += Html`</td></tr>`;
        });
        htm += `</table>`;
        Dialog.htmlToDOM(this.table, htm);
        let newSettings = {}, handler = null;
        const onInput = (event) => {
            const input = event.target;
            const img = input.nextElementSibling;
            let value = input.value;
            if (input.type == 'number') value = +value;
            if (input.type == 'color') value = ThemeEditor.toColor(value);
            newSettings[input.name] = value;
            img.classList.toggle('hidden', value == defaults[input.name].default);
            if (handler) clearTimeout(handler);
            handler = setTimeout(() => {
                if (this.tableCallback) this.tableCallback(newSettings);
                newSettings = {};
            }, this.tableDelay);
        };
        const onClick = (event) => {
            const img = event.target;
            const target = img.previousElementSibling;
            target.value = defaults[target.name].default;
            onInput({ target });
        };
        this.table.querySelectorAll('input').forEach(input => input.addEventListener('input', onInput));
        this.table.querySelectorAll('img').forEach(img => img.addEventListener('click', onClick));
    }

    static toColor(value) {
        value = String(value);
        if (value[0] == '#') value = value.substr(1);
        if (value.match(/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)) {
            if (value.length <= 4) value = value.split('').map(v => v + v).join('');
            return '#' + value.toLowerCase();
        }
        return null;
    }

    static toTripletColor(value) {
        const s = ThemeEditor.toColor(value);
        return s && [parseInt(s.substring(1, 3), 16) / 255, parseInt(s.substring(3, 5), 16) / 255, parseInt(s.substring(5, 7), 16) / 255];
    }

    static getColorLuma(color) {
        const rgb = (typeof color === 'string') ? ThemeEditor.toTripletColor(color) : color;
        const luma = (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]); // SMPTE C, Rec. 709 weightings
        return luma;
    }

    static Color(color, ...extra) {
        return Object.assign({}, ...extra, { type: 'color', default: ThemeEditor.toColor(color) });
    }
    static Int(num, min, max, ...extra) {
        return Object.assign({}, ...extra, { type: 'int', min, max, default: num });
    }
}

export default ThemeEditor;