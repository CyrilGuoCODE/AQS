function getCurrentParent(queue) {
    return queue.find(item => item.status === 'current') || null;
}

function getWaitingParents(queue) {
    return queue.filter(item => item.status === 'waiting').slice(0, 3);
}

function renderQueue() {
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

function completeCurrentParent() {
    const currentIndex = queue.findIndex(item => item.status === 'current');
    
    if (currentIndex !== -1) {
        queue.splice(currentIndex, 1);
        
        if (queue.length > 0) {
            queue[0].status = 'current';
        }
        
        renderQueue();
    }
}

function skipCurrentParent() {
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
        
        renderQueue();
    }
}

document.addEventListener('DOMContentLoaded', function() {

    renderQueue()

    document.getElementById('complete-btn').addEventListener('click', () => completeCurrentParent(teacherId));

    document.getElementById('skip-btn').addEventListener('click', () => skipCurrentParent(teacherId));
});