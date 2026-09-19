(function () {
	'use strict';

	var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var isTouch = window.matchMedia('(pointer: coarse)').matches;

	/* ---------- Scroll progress bar ---------------------------- */
	var progressBar = document.getElementById('scrollProgress');

	function updateProgress() {
		var doc = document.documentElement;
		var scrollTop = doc.scrollTop || document.body.scrollTop;
		var scrollHeight = doc.scrollHeight - doc.clientHeight;
		var pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
		if (progressBar) progressBar.style.width = pct + '%';
	}

	/* ---------- Scroll reveal (staggered) ----------------------- */
	var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

	revealEls.forEach(function (el) {
		var siblings = Array.prototype.filter.call(el.parentElement.children, function (c) {
			return c.classList.contains('reveal');
		});
		var idx = siblings.indexOf(el);
		el.style.setProperty('--reveal-delay', Math.min(idx, 6) * 0.08 + 's');
	});

	if ('IntersectionObserver' in window && revealEls.length) {
		var revealObserver = new IntersectionObserver(function (entries, obs) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					obs.unobserve(entry.target);
				}
			});
		}, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

		revealEls.forEach(function (el) { revealObserver.observe(el); });
	} else {
		revealEls.forEach(function (el) { el.classList.add('is-visible'); });
	}

	/* ---------- Nav scrollspy ------------------------------------ */
	var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[data-nav]'));
	var navSections = navLinks
		.map(function (link) {
			var id = link.getAttribute('href').slice(1);
			return { link: link, section: document.getElementById(id) };
		})
		.filter(function (item) { return item.section; });

	if ('IntersectionObserver' in window && navSections.length) {
		var navObserver = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				var match = navSections.filter(function (item) { return item.section === entry.target; })[0];
				if (!match) return;
				if (entry.isIntersecting) {
					navLinks.forEach(function (l) { l.classList.remove('is-active'); });
					match.link.classList.add('is-active');
				}
			});
		}, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

		navSections.forEach(function (item) { navObserver.observe(item.section); });
	}

	/* ---------- Count-up numbers ---------------------------------- */
	var countEls = Array.prototype.slice.call(document.querySelectorAll('[data-count-to]'));

	function animateCount(el) {
		var target = parseInt(el.getAttribute('data-count-to'), 10) || 0;
		if (prefersReducedMotion) {
			el.textContent = target;
			return;
		}
		var duration = 1100;
		var start = null;

		function step(timestamp) {
			if (start === null) start = timestamp;
			var progress = Math.min((timestamp - start) / duration, 1);
			var eased = 1 - Math.pow(1 - progress, 3);
			el.textContent = Math.round(eased * target);
			if (progress < 1) {
				requestAnimationFrame(step);
			} else {
				el.textContent = target;
			}
		}
		el.classList.add('is-counting');
		requestAnimationFrame(step);
	}

	if ('IntersectionObserver' in window && countEls.length) {
		var countObserver = new IntersectionObserver(function (entries, obs) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) {
					animateCount(entry.target);
					obs.unobserve(entry.target);
				}
			});
		}, { threshold: 0.6 });

		countEls.forEach(function (el) { countObserver.observe(el); });
	} else {
		countEls.forEach(function (el) { el.textContent = el.getAttribute('data-count-to'); });
	}

	/* ---------- Journey path draw + active markers ----------------- */
	var journeyTrack = document.getElementById('journeyTrack');
	var journeyPath = document.getElementById('journeyPath');
	var journeyLineSvg = document.querySelector('.journey-line');
	var journeyItems = Array.prototype.slice.call(document.querySelectorAll('[data-journey-item]'));
	var pathLength = 0;

	function positionJourneyLine() {
		if (!journeyTrack || !journeyLineSvg || journeyItems.length < 2) return;
		var trackRect = journeyTrack.getBoundingClientRect();
		var firstMarker = journeyItems[0].querySelector('.journey-marker');
		var lastMarker = journeyItems[journeyItems.length - 1].querySelector('.journey-marker');
		if (!firstMarker || !lastMarker) return;
		var firstRect = firstMarker.getBoundingClientRect();
		var lastRect = lastMarker.getBoundingClientRect();
		var top = (firstRect.top + firstRect.height / 2) - trackRect.top;
		var bottom = (lastRect.top + lastRect.height / 2) - trackRect.top;
		journeyLineSvg.style.top = top + 'px';
		journeyLineSvg.style.height = Math.max(bottom - top, 0) + 'px';
	}

	function setupJourneyPath() {
		if (!journeyPath) return;
		positionJourneyLine();
		pathLength = journeyPath.getTotalLength();
		journeyPath.style.strokeDasharray = pathLength;
		journeyPath.style.strokeDashoffset = pathLength;
	}

	function updateJourney() {
		if (!journeyTrack || !journeyPath) return;

		var rect = journeyTrack.getBoundingClientRect();
		var windowHeight = window.innerHeight;
		var progress = (windowHeight - rect.top) / (rect.height + windowHeight);
		progress = Math.max(0, Math.min(1, progress));

		journeyPath.style.strokeDashoffset = pathLength * (1 - progress);

		var activeThreshold = windowHeight * 0.68;
		journeyItems.forEach(function (item) {
			var marker = item.querySelector('.journey-marker');
			if (!marker) return;
			var markerRect = marker.getBoundingClientRect();
			var markerCenter = markerRect.top + markerRect.height / 2;
			if (markerCenter < activeThreshold) {
				item.classList.add('is-active');
			} else {
				item.classList.remove('is-active');
			}
		});
	}

	/* ---------- rAF-throttled scroll handler ------------------------ */
	var ticking = false;
	function onScroll() {
		if (!ticking) {
			requestAnimationFrame(function () {
				updateProgress();
				updateJourney();
				ticking = false;
			});
			ticking = true;
		}
	}

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', function () {
		setupJourneyPath();
		updateJourney();
	});

	setupJourneyPath();
	updateProgress();
	updateJourney();

	/* ---------- Button ripple -------------------------------------- */
	document.querySelectorAll('.btn').forEach(function (btn) {
		btn.addEventListener('click', function (e) {
			var rect = btn.getBoundingClientRect();
			var size = Math.max(rect.width, rect.height) * 2;
			var ripple = document.createElement('span');
			ripple.className = 'btn-ripple';
			ripple.style.width = ripple.style.height = size + 'px';
			ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
			ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
			btn.appendChild(ripple);
			ripple.addEventListener('animationend', function () { ripple.remove(); });
		});
	});

	/* ---------- Magnetic buttons ------------------------------------ */
	if (!isTouch && !prefersReducedMotion) {
		document.querySelectorAll('.magnetic').forEach(function (btn) {
			btn.addEventListener('mousemove', function (e) {
				var rect = btn.getBoundingClientRect();
				var x = e.clientX - rect.left - rect.width / 2;
				var y = e.clientY - rect.top - rect.height / 2;
				btn.style.transform = 'translate(' + (x * 0.22) + 'px, ' + (y * 0.35) + 'px)';
			});
			btn.addEventListener('mouseleave', function () {
				btn.style.transform = '';
			});
		});
	}

	/* ---------- Project card tilt ------------------------------------ */
	if (!isTouch && !prefersReducedMotion) {
		document.querySelectorAll('.tilt-card').forEach(function (card) {
			card.addEventListener('mousemove', function (e) {
				var rect = card.getBoundingClientRect();
				var x = (e.clientX - rect.left) / rect.width - 0.5;
				var y = (e.clientY - rect.top) / rect.height - 0.5;
				var rotateX = (-y * 6).toFixed(2);
				var rotateY = (x * 8).toFixed(2);
				card.style.transform =
					'perspective(900px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) translateY(-6px)';
			});
			card.addEventListener('mouseleave', function () {
				card.style.transform = '';
			});
		});

		var aboutPhoto = document.getElementById('aboutPhoto');
		if (aboutPhoto) {
			var photoCol = aboutPhoto.closest('.about-photo-col');
			photoCol.addEventListener('mousemove', function (e) {
				var rect = aboutPhoto.getBoundingClientRect();
				var x = (e.clientX - rect.left) / rect.width - 0.5;
				var y = (e.clientY - rect.top) / rect.height - 0.5;
				aboutPhoto.style.transform =
					'perspective(700px) rotateX(' + (-y * 8).toFixed(2) + 'deg) rotateY(' + (x * 10).toFixed(2) + 'deg)';
			});
			photoCol.addEventListener('mouseleave', function () {
				aboutPhoto.style.transform = '';
			});
		}
	}

	/* ---------- Back to top ------------------------------------------- */
	var backToTop = document.getElementById('backToTop');
	if (backToTop) {
		window.addEventListener('scroll', function () {
			if (window.scrollY > window.innerHeight * 0.8) {
				backToTop.classList.add('is-visible');
			} else {
				backToTop.classList.remove('is-visible');
			}
		}, { passive: true });

		backToTop.addEventListener('click', function () {
			window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
		});
	}
})();
