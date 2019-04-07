var resizeObserver = new ResizeObserver(function(entries) {
    for (let entry of entries) {
        var element = entry.target;
        var event = new Event('resized', {
            bubbles: true
        });
        element.dispatchEvent(event);
    }
});

function SmartTable(table) {
    this.table = table;
    this.container = this.table.parentNode.insertBefore(document.createElement('div'), this.table);
    this.container.className = 'sticky-container';
    this.sort = {};
    this.sortSub = {};
    this.header = table.querySelector('thead');
    if (this.header) {
        //        let tableHeader = table.parentNode.insertBefore(document.createElement('table'), table);
        let tableHeader = this.container.appendChild(document.createElement('table'));
        tableHeader.className = 'sticky-header';
        tableHeader.appendChild(this.fixedHeader = this.header.cloneNode(true));
        this.header.style.visibility = 'hidden';
        this.fixedHeader.addEventListener('click', e => this.headerClick(e));
    }
    this.container.appendChild(this.table);
    this.footer = table.querySelector('tfoot');
    if (this.footer) {
        //let tableFooter = table.parentNode.insertBefore(document.createElement('table'), table.nextSibling);
        let tableFooter = this.container.appendChild(document.createElement('table'));
        tableFooter.className = 'sticky-footer';
        tableFooter.appendChild(this.fixedFooter = this.footer.cloneNode(true));
        this.footer.style.visibility = 'hidden';
    }
    this.tbody = Array.from(table.querySelectorAll('tbody'));
    table.addEventListener('resized', () => this.sync());
    resizeObserver.observe(table);
    return this;
}
Object.assign(SmartTable.prototype, {
    syncLater: function() {
        setTimeout(() => this.sync(), 100);
    },
    sync: function() {
        this.container.style.maxWidth = (this.container.parentNode.clientWidth - 12) + 'px';
        this.container.style.maxHeight = (this.container.parentNode.clientHeight - 24) + 'px';

        function process(thead1, thead2) {
            if (!thead1) return;
            var a = Array.from(thead1.querySelectorAll('th,td')),
                b = Array.from(thead2.querySelectorAll('th,td'));
            a.forEach((el, index) => {
                if (index < b.length) b[index].width = el.offsetWidth + 'px';
            });
            var table = thead2.parentNode;
            table.style.width = thead1.parentNode.offsetWidth + 'px';
            if (thead1.tagName == 'THEAD') table.style.marginBottom = (-thead1.offsetHeight - 2) + 'px';
            else table.style.marginTop = (-thead1.offsetHeight - 1) + 'px';
        }
        process(this.header, this.fixedHeader);
        process(this.footer, this.fixedFooter);
        this.showFixed();
    },
    showFixed: function(flag = true) {
        [this.fixedHeader, this.fixedFooter].forEach(el => el && (el.parentNode.style.display = flag ? '' : 'none'));
    },
    headerClick: function(e) {
        for (var el = e.target; el && el.tagName != 'TABLE'; el = el.parentNode)
            if (el.tagName == 'TH') break;
        if (!el || el.tagName != 'TH' || !el.classList.contains('sortable')) return;
        var name = el.getAttribute('sort-name');
        var isSub = el.classList.contains('sort-sub');
        var sortInfo = isSub ? this.sortSub : this.sort;
        if (!name) return;
        sortInfo.ascending = sortInfo.name != name || !sortInfo.ascending;
        sortInfo.name = name;
        this.setSortInfo(sortInfo, isSub);
        if (typeof this.onSort == 'function') this.onSort();
    },
    checkSortInfo: function(sortInfo, isSub) {
        var result = {};
        if (this.header && sortInfo)
            Array.from(this.header.querySelectorAll('th.sortable')).forEach(el => {
                var name = el.getAttribute('sort-name');
                if (!name || name != sortInfo.name || el.classList.contains('sort-sub') != isSub) return;
                result.name = name;
                result.ascending = sortInfo.ascending !== false;
            });
        return result;
    },
    setSortInfo: function(sortInfo, isSub) {
        sortInfo = this.checkSortInfo(sortInfo, isSub);
        if (isSub) this.sortSub = sortInfo;
        else this.sort = sortInfo;
        [this.header, this.fixedHeader].forEach(thead => {
            if (!thead) return;
            Array.from(thead.querySelectorAll('th.sortable')).forEach(el => {
                if (el.classList.contains('sort-sub') != isSub) return;
                var name = el.getAttribute('sort-name');
                el.classList.toggle('sort-ascending', name && name == sortInfo.name && sortInfo.ascending);
                el.classList.toggle('sort-descending', name && name == sortInfo.name && !sortInfo.ascending);
            });
        });
    },
    sortInfo2string: function(sortInfo) {
        return (sortInfo && sortInfo.name) ? sortInfo.name + (sortInfo.ascending ? '(asc)' : '(desc)') : '';
    },
    string2sortInfo: function(value) {
        var text = String(value),
            i = text.lastIndexOf('(');
        return {
            name: i >= 0 ? text.substr(0, i) : text,
            ascending: !text.endsWith('(desc)')
        };
    }
});