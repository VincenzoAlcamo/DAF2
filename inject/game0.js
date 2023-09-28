function createScript(code) {
	const script = document.createElement('script');
	script.type = 'text/javascript';
	script.appendChild(document.createTextNode(`(function(){${code}})();`));
	return script;
}

function addCode() {
	const code = `
window.$hxClasses = window.$hxClasses || {};
const _ObjectCreate = Object.create;
Object.create = function (proto) {
	const obj = _ObjectCreate.apply(Object, arguments);
	let __class__;
	if (proto) Object.defineProperty(obj, '__class__', {
		get() { return __class__; },
		set(newValue) {
			if (newValue && typeof newValue.__name__ == 'string') window.$hxClasses[newValue.__name__] = newValue;
			__class__ = newValue;
		},
		enumerable: true,
		configurable: true,
	});
	return obj;
};
`;
	document.head.appendChild(createScript(code));
}

function checkHead() {
	if (document.head) addCode();
	else setTimeout(checkHead, 5);
}
checkHead();