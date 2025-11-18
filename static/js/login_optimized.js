/**
 * 登录系统前端脚本 - 优化版
 * 主要优化点：
 * 1. 使用状态管理模式
 * 2. 添加加载状态和错误处理
 * 3. 优化DOM操作和事件处理
 * 4. 添加防抖动和节流
 * 5. 提高代码可维护性
 */

// 全局状态管理
const state = {
    currentRole: '',
    isLoading: false,
    teachers: [],
    classes: {}
};

// DOM缓存
const dom = {
    keyInput: null,
    keyError: null,
    keySubmitBtn: null,
    formContainer: null,
    gradeSelect: null
};

// 防抖动函数
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// 节流函数
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 初始化函数
function init() {
    // 缓存DOM元素
    cacheDOMElements();

    // 设置事件监听
    setupEventListeners();

    // 检查预设参数
    checkPresetParams();
}

// 缓存DOM元素
function cacheDOMElements() {
    dom.keyInput = document.getElementById('key-input');
    dom.keyError = document.getElementById('key-error');
    dom.keySubmitBtn = document.getElementById('key-submit-btn');
    dom.formContainer = document.getElementById('additional-form-container');
    dom.gradeSelect = document.getElementById('grade-select');
}

// 设置事件监听器
function setupEventListeners() {
    if (dom.keyInput) {
        dom.keyInput.addEventListener('keypress', handleKeyPress);
    }

    if (dom.keySubmitBtn) {
        dom.keySubmitBtn.addEventListener('click', checkKey);
    }

    // 如果有年级选择器，添加变化事件
    if (dom.gradeSelect) {
        dom.gradeSelect.addEventListener('change', handleGradeChange);
    }
}

// 处理键盘事件
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        checkKey();
    }
}

// 处理年级变化
function handleGradeChange(event) {
    const grade = event.target.value;
    if (grade) {
        loadClasses(grade);
    }
}

// 检查预设参数
function checkPresetParams() {
    const presetParams = new URLSearchParams(window.location.search);
    const presetKey = presetParams.get('pwd');

    if (presetKey && dom.keyInput) {
        dom.keyInput.value = presetKey;
        // 使用防抖动，避免快速连续请求
        debounce(checkKey, 300)();
    }
}

// 验证密钥
function checkKey() {
    if (state.isLoading) return;

    const key = dom.keyInput ? dom.keyInput.value.trim() : '';

    if (!key) {
        showError(dom.keyError, '请输入密钥');
        return;
    }

    setLoadingState(true, '验证中...');

    fetch('/verify-key', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            state.currentRole = data.role;

            // 禁用输入和按钮
            if (dom.keyInput) dom.keyInput.disabled = true;
            if (dom.keySubmitBtn) dom.keySubmitBtn.disabled = true;

            // 根据角色显示相应表单
            if (data.role === 'parent') {
                showParentForm();
            } else if (data.role === 'teacher') {
                showTeacherForm();
            }
        } else {
            showError(dom.keyError, data.message || '密钥错误，请重新输入');
            if (dom.keyInput) dom.keyInput.value = '';
        }
    })
    .catch(error => {
        console.error('密钥验证错误:', error);
        showError(dom.keyError, '验证失败，请重试');
        if (dom.keyInput) dom.keyInput.value = '';
    })
    .finally(() => {
        setLoadingState(false);
    });
}

// 显示错误信息
function showError(element, message) {
    if (element) {
        element.textContent = message;
        // 添加动画效果
        element.classList.add('error-shake');
        setTimeout(() => {
            element.classList.remove('error-shake');
        }, 500);
    }
}

// 设置加载状态
function setLoadingState(isLoading, text = '') {
    state.isLoading = isLoading;

    if (dom.keySubmitBtn) {
        dom.keySubmitBtn.disabled = isLoading;
        dom.keySubmitBtn.textContent = isLoading ? text : '验证';
    }
}

