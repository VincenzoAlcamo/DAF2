/*global Html*/
const resizeObserver = new ResizeObserver(function (entries) {
	for (const entry of entries) {
		const element = entry.target;
		const event = new Event('resized', {
			bubbles: true
		});
		element.dispatchEvent(event);
	}
});

function SmartTable(table) {
	this.table = table;
	const parent = this.table.parentNode;
	this.container = Html.get(`<div class="sticky-container"></div>`)[0];
	parent.insertBefore(this.container, this.table);
	this.sort = {};
	this.sortSub = {};
	this.container.appendChild(this.table);
	this.recreateHeader();
	this.recreateFooter();
	this.tbody = Array.from(table.querySelectorAll('tbody'));
	this.table.addEventListener('resized', () => this.syncLater());
	resizeObserver.observe(this.table);
	parent.addEventListener('resized', () => this.syncLater());
	resizeObserver.observe(parent);
	return this;
}
Object.assign(SmartTable.prototype, {
	recreateHeader() {
		let tableHeader = this.container.querySelector('table.sticky-header');
		if (tableHeader) tableHeader.parentNode.removeChild(tableHeader);
		this.hasSortableSub = false;
		this.fixedHeader = null;
		this.header = this.table.querySelector('thead');
		if (this.header) {
			this.hasSortableSub = !!this.header.querySelector('th.sortable-sub');
			tableHeader = Html.get(`<table class="sticky-header"></table>`)[0];
			this.container.insertBefore(tableHeader, this.container.firstChild);
			this.header.style.visibility = '';
			tableHeader.appendChild(this.fixedHeader = this.header.cloneNode(true));
			this.header.style.visibility = 'hidden';
			this.fixedHeader.addEventListener('click', e => this.headerClick(e));
		}
	},
	recreateFooter() {
		let tableFooter = this.container.querySelector('table.sticky-footer');
		if (tableFooter) tableFooter.parentNode.removeChild(tableFooter);
		this.fixedFooter = null;
		this.footer = this.table.querySelector('tfoot');
		if (this.footer) {
			tableFooter = Html.get(`<table class="sticky-footer"></table>`)[0];
			this.container.appendChild(tableFooter);
			this.footer.style.visibility = '';
			tableFooter.appendChild(this.fixedFooter = this.footer.cloneNode(true));
			this.footer.style.visibility = 'hidden';
		}
	},
	syncLater() {
		setTimeout(() => this.sync(), 100);
	},
	sync() {
		this.container.style.maxWidth = (this.container.parentNode.clientWidth - 12) + 'px';
		this.container.style.maxHeight = (this.container.parentNode.clientHeight - 28) + 'px';

		function process(thead1, thead2) {
			if (!thead1) return;
			const a = Array.from(thead1.querySelectorAll('th,td'));
			const b = Array.from(thead2.querySelectorAll('th,td'));
			a.forEach((el, index) => {
				if (index < b.length) b[index].width = el.offsetWidth;
			});
			const table = thead2.parentNode;
			table.style.width = thead1.parentNode.offsetWidth + 'px';
			setTimeout(() => {
				const height = thead1.offsetHeight;
				if (thead1.tagName == 'THEAD') {
					thead1.parentNode.style.marginTop = Math.max(0, thead2.offsetHeight - thead1.offsetHeight) + 'px';
					let tot = -table.offsetHeight;
					const nextSibling = thead2.nextElementSibling;
					if (nextSibling && nextSibling.tagName == 'TBODY' && nextSibling.offsetHeight)
						tot = -(thead1.offsetHeight + thead1.nextElementSibling.offsetHeight);
					table.style.marginBottom = tot + 'px';
				} else table.style.marginTop = (height ? -height - 1 : 0) + 'px';
			}, 0);
		}
		process(this.header, this.fixedHeader);
		process(this.footer, this.fixedFooter);
		this.showFixed();
	},
	showFixed(flag = true) {
		[this.fixedHeader, this.fixedFooter].forEach(el => el && (el.parentNode.style.display = flag ? '' : 'none'));
	},
	headerClick(e) {
		let el;
		for (el = e.target; el && el.tagName != 'TABLE'; el = el.parentNode)
			if (el.tagName == 'TH') break;
		if (!el || el.tagName != 'TH' || !(el.classList.contains('sortable') || el.classList.contains('sortable-sub'))) return;
		const name = el.getAttribute('data-sort-name');
		if (!name) return;
		if (this.hasSortableSub) {
			const sortInfo = el.classList.contains('sortable-sub') ? this.sortSub : this.sort;
			sortInfo.ascending = sortInfo.name != name || !sortInfo.ascending;
			sortInfo.name = name;
		} else if (!e.ctrlKey) {
			this.sort.ascending = this.sort.name == name ? !this.sort.ascending : true;
			this.sort.name = name;
			if (this.sortSub.name == name) delete this.sortSub.name;
		} else if (this.sort.name == name) {
			delete this.sortSub.name;
			this.sort.ascending = !this.sort.ascending;
		} else {
			this.sortSub.ascending = this.sortSub.name == name ? !this.sortSub.ascending : true;
			this.sortSub.name = name;
		}
		this.setSortInfo();
		if (typeof this.onSort == 'function') this.onSort();
	},
	isValidSortName(name, isSub) {
		if (!this.header || !name) return false;
		for (const el of this.header.querySelectorAll(this.hasSortableSub && isSub ? 'th.sortable-sub' : 'th.sortable')) {
			if (el.getAttribute('data-sort-name') == name) return true;
		}
		return false;
	},
	setSortInfo() {
		this.sortSub = this.sortSub || {};
		this.sortSub.ascending = this.sortSub.ascending !== false;
		if (!this.isValidSortName(this.sortSub.name, true)) delete this.sortSub.name;
		this.sort = this.sort || {};
		this.sort.ascending = this.sort.ascending !== false;
		if (!this.isValidSortName(this.sort.name, false)) delete this.sort.name;
		if (this.sort.name == this.sortSub.name) {
			delete this.sortSub.name;
		} else if (!this.sort.name && !this.hasSortableSub && this.sortSub.name) {
			this.sort = this.sortSub;
			delete this.sortSub.name;
		}
		for (const thead of [this.header, this.fixedHeader]) {
			if (!thead) continue;
			for (const el of thead.querySelectorAll('th.sortable-sub,th.sortable')) {
				const name = el.getAttribute('data-sort-name');
				let isSub = false;
				let sortInfo = null;
				if (name == this.sort.name) {
					sortInfo = this.sort;
				} else if (name == this.sortSub.name) {
					isSub = true;
					sortInfo = this.sortSub;
				}
				el.classList.toggle('sort-sub', isSub && sortInfo);
				el.classList.toggle('sort-ascending', sortInfo && sortInfo.ascending);
				el.classList.toggle('sort-descending', sortInfo && !sortInfo.ascending);
			}
		}
	}
});