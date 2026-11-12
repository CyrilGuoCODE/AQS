document.addEventListener('DOMContentLoaded', function () {
    let reservedStudents = [];
    let maxParents = 10;

    function loadSettings() {
        if (typeof initialMaxParents !== 'undefined') {
            maxParents = initialMaxParents;
            const input = document.getElementById('max-parents');
            if (input) {
                input.value = maxParents;
            }
        }
        if (typeof initialReservedStudents !== 'undefined' && Array.isArray(initialReservedStudents)) {
            reservedStudents = initialReservedStudents;
            renderReservedList();
        }
    }

    function renderReservedList() {
        const container = document.getElementById('reserved-list-container');
        if (!container) {
            return;
        }

        if (reservedStudents.length === 0) {
            container.innerHTML = '<p class="empty-hint">暂无提前预约名单</p>';
            return;
        }

        container.innerHTML = '';
        reservedStudents.forEach((name, index) => {
            const item = document.createElement('div');
            item.className = 'reserved-item';
            item.innerHTML = `
                <span class="reserved-name">${escapeHtml(name)}</span>
                <button class="btn btn-sm btn-danger remove-btn" data-index="${index}">
                    <svg class="icon"><use href="#i-trash"></use></svg>删除
                </button>
            `;
            container.appendChild(item);
        });

        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const index = parseInt(this.getAttribute('data-index'), 10);
                reservedStudents.splice(index, 1);
                renderReservedList();
            });
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function addReservedParent() {
        const input = document.getElementById('parent-name-input');
        const classSelect = document.getElementById('class-select');
        if (!input || !classSelect) {
            return;
        }
        const name = input.value.trim();
        const className = classSelect.value;

        if (!className) {
            showToast('请选择班级');
            return;
        }
        if (!name) {
            showToast('请输入学生姓名');
            return;
        }

        const nameLimit = typeof maxReservedStudents !== 'undefined' ? maxReservedStudents : 100;
        if (reservedStudents.length >= nameLimit) {
            showToast(`名单最多 ${nameLimit} 人`);
            return;
        }

        const fullName = className + name;
        if (reservedStudents.includes(fullName)) {
            showToast('该学生已在名单中');
            return;
        }

        reservedStudents.push(fullName);
        input.value = '';
        classSelect.value = '';
        renderReservedList();
    }

    function saveSettings() {
        const input = document.getElementById('max-parents');
        maxParents = parseInt(input ? input.value : initialMaxParents, 10);

        const limit = typeof maxParentsLimit !== 'undefined' ? maxParentsLimit : 20;
        if (isNaN(maxParents) || maxParents < 1 || maxParents > limit) {
            showToast(`请输入 1 到 ${limit} 之间的家长数量`);
            return;
        }

        fetch('/teacher/setting/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({maxParents: maxParents, reservedStudents: reservedStudents})
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast('设置保存成功');
                } else {
                    showToast(data.message || '设置保存失败，请稍后重试');
                }
            })
            .catch(() => {
                showToast('设置保存失败，请检查网络后重试');
            });
    }

    function loadClasses() {
        const select = document.getElementById('class-select');
        if (!select) {
            return;
        }
        fetch('/get_classes')
            .then(response => response.json())
            .then(data => {
                select.innerHTML = '<option value="">请选择班级</option>';
                (data.classes || []).forEach(className => {
                    const option = document.createElement('option');
                    option.value = className;
                    option.textContent = className;
                    select.appendChild(option);
                });
            })
            .catch(() => {
                select.innerHTML = '<option value="">请选择班级</option>';
            });
    }

    loadSettings();
    loadClasses();

    const addBtn = document.getElementById('add-parent-btn');
    const nameInput = document.getElementById('parent-name-input');
    if (addBtn) {
        addBtn.addEventListener('click', addReservedParent);
    }
    if (nameInput) {
        nameInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                addReservedParent();
            }
        });
    }
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveSettings);
    }
});