// 显示家长表单
function showParentForm() {
    if (!dom.formContainer) return;

    dom.formContainer.innerHTML = `
        <div class="name-input-wrapper">
            <div class="form-group">
                <label for="grade-select">请选择年级:</label>
                <select id="grade-select" class="teacher-select">
                    <option value="">请选择年级</option>
                    <option value="初一">初一</option>
                    <option value="初二">初二</option>
                </select>
            </div>
            <div class="form-group">
                <label for="class-select">请选择班级:</label>
                <select id="class-select" class="teacher-select">
                    <option value="">请先选择年级</option>
                </select>
            </div>
            <div class="form-group">
                <label for="student-name-input">请输入孩子姓名:</label>
                <input type="text" id="student-name-input" placeholder="请输入孩子姓名" autocomplete="off">
            </div>
            <button id="student-name-submit-btn" class="submit-btn">确认</button>
        </div>
        <p id="student-name-error" class="error-message"></p>
    `;

    // 设置事件监听
    const nameInput = document.getElementById('student-name-input');
    const submitBtn = document.getElementById('student-name-submit-btn');
    const gradeSelect = document.getElementById('grade-select');

    if (nameInput) {
        nameInput.addEventListener('keypress', handleKeyPress);
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', submitStudentName);
    }

    if (gradeSelect) {
        gradeSelect.addEventListener('change', handleGradeChange);
    }

    // 聚焦到姓名输入框
    if (nameInput) {
        nameInput.focus();
    }

    // 默认加载初一的班级
    loadClasses('初一');
}

// 显示教师表单
function showTeacherForm() {
    if (!dom.formContainer) return;

    dom.formContainer.innerHTML = `
        <div class="teacher-select-wrapper">
            <label for="teacher-select">请选择老师:</label>
            <select id="teacher-select" class="teacher-select">
                <option value="">请选择老师</option>
            </select>
        </div>
        <p id="teacher-select-error" class="error-message"></p>
    `;

    // 加载教师列表
    loadTeachers();

    // 设置事件监听
    const select = document.getElementById('teacher-select');
    if (select) {
        select.addEventListener('change', submitTeacherSelect);
    }
}

// 提交学生姓名
function submitStudentName() {
    const nameInput = document.getElementById('student-name-input');
    const classNameSelect = document.getElementById('class-select');
    const nameError = document.getElementById('student-name-error');

    if (!nameInput || !classNameSelect || !nameError) return;

    const name = nameInput.value.trim();
    const className = classNameSelect.value;

    nameError.textContent = '';

    if (!name) {
        showError(nameError, '请输入孩子姓名');
        return;
    }

    if (!className) {
        showError(nameError, '请选择班级');
        return;
    }

    setLoadingState(true, '提交中...');

    fetch('/handle', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, className })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            window.location.href = '/parent';
        } else {
            showError(nameError, data.message || '保存失败，请重试');
        }
    })
    .catch(error => {
        console.error('学生信息提交错误:', error);
        showError(nameError, '登录失败，请重试');
    })
    .finally(() => {
        setLoadingState(false);
    });
}

// 提交教师选择
function submitTeacherSelect() {
    const select = document.getElementById('teacher-select');
    const teacherError = document.getElementById('teacher-select-error');

    if (!select || !teacherError) return;

    const teacherId = select.value;

    teacherError.textContent = '';

    if (!teacherId) {
        return;
    }

    setLoadingState(true, '提交中...');

    fetch('/handle', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: teacherId })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            window.location.href = '/teacher';
        } else {
            showError(teacherError, data.message || '保存失败，请重试');
        }
    })
    .catch(error => {
        console.error('教师选择提交错误:', error);
        showError(teacherError, '保存失败，请重试');
    })
    .finally(() => {
        setLoadingState(false);
    });
}

// 加载教师列表
function loadTeachers() {
    const select = document.getElementById('teacher-select');
    if (!select) return;

    select.innerHTML = '<option value="">加载中...</option>';

    fetch('/get_teachers')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        state.teachers = data;

        // 清空并填充选择框
        select.innerHTML = '<option value="">请选择老师</option>';

        data.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher.id;
            option.textContent = teacher.subject + teacher.name;
            select.appendChild(option);
        });
    })
    .catch(error => {
        console.error('加载教师列表失败:', error);
        select.innerHTML = '<option value="">加载失败</option>';
    });
}

// 加载班级列表
function loadClasses(grade) {
    const select = document.getElementById('class-select');
    if (!select) return;

    // 如果已缓存，直接使用
    if (state.classes[grade]) {
        populateClassSelect(select, state.classes[grade]);
        return;
    }

    select.innerHTML = '<option value="">加载中...</option>';

    fetch(`/get_classes?grade=${encodeURIComponent(grade)}`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // 缓存班级数据
        state.classes[grade] = data.classes || [];

        // 填充选择框
        populateClassSelect(select, state.classes[grade]);
    })
    .catch(error => {
        console.error('加载班级列表失败:', error);
        select.innerHTML = '<option value="">加载失败</option>';
    });
}

// 填充班级选择框
function populateClassSelect(select, classes) {
    if (!select) return;

    select.innerHTML = '<option value="">请选择班级</option>';

    classes.forEach(className => {
        const option = document.createElement('option');
        option.value = className;
        option.textContent = className;
        select.appendChild(option);
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
