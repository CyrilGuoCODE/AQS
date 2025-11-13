const normalizedTeachers = (typeof teachers !== 'undefined' && Array.isArray(teachers) ? teachers : []).map((teacher, index) => {
    const fallbackId = `teacher-${index + 1}`;
    const id = teacher.id ?? teacher._id ?? fallbackId;
    const waiting = Number.isFinite(Number(teacher.waiting)) ? Number(teacher.waiting) : 0;
    return { ...teacher, id, waiting };
});

let selectedTeachers = [];
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
    showScreen('teacher-screen');
    renderTeachers();
    updateSelectedCount();
}

function renderTeachers() {
    const grid = document.getElementById('teacher-grid');
    grid.innerHTML = '';

    normalizedTeachers.forEach(teacher => {
        if (teacher.class.indexOf(className) === -1) return;

        const card = document.createElement('div');
        card.className = 'teacher-card';
        if (selectedTeachers.find(t => t.id === teacher.id)) {
            card.classList.add('selected');
        }

        card.innerHTML = `
            <div class="teacher-name">${teacher.name}</div>
            <div class="teacher-info">
                <span><strong>班级:</strong> ${teacher.class}</span>
            </div>
            <div class="teacher-info">
                <span><strong>位置:</strong> <span class="waiting-count">${teacher.location}</span></span>
            </div>
            <div class="teacher-info">
                <span><strong>前方等待:</strong> <span class="waiting-count">${teacher.waiting}人</span></span>
            </div>
            <div class="teacher-info">
                <span><strong>预计时间:</strong> <span class="waiting-count">???</span></span>
            </div>
        `;

        card.addEventListener('click', () => toggleTeacher(teacher, card));
        grid.appendChild(card);
    });
}

function toggleTeacher(teacher, cardElement) {
    const index = selectedTeachers.findIndex(t => t.id === teacher.id);

    if (index > -1) {
        selectedTeachers.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        if (selectedTeachers.length >= 3) {
            alert('最多只能选择3位老师');
            return;
        }
        selectedTeachers.push(teacher);
        cardElement.classList.add('selected');
    }

    updateSelectedCount();
}

function updateSelectedCount() {
    const count = selectedTeachers.length;
    document.getElementById('selected-count').textContent = count;
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = count === 0;
}

function submitAppointment() {
    if (selectedTeachers.length === 0) {
        alert('请至少选择一位老师');
        return;
    }

    const scheduleList = document.getElementById('schedule-list');
    scheduleList.innerHTML = '';

    const appointmentPayload = selectedTeachers.map((teacher, index) => {
        const totalWaiting = selectedTeachers
            .slice(0, index)
            .reduce((sum, t) => sum + (Number.isFinite(Number(t.waiting)) ? Number(t.waiting) : 0), 0);
        const waitingCount = Number.isFinite(Number(teacher.waiting)) ? Number(teacher.waiting) : 0;
        const estimatedMinutes = (totalWaiting + waitingCount) * 10 + (index + 1) * 10;
        const estimatedTime = formatTime(estimatedMinutes);
        const scheduleItem = document.createElement('div');
        scheduleItem.className = 'schedule-item';
        scheduleItem.innerHTML = `
            <div class="schedule-item-header">
                <span class="schedule-teacher-name">${teacher.name}</span>
                <span class="schedule-time">预计时间: ${estimatedTime}</span>
            </div>
            <div class="schedule-details">
                <p>班级: ${teacher.class}</p>
                <p class="schedule-location">前往位置: ${teacher.location}</p>
            </div>
        `;
        scheduleList.appendChild(scheduleItem);
        return teacher.id;
    });

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
