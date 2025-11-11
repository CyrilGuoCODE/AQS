let selectedTeachers = [];
let parentName = '';
let studentName = '';
let countdownTimer = null;

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function submitStudentName() {
    const nameInput = document.getElementById('student-name-input');
    const name = nameInput.value.trim();

    if (!name) {
        alert('请输入孩子姓名');
        return;
    }

    studentName = name;
    localStorage.setItem('studentName', studentName);
    localStorage.setItem('parentName', parentName);
    
    nameInput.value = '';
    showNoticeModal();
}

function showNoticeModal() {
    const modal = document.getElementById('notice-modal');
    const closeBtn = document.getElementById('close-notice-btn');
    const countdownText = document.getElementById('countdown-text');
    
    modal.classList.add('active');
    closeBtn.disabled = true;
    
    let countdown = 5;
    countdownText.textContent = `${countdown}秒后自动关闭`;
    
    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownText.textContent = `${countdown}秒后自动关闭`;
        } else {
            countdownText.textContent = '';
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

    teachers.forEach(teacher => {
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
                <span><strong>前方等待:</strong> <span class="waiting-count">${teacher.waiting}人</span></span>
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

    selectedTeachers.forEach((teacher, index) => {
        const totalWaiting = selectedTeachers.slice(0, index).reduce((sum, t) => sum + t.waiting, 0);
        const estimatedMinutes = (totalWaiting + teacher.waiting) * 10 + (index + 1) * 10;
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
    });

    document.getElementById('parent-name-display').textContent = parentName;
    document.getElementById('student-name-display').textContent = studentName;
    showScreen('schedule-screen');
}

function formatTime(minutes) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + minutes * 60000);
    const hours = targetTime.getHours().toString().padStart(2, '0');
    const mins = targetTime.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
}

document.addEventListener('DOMContentLoaded', function() {
    parentName = '家长';
    if (localStorage.getItem('parentName')) {
        parentName = localStorage.getItem('parentName');
    }
    const savedStudentName = localStorage.getItem('studentName');
    if (savedStudentName) {
        studentName = savedStudentName;
        showNoticeModal();
    } else {
        showScreen('name-screen');
    }

    document.getElementById('student-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitStudentName();
        }
    });

    document.getElementById('name-submit-btn').addEventListener('click', submitStudentName);

    document.getElementById('close-notice-btn').addEventListener('click', closeNoticeModal);

    document.getElementById('submit-btn').addEventListener('click', submitAppointment);
});
