(function () {
	'use strict';

	var root = document.documentElement;
	var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function lerp(a, b, t) { return a + (b - a) * t; }
	/* frame-rate independent smoothing factor */
	function damp(lambda, dt) { return 1 - Math.exp(-lambda * dt); }

	/* ---------- Shared pointer + scroll state ------------------- */
	var vw = window.innerWidth;
	var vh = window.innerHeight;
	var pointer = { x: vw / 2, y: vh / 2, sx: vw / 2, sy: vh / 2, active: false, moved: false };
	var scrollY = window.scrollY;
	var lastScrollY = -1;

	/* ---------- Smooth scroll (Lenis) --------------------------- */
	var lenis = null;
	if (!reduceMotion && typeof window.Lenis === 'function') {
		lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true });
	}

	document.addEventListener('click', function (e) {
		var link = e.target.closest('a[href^="#"]');
		if (!link || link.classList.contains('skip-link')) return;
		var id = link.getAttribute('href');
		var target = id === '#top' ? 0 : document.querySelector(id);
		if (target === null) return;
		e.preventDefault();
		if (lenis) {
			lenis.scrollTo(target, { offset: id === '#top' ? 0 : -40, duration: 1.4 });
		} else if (target === 0) {
			window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
		} else {
			target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
		}
	});

	/* ---------- Hero title split ------------------------------- */
	var title = document.querySelector('[data-split]');
	if (title) {
		var text = title.textContent.trim();
		var c = 0;
		title.setAttribute('aria-label', text);
		title.innerHTML = text.split(' ').map(function (word) {
			var chars = word.split('').map(function (ch) {
				return '<span class="char" style="--c:' + (c++) + '">' + ch + '</span>';
			}).join('');
			return '<span class="word" aria-hidden="true">' + chars + '</span>';
		}).join(' ');
	}

	requestAnimationFrame(function () {
		requestAnimationFrame(function () { document.body.classList.add('is-loaded'); });
	});

	/* ---------- Reveal on scroll -------------------------------- */
	var reveals = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
	reveals.forEach(function (el) {
		var siblings = Array.prototype.filter.call(el.parentElement.children, function (n) {
			return n.hasAttribute('data-reveal');
		});
		el.style.setProperty('--d', Math.min(siblings.indexOf(el), 6) * 0.07 + 's');
	});

	if ('IntersectionObserver' in window && !reduceMotion) {
		var revealIO = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (!entry.isIntersecting) return;
				entry.target.classList.add('is-in');
				revealIO.unobserve(entry.target);
			});
		}, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
		reveals.forEach(function (el) { revealIO.observe(el); });
	} else {
		reveals.forEach(function (el) { el.classList.add('is-in'); });
	}

	/* ---------- Count-up ---------------------------------------- */
	var counters = document.querySelectorAll('[data-count-to]');
	if ('IntersectionObserver' in window && !reduceMotion) {
		var countIO = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (!entry.isIntersecting) return;
				countIO.unobserve(entry.target);
				var el = entry.target;
				var to = parseInt(el.getAttribute('data-count-to'), 10) || 0;
				var start = performance.now();
				var dur = 1200;
				(function tick(now) {
					var t = clamp((now - start) / dur, 0, 1);
					el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
					if (t < 1) requestAnimationFrame(tick);
				})(start);
			});
		}, { threshold: 0.6 });
		Array.prototype.forEach.call(counters, function (el) { el.textContent = '0'; countIO.observe(el); });
	}

	/* ---------- Theme toggle ------------------------------------ */
	var themeToggle = document.getElementById('themeToggle');
	function setTheme(theme) {
		root.setAttribute('data-theme', theme);
		if (themeToggle) {
			themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
			themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
		}
		field.refreshColours();
	}
	if (themeToggle) {
		themeToggle.addEventListener('click', function () {
			var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
			try { localStorage.setItem('theme', next); } catch (e) {}
			setTheme(next);
		});
	}

	/* ---------- Blueprint field --------------------------------- */
	var field = (function () {
		var canvas = document.getElementById('field');
		var ctx = canvas && canvas.getContext('2d');
		var dpr = 1;
		var S = 28;               // grid spacing
		var R = 170;              // cursor radius of influence
		var cols = 0, rows = 0;
		var px, py, inten;        // per-dot position + intensity for current frame
		var ripples = [];
		var strength = 0;         // cursor influence, eases in/out
		var dirty = true;
		var ink = '14,15,18';
		var accent = '51,85,255';
		var baseAlpha = 0.14;

		function hexToRgb(hex) {
			hex = hex.trim().replace('#', '');
			if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
			var n = parseInt(hex, 16);
			return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
		}

		function refreshColours() {
			var cs = getComputedStyle(root);
			var isDark = root.getAttribute('data-theme') === 'dark';
			ink = hexToRgb(cs.getPropertyValue('--ink') || (isDark ? '#ecedef' : '#0e0f12'));
			accent = hexToRgb(cs.getPropertyValue('--accent') || (isDark ? '#7f96ff' : '#3355ff'));
			baseAlpha = isDark ? 0.13 : 0.15;
			dirty = true;
		}

		function resize() {
			if (!ctx) return;
			dpr = Math.min(window.devicePixelRatio || 1, vw < 720 ? 1.5 : 2);
			S = vw < 720 ? 24 : 28;
			R = vw < 720 ? 120 : 170;
			canvas.width = Math.round(vw * dpr);
			canvas.height = Math.round(vh * dpr);
			cols = Math.ceil(vw / S) + 2;
			rows = Math.ceil(vh / S) + 2;
			px = new Float32Array(cols * rows);
			py = new Float32Array(cols * rows);
			inten = new Float32Array(cols * rows);
			dirty = true;
		}

		function ripple(x, y) {
			if (reduceMotion) return;
			ripples.push({ x: x, y: y, t: performance.now() });
			if (ripples.length > 4) ripples.shift();
		}

		function draw(now, dt) {
			if (!ctx) return;

			var target = pointer.active && finePointer && !reduceMotion ? 1 : 0;
			var prevStrength = strength;
			strength = lerp(strength, target, damp(4, dt));
			if (Math.abs(strength - target) < 0.002) strength = target;

			ripples = ripples.filter(function (r) { return now - r.t < 1400; });

			var pointerSettled = Math.abs(pointer.sx - pointer.x) < 0.1 && Math.abs(pointer.sy - pointer.y) < 0.1;
			var active = ripples.length || strength !== prevStrength || (strength > 0 && !pointerSettled) || scrollY !== lastScrollY;
			if (!active && !dirty) return;
			dirty = false;

			var offY = reduceMotion ? 0 : -((scrollY * 0.35) % S);
			var cx = pointer.sx, cy = pointer.sy;
			var R2 = R * R;
			var i, x, y, gx, gy, dx, dy, d2, d, f, push, k;

			/* compute positions */
			for (y = 0; y < rows; y++) {
				gy = y * S + offY - S / 2;
				for (x = 0; x < cols; x++) {
					k = y * cols + x;
					gx = x * S - S / 2 + ((vw % S) / 2);
					var ox = 0, oy = 0, it = 0;

					if (strength > 0.001) {
						dx = gx - cx; dy = gy - cy;
						d2 = dx * dx + dy * dy;
						if (d2 < R2) {
							d = Math.sqrt(d2) || 1;
							f = 1 - d / R;
							f = f * f * (3 - 2 * f);
							push = f * 20 * strength;
							ox += dx / d * push;
							oy += dy / d * push;
							it = Math.max(it, f * strength);
						}
					}

					for (i = 0; i < ripples.length; i++) {
						var r = ripples[i];
						var age = (now - r.t) / 1400;
						var rad = age * 900;
						dx = gx - r.x; dy = gy - r.y;
						d = Math.sqrt(dx * dx + dy * dy) || 1;
						var band = (d - rad) / 70;
						if (band > -2.5 && band < 2.5) {
							var g = Math.exp(-band * band) * (1 - age);
							ox += dx / d * g * 14;
							oy += dy / d * g * 14;
							it = Math.max(it, g * 0.9);
						}
					}

					px[k] = gx + ox;
					py[k] = gy + oy;
					inten[k] = it;
				}
			}

			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, vw, vh);

			/* mesh lines between lit neighbours (4 alpha buckets) */
			var buckets = [[], [], [], []];
			for (y = 0; y < rows; y++) {
				for (x = 0; x < cols; x++) {
					k = y * cols + x;
					if (inten[k] < 0.04) continue;
					if (x + 1 < cols && inten[k + 1] >= 0.04) {
						buckets[Math.min(3, (Math.min(inten[k], inten[k + 1]) * 4) | 0)].push(k, k + 1);
					}
					if (y + 1 < rows && inten[k + cols] >= 0.04) {
						buckets[Math.min(3, (Math.min(inten[k], inten[k + cols]) * 4) | 0)].push(k, k + cols);
					}
				}
			}
			ctx.lineWidth = 1;
			for (i = 0; i < 4; i++) {
				var list = buckets[i];
				if (!list.length) continue;
				ctx.strokeStyle = 'rgba(' + accent + ',' + (0.08 + i * 0.09) + ')';
				ctx.beginPath();
				for (var j = 0; j < list.length; j += 2) {
					ctx.moveTo(px[list[j]], py[list[j]]);
					ctx.lineTo(px[list[j + 1]], py[list[j + 1]]);
				}
				ctx.stroke();
			}

			/* base dots */
			ctx.fillStyle = 'rgba(' + ink + ',' + baseAlpha + ')';
			ctx.beginPath();
			for (k = 0; k < px.length; k++) {
				if (inten[k] >= 0.04) continue;
				ctx.rect(px[k] - 0.75, py[k] - 0.75, 1.5, 1.5);
			}
			ctx.fill();

			/* lit dots */
			for (i = 0; i < 4; i++) {
				ctx.fillStyle = 'rgba(' + accent + ',' + (0.35 + i * 0.2) + ')';
				ctx.beginPath();
				var size = 1.6 + i * 0.5;
				for (k = 0; k < px.length; k++) {
					if (inten[k] < 0.04 || Math.min(3, (inten[k] * 4) | 0) !== i) continue;
					ctx.rect(px[k] - size / 2, py[k] - size / 2, size, size);
				}
				ctx.fill();
			}
		}

		refreshColours();
		resize();

		return {
			draw: draw,
			resize: resize,
			ripple: ripple,
			refreshColours: refreshColours
		};
	})();

	setTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

	/* ---------- Custom cursor ----------------------------------- */
	var cursor = document.getElementById('cursor');
	var cursorDot = cursor && cursor.querySelector('.cursor-dot');
	var cursorRing = cursor && cursor.querySelector('.cursor-ring');
	var ring = { x: pointer.x, y: pointer.y };
	var useCursor = finePointer && !reduceMotion && cursor;
	if (useCursor) root.classList.add('has-cursor');

	var HOVER_SEL = 'a, button, [data-magnetic], .tags li, .stack-row';

	window.addEventListener('pointermove', function (e) {
		if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
		pointer.x = e.clientX;
		pointer.y = e.clientY;
		if (!pointer.active) {
			pointer.active = true;
			if (!pointer.moved) { pointer.sx = ring.x = e.clientX; pointer.sy = ring.y = e.clientY; }
			pointer.moved = true;
			if (useCursor) cursor.classList.add('is-visible');
		}
		if (useCursor) cursorDot.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
	}, { passive: true });

	document.addEventListener('pointerleave', function () {
		pointer.active = false;
		if (useCursor) cursor.classList.remove('is-visible');
	});
	document.documentElement.addEventListener('mouseleave', function () {
		pointer.active = false;
		if (useCursor) cursor.classList.remove('is-visible');
	});

	document.addEventListener('pointerover', function (e) {
		if (!useCursor) return;
		cursor.classList.toggle('is-hover', !!e.target.closest(HOVER_SEL));
	});
	window.addEventListener('pointerdown', function (e) {
		if (useCursor) cursor.classList.add('is-down');
		if (!e.target.closest('a, button')) field.ripple(e.clientX, e.clientY);
	}, { passive: true });
	window.addEventListener('pointerup', function () {
		if (useCursor) cursor.classList.remove('is-down');
	}, { passive: true });

	/* ---------- Magnetic + tilt elements ------------------------ */
	var springs = [];

	function addSpring(el, onMove, apply) {
		var s = { el: el, x: 0, y: 0, tx: 0, ty: 0, apply: apply, live: false };
		el.addEventListener('pointermove', function (e) {
			if (e.pointerType !== 'mouse') return;
			var r = el.getBoundingClientRect();
			var nx = (e.clientX - r.left) / r.width - 0.5;
			var ny = (e.clientY - r.top) / r.height - 0.5;
			onMove(s, nx, ny, r);
			s.live = true;
		});
		el.addEventListener('pointerleave', function () { s.tx = 0; s.ty = 0; s.live = true; });
		springs.push(s);
	}

	if (finePointer && !reduceMotion) {
		Array.prototype.forEach.call(document.querySelectorAll('[data-magnetic]'), function (el) {
			addSpring(el, function (s, nx, ny, r) {
				s.tx = nx * Math.min(r.width * 0.3, 18);
				s.ty = ny * Math.min(r.height * 0.5, 12);
			}, function (s) {
				s.el.style.transform = 'translate3d(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px,0)';
			});
		});

		Array.prototype.forEach.call(document.querySelectorAll('[data-tilt]'), function (el) {
			addSpring(el, function (s, nx, ny) {
				s.tx = nx * 10;
				s.ty = -ny * 10;
			}, function (s) {
				s.el.style.transform = 'perspective(900px) rotateY(' + s.x.toFixed(2) + 'deg) rotateX(' + s.y.toFixed(2) + 'deg)';
			});
		});
	}

	/* spotlight position on cards */
	Array.prototype.forEach.call(document.querySelectorAll('[data-spotlight]'), function (el) {
		el.addEventListener('pointermove', function (e) {
			var r = el.getBoundingClientRect();
			el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
			el.style.setProperty('--my', (e.clientY - r.top) + 'px');
		});
	});

	/* ---------- Exploded device --------------------------------- */
	var device = document.getElementById('device');
	var layers = device ? Array.prototype.slice.call(device.querySelectorAll('.layer')) : [];
	var anchors = layers.map(function (l) { return l.querySelector('.layer-anchor'); });
	var callouts = device ? Array.prototype.slice.call(device.querySelectorAll('.callout')) : [];
	var calloutLines = callouts.map(function (c) { return c.querySelector('.callout-line'); });
	var calloutTexts = callouts.map(function (c) { return c.querySelector('.callout-text'); });
	var calloutTextW = 0;

	function measureCallouts() {
		calloutTextW = 0;
		calloutTexts.forEach(function (t) { calloutTextW = Math.max(calloutTextW, t.offsetWidth); });
	}
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureCallouts);
	measureCallouts();

	/* read each layer's projected anchor, then line up the callouts in one column */
	function placeCallouts() {
		if (!device || !dev.visible || !callouts.length || vw <= 720) return;
		var wr = device.getBoundingClientRect();
		var pts = anchors.map(function (a) {
			var r = a.getBoundingClientRect();
			return { x: r.left - wr.left, y: r.top - wr.top };
		});
		var maxX = 0;
		pts.forEach(function (p) { maxX = Math.max(maxX, p.x); });
		var column = Math.min(maxX + 36, wr.width - calloutTextW - 20);
		pts.forEach(function (p, i) {
			var len = Math.max(14, column - p.x);
			callouts[i].style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,0)';
			calloutLines[i].style.width = len.toFixed(1) + 'px';
		});
	}

	var dev = { rx: 56, rz: -34, gap: 0, trx: 56, trz: -34, tgap: 0, visible: true, hover: false, ready: false };

	if (device) {
		setTimeout(function () { dev.ready = true; }, reduceMotion ? 0 : 450);
		device.addEventListener('pointerenter', function () { dev.hover = true; device.classList.add('is-hot'); });
		device.addEventListener('pointerleave', function () { dev.hover = false; device.classList.remove('is-hot'); });

		if ('IntersectionObserver' in window) {
			new IntersectionObserver(function (entries) {
				dev.visible = entries[0].isIntersecting;
			}).observe(device);
		}

		/* data flows up through the layers: Data → Domain → ViewModel → View */
		if (!reduceMotion) {
			var lit = 0;
			setInterval(function () {
				if (!dev.visible || document.hidden) return;
				layers.forEach(function (l, i) { l.classList.toggle('is-lit', i === lit); });
				callouts.forEach(function (c, i) { c.classList.toggle('is-lit', i === lit); });
				lit = (lit + 1) % (layers.length + 1);
			}, 900);
		}
	}

	function updateDevice(now, dt) {
		if (!device || !dev.visible) return;
		var heroProgress = clamp(scrollY / (vh * 0.9), 0, 1);
		var t = now / 1000;

		if (reduceMotion) {
			dev.trx = 56; dev.trz = -34; dev.tgap = 64;
		} else if (finePointer && pointer.moved) {
			var nx = pointer.x / vw - 0.5;
			var ny = pointer.y / vh - 0.5;
			dev.trx = 56 - ny * 12;
			dev.trz = -34 + nx * 16;
			dev.tgap = dev.ready ? (dev.hover ? 88 : 64) + Math.sin(t * 1.2) * 3 : 0;
		} else {
			dev.trx = 56 + Math.sin(t * 0.6) * 3;
			dev.trz = -34 + Math.sin(t * 0.4) * 6;
			dev.tgap = dev.ready ? 64 + Math.sin(t * 1.2) * 3 : 0;
		}
		dev.tgap += heroProgress * 50;
		dev.trx -= heroProgress * 10;

		var k = reduceMotion ? 1 : damp(dev.ready && dev.gap < 1 ? 2.5 : 5, dt);
		dev.rx = lerp(dev.rx, dev.trx, k);
		dev.rz = lerp(dev.rz, dev.trz, k);
		dev.gap = lerp(dev.gap, dev.tgap, reduceMotion ? 1 : damp(3.2, dt));

		device.style.setProperty('--rx', dev.rx.toFixed(2) + 'deg');
		device.style.setProperty('--rz', dev.rz.toFixed(2) + 'deg');
		device.style.setProperty('--gap', dev.gap.toFixed(2) + 'px');
		device.style.setProperty('--label', clamp((dev.gap - 24) / 36, 0, 1).toFixed(3));
	}

	/* ---------- Nav: hide on scroll + active pill -------------- */
	var nav = document.getElementById('nav');
	var navPill = document.getElementById('navPill');
	var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
	var navTargets = navLinks.map(function (a) { return document.querySelector(a.getAttribute('href')); });
	var activeLink = null;
	var lastDir = 0;

	function updateNav() {
		var delta = scrollY - lastScrollY;
		if (scrollY < 160) nav.classList.remove('is-hidden');
		else if (delta > 4 && lastDir !== 1) { nav.classList.add('is-hidden'); lastDir = 1; }
		else if (delta < -4 && lastDir !== -1) { nav.classList.remove('is-hidden'); lastDir = -1; }

		var current = null;
		for (var i = 0; i < navTargets.length; i++) {
			if (navTargets[i] && navTargets[i].getBoundingClientRect().top < vh * 0.45) current = navLinks[i];
		}
		if (current !== activeLink) {
			if (activeLink) activeLink.classList.remove('is-active');
			activeLink = current;
			if (current) {
				current.classList.add('is-active');
				navPill.style.width = current.offsetWidth + 'px';
				navPill.style.transform = 'translateX(' + current.parentElement.offsetLeft + 'px)';
				navPill.style.opacity = '1';
			} else {
				navPill.style.opacity = '0';
			}
		}
	}

	/* ---------- Timeline progress ------------------------------- */
	var timeline = document.getElementById('timeline');
	var timelineFill = document.getElementById('timelineFill');
	var tlItems = timeline ? Array.prototype.slice.call(timeline.querySelectorAll('.tl')) : [];

	function updateTimeline() {
		if (!timeline) return;
		var r = timeline.getBoundingClientRect();
		if (r.bottom < -100 || r.top > vh + 100) return;
		var mark = vh * 0.6;
		timelineFill.style.setProperty('--p', clamp((mark - r.top) / r.height, 0, 1).toFixed(4));
		tlItems.forEach(function (li) {
			li.classList.toggle('is-passed', li.getBoundingClientRect().top + 12 < mark);
		});
	}

	/* ---------- Main loop --------------------------------------- */
	var last = performance.now();

	function frame(now) {
		var dt = Math.min((now - last) / 1000, 0.05);
		last = now;

		/* layout reads first, before this frame's style writes */
		placeCallouts();

		if (lenis) lenis.raf(now);
		scrollY = window.scrollY;

		/* smoothed pointer for the field and ring */
		var pk = damp(14, dt);
		pointer.sx = lerp(pointer.sx, pointer.x, pk);
		pointer.sy = lerp(pointer.sy, pointer.y, pk);

		if (useCursor) {
			var rk = damp(18, dt);
			ring.x = lerp(ring.x, pointer.x, rk);
			ring.y = lerp(ring.y, pointer.y, rk);
			cursorRing.style.transform = 'translate3d(' + ring.x.toFixed(2) + 'px,' + ring.y.toFixed(2) + 'px,0)';
		}

		field.draw(now, dt);
		updateDevice(now, dt);

		var sk = damp(10, dt);
		for (var i = 0; i < springs.length; i++) {
			var s = springs[i];
			if (!s.live) continue;
			s.x = lerp(s.x, s.tx, sk);
			s.y = lerp(s.y, s.ty, sk);
			if (Math.abs(s.x - s.tx) < 0.01 && Math.abs(s.y - s.ty) < 0.01) {
				s.x = s.tx; s.y = s.ty;
				if (s.tx === 0 && s.ty === 0) s.live = false;
			}
			s.apply(s);
		}

		if (scrollY !== lastScrollY) {
			updateNav();
			updateTimeline();
			lastScrollY = scrollY;
		}

		requestAnimationFrame(frame);
	}

	window.addEventListener('resize', function () {
		vw = window.innerWidth;
		vh = window.innerHeight;
		field.resize();
		measureCallouts();
		lastScrollY = -1;
		activeLink = null;
	});

	updateNav();
	updateTimeline();
	requestAnimationFrame(frame);
})();
