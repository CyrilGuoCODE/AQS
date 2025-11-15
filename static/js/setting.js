let reservedStudents = [];
let maxParents = 10;

function loadSettings() {
    if (typeof initialMaxParents !== 'undefined') {
        maxParents = initialMaxParents;
        document.getElementById('max-parents').value = maxParents;
    }
    
    if (typeof initialReservedStudents !== 'undefined' && Array.isArray(initialReservedStudents)) {
        reservedStudents = initialReservedStudents;
        renderReservedList();
    }
}

function renderReservedList() {
    const container = document.getElementById('reserved-list-container');
    
    if (reservedStudents.length === 0) {
        container.innerHTML = '<p class="empty-hint">暂无提前预约名单</p>';
        return;
    }
    
    container.innerHTML = '';
    reservedStudents.forEach((name, index) => {
        const item = document.createElement('div');
        item.className = 'reserved-item';
        item.innerHTML = `
            <span class="reserved-name">${name}</span>
            <button class="remove-btn" data-index="${index}">删除</button>
        `;
        container.appendChild(item);
    });
    
    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'), 10);
            reservedStudents.splice(index, 1);
            renderReservedList();
        });
    });
}

function addReservedParent() {
    const input = document.getElementById('parent-name-input');
    const classSelect = document.getElementById('class-select');
    const name = input.value.trim();
    const className = classSelect.value.trim();
    
    if (!name) {
        alert('请输入学生姓名');
        return;
    }
    
    if (!className) {
        alert('请选择班级');
        return;
    }
    
    const fullName = className + name;
    
    if (reservedStudents.includes(fullName)) {
        alert('该学生已在名单中');
        return;
    }
    
    reservedStudents.push(fullName);
    input.value = '';
    classSelect.value = '';
    renderReservedList();
}

function saveSettings() {
    maxParents = parseInt(document.getElementById('max-parents').value, 10);
    
    if (isNaN(maxParents) || maxParents < 1) {
        alert('请输入有效的家长数量');
        return;
    }
    
    const settingsData = {
        maxParents: maxParents,
        reservedStudents: reservedStudents
    };
    
    fetch('/teacher/setting/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settingsData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('设置保存成功');
            window.location.reload();
        } else {
            alert(data.message || '设置保存失败，请稍后重试');
        }
    })
    .catch(() => {
        alert('设置保存失败，请检查网络后重试');
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    
    document.getElementById('add-parent-btn').addEventListener('click', addReservedParent);
    
    document.getElementById('parent-name-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addReservedParent();
        }
    });
    
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
});

