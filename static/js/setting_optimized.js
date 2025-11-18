/**
 * 教师设置管理 - 优化版
 * 主要优化点：
 * 1. 使用状态管理模式
 * 2. 添加表单验证和错误处理
 * 3. 优化DOM操作和事件处理
 * 4. 添加加载状态和用户反馈
 * 5. 提高代码可维护性
 */

// 全局状态管理
const state = {
    reservedStudents: [],
    maxParents: 10,
    isLoading: false,
    classes: {},
    originalSettings: {} // 用于重置功能
};

// DOM缓存
const dom = {
    maxParentsInput: null,
    reservedListContainer: null,
    parentNameInput: null,
    classSelect: null,
    addParentBtn: null,
    saveSettingsBtn: null,
    resetBtn: null,
    gradeSelect: null
};

// 初始化函数
function init() {
    // 缓存DOM元素
    cacheDOMElements();

    // 加载初始设置
    loadInitialSettings();

    // 设置事件监听
    setupEventListeners();

    // 加载班级数据
    loadClasses('初一');
}

// 缓存DOM元素
function cacheDOMElements() {
    dom.maxParentsInput = document.getElementById('max-parents');
    dom.reservedListContainer = document.getElementById('reserved-list-container');
    dom.parentNameInput = document.getElementById('parent-name-input');
    dom.classSelect = document.getElementById('class-select');
    dom.addParentBtn = document.getElementById('add-parent-btn');
    dom.saveSettingsBtn = document.getElementById('save-settings-btn');
    dom.resetBtn = document.getElementById('reset-btn');
    dom.gradeSelect = document.getElementById('grade-select');
}

// 加载初始设置
function loadInitialSettings() {
    // 加载最大家长数
    if (typeof initialMaxParents !== 'undefined') {
        state.maxParents = initialMaxParents;
        if (dom.maxParentsInput) {
            dom.maxParentsInput.value = state.maxParents;
        }
    }

    // 加载保留学生列表
    if (typeof initialReservedStudents !== 'undefined' && Array.isArray(initialReservedStudents)) {
        state.reservedStudents = [...initialReservedStudents];
        renderReservedList();
    }

    // 保存原始设置，用于重置
    state.originalSettings = {
        maxParents: state.maxParents,
        reservedStudents: [...state.reservedStudents]
    };
}

// 设置事件监听器
function setupEventListeners() {
    if (dom.addParentBtn) {
        dom.addParentBtn.addEventListener('click', addReservedParent);
    }

    if (dom.parentNameInput) {
        dom.parentNameInput.addEventListener('keypress', handleKeyPress);
    }

    if (dom.saveSettingsBtn) {
        dom.saveSettingsBtn.addEventListener('click', saveSettings);
    }

    if (dom.resetBtn) {
        dom.resetBtn.addEventListener('click', resetToOriginal);
    }

    if (dom.gradeSelect) {
        dom.gradeSelect.addEventListener('change', handleGradeChange);
    }

    // 添加表单验证
    if (dom.maxParentsInput) {
        dom.maxParentsInput.addEventListener('input', validateMaxParents);
    }
}

// 处理键盘事件
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        addReservedParent();
    }
}

// 处理年级变化
function handleGradeChange(event) {
    const grade = event.target.value;
    if (grade) {
        loadClasses(grade);
    }
}

// 验证最大家长数输入
function validateMaxParents() {
    const value = parseInt(dom.maxParentsInput.value, 10);

    if (isNaN(value) || value < 1) {
        dom.maxParentsInput.setCustomValidity('请输入有效的家长数量（至少1人）');
    } else if (value > 50) {
        dom.maxParentsInput.setCustomValidity('家长数量不能超过50人');
    } else {
        dom.maxParentsInput.setCustomValidity('');
    }
}

