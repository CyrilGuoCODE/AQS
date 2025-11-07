document.getElementById('key-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        checkKey();
    }
});

document.getElementById('key-submit-btn').addEventListener('click', checkKey);

function checkKey() {
    const keyInput = document.getElementById('key-input');
    const keyError = document.getElementById('key-error');
    const key = keyInput.value.trim();

    keyError.textContent = '';

    if (!key) {
        keyError.textContent = '请输入密钥';
        return;
    }

    fetch('/verify-key', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: key })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (data.role === 'parent') {
                window.location.href = '/parent';
            } else if (data.role === 'teacher') {
                window.location.href = '/teacher';
            }
        } else {
            keyError.textContent = data.message || '密钥错误，请重新输入';
            keyInput.value = '';
        }
    })
    .catch(error => {
        keyError.textContent = '验证失败，请重试';
        keyInput.value = '';
    });
}
