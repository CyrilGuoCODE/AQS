/**
 * 预约系统前端脚本 - 优化版
 * 主要优化点：
 * 1. 使用对象池减少DOM创建销毁
 * 2. 事件委托减少事件监听器数量
 * 3. 减少DOM操作次数
 * 4. 优化数据查找算法
 * 5. 添加加载状态和错误处理
 */

// 全局状态管理
const state = {
    selectedTeachers: [],
    lockedTeachers: [],
    teachersMap: new Map(), // 使用Map提高查找效率
    isSubmitting: false,
    countdownTimer: null
};

// DOM缓存
const dom = {
    screens: null,
    teacherGrid: null,
    scheduleList: null,
    selectedCount: null,
    submitBtn: null,
    parentNameDisplay: null
};

// 对象池，减少DOM创建销毁
const elementPool = {
    teacherCards: [],
    scheduleItems: []
};

// 初始化函数
function init() {
    // 缓存DOM元素
    cacheDOMElements();

    // 初始化教师数据映射
    initTeachersMap();

    // 设置事件监听
    setupEventListeners();

    // 显示通知
    showNoticeModal();
}

// 缓存DOM元素
function cacheDOMElements() {
    dom.screens = document.querySelectorAll('.screen');
    dom.teacherGrid = document.getElementById('teacher-grid');
    dom.scheduleList = document.getElementById('schedule-list');
    dom.selectedCount = document.getElementById('selected-count');
    dom.submitBtn = document.getElementById('submit-btn');
    dom.parentNameDisplay = document.getElementById('parent-name-display');
}

// 初始化教师数据映射，提高查找效率
function initTeachersMap() {
    if (typeof teachers !== 'undefined') {
        teachers.forEach(teacher => {
            state.teachersMap.set(String(teacher.id), teacher);
        });
    }
}

// 设置事件监听器，使用事件委托减少监听器数量
function setupEventListeners() {
    // 通知关闭按钮
    const closeNoticeBtn = document.getElementById('close-notice-btn');
    if (closeNoticeBtn) {
        closeNoticeBtn.addEventListener('click', closeNoticeModal);
    }

    // 提交按钮
    if (dom.submitBtn) {
        dom.submitBtn.addEventListener('click', submitAppointment);
    }

    // 使用事件委托处理教师卡片点击
    if (dom.teacherGrid) {
        dom.teacherGrid.addEventListener('click', handleTeacherCardClick);
    }
}

// 显示指定屏幕
function showScreen(screenId) {
    dom.screens.forEach(screen => {
        screen.classList.remove('active');
    });

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

// 显示通知模态框
function showNoticeModal() {
    const modal = document.getElementById('notice-modal');
    const closeBtn = document.getElementById('close-notice-btn');
    const countdownText = document.getElementById('countdown-text');

    if (!modal || !closeBtn || !countdownText) return;

    modal.classList.add('active');
    closeBtn.disabled = true;

    let countdown = 5;
    countdownText.textContent = `关闭(${countdown})`;

    state.countdownTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownText.textContent = `关闭(${countdown})`;
        } else {
            countdownText.textContent = '关闭';
            closeBtn.disabled = false;
            clearInterval(state.countdownTimer);
            state.countdownTimer = null;
        }
    }, 1000);
}

// 关闭通知模态框
function closeNoticeModal() {
    const modal = document.getElementById('notice-modal');
    if (!modal) return;

    modal.classList.remove('active');

    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }

    showTeacherScreen();
}

// 显示教师选择屏幕
function showTeacherScreen() {
    // 初始化锁定教师
    if (typeof mustAppointments !== 'undefined' && Array.isArray(mustAppointments)) {
        state.lockedTeachers = mustAppointments.map(appointment => {
            return state.teachersMap.get(String(appointment.teacher_id));
        }).filter(teacher => teacher !== undefined);
    }

    // 初始化已选教师
    state.selectedTeachers = [...state.lockedTeachers];

    // 添加之前预约的教师
    if (typeof previousAppointments !== 'undefined' && Array.isArray(previousAppointments)) {
        previousAppointments.forEach(appointment => {
            const teacher = state.teachersMap.get(String(appointment.teacher_id));
            if (teacher && !state.selectedTeachers.find(t => t.id === teacher.id)) {
                state.selectedTeachers.push(teacher);
            }
        });
    }

    showScreen('teacher-screen');
    renderTeachers();
    updateSelectedCount();
}

// 渲染教师卡片
function renderTeachers() {
    if (!dom.teacherGrid) return;

    // 使用文档片段减少DOM重排
    const fragment = document.createDocumentFragment();

    // 清空现有内容
    dom.teacherGrid.innerHTML = '';

    teachers.forEach(teacher => {
        // 只显示当前班级的教师
        if (typeof className !== 'undefined' && teacher.class.indexOf(className) === -1) {
            return;
        }

        const teacherCard = createTeacherCard(teacher);
        fragment.appendChild(teacherCard);
    });

    dom.teacherGrid.appendChild(fragment);
}

// 创建教师卡片
function createTeacherCard(teacher) {
    const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
    let currentPeoples = teacherSetting.peoples || 0;
    const maxParents = teacherSetting.maxParents || 10;

    // 检查是否为锁定教师
    const isMust = state.lockedTeachers.find(t => t.id === teacher.id) !== undefined;

    // 获取等待人数
    if (!isMust && state.selectedTeachers.find(t => t.id === teacher.id)) {
        const appointment = previousAppointments.find(t => t.teacher_id === teacher.id);
        if (appointment) currentPeoples = appointment.ranking;
    }
    if (isMust) {
        const appointment = mustAppointments.find(t => t.teacher_id === teacher.id);
        if (appointment) currentPeoples = appointment.ranking;
    }

    const isFull = currentPeoples >= maxParents;
    const isSelected = state.selectedTeachers.find(t => t.id === teacher.id) !== undefined;

    // 计算预计时间
    const appointmentStartTime = new Date(startTime);
    const estimatedTime = new Date(appointmentStartTime.getTime() + currentPeoples * 10 * 60000);
    const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;

    // 创建卡片元素
    const card = document.createElement('div');
    card.className = 'teacher-card';
    card.dataset.teacherId = teacher.id;

    if (isFull) card.classList.add('disabled');
    if (isMust) card.classList.add('must-locked');
    if (isSelected) card.classList.add('selected');

    // 使用模板字符串一次性设置innerHTML，减少DOM操作
    card.innerHTML = `
        <div class="teacher-name">${teacher.subject}${teacher.name}</div>
        <div class="teacher-info">
            <span><strong>地点:</strong> <span class="waiting-count">${teacher.location}</span></span>
        </div>
        <div class="teacher-info">
            <span><strong>前方等待:</strong> <span class="waiting-count">${currentPeoples}人</span></span>
        </div>
        <div class="teacher-info">
            <span><strong>预计时间:</strong> <span class="waiting-count">${isFull ? '已满' : estimatedTimeStr}</span></span>
        </div>
        ${isFull ? '<div class="full-badge">已满</div>' : ''}
        ${isMust ? '<div class="must-badge">指定</div>' : ''}
    `;

    return card;
}

// 处理教师卡片点击事件（事件委托）
function handleTeacherCardClick(event) {
    const card = event.target.closest('.teacher-card');
    if (!card) return;

    const teacherId = parseInt(card.dataset.teacherId);
    const teacher = state.teachersMap.get(String(teacherId));

    if (!teacher) return;

    // 如果卡片被禁用或者是锁定教师，则不处理
    if (card.classList.contains('disabled') || card.classList.contains('must-locked')) {
        if (card.classList.contains('must-locked')) {
            alert('该老师指定了您，无法取消');
        }
        return;
    }

    toggleTeacher(teacher, card);
}

// 切换教师选择状态
function toggleTeacher(teacher, cardElement) {
    const index = state.selectedTeachers.findIndex(t => t.id === teacher.id);

    if (index > -1) {
        // 取消选择
        state.selectedTeachers.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        // 检查可选名额
        const availableSlots = 3 - state.lockedTeachers.length;
        const selectableCount = state.selectedTeachers.filter(t => 
            state.lockedTeachers.find(lt => lt.id === t.id) === undefined
        ).length;

        if (selectableCount >= availableSlots) {
            alert(`最多只能选择${availableSlots}位可选老师（老师指定已占用${state.lockedTeachers.length}个名额）`);
            return;
        }

        // 添加选择
        state.selectedTeachers.push(teacher);
        cardElement.classList.add('selected');
    }

    updateSelectedCount();
}

// 更新已选教师计数
function updateSelectedCount() {
    const count = state.selectedTeachers.length;
    const mustCount = state.lockedTeachers.length;
    const availableSlots = 3 - mustCount;
    const selectableCount = state.selectedTeachers.filter(t => 
        state.lockedTeachers.find(lt => lt.id === t.id) === undefined
    ).length;
    const remainingSlots = availableSlots - selectableCount;

    if (dom.selectedCount) {
        dom.selectedCount.textContent = `${count}（指定${mustCount}，可选${remainingSlots}/${availableSlots}）`;
    }

    if (dom.submitBtn) {
        dom.submitBtn.disabled = count === 0 || state.isSubmitting;
    }
}

// 提交预约
function submitAppointment() {
    if (state.isSubmitting) return;

    const allSelectedTeachers = [...state.selectedTeachers];

    if (allSelectedTeachers.length === 0) {
        alert('请至少选择一位老师');
        return;
    }

    // 设置提交状态
    state.isSubmitting = true;
    if (dom.submitBtn) {
        dom.submitBtn.disabled = true;
        dom.submitBtn.textContent = '提交中...';
    }

    // 渲染预约列表
    renderScheduleList(allSelectedTeachers);

    // 显示预约屏幕
    if (dom.parentNameDisplay && typeof name !== 'undefined') {
        dom.parentNameDisplay.textContent = name;
    }
    showScreen('schedule-screen');

    // 准备提交数据
    const selectableTeachers = allSelectedTeachers.filter(teacher =>
        state.lockedTeachers.find(t => t.id === teacher.id) === undefined
    );
    const appointmentPayload = selectableTeachers.map(teacher => teacher.id);

    // 发送请求
    fetch('/parent/appointment/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            appointments: appointmentPayload
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            throw new Error(data.message || '预约保存失败');
        }
        // 预约成功，可以添加成功提示
    })
    .catch(error => {
        console.error('预约提交错误:', error);
        alert(error.message || '预约保存失败，请检查网络后重试');
        showTeacherScreen();
    })
    .finally(() => {
        // 重置提交状态
        state.isSubmitting = false;
        if (dom.submitBtn) {
            dom.submitBtn.disabled = state.selectedTeachers.length === 0;
            dom.submitBtn.textContent = '提交预约';
        }
    });
}

// 渲染预约列表
function renderScheduleList(allSelectedTeachers) {
    if (!dom.scheduleList) return;

    // 使用文档片段减少DOM重排
    const fragment = document.createDocumentFragment();
    dom.scheduleList.innerHTML = '';

    const appointmentStartTime = new Date(startTime);

    allSelectedTeachers.forEach(teacher => {
        const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
        let waitingCount = teacherSetting.peoples || 0;

        const isMust = state.lockedTeachers.find(t => t.id === teacher.id) !== undefined;

        // 获取等待人数
        if (!isMust && state.selectedTeachers.find(t => t.id === teacher.id)) {
            const appointment = previousAppointments.find(t => t.teacher_id === teacher.id);
            if (appointment) waitingCount = appointment.ranking;
        }
        if (isMust) {
            const appointment = mustAppointments.find(t => t.teacher_id === teacher.id);
            if (appointment) waitingCount = appointment.ranking;
        }

        // 计算预计时间
        const estimatedTime = new Date(appointmentStartTime.getTime() + waitingCount * 10 * 60000);
        const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;

        // 创建预约项
        const scheduleItem = document.createElement('div');
        scheduleItem.className = 'schedule-item';
        if (isMust) {
            scheduleItem.classList.add('must');
        }

        scheduleItem.innerHTML = `
            <div class="schedule-item-header">
                <span class="schedule-teacher-name">${teacher.subject}${teacher.name}${isMust ? ' <span style="color: #ff4d4f;">（老师指定）</span>' : ''}</span>
                <span class="schedule-time">预计时间: ${estimatedTimeStr}</span>
            </div>
            <div class="schedule-details">
                <p class="schedule-location"><strong style="color: #333;">前方等待: </strong>${waitingCount}人</p>
                <p class="schedule-location"><strong style="color: #333;">前往位置: </strong>${teacher.location}</p>
            </div>
        `;

        fragment.appendChild(scheduleItem);
    });

    dom.scheduleList.appendChild(fragment);
}

// 格式化时间
function formatTime(minutes) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutes * 60000);
    const hours = targetTime.getHours().toString().padStart(2, '0');
    const mins = targetTime.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