// 渲染保留学生列表
function renderReservedList() {
    if (!dom.reservedListContainer) return;

    // 使用文档片段减少DOM重排
    const fragment = document.createDocumentFragment();

    if (state.reservedStudents.length === 0) {
        const emptyHint = document.createElement('p');
        emptyHint.className = 'empty-hint';
        emptyHint.textContent = '暂无提前预约名单';
        fragment.appendChild(emptyHint);
    } else {
        // 使用事件委托处理删除按钮点击
        const listContainer = document.createElement('div');
        listContainer.className = 'reserved-list';
        listContainer.addEventListener('click', handleRemoveClick);

        state.reservedStudents.forEach((fullName, index) => {
            const item = createReservedItem(fullName, index);
            listContainer.appendChild(item);
        });

        fragment.appendChild(listContainer);
    }

    // 清空并添加新内容
    dom.reservedListContainer.innerHTML = '';
    dom.reservedListContainer.appendChild(fragment);
}

// 创建保留学生项
function createReservedItem(fullName, index) {
    const item = document.createElement('div');
    item.className = 'reserved-item';
    item.dataset.index = index;

    // 提取班级和姓名
    const className = extractClassName(fullName);
    const studentName = extractStudentName(fullName);

    item.innerHTML = `
        <div class="reserved-info">
            <span class="reserved-class">${className}</span>
            <span class="reserved-name">${studentName}</span>
        </div>
        <button class="remove-btn" data-index="${index}" title="删除此学生">
            <span class="icon">×</span>
        </button>
    `;

    return item;
}

// 提取班级名称
function extractClassName(fullName) {
    // 假设格式为"班级姓名"，如"初一一班张三"
    for (const grade of ['初一', '初二']) {
        if (fullName.startsWith(grade)) {
            for (let i = 1; i <= 6; i++) {
                const className = `${grade}${i}班`;
                if (fullName.startsWith(className)) {
                    return className;
                }
            }
        }
    }
    return '未知班级';
}

// 提取学生姓名
function extractStudentName(fullName) {
    // 假设格式为"班级姓名"，如"初一一班张三"
    for (const grade of ['初一', '初二']) {
        if (fullName.startsWith(grade)) {
            for (let i = 1; i <= 6; i++) {
                const className = `${grade}${i}班`;
                if (fullName.startsWith(className)) {
                    return fullName.substring(className.length);
                }
            }
        }
    }
    return fullName;
}

// 处理删除按钮点击（事件委托）
function handleRemoveClick(event) {
    if (event.target.closest('.remove-btn')) {
        const btn = event.target.closest('.remove-btn');
        const index = parseInt(btn.dataset.index, 10);

        if (!isNaN(index) && index >= 0 && index < state.reservedStudents.length) {
            // 添加确认对话框
            if (confirm(`确定要删除"${extractStudentName(state.reservedStudents[index])}"吗？`)) {
                state.reservedStudents.splice(index, 1);
                renderReservedList();
            }
        }
    }
}

// 添加保留家长
function addReservedParent() {
    if (state.isLoading) return;

    const name = dom.parentNameInput ? dom.parentNameInput.value.trim() : '';
    const className = dom.classSelect ? dom.classSelect.value.trim() : '';

    if (!name) {
        showError(dom.parentNameInput, '请输入学生姓名');
        return;
    }

    if (!className) {
        showError(dom.classSelect, '请选择班级');
        return;
    }

    const fullName = className + name;

    if (state.reservedStudents.includes(fullName)) {
        showError(dom.parentNameInput, '该学生已在名单中');
        return;
    }

    // 添加到列表
    state.reservedStudents.push(fullName);

    // 清空输入
    if (dom.parentNameInput) dom.parentNameInput.value = '';
    if (dom.classSelect) dom.classSelect.value = '';

    // 重新渲染列表
    renderReservedList();
}

// 显示错误信息
function showError(element, message) {
    if (!element) return;

    // 清除之前的错误
    clearError(element);

    // 添加错误样式
    element.classList.add('error-input');

    // 创建错误消息元素
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;

    // 插入错误消息
    element.parentNode.insertBefore(errorElement, element.nextSibling);

    // 添加动画效果
    errorElement.classList.add('error-shake');

    // 自动清除错误
    setTimeout(() => {
        clearError(element);
    }, 3000);
}

// 清除错误信息
function clearError(element) {
    if (!element) return;

    element.classList.remove('error-input');

    // 查找并删除错误消息元素
    const errorElement = element.parentNode.querySelector('.error-message');
    if (errorElement) {
        errorElement.parentNode.removeChild(errorElement);
    }
}

// 重置到原始设置
function resetToOriginal() {
    if (!confirm('确定要重置所有设置吗？未保存的更改将丢失。')) {
        return;
    }

    // 恢复原始设置
    state.maxParents = state.originalSettings.maxParents;
    state.reservedStudents = [...state.originalSettings.reservedStudents];

    // 更新UI
    if (dom.maxParentsInput) {
        dom.maxParentsInput.value = state.maxParents;
    }

    renderReservedList();
}

// 保存设置
function saveSettings() {
    if (state.isLoading) return;

    // 验证最大家长数
    if (dom.maxParentsInput) {
        validateMaxParents();
        if (!dom.maxParentsInput.checkValidity()) {
            dom.maxParentsInput.reportValidity();
            return;
        }

        state.maxParents = parseInt(dom.maxParentsInput.value, 10);
    }

    // 设置加载状态
    setLoadingState(true);

    const settingsData = {
        maxParents: state.maxParents,
        reservedStudents: state.reservedStudents
    };

    fetch('/teacher/setting/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settingsData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // 更新原始设置
            state.originalSettings = {
                maxParents: state.maxParents,
                reservedStudents: [...state.reservedStudents]
            };

            // 显示成功消息
            showSuccessMessage('设置保存成功');

            // 延迟刷新页面
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            throw new Error(data.message || '设置保存失败');
        }
    })
    .catch(error => {
        console.error('设置保存错误:', error);
        showErrorMessage(error.message || '设置保存失败，请检查网络后重试');
    })
    .finally(() => {
        setLoadingState(false);
    });
}

// 设置加载状态
function setLoadingState(isLoading) {
    state.isLoading = isLoading;

    if (dom.saveSettingsBtn) {
        dom.saveSettingsBtn.disabled = isLoading;
        dom.saveSettingsBtn.textContent = isLoading ? '保存中...' : '保存设置';
    }

    if (dom.addParentBtn) {
        dom.addParentBtn.disabled = isLoading;
    }
}

// 显示成功消息
function showSuccessMessage(message) {
    showMessage(message, 'success');
}

// 显示错误消息
function showErrorMessage(message) {
    showMessage(message, 'error');
}

// 显示消息
function showMessage(message, type) {
    // 创建消息元素
    const messageElement = document.createElement('div');
    messageElement.className = `message-toast ${type}`;
    messageElement.textContent = message;

    // 添加样式
    messageElement.style.position = 'fixed';
    messageElement.style.top = '20px';
    messageElement.style.left = '50%';
    messageElement.style.transform = 'translateX(-50%)';
    messageElement.style.padding = '12px 24px';
    messageElement.style.borderRadius = '4px';
    messageElement.style.zIndex = '1000';
    messageElement.style.transition = 'all 0.3s ease';
    messageElement.style.opacity = '0';

    // 根据类型设置颜色
    if (type === 'success') {
        messageElement.style.backgroundColor = '#4CAF50';
        messageElement.style.color = 'white';
    } else {
        messageElement.style.backgroundColor = '#f44336';
        messageElement.style.color = 'white';
    }

    // 添加到页面
    document.body.appendChild(messageElement);

    // 显示动画
    setTimeout(() => {
        messageElement.style.opacity = '1';
    }, 100);

    // 自动隐藏
    setTimeout(() => {
        messageElement.style.opacity = '0';
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 300);
    }, 3000);
}

// 加载班级列表
function loadClasses(grade) {
    if (!dom.classSelect) return;

    // 如果已缓存，直接使用
    if (state.classes[grade]) {
        populateClassSelect(state.classes[grade]);
        return;
    }

    // 显示加载状态
    dom.classSelect.innerHTML = '<option value="">加载中...</option>';

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
        populateClassSelect(state.classes[grade]);
    })
    .catch(error => {
        console.error('加载班级列表失败:', error);
        dom.classSelect.innerHTML = '<option value="">加载失败</option>';
    });
}

// 填充班级选择框
function populateClassSelect(classes) {
    if (!dom.classSelect) return;

    dom.classSelect.innerHTML = '<option value="">请选择班级</option>';

    classes.forEach(className => {
        const option = document.createElement('option');
        option.value = className;
        option.textContent = className;
        dom.classSelect.appendChild(option);
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
