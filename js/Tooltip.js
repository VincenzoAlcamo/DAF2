/*global Html*/
const Tooltip = {};
Tooltip.init = function () {
	this.tip = Html.get(`<span class="Tooltip" style="display:none"></span>`)[0];
	document.body.appendChild(this.tip);
	document.addEventListener('mouseover', function (e) {
		const el = e.target;
		if (el.hasAttribute('data-tooltip')) Tooltip.show(el, el.getAttribute('data-tooltip'));
		else {
			const element = el.closest('.tooltip-event');
			if (element) {
				const event = new Event('tooltip', { bubbles: true });
				['ctrlKey', 'shiftKey', 'altKey'].forEach(name => event[name] = e[name]);
				element.dispatchEvent(event);
			}
		}
	});
};
Tooltip.show = function (el, html, direction) {
	direction = ((direction || '') + 'WE').toUpperCase();
	const eventNames = ['mousedown', 'mouseleave', 'blur'];
	const autoHide = () => {
		eventNames.forEach(name => el.removeEventListener(name, autoHide));
		Tooltip.hide();
	};
	eventNames.forEach(name => el.addEventListener(name, autoHide));
	const tip = this.tip;
	tip.className = 'Tooltip';
	tip.style.display = '';
	Html.set(tip, html);
	const height = this.tip.offsetHeight;
	const width = this.tip.offsetWidth;
	const box = el.getBoundingClientRect();
	let top = direction.indexOf('BB') >= 0 ? Math.floor(box.top + box.height - height + 6) : Math.floor(box.top + (box.height - height) / 2);
	top = Math.min(Math.max(16, top), window.innerHeight - 16 - height);
	const leftE = Math.floor(box.left + box.width + 8);
	const leftW = Math.floor(box.left - width - 8);
	const isValidLeftE = leftE + width <= window.innerWidth - 16;
	const isValidLeftW = leftW >= 16;
	const left = (direction.indexOf('W') < direction.indexOf('E')) ? (isValidLeftW ? leftW : leftE) : (isValidLeftE ? leftE : leftW);
	tip.style.left = left + 'px';
	tip.style.top = top + 'px';
	tip.classList.add('Tooltip-On');
};
Tooltip.hide = function () {
	this.tip.style.display = 'none';
};