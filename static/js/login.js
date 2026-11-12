let currentRole = '';

function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const gradeValue = (params.get('grade') || '').trim();
    const keyValue = (params.get('key') || '').trim();

    const gradeSelect = document.getElementById('grade-select');
    const keyInput = document.getElementById('key-input');

    let gradeMatched = false;
    if (gradeValue && gradeSelect) {
        const matched = Array.from(gradeSelect.options).find(option => option.value === gradeValue);
        if (matched) {
            gradeSelect.value = matched.value;
            gradeMatched = true;
        }
    }

    if (keyValue && keyInput) {
        keyInput.value = keyValue;
    }

    if (gradeMatched && keyValue) {
        checkKey();
    } else if (keyValue && keyInput) {
        keyInput.focus();
    }
}

document.addEventListener('DOMContentLoaded', function () {
    applyUrlParams();

    document.getElementById('key-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            checkKey();
        }
    });

    document.getElementById('key-submit-btn').addEventListener('click', checkKey);
});

function checkKey() {
    const gradeSelect = document.getElementById('grade-select');
    const keyInput = document.getElementById('key-input');
    const keyError = document.getElementById('key-error');
    const grade = gradeSelect.value;
    const key = keyInput.value.trim();

    keyError.textContent = '';

    if (!grade) {
        keyError.textContent = '请选择年级';
        return;
    }

    if (!key) {
        keyError.textContent = '请输入密钥';
        return;
    }

    fetch('/verify-key', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({grade: grade, key: key})
    })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                keyError.textContent = data.message || '密钥错误，请重新输入';
                keyInput.value = '';
                return;
            }
            currentRole = data.role;
            gradeSelect.disabled = true;
            keyInput.disabled = true;
            document.getElementById('key-submit-btn').disabled = true;

            if (data.role === 'parent') {
                showParentForm();
            } else {
                showTeacherForm();
            }
        })
        .catch(() => {
            keyError.textContent = '验证失败，请重试';
            keyInput.value = '';
        });
}

function showParentForm() {
    const container = document.getElementById('additional-form-container');
    container.innerHTML = `
        <div class="form-stack form-stack-spaced">
            <select id="class-select" class="field" aria-label="选择班级">
                <option value="">请选择班级</option>
            </select>
            <input type="text" id="student-name-input" class="field" placeholder="请输入孩子姓名" autocomplete="off" aria-label="孩子姓名">
            <button id="student-name-submit-btn" class="btn btn-primary btn-block">确认</button>
        </div>
        <p id="student-name-error" class="error-message"></p>
    `;

    const nameInput = document.getElementById('student-name-input');
    nameInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            submitStudentName();
        }
    });
    document.getElementById('student-name-submit-btn').addEventListener('click', submitStudentName);

    loadClasses();
    nameInput.focus();
}

function showTeacherForm() {
    const container = document.getElementById('additional-form-container');
    container.innerHTML = `
        <div class="form-stack form-stack-spaced">
            <select id="teacher-select" class="field" aria-label="选择老师">
                <option value="">请选择老师</option>
            </select>
        </div>
        <p id="teacher-select-error" class="error-message"></p>
    `;

    loadTeachers();
    document.getElementById('teacher-select').addEventListener('change', submitTeacherSelect);
}

function submitStudentName() {
    const nameInput = document.getElementById('student-name-input');
    const classSelect = document.getElementById('class-select');
    const nameError = document.getElementById('student-name-error');
    const name = nameInput.value.trim();
    const className = classSelect.value;

    nameError.textContent = '';

    if (!name) {
        nameError.textContent = '请输入孩子姓名';
        return;
    }
    if (!className) {
        nameError.textContent = '请选择班级';
        return;
    }

    fetch('/handle', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: name, className: className})
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/parent';
            } else {
                nameError.textContent = data.message || '保存失败，请重试';
            }
        })
        .catch(() => {
            nameError.textContent = '登录失败，请重试';
        });
}

function loadTeachers() {
    fetch('/get_teachers')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('teacher-select');
            if (!select) {
                return;
            }
            select.innerHTML = '<option value="">请选择老师</option>';
            (Array.isArray(data) ? data : []).forEach(teacher => {
                const option = document.createElement('option');
                option.value = teacher.id;
                option.textContent = teacher.subject + teacher.name;
                select.appendChild(option);
            });
        })
        .catch(() => {
            console.error('Failed to load teachers');
        });
}

function loadClasses() {
    fetch('/get_classes')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('class-select');
            if (!select) {
                return;
            }
            select.innerHTML = '<option value="">请选择班级</option>';
            (data.classes || []).forEach(className => {
                const option = document.createElement('option');
                option.value = className;
                option.textContent = className;
                select.appendChild(option);
            });
        })
        .catch(() => {
            console.error('Failed to load classes');
        });
}

function submitTeacherSelect() {
    const select = document.getElementById('teacher-select');
    const teacherError = document.getElementById('teacher-select-error');
    const teacherId = select.value;

    teacherError.textContent = '';
    if (!teacherId) {
        return;
    }

    fetch('/handle', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: teacherId})
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/teacher';
            } else {
                teacherError.textContent = data.message || '保存失败，请重试';
            }
        })
        .catch(() => {
            teacherError.textContent = '保存失败，请重试';
        });
}
