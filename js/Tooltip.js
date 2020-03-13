/*global Dialog*/
let Tooltip = {};
Tooltip.init = function () {
    this.tip = document.createElement('span');
    this.tip.className = 'Tooltip';
    this.tip.style.display = 'none';
    document.body.appendChild(this.tip);
    document.addEventListener('mouseover', function (e) {
        let el = e.target;
        if (el.hasAttribute('data-tooltip')) Tooltip.show(el, el.getAttribute('data-tooltip'));
        else if (el.classList.contains('tooltip-event')) {
            var event = new Event('tooltip', {
                bubbles: true
            });
            el.dispatchEvent(event);
        }
    });
};
Tooltip.show = function (el, html, direction) {
    direction = ((direction || '') + 'WE').toUpperCase();
    let tip = this.tip;
    for (let name of ['mousedown', 'mouseleave', 'blur']) el.addEventListener(name, autoHide);
    tip.className = 'Tooltip';
    tip.style.display = '';
    Dialog.htmlToDOM(tip, html);
    let height = this.tip.offsetHeight;
    let width = this.tip.offsetWidth;
    let box = el.getBoundingClientRect();
    let top = direction.indexOf('BB') >= 0 ? Math.floor(box.top + box.height - height + 6) : Math.floor(box.top + (box.height - height) / 2);
    top = Math.min(Math.max(16, top), window.innerHeight - 16 - height);
    let leftE = Math.floor(box.left + box.width + 8);
    let leftW = Math.floor(box.left - width - 8);
    let isValidLeftE = leftE + width <= window.innerWidth - 16;
    let isValidLeftW = leftW >= 16;
    let left = (direction.indexOf('W') < direction.indexOf('E')) ? (isValidLeftW ? leftW : leftE) : (isValidLeftE ? leftE : leftW);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.classList.add('Tooltip-On');

    function autoHide() {
        for (let name of ['mousedown', 'mouseleave', 'blur']) el.removeEventListener(name, autoHide);
        Tooltip.hide();
    }
};
Tooltip.hide = function () {
    this.tip.style.display = 'none';
};