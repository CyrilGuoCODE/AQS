(function () {
    var KEY = 'aqs-theme';
    var META_COLORS = { light: '#f6f8fb', dark: '#0a111a' };
    var switchingTimer = null;

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function syncMeta(theme) {
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', META_COLORS[theme] || META_COLORS.light);
        }
    }

    function applyTheme(theme, animate) {
        var root = document.documentElement;

        if (animate && !prefersReducedMotion()) {
            root.classList.add('theme-switching');
            window.clearTimeout(switchingTimer);
            switchingTimer = window.setTimeout(function () {
                root.classList.remove('theme-switching');
            }, 360);
        }

        root.setAttribute('data-theme', theme);
        syncMeta(theme);

        var label = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
        document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
        });
    }

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    document.addEventListener('DOMContentLoaded', function () {
        applyTheme(currentTheme(), false);

        document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
            button.addEventListener('click', function () {
                var next = currentTheme() === 'dark' ? 'light' : 'dark';
                try {
                    localStorage.setItem(KEY, next);
                } catch (e) {}
                applyTheme(next, true);
            });
        });
    });
})();
