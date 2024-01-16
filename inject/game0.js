(function () {
	function setupMessaging(src, color, dst) {
		const logPrefix = `%c ${src.toUpperCase()} %c`;
		const logColor = `background-color:${color};color:white`;
		const log = function (...data) {
			if (typeof data[0] === 'string') data[0] = logPrefix + ' ' + data[0];
			else data.unshift(logPrefix);
			data.splice(1, 0, logColor, 'background-color:transparent;color:inherit');
			return console.log.apply(console, data);
		};
		log('started');

		const Prefs = {};
		const handlers = {};
		handlers['@prefs'] = (request) => {
			const values = request.values || {};
			Object.assign(Prefs, values);
			dispatch({ action: 'pref:*', values });
			Object.entries(values).forEach(([key, value]) => dispatch({ action: 'pref:' + key, value }));
		};
		const dispatch = (request, sender) => {
			const action = request?.action;
			try { return action in handlers ? handlers[action](request, sender) : void 0; } catch (e) {}
		};
		const makeRequest = (action, data) => (typeof action === 'string' ? { action, ...data } : action);
		const notSupported = () => { throw 'Not supported'; };
		let [sendPage, send, setPreference] = [notSupported, notSupported, notSupported];
		if (dst) {
			window.addEventListener('message', (event) => event.source === window && event.data?.src === dst && dispatch(event.data.request));
			sendPage = (...args) => window.postMessage({ src, request: makeRequest(...args) }, window.location.href);
		}
		if (src !== 'game0') {
			chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
				const response = dispatch(request, sender);
				if (response instanceof Promise) {
					response.then(sendResponse);
					return true;
				}
				if (response !== undefined) sendResponse(response);
			});
			send = async (...args) => {
				return new Promise((resolve, reject) => {
					chrome.runtime.sendMessage(makeRequest(...args), (response) => {
						if (!chrome.runtime.lastError) resolve(response);
					});
				});
			};
			setPreference = (name, value) => chrome.storage.local.set({ [name]: value });
			chrome.storage.local.get(null, function (values) {
				dispatch({ action: '@prefs', values });
				chrome.storage.local.onChanged.addListener((changes) => {
					const values = {};
					Object.entries(changes).forEach(([key, change]) => (values[key] = change.newValue));
					dispatch({ action: '@prefs', values });
				});
			});
		}

		return { Msg: { send, sendPage, handlers }, Prefs, setPreference, log };
	}

	const { Msg, Prefs, log } = setupMessaging('game0', 'blue', 'game2');

	// $hxClasses
	const $hxClasses = {};
	const _ObjectCreate = Object.create;
	Object.create = function (proto) {
		const obj = _ObjectCreate.apply(Object, arguments);
		let __class__;
		if (proto)
			Object.defineProperty(obj, '__class__', {
				get() {
					return __class__;
				},
				set(newValue) {
					if (newValue && typeof newValue.__name__ == 'string') $hxClasses[newValue.__name__] = newValue;
					__class__ = newValue;
				},
				enumerable: true,
				configurable: true
			});
		return obj;
	};

	// XMLHttpRequest
	let xhrEnabled = false;
	let parser = null;
	function parseXml(text) {
		if (!text) return null;
		if (!parser) parser = new DOMParser();
		const root = parser.parseFromString(text, 'text/xml')?.documentElement;
		return root ? parse(root) : null;
		function parse(parent) {
			const item = {};
			function add(name, value) {
				if (name in item) {
					const old = item[name];
					if (Array.isArray(old)) old.push(value);
					else item[name] = [old, value];
				} else item[name] = value;
			}
			for (let child = parent.firstElementChild; child; child = child.nextElementSibling)
				add(child.nodeName, child.firstElementChild ? parse(child) : child.textContent);
			return item;
		}
	}
	const XHR = XMLHttpRequest.prototype;
	const send = XHR.send;
	const open = XHR.open;
	function getString(b) {
		let s = '';
		let i = 0;
		const max = b.length;
		while (i < max) {
			const c = b[i++];
			if (c < 128) {
				if (c == 0) {
					break;
				}
				s += String.fromCodePoint(c);
			} else if (c < 224) {
				const code = ((c & 63) << 6) | (b[i++] & 127);
				s += String.fromCodePoint(code);
			} else if (c < 240) {
				const c2 = b[i++];
				const code1 = ((c & 31) << 12) | ((c2 & 127) << 6) | (b[i++] & 127);
				s += String.fromCodePoint(code1);
			} else {
				const c21 = b[i++];
				const c3 = b[i++];
				const u = ((c & 15) << 18) | ((c21 & 127) << 12) | ((c3 & 127) << 6) | (b[i++] & 127);
				s += String.fromCodePoint(u);
			}
		}
		return s;
	}
	XHR.open = function (method, url) {
		this.url = url;
		return open.apply(this, arguments);
	};
	XHR.send = function () {
		let kind, player_id, xml;
		const dispatch = (type) => {
			let response = null;
			if (type == 'ok') {
				const result = this.response;
				if (result === null) response = null;
				else if (typeof result == 'string') response = result;
				else if (result.bytes instanceof Uint8Array) response = getString(result.bytes);
				else log('daf_xhr: invalid response');
			}
			const lang = kind === 'generator' ? window.gamevars?.lang : undefined;
			Msg.sendPage('daf_xhr', { type, kind, lang, player_id, xml, url: this.url, response });
		};
		if (this.url.indexOf('/graph.facebook.com') > 0) kind = 'graph';
		else if (this.url.indexOf('/generator.php') > 0) kind = 'generator';
		else if (this.url.indexOf('/synchronize.php') > 0) kind = 'synchronize';
		else if (this.url.indexOf('/server-api/teams/my') > 0) kind = 'team';
		if (kind && xhrEnabled) {
			if (kind == 'generator' || kind == 'synchronize') {
				for (const item of (arguments[0] || '').split('&')) {
					const p = item.split('=');
					const key = decodeURIComponent(p[0]);
					if (key == 'player_id') player_id = decodeURIComponent(p[1]);
					else if (key == 'xml') xml = parseXml(decodeURIComponent(p[1]));
				}
				const error = () => dispatch('error');
				dispatch('send');
				this.addEventListener('error', error);
				this.addEventListener('abort', error);
				this.addEventListener('timeout', error);
			}
			this.addEventListener('load', () => dispatch('ok'));
		}
		return send.apply(this, arguments);
	};
	Msg.handlers['enableXhr'] = () => {
		log('enabling xhr');
		xhrEnabled = true;
	};

	Msg.handlers['enableGame'] = () => {
		// No GC popups
		let bypassFB = false;
		const _getFBApi = window.getFBApi;
		window.getFBApi = function () {
			const result = bypassFB ? { ui: function () {} } : _getFBApi();
			bypassFB = false;
			return result;
		};
		const _userRequest = window.userRequest;
		window.userRequest = function (recipients, req_type) {
			bypassFB = Prefs.noGCPopup;
			const result = _userRequest(recipients, req_type);
			bypassFB = false;
			return result;
		};

		// Resize
		window.removeEventListener('resize', window.resizeCanvas, false);
		window.removeEventListener('resize', window.resizeCanvas, true);
		window.resize = () => {};
		const canvas = document.getElementById('canvas');
		const resizeObserver = new ResizeObserver(function (entries) {
			for (const entry of entries) entry.target.dispatchEvent(new CustomEvent('daf_resized', { bubbles: true }));
		});
		resizeObserver.observe(canvas);
		canvas.addEventListener('daf_resized', () => {
			canvas.width = canvas.offsetWidth;
			canvas.height = canvas.offsetHeight;
			getJSInterface().onResize(canvas.width, canvas.height);
		});
		window.isFullScreen = () => !!document.fullscreenElement;
		window.exitFullscreen = () => document.exitFullscreen();
		window.enterFullscreen = () => canvas.parentElement.requestFullscreen();
	};

	Msg.handlers['enableExtra'] = () => {
		log('checking extra');

		let extras = [];

		function intercept(className, protoName, fn) {
			const def = $hxClasses[className],
				proto = def?.prototype,
				_ = proto?.[protoName];
			if (_ && typeof _ === 'function') proto[protoName] = fn(_, def);
		}

		const core = $hxClasses['com.pixelfederation.diggy.Core'];
		if (core) {
			extras.push('@core');
			let currentScreen = null;
			const getActiveScreen = () => {
				let screen = core.instance?._screenManager?.getActiveScreen();
				let visited = null;
				if (screen == 'campLowerScreen' || screen == 'campUpperScreen') {
					visited = core.instance._gameManagers?._friendsManager?.getVisitedFriend()?.getId();
					if (visited) screen += 'Visit';
				}
				const popups = core.instance?._popupManager?._visiblePopups;
				const popup = popups?.length > 0 ? popups[popups.length - 1] : null;
				const dialog = popup ? popup._popupId?.Id || popup._name : null;
				return { screen, visited, dialog };
			};

			Msg.handlers['visit'] = (request) => {
				const id = +request.id;
				currentScreen = null;
				const fm = core.instance?._gameManagers._friendsManager;
				const info = getActiveScreen();
				if (
					fm &&
					id > 0 &&
					!info.dialog &&
					['friendsScreen', 'campLowerScreenVisit', 'campUpperScreenVisit'].includes(info.screen) &&
					id !== info.visited
				)
					fm.visitFriend(id);
			};
			setInterval(() => {
				const info = getActiveScreen();
				const value = info.screen + '.' + info.dialog;
				const screen = value + '.' + info.visited;
				if (screen !== currentScreen) {
					currentScreen = screen;
					Msg.sendPage('screen', { value });
				}
			}, 500);
		}

		intercept(
			'com.pixelfederation.diggy.screens.popup.RedeemEnterCodePopup',
			'keyDownHandler',
			function (_keyDownHandler) {
				extras.push('hReward');
				return function (p_event) {
					if (p_event.keyCode >= 65 && p_event.keyCode <= 90 && Prefs.hReward)
						p_event = { keyCode: p_event.keyCode, key: p_event.key.toUpperCase() };
					return _keyDownHandler.call(this, p_event);
				};
			}
		);

		intercept('com.pixelfederation.diggy.game.character.Character', 'breakTile', function (_breakTile, Character) {
			extras.push('hSpeed');
			let lastMineId, isRepeat, isTower;
			function isSpeedAllowed() {
				const screen = core.instance._screenManager?._activeScreen?._screen;
				const mineId = screen?.screenId === 'mineScreen' && screen._mineLoader.getMineId();
				if (mineId !== lastMineId) {
					lastMineId = mineId;
					isRepeat = mineId && core.instance.getMapManager()?.getLocation(mineId)?.isRefreshable();
					isTower = mineId && screen._mineLoader.isTowerFloor();
				}
				return isRepeat || isTower;
			}
			function getSpeed(p_core, val, def, isPet) {
				const hasSpeedUp = (isPet && Prefs.hPetSpeed) || (Prefs.hSpeed && isSpeedAllowed());
				return hasSpeedUp && p_core.getInventoryManager().getSpeedupCtrlRemainingTime() > 0
					? Math.min(val * 0.6, def)
					: def;
			}
			intercept('com.pixelfederation.diggy.game.managers.pet.Pet', 'breakTile', function (_breakTile, Pet) {
				extras.push('hPetSpeed');
				const _getSpeed = Pet.getSpeed;
				Pet.getSpeed = function (p_core) {
					return getSpeed(p_core, 0.24, _getSpeed.apply(this, arguments), true);
				};
				return function (p_tileDef, p_digTime) {
					return _breakTile.call(this, p_tileDef, getSpeed(this._core, 0.15, p_digTime, true));
				};
			});
			const _getSpeed = Character.getSpeed;
			Character.getSpeed = function (p_core) {
				return getSpeed(p_core, 0.24, _getSpeed.apply(this, arguments), false);
			};
			return function (p_tileDef, p_digTime) {
				return _breakTile.call(this, p_tileDef, getSpeed(this._core, 0.15, p_digTime, false));
			};
		});

		intercept(
			'com.pixelfederation.diggy.game.mine.MineRenderer',
			'mouseMove_handler',
			function (_mouseMove_handler) {
				extras.push('hQueue', 'hAutoQueue');
				let maxQueue;
				return function (e) {
					const old = this._lastMineTileOver,
						result = _mouseMove_handler.apply(this, arguments),
						tile = this._lastMineTileOver;
					const isActive = Prefs.hQueue;
					if (!maxQueue) maxQueue = this._character.diggingQueue._maxQueue || 5;
					this._character.diggingQueue._maxQueue = isActive ? 100 : maxQueue;
					if (isActive && tile && old !== tile) {
						if (e.ctrlKey) this._character.diggingQueue.removeFromQueue(tile);
						else if ((e.shiftKey || Prefs.hAutoQueue) && (tile.isBreakable() || tile.isUsable()))
							this._character.go(tile);
					}
					return result;
				};
			}
		);

		intercept('com.pixelfederation.diggy.screens.campUpper.CampUpperScreenWeb', 'resizeUI', function (_resizeUI) {
			extras.push('hScroll');
			let firstTime = true;
			return function () {
				const result = _resizeUI.apply(this, arguments);
				if (firstTime) {
					firstTime = false;
					Object.defineProperty(this._dragManager.__proto__, '_autoPan', {
						get() {
							return Prefs.hScroll ? false : this.__autoPan;
						},
						set(newValue) {
							this.__autoPan = newValue;
						},
						enumerable: true,
						configurable: true
					});
					if (Prefs.hScroll) this._dragManager.setAutoPan(false);
				}
				return result;
			};
		});

		intercept(
			'com.pixelfederation.diggy.screens.campUpper.CampUpperScreenWeb',
			'addGodChild',
			function (_addGodChild) {
				extras.push('hGCCluster');
				return function () {
					const result = _addGodChild.apply(this, arguments);
					if (Prefs.hGCCluster)
						this._npcContainer.g2d_children.forEach((e, i) => (e.g2d_anchorX = -260 + i * 10));
					return result;
				};
			}
		);

		intercept(
			'com.pixelfederation.diggy.game.custom.DecalContainer',
			'createDropCount',
			function (_createDropCount) {
				extras.push('hLootCount');
				extras.push('hLootFast');
				return function (p_x, p_y, p_item, p_scaleX, p_scaleY, p_texture, p_target, p_screenType, p_showText) {
					if (p_screenType === 'mineScreen' && Prefs.hLootCount) p_showText = true;
					const dp = this.dropLootDecalPool,
						dp_getNext = dp?.getNext;
					if (dp && p_screenType === 'mineScreen' && Prefs.hLootFast)
						dp.getNext = function () {
							return null;
						};
					const result = _createDropCount.apply(this, arguments);
					if (dp) dp.getNext = dp_getNext;
					return result;
				};
			}
		);
		intercept(
			'com.pixelfederation.diggy.game.custom.DecalContainer',
			'getScaleFromScreenType',
			function (_getScaleFromScreenType) {
				extras.push('hLootZoom');
				return function (p_screenType) {
					if (p_screenType === 'mineScreen' && Prefs.hLootZoom)
						return this._core.getMineCamera().g2d_contextCamera.scaleX;
					return _getScaleFromScreenType.apply(this, arguments);
				};
			}
		);

		intercept(
			'com.pixelfederation.diggy.screens.popup.NoenergyPopup',
			'initUsableFromStorage',
			function (_initUsableFromStorage) {
				extras.push('hFood', 'hFoodNum');
				return function () {
					if (!Prefs.hFood) return _initUsableFromStorage.apply(this, arguments);
					this._myUsableFromStorageId = this._myUsableFromStorageCount = this._myUsableFromStorageValue = 0;
					const _usablesLoader = this._core.getLoadersManager()._usablesLoader;
					const usables = this._core
						.getInventoryManager()
						.getUsables()
						.filter((obj) => _usablesLoader.getAction(obj.id) == 'add_stamina')
						.map((obj) => [obj, _usablesLoader.getValue(obj.id)])
						.sort((a, b) => b[1] - a[1]);
					let index = 0;
					const what = Prefs.hFoodNum;
					if (what == 'min') index = usables.length - 1;
					else if (what == 'avg') index = Math.floor((usables.length - 1) / 2);
					else if (isFinite(+what)) index = +what;
					index = Math.max(0, Math.min(usables.length - 1, index));
					if (index >= 0 && index < usables.length) {
						const [obj, value] = usables[index];
						this._myUsableFromStorageId = obj.id;
						this._myUsableFromStorageValue = value;
						this._myUsableFromStorageCount = this._core
							.getInventoryManager()
							.getItemAmount(obj.item_type, obj.id);
					}
				};
			}
		);

		intercept(
			'com.pixelfederation.diggy.ui.hud.UISpecialButtons',
			'createFlashAdButton',
			function (_createFlashAdButton) {
				extras.push('hFlashAdSound');
				let _show;
				function show() {
					Msg.sendPage('hFlashAd');
					return _show.apply(this, arguments);
				}
				return function () {
					const result = _createFlashAdButton.apply(this, arguments);
					const btn = this._flashAdButton?._flashAdButtonIcon;
					if (btn && btn.show !== show) {
						_show = btn.show;
						btn.show = show;
					}
					return result;
				};
			}
		);

		intercept(
			'com.pixelfederation.diggy.screens.popup.production.ProductionPopup',
			'refreshSlotOnChange',
			function (_refreshSlotOnChange, ProductionPopup) {
				extras.push('hLockCaravan');
				function updateText(parent, name, value, color) {
					const el = parent.getChildByName(name, true);
					if (!el) return;
					if (value === undefined) {
						value = el.__old || el.g2d_model;
						delete el.__old;
						color = 1;
					} else if (!el.__old) el.__old = el.g2d_model;
					if (color) el.blue = el.red = el.green = color;
					el.g2d_model = value;
					el.g2d_onModelChanged.dispatch(el);
				}
				function lockSlot(p_index, locked) {
					this['__lockedSlot' + p_index] = locked;
					this._getButtons[p_index].setVisible(!locked);
					this._resendButtons[p_index].setVisible(!locked);
					const parent = this._prototypeInstance.getChildByName('slot' + p_index, true);
					updateText(parent, 'delivered', locked ? 'LOCKED' : undefined, 0.1);
					updateText(parent, 'amount_delivered', locked ? 'D A F 2' : undefined, 0.1);
				}
				const slotHasTicket = (slot) =>
					slot?.__state == 'delivered' &&
					slot._producedItem?._requirements?.find((req) => req.object_id == 347 && req.type == 'material');
				const shouldBeLocked = (popup) =>
					popup._mode == 'caravan' && popup._slots_initialized && Prefs.hLockCaravan;
				const _refreshCards = ProductionPopup.prototype.refreshCards;
				ProductionPopup.prototype.refreshCards = function () {
					this.__locked = false;
					const result = _refreshCards.apply(this, arguments);
					if (shouldBeLocked(this) && this._slots?.find(slotHasTicket)) {
						this.__locked = true;
						this._resendAllButton.setVisible(false);
						const button = this._collectAllButton._buttonElement;
						button.green = 0.3;
						if (this.__buttonX === undefined) this.__buttonX = button.g2d_anchorX;
						button.g2d_anchorX = this.__buttonX - 310;
						updateText(button, 'btn_collectAllLabel', 'UNLOCK');
					}
					return result;
				};
				const _collectAll = ProductionPopup.prototype.collectAll;
				ProductionPopup.prototype.collectAll = function () {
					if (!this.__locked) return _collectAll.apply(this, arguments);
					this.restorePushedButton();
					this.__locked = false;
					for (let p_index = 0; p_index < 6; p_index++)
						if (this['__lockedSlot' + p_index]) lockSlot.call(this, p_index, false);
					this._resendAllButton.setVisible(true);
					const button = this._collectAllButton._buttonElement;
					this._collectAllButton._initGreen = 1;
					button.g2d_anchorX = this.__buttonX;
					updateText(button, 'btn_collectAllLabel', undefined);
				};
				return function (p_index) {
					const result = _refreshSlotOnChange.apply(this, arguments);
					if (shouldBeLocked(this) && slotHasTicket(this._slots?.[p_index]))
						lockSlot.call(this, p_index, true);
					return result;
				};
			}
		);

		let lockPetCounter = 0;
		intercept('com.pixelfederation.diggy.game.mine.MineRenderer', 'setup', function (_setup) {
			lockPetCounter++;
			return function () {
				const result = _setup.apply(this, arguments);
				const callback = this._character.get_onGoFromTile();
				const listener = callback.g2d_listeners.find((fn) => fn.name === 'bound onDiggyMoving');
				if (listener) callback.remove(listener);
				const petInMineManager = this._petInMineManager;
				this._character.get_onGoFromTile().add(function () {
					if (Prefs.hPetFollow) petInMineManager.stopWalk();
					else petInMineManager.onDiggyMoving.apply(petInMineManager, arguments);
				});
				return result;
			};
		});
		intercept('com.pixelfederation.diggy.game.managers.pet.Pet', 'afterDrag', function (_afterDrag) {
			lockPetCounter++;
			return function () {
				if (!Prefs.hPetFollow) _afterDrag.apply(this, arguments);
			};
		});
		intercept('com.pixelfederation.diggy.game.managers.pet.Pet', 'onDrag', function (_onDrag) {
			lockPetCounter++;
			return function () {
				if (!Prefs.hPetFollow) _onDrag.apply(this, arguments);
			};
		});
		if (lockPetCounter === 3) extras.push('hPetFollow');

		intercept('com.pixelfederation.diggy.game.mine.MineRenderer', 'focus', function (_focus) {
			extras.push('hInstantCamera');
			return function (p_mineX, p_mineY, p_force, p_return, p_immediate, p_onCompleteCallback, p_returnPosition) {
				const result = _focus.apply(this, arguments);
				if (Prefs.hInstantCamera && this._focusTween) this._focusTween.duration = 0.01;
				return result;
			};
		});

		const value = extras.join();
		log('extra detected = "%s"', value);
		Msg.sendPage('extra', { value })
	};
})();
