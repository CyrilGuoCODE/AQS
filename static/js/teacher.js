const teachers = [
    { id: 1, name: '1老师', class: '8年级1班', location: '教学楼111' },
    { id: 2, name: '2老师', class: '8年级2班', location: '教学楼222' },
    { id: 3, name: '3老师', class: '8年级1班', location: '教学楼333' },
    { id: 4, name: '4老师', class: '8年级2班', location: '教学楼444' },
    { id: 5, name: '5老师', class: '8年级1班', location: '教学楼555' },
    { id: 6, name: '6老师', class: '8年级2班', location: '教学楼666' },
    { id: 7, name: '7老师', class: '8年级1班', location: '教学楼777' },
    { id: 8, name: '8老师', class: '8年级2班', location: '教学楼888' }
];

let queues = {
    1: [
        { id: 1, parentName: '111家长', studentName: '111', status: 'current' },
        { id: 2, parentName: '222家长', studentName: '222', status: 'waiting' },
        { id: 3, parentName: '333家长', studentName: '333', status: 'waiting' },
        { id: 4, parentName: '444家长', studentName: '444', status: 'waiting' },
        { id: 5, parentName: '555家长', studentName: '555', status: 'waiting' }
    ],
    2: [
        { id: 6, parentName: '666家长', studentName: '666', status: 'current' },
        { id: 7, parentName: '777家长', studentName: '777', status: 'waiting' },
        { id: 8, parentName: '888家长', studentName: '888', status: 'waiting' }
    ],
    3: [
        { id: 9, parentName: '999家长', studentName: '999', status: 'current' },
        { id: 10, parentName: '123家长', studentName: '123', status: 'waiting' },
        { id: 11, parentName: '456家长', studentName: '456', status: 'waiting' },
        { id: 12, parentName: '789家长', studentName: '789', status: 'waiting' }
    ],
    4: [],
    5: [
        { id: 13, parentName: '101家长', studentName: '101', status: 'current' }
    ],
    6: [],
    7: [],
    8: []
};

function initTeacherSelect() {
    const select = document.getElementById('teacher-select');
    teachers.forEach(teacher => {
        const option = document.createElement('option');
        option.value = teacher.id;
        option.textContent = teacher.name;
        select.appendChild(option);
    });
}

function getCurrentParent(queue) {
    return queue.find(item => item.status === 'current') || null;
}

function getWaitingParents(queue) {
    return queue.filter(item => item.status === 'waiting').slice(0, 3);
}

function renderQueue(teacherId) {
    const queue = queues[teacherId] || [];
    const currentParent = getCurrentParent(queue);
    const waitingParents = getWaitingParents(queue);
    
    const queueDisplay = document.getElementById('queue-display');
    const emptyQueue = document.getElementById('empty-queue');
    
    if (queue.length === 0) {
        queueDisplay.style.display = 'none';
        emptyQueue.style.display = 'block';
        return;
    }
    
    queueDisplay.style.display = 'block';
    emptyQueue.style.display = 'none';
    
    const currentParentCard = document.getElementById('current-parent');
    const waitingQueue = document.getElementById('waiting-queue');
    
    if (currentParent) {
        currentParentCard.innerHTML = `
            <div class="parent-info">
                <p><strong>家长姓名:</strong> ${currentParent.parentName}</p>
                <p><strong>学生姓名:</strong> ${currentParent.studentName}</p>
            </div>
        `;
        currentParentCard.style.display = 'block';
        document.getElementById('complete-btn').style.display = 'block';
        document.getElementById('skip-btn').style.display = 'block';
    } else {
        currentParentCard.style.display = 'none';
        document.getElementById('complete-btn').style.display = 'none';
        document.getElementById('skip-btn').style.display = 'none';
    }
    
    waitingQueue.innerHTML = '';
    if (waitingParents.length > 0) {
        waitingParents.forEach((parent, index) => {
            const card = document.createElement('div');
            card.className = 'waiting-parent-card';
            card.innerHTML = `
                <div class="queue-number">${index + 1}</div>
                <div class="parent-info">
                    <p><strong>家长姓名:</strong> ${parent.parentName}</p>
                    <p><strong>学生姓名:</strong> ${parent.studentName}</p>
                </div>
            `;
            waitingQueue.appendChild(card);
        });
    } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-waiting';
        emptyMsg.textContent = '暂无等待的家长';
        waitingQueue.appendChild(emptyMsg);
    }
}

function completeCurrentParent(teacherId) {
    const queue = queues[teacherId] || [];
    const currentIndex = queue.findIndex(item => item.status === 'current');
    
    if (currentIndex !== -1) {
        queue.splice(currentIndex, 1);
        
        if (queue.length > 0) {
            queue[0].status = 'current';
        }
        
        renderQueue(teacherId);
    }
}

function skipCurrentParent(teacherId) {
    const queue = queues[teacherId] || [];
    const currentIndex = queue.findIndex(item => item.status === 'current');
    
    if (currentIndex !== -1) {
        const currentParent = queue[currentIndex];
        queue.splice(currentIndex, 1);
        
        currentParent.status = 'waiting';
        
        if (queue.length > 0) {
            queue[0].status = 'current';
            if (queue.length > 1) {
                queue.splice(1, 0, currentParent);
            } else {
                queue.push(currentParent);
            }
        } else {
            queue.push(currentParent);
            currentParent.status = 'current';
        }
        
        renderQueue(teacherId);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initTeacherSelect();
    
    const teacherSelect = document.getElementById('teacher-select');
    teacherSelect.addEventListener('change', function() {
        const teacherId = parseInt(this.value);
        if (teacherId) {
            renderQueue(teacherId);
        } else {
            document.getElementById('queue-display').style.display = 'none';
            document.getElementById('empty-queue').style.display = 'none';
        }
    });
    
    document.getElementById('complete-btn').addEventListener('click', function() {
        const teacherId = parseInt(teacherSelect.value);
        if (teacherId) {
            completeCurrentParent(teacherId);
        }
    });

    document.getElementById('skip-btn').addEventListener('click', function() {
        const teacherId = parseInt(teacherSelect.value);
        if (teacherId) {
            skipCurrentParent(teacherId);
        }
    });
});