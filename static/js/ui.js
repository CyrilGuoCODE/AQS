(function () {
    var toastTimer = null;

    window.showToast = function (message) {
        var toast = document.getElementById('aqs-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'aqs-toast';
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.classList.remove('show');
        }, 2600);
    };
})();

(function () {
    var startX = 0;
    var startY = 0;
    var tracking = false;

    document.addEventListener('touchstart', function (event) {
        if (event.touches.length !== 1 || !document.querySelector('.topbar')) {
            tracking = false;
            return;
        }
        var touch = event.touches[0];
        if (touch.clientX > 28) {
            tracking = false;
            return;
        }
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
    }, { passive: true });

    document.addEventListener('touchend', function (event) {
        if (!tracking) {
            return;
        }
        tracking = false;
        var touch = event.changedTouches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;
        if (dx < 64 || Math.abs(dy) > 48) {
            return;
        }
        if (window.history.length > 1 && document.referrer.indexOf(window.location.origin) === 0) {
            window.history.back();
        }
    }, { passive: true });
})();

