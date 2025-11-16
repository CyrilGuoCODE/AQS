const normalizedTeachers = (typeof teachers !== 'undefined' && Array.isArray(teachers) ? teachers : []).map((teacher, index) => {
    const fallbackId = `teacher-${index + 1}`;
    const id = teacher.id ?? teacher._id ?? fallbackId;
    const waiting = Number.isFinite(Number(teacher.waiting)) ? Number(teacher.waiting) : 0;
    return { ...teacher, id, waiting };
});

let selectedTeachers = [];
let lockedTeachers = [];
let countdownTimer = null;

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function showNoticeModal() {
    const modal = document.getElementById('notice-modal');
    const closeBtn = document.getElementById('close-notice-btn');
    const countdownText = document.getElementById('countdown-text');

    modal.classList.add('active');
    closeBtn.disabled = true;

    let countdown = 5;
    countdownText.textContent = `关闭(${countdown})`;

    countdownTimer = setInterval(() => {
        countdown--;
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
    modal.classList.remove('active');
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
    showTeacherScreen();
}

function showTeacherScreen() {
    if (typeof mustAppointments !== 'undefined' && Array.isArray(mustAppointments)) {
        lockedTeachers = mustAppointments.map(teacherId => {
            return normalizedTeachers.find(t => String(t.id) === String(teacherId));
        }).filter(t => t !== undefined);
        
        selectedTeachers = [...lockedTeachers];
    }
    showScreen('teacher-screen');
    renderTeachers();
    updateSelectedCount();
}

function renderTeachers() {
    const grid = document.getElementById('teacher-grid');
    grid.innerHTML = '';

    normalizedTeachers.forEach(teacher => {
        if (teacher.class.indexOf(className) === -1) return;

        const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
        const currentPeoples = teacherSetting.peoples || 0;
        const maxParents = teacherSetting.maxParents || 10;
        const isFull = currentPeoples >= maxParents;
        const isMust = lockedTeachers.find(t => t.id === teacher.id) !== undefined;
        const appointmentStartTime = new Date(startTime);
        const estimatedTime = new Date(appointmentStartTime.getTime() + currentPeoples * 10 * 60000);
        const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;

        const card = document.createElement('div');
        card.className = 'teacher-card';
        if (isFull) {
            card.classList.add('disabled');
        }
        if (isMust) {
            card.classList.add('must-locked');
        }
        if (selectedTeachers.find(t => t.id === teacher.id)) {
            card.classList.add('selected');
        }

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

        if (!isFull && !isMust) {
            card.addEventListener('click', () => toggleTeacher(teacher, card));
        }
        grid.appendChild(card);
    });
}

function toggleTeacher(teacher, cardElement) {
    const isMust = lockedTeachers.find(t => t.id === teacher.id) !== undefined;
    
    if (isMust) {
        alert('该老师指定了您，无法取消');
        return;
    }

    const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
    const currentPeoples = teacherSetting.peoples || 0;
    const maxParents = teacherSetting.maxParents || 10;
    
    if (currentPeoples >= maxParents) {
        alert('该老师的预约人数已满，无法预约');
        return;
    }

    const index = selectedTeachers.findIndex(t => t.id === teacher.id);

    if (index > -1) {
        selectedTeachers.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        const availableSlots = 3 - lockedTeachers.length;
        const selectableCount = selectedTeachers.filter(t => lockedTeachers.find(lt => lt.id === t.id) === undefined).length;
        
        if (selectableCount >= availableSlots) {
            alert(`最多只能选择${availableSlots}位可选老师（老师指定已占用${lockedTeachers.length}个名额）`);
            return;
        }
        selectedTeachers.push(teacher);
        cardElement.classList.add('selected');
    }

    updateSelectedCount();
}

function updateSelectedCount() {
    const count = selectedTeachers.length;
    const mustCount = lockedTeachers.length;
    const availableSlots = 3 - mustCount;
    const selectableCount = selectedTeachers.filter(t => lockedTeachers.find(lt => lt.id === t.id) === undefined).length;
    
    document.getElementById('selected-count').textContent = `${count}（指定${mustCount}，可选${selectableCount}/${availableSlots}）`;
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = count === 0;
}

function submitAppointment() {
    const allSelectedTeachers = [...selectedTeachers];
    
    if (allSelectedTeachers.length === 0) {
        alert('请至少选择一位老师');
        return;
    }

    const scheduleList = document.getElementById('schedule-list');
    scheduleList.innerHTML = '';

    const appointmentStartTime = new Date(startTime);
    let currentPosition = 0;

    allSelectedTeachers.forEach((teacher, index) => {
        const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
        const waitingCount = teacherSetting.peoples || 0;
        const totalWaiting = currentPosition + waitingCount;
        const estimatedTime = new Date(appointmentStartTime.getTime() + totalWaiting * 10 * 60000);
        const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;
        const isMust = lockedTeachers.find(t => t.id === teacher.id) !== undefined;
        
        currentPosition += waitingCount;
        
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
        scheduleList.appendChild(scheduleItem);
    });

    const selectableTeachers = allSelectedTeachers.filter(teacher => 
        lockedTeachers.find(t => t.id === teacher.id) === undefined
    );
    const appointmentPayload = selectableTeachers.map(teacher => teacher.id);

    document.getElementById('parent-name-display').textContent = name;
    showScreen('schedule-screen');

    fetch('/parent/appointment/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            appointments: appointmentPayload
        })
    })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                alert(data.message || '预约保存失败，请稍后重试');
                showTeacherScreen();
            }
        })
        .catch(() => {
            alert('预约保存失败，请检查网络后重试');
        });
}

function formatTime(minutes) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutes * 60000);
    const hours = targetTime.getHours().toString().padStart(2, '0');
    const mins = targetTime.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
}

document.addEventListener('DOMContentLoaded', function () {
    showNoticeModal();

    document.getElementById('close-notice-btn').addEventListener('click', closeNoticeModal);

    document.getElementById('submit-btn').addEventListener('click', submitAppointment);
});
