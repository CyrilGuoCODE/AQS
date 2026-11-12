let selectedTeachers = [];
let lockedTeachers = [];
let countdownTimer = null;
let previousSelections = [];
let submitting = false;

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
    }
    window.scrollTo({top: 0, behavior: 'auto'});
}

function showNoticeModal() {
    const modal = document.getElementById('notice-modal');
    const closeBtn = document.getElementById('close-notice-btn');
    const countdownText = document.getElementById('countdown-text');

    if (!modal || !closeBtn || !countdownText || typeof noticeCount === 'undefined' || noticeCount <= 0) {
        showTeacherScreen();
        return;
    }

    modal.classList.remove('closing');
    modal.classList.add('active');
    closeBtn.disabled = true;

    let countdown = Number(noticeCount);
    countdownText.textContent = `关闭(${countdown})`;

    countdownTimer = setInterval(() => {
        countdown -= 1;
        if (countdown > 0) {
            countdownText.textContent = `关闭(${countdown})`;
        } else {
            countdownText.textContent = '关闭';
            closeBtn.disabled = false;
            clearInterval(countdownTimer);
        }
    }, 1000);
}

function closeNoticeModal() {
    const modal = document.getElementById('notice-modal');
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    if (!modal || !modal.classList.contains('active')) {
        showTeacherScreen();
        return;
    }
    if (modal.classList.contains('closing')) {
        return;
    }
    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.remove('active', 'closing');
        showTeacherScreen();
    }, 140);
}

function findTeacherById(teacherId) {
    return teachers.find(teacher => String(teacher.id) === String(teacherId));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function findRecord(records, teacherId) {
    return (records || []).find(record => String(record.teacher_id) === String(teacherId));
}

function showTeacherScreen() {
    if (Array.isArray(mustAppointments)) {
        lockedTeachers = mustAppointments
            .map(record => findTeacherById(record.teacher_id))
            .filter(teacher => teacher !== undefined);
        selectedTeachers = [...lockedTeachers];
    }

    if (Array.isArray(previousAppointments)) {
        previousAppointments.forEach(record => {
            const teacher = findTeacherById(record.teacher_id);
            const alreadySelected = teacher && selectedTeachers.some(item => String(item.id) === String(teacher.id));
            if (teacher && !alreadySelected) {
                selectedTeachers.push(teacher);
            }
        });
    }

    previousSelections = [...selectedTeachers];

    showScreen('teacher-screen');
    renderTeachers();
    updateSelectedCount();
}

function isLocked(teacher) {
    return lockedTeachers.some(item => String(item.id) === String(teacher.id));
}

function isSelected(teacher) {
    return selectedTeachers.some(item => String(item.id) === String(teacher.id));
}

function renderTeachers() {
    const grid = document.getElementById('teacher-grid');
    if (!grid) {
        return;
    }
    grid.innerHTML = '';

    teachers.forEach(teacher => {
        if (!Array.isArray(teacher.class) || teacher.class.indexOf(className) === -1) {
            return;
        }

        const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
        let currentPeoples = teacherSetting.peoples || 0;
        const maxParents = teacherSetting.maxParents || 10;
        const must = isLocked(teacher);
        const selected = isSelected(teacher);
        const previousRecord = findRecord(previousAppointments, teacher.id);
        const mustRecord = findRecord(mustAppointments, teacher.id);

        if (must && mustRecord) {
            currentPeoples = mustRecord.ranking;
        } else if (previousRecord) {
            currentPeoples = previousRecord.ranking;
        }

        const isFull = currentPeoples >= maxParents;
        const blocked = isFull && !selected;

        const appointmentStartTime = new Date(startTime);
        const estimatedTime = new Date(appointmentStartTime.getTime() + currentPeoples * meetingDuration * 60000);
        const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;

        const card = document.createElement('div');
        card.className = 'teacher-card';
        if (blocked) {
            card.classList.add('disabled');
        }
        if (must) {
            card.classList.add('must-locked');
        }
        if (selected) {
            card.classList.add('selected');
        }

        card.innerHTML = `
            <div class="teacher-card-head">
                <span class="teacher-name">${escapeHtml(teacher.subject)}${escapeHtml(teacher.name)}</span>
                ${must ? '<span class="tag tag-locked">指定</span>' : ''}
                ${blocked ? '<span class="tag tag-full">已满</span>' : ''}
            </div>
            <div class="meta-row">
                <span class="meta-label">地点</span>
                <span class="meta-value">${escapeHtml(teacher.location)}</span>
            </div>
            <div class="meta-row">
                <span class="meta-label">前方等待</span>
                <span class="meta-value">${currentPeoples} 人</span>
            </div>
            <div class="meta-row">
                <span class="meta-label">预计时间</span>
                <span class="meta-value">${isFull ? '已满' : estimatedTimeStr}</span>
            </div>
        `;

        if (!must && (!blocked || selected)) {
            card.addEventListener('click', () => toggleTeacher(teacher, card));
        }
        grid.appendChild(card);
    });
}

function toggleTeacher(teacher, cardElement) {
    if (isLocked(teacher)) {
        showToast('该老师指定了您，无法取消');
        return;
    }

    const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
    const index = selectedTeachers.findIndex(item => String(item.id) === String(teacher.id));

    if (index > -1) {
        selectedTeachers.splice(index, 1);
        cardElement.classList.remove('selected');
        updateSelectedCount();
        return;
    }

    if ((teacherSetting.peoples || 0) >= (teacherSetting.maxParents || 10)) {
        showToast('该老师的预约人数已满，无法预约');
        return;
    }

    const availableSlots = Math.max(0, maxSelectable - lockedTeachers.length);
    const selectableCount = selectedTeachers.filter(
        item => !lockedTeachers.some(locked => String(locked.id) === String(item.id))
    ).length;

    if (selectableCount >= availableSlots) {
        showToast(`最多只能选择${availableSlots}位可选老师`);
        return;
    }

    selectedTeachers.push(teacher);
    cardElement.classList.add('selected');
    updateSelectedCount();
}

function updateSelectedCount() {
    const countElement = document.getElementById('selected-count');
    if (countElement) {
        countElement.textContent = selectedTeachers.length;
    }

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.disabled = selectedTeachers.length === 0;
    }
}

function submitAppointment() {
    if (submitting) {
        return;
    }

    const allSelectedTeachers = [...selectedTeachers];

    if (allSelectedTeachers.length === 0) {
        showToast('请至少选择一位老师');
        return;
    }

    submitting = true;
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中…';
    }

    const scheduleList = document.getElementById('schedule-list');
    if (scheduleList) {
        scheduleList.innerHTML = '';
    }

    const appointmentStartTime = new Date(startTime);

    allSelectedTeachers.forEach(teacher => {
        const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
        let waitingCount = teacherSetting.peoples || 0;
        const must = isLocked(teacher);
        const previousRecord = findRecord(previousAppointments, teacher.id);
        const mustRecord = findRecord(mustAppointments, teacher.id);

        if (must && mustRecord) {
            waitingCount = mustRecord.ranking;
        } else if (previousRecord) {
            waitingCount = previousRecord.ranking;
        }

        const estimatedTime = new Date(appointmentStartTime.getTime() + waitingCount * meetingDuration * 60000);
        const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;

        const scheduleItem = document.createElement('div');
        scheduleItem.className = 'schedule-item';
        if (must) {
            scheduleItem.classList.add('schedule-item-must');
        }
        scheduleItem.innerHTML = `
            <div class="schedule-head">
                <span class="schedule-teacher">${escapeHtml(teacher.subject)}${escapeHtml(teacher.name)}${must ? '（指定）' : ''}</span>
                <span class="schedule-time">预计 ${estimatedTimeStr}</span>
            </div>
            <div class="meta-row">
                <span class="meta-label">前方等待</span>
                <span class="meta-value">${waitingCount} 人</span>
            </div>
            <div class="meta-row">
                <span class="meta-label">前往位置</span>
                <span class="meta-value">${escapeHtml(teacher.location)}</span>
            </div>
        `;
        if (scheduleList) {
            scheduleList.appendChild(scheduleItem);
        }
    });

    const selectableTeachers = allSelectedTeachers.filter(
        teacher => !lockedTeachers.some(locked => String(locked.id) === String(teacher.id))
    );
    const appointmentPayload = selectableTeachers.map(teacher => teacher.id);

    fetch('/parent/appointment/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({appointments: appointmentPayload})
    })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                if (data.setting && typeof data.setting === 'object') {
                    Object.assign(setting, data.setting);
                }
                showToast(data.message || '预约保存失败，请稍后重试');
                showTeacherScreen();
                return;
            }

            const nameDisplay = document.getElementById('parent-name-display');
            if (nameDisplay) {
                nameDisplay.textContent = name;
            }
            showScreen('schedule-screen');
        })
        .catch(() => {
            showToast('预约保存失败，请检查网络后重试');
            showTeacherScreen();
        })
        .finally(() => {
            submitting = false;
            if (submitBtn) {
                submitBtn.textContent = '提交预约';
                updateSelectedCount();
            }
        });
}

function initScreenSwipe() {
    const container = document.querySelector('.page');
    const teacherScreen = document.getElementById('teacher-screen');
    const scheduleScreen = document.getElementById('schedule-screen');

    if (!container || !teacherScreen || !scheduleScreen) {
        return;
    }

    let startX = 0;
    let startY = 0;
    let tracking = false;

    container.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) {
            tracking = false;
            return;
        }
        const touch = event.touches[0];
        if (touch.clientX < 32) {
            tracking = false;
            return;
        }
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
    }, {passive: true});

    container.addEventListener('touchend', event => {
        if (!tracking) {
            return;
        }
        tracking = false;

        const touch = event.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        if (Math.abs(dx) < 64 || Math.abs(dy) > 48) {
            return;
        }

        const scheduleList = document.getElementById('schedule-list');
        const hasSchedule = scheduleList && scheduleList.children.length > 0;

        if (dx < 0 && teacherScreen.classList.contains('active') && hasSchedule) {
            showScreen('schedule-screen');
        } else if (dx > 0 && scheduleScreen.classList.contains('active')) {
            showScreen('teacher-screen');
        }
    }, {passive: true});
}

document.addEventListener('DOMContentLoaded', function () {
    showNoticeModal();

    const closeBtn = document.getElementById('close-notice-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeNoticeModal);
    }

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitAppointment);
    }

    initScreenSwipe();
});
