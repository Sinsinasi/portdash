/**
 * App.js - Main application controller
 * Handles navigation, modals, toasts, and utility functions.
 */
const App = (function () {
    'use strict';

    // ── Navigation ──────────────────────────────────────────────────────

    const PAGES = ['home', 'notes', 'trading', 'youtube', 'finances'];

    function navigateTo(page) {
        if (!PAGES.includes(page)) {
            page = 'home';
        }

        // Toggle sidebar visibility for home page
        if (page === 'home') {
            document.body.classList.add('on-home');
        } else {
            document.body.classList.remove('on-home');
        }

        // Update nav links
        document.querySelectorAll('.nav-link[data-page]').forEach(function (link) {
            if (link.getAttribute('data-page') === page) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Update page sections
        document.querySelectorAll('.page').forEach(function (section) {
            section.classList.remove('active');
        });

        var target = document.getElementById(page + '-page');
        if (target) {
            target.classList.add('active');
        }

        // 3D home scene lifecycle
        if (typeof Home3D !== 'undefined') {
            if (page === 'home') {
                Home3D.init();
            } else {
                Home3D.destroy();
            }
        }

        // Update hash without triggering hashchange
        if (window.location.hash !== '#' + page) {
            history.pushState(null, '', '#' + page);
        }
    }

    function getPageFromHash() {
        var hash = window.location.hash.replace('#', '');
        return PAGES.includes(hash) ? hash : 'home';
    }

    function initNavigation() {
        // Click handlers on nav links
        document.querySelectorAll('.nav-link[data-page]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                navigateTo(link.getAttribute('data-page'));
            });
        });

        // Logo click → go home
        var logo = document.querySelector('.logo');
        if (logo) {
            logo.style.cursor = 'pointer';
            logo.addEventListener('click', function () {
                navigateTo('home');
            });
        }

        // Browser back/forward
        window.addEventListener('popstate', function () {
            navigateTo(getPageFromHash());
        });

        // Initial page load
        navigateTo(getPageFromHash());
    }

    // ── Modals ──────────────────────────────────────────────────────────

    function showModal(modalId) {
        var modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }

    function closeModal(modalId) {
        var modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('closing');
            setTimeout(function () {
                modal.classList.remove('active', 'closing');
            }, 220);
        }
    }

    function animateCloseModal(modal) {
        if (!modal || modal.classList.contains('closing')) return;
        modal.classList.add('closing');
        setTimeout(function () {
            modal.classList.remove('active', 'closing');
        }, 220);
    }

    function initModals() {
        // Close buttons inside modals
        document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var modal = btn.closest('.modal');
                if (modal) animateCloseModal(modal);
            });
        });

        // Click on backdrop (the modal overlay itself) to close
        document.querySelectorAll('.modal').forEach(function (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) animateCloseModal(modal);
            });
        });

        // Escape key closes any open modal
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(function (modal) {
                    animateCloseModal(modal);
                });
            }
        });
    }

    // ── Toast Notifications ─────────────────────────────────────────────

    function toast(message, type) {
        type = type || 'info';

        var container = document.getElementById('toast-container');
        if (!container) {
            return;
        }

        var el = document.createElement('div');
        el.className = 'toast toast-' + type;
        el.textContent = message;

        container.appendChild(el);

        setTimeout(function () {
            el.classList.add('hiding');
            setTimeout(function () {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }, 350);
        }, 3000);
    }

    // ── Utilities ───────────────────────────────────────────────────────

    var idCounter = 0;

    function generateId() {
        idCounter++;
        return Date.now().toString(36) + '-' + idCounter.toString(36) + '-' + Math.random().toString(36).substring(2, 8);
    }

    function formatCurrency(amount) {
        var num = Number(amount);
        if (isNaN(num)) {
            return '$0.00';
        }
        return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function formatDate(dateStr) {
        if (!dateStr) {
            return '';
        }
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // Handle YYYY-MM-DD directly to avoid timezone offset issues
        var parts = dateStr.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
            var monthIdx = parseInt(parts[1], 10) - 1;
            var day = parseInt(parts[2], 10);
            return months[monthIdx] + ' ' + day + ', ' + parts[0];
        }
        // Fallback for ISO or other date formats
        var date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return '';
        }
        return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
    }

    function formatNumber(num) {
        num = Number(num);
        if (isNaN(num)) {
            return '0';
        }
        var abs = Math.abs(num);
        var sign = num < 0 ? '-' : '';

        if (abs >= 1e9) {
            return sign + (abs / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
        }
        if (abs >= 1e6) {
            return sign + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        if (abs >= 1e3) {
            return sign + (abs / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return sign + abs.toString();
    }

    // ── Sidebar Clock ────────────────────────────────────────────────────

    function startClock() {
        var clockEl = document.getElementById('sidebar-clock');
        if (!clockEl) return;

        function updateClock() {
            var now = new Date();
            var hours = String(now.getHours()).padStart(2, '0');
            var minutes = String(now.getMinutes()).padStart(2, '0');
            var seconds = String(now.getSeconds()).padStart(2, '0');
            var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var day = now.getDate();
            var month = months[now.getMonth()];
            clockEl.innerHTML = hours + ':' + minutes + ':' + seconds + '<br>' + month + ' ' + day;
        }

        updateClock();
        setInterval(updateClock, 1000);
    }

    // ── Keyboard Shortcuts ───────────────────────────────────────────────

    function initKeyboardShortcuts() {
        document.addEventListener('keydown', function (e) {
            // Skip if a modal is open
            var openModal = document.querySelector('.modal.active');
            if (openModal) return;

            // Skip if an input or textarea is focused
            var tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            var key = e.key;

            if (key === '1') {
                navigateTo('notes');
            } else if (key === '2') {
                navigateTo('trading');
            } else if (key === '3') {
                navigateTo('youtube');
            } else if (key === '4') {
                navigateTo('finances');
            } else if (key === 'h' || key === '0') {
                navigateTo('home');
            }
        });
    }

    // ── Button Ripple Effect ────────────────────────────────────────────

    function initRipple() {
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('.btn');
            if (!btn) return;
            var rect = btn.getBoundingClientRect();
            var ripple = document.createElement('span');
            ripple.className = 'ripple';
            var size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
            btn.appendChild(ripple);
            ripple.addEventListener('animationend', function () {
                if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
            });
        });
    }

    // ── Card Spotlight (mouse-following glow) ─────────────────────────

    function initCardSpotlight() {
        document.addEventListener('mousemove', function (e) {
            var cards = document.querySelectorAll('.note-card, .channel-card, .stat-card');
            for (var i = 0; i < cards.length; i++) {
                var rect = cards[i].getBoundingClientRect();
                var x = ((e.clientX - rect.left) / rect.width) * 100;
                var y = ((e.clientY - rect.top) / rect.height) * 100;
                cards[i].style.setProperty('--mouse-x', x + '%');
                cards[i].style.setProperty('--mouse-y', y + '%');
            }
        });
    }

    // ── Keyboard Shortcut Hints on Sidebar ────────────────────────────

    function initShortcutHints() {
        var shortcuts = { notes: '1', trading: '2', youtube: '3', finances: '4' };
        var links = document.querySelectorAll('.nav-link[data-page]');
        for (var i = 0; i < links.length; i++) {
            var page = links[i].getAttribute('data-page');
            if (shortcuts[page]) {
                var hint = document.createElement('span');
                hint.className = 'shortcut-hint';
                hint.textContent = shortcuts[page];
                links[i].appendChild(hint);
            }
        }
    }

    // ── Initialisation ──────────────────────────────────────────────────

    function init() {
        initNavigation();
        initModals();
        startClock();
        initKeyboardShortcuts();
        initRipple();
        initCardSpotlight();
        initShortcutHints();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Public API ──────────────────────────────────────────────────────

    return {
        showModal: showModal,
        closeModal: closeModal,
        toast: toast,
        generateId: generateId,
        formatCurrency: formatCurrency,
        formatDate: formatDate,
        formatNumber: formatNumber,
        navigateTo: navigateTo
    };
})();
