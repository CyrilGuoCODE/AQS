let currentRole = '';

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
            currentRole = data.role;
            keyInput.disabled = true;
            document.getElementById('key-submit-btn').disabled = true;
            
            if (data.role === 'parent') {
                showParentForm();
            } else if (data.role === 'teacher') {
                showTeacherForm();
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

function showParentForm() {
    const container = document.getElementById('additional-form-container');
    container.innerHTML = `
        <div class="name-input-wrapper">
            <label for="grade-select">请选择年级:</label>
            <select id="grade-select" class="teacher-select">
                <option value="">请选择年级</option>
                <option value="1">初一</option>
                <option value="2">初二</option>
                <option value="3">初三</option>
            </select>
            <label for="class-select">请选择班级:</label>
            <select id="class-select" class="teacher-select">
                <option value="">请选择班级</option>
                <option value="21">初二一班</option>
                <option value="22">初二二班</option>
                <option value="23">初二三班</option>
                <option value="24">初二四班</option>
                <option value="25">初二五班</option>
                <option value="26">初二六班</option>
            </select>
            <label for="student-name-input">请输入孩子姓名:</label>
            <input type="text" id="student-name-input" placeholder="请输入孩子姓名" autocomplete="off">
            <button id="student-name-submit-btn">确认</button>
        </div>
        <p id="student-name-error" class="error-message"></p>
    `;
    
    const nameInput = document.getElementById('student-name-input');
    const submitBtn = document.getElementById('student-name-submit-btn');
    
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitStudentName();
        }
    });
    
    submitBtn.addEventListener('click', submitStudentName);
    nameInput.focus();
}

function showTeacherForm() {
    const container = document.getElementById('additional-form-container');
    container.innerHTML = `
        <div class="teacher-select-wrapper">
            <label for="teacher-select">请选择老师:</label>
            <select id="teacher-select" class="teacher-select">
                <option value="">请选择老师</option>
            </select>
        </div>
        <p id="teacher-select-error" class="error-message"></p>
    `;
    
    loadTeachers();
    
    const select = document.getElementById('teacher-select');
    select.addEventListener('change', submitTeacherSelect);
}

function submitStudentName() {
    const nameInput = document.getElementById('student-name-input');
    const nameError = document.getElementById('student-name-error');
    const name = nameInput.value.trim();

    nameError.textContent = '';

    if (!name) {
        nameError.textContent = '请输入孩子姓名';
        return;
    }

    fetch('/handle', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = '/parent';
        } else {
            nameError.textContent = data.message || '保存失败，请重试';
        }
    })
    .catch(error => {
        nameError.textContent = '登录失败，请重试';
    });
}

function loadTeachers() {
    fetch('/get_teachers')
    .then(response => response.json())
    .then(data => {
        const select = document.getElementById('teacher-select');
        select.innerHTML = '<option value="">请选择老师</option>';
        data.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher.id;
            option.textContent = teacher.subject + teacher.name;
            select.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Failed to load teachers:', error);
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
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: teacherId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = '/teacher';
        } else {
            teacherError.textContent = data.message || '保存失败，请重试';
        }
    })
    .catch(error => {
        teacherError.textContent = '保存失败，请重试';
    });
}