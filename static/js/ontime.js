class QueueManager {
    constructor(initialQueue, teacherId) {
        this.queue = Array.isArray(initialQueue) ? [...initialQueue] : [];
        this.teacherId = teacherId;
        this.socket = null;
        this.initSocket();
        this.initElements();
        this.bindEvents();
        this.render();
    }

    initSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Socket connected');
        });

        this.socket.on('queue_updated', (data) => {
            if (data.queue) {
                this.queue = data.queue;
                this.render();
            }
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
    }

    initElements() {
        this.elements = {
            queueDisplay: document.getElementById('queue-display'),
            emptyQueue: document.getElementById('empty-queue'),
            currentParentCard: document.getElementById('current-parent'),
            waitingQueue: document.getElementById('waiting-queue'),
            completeBtn: document.getElementById('complete-btn'),
            skipBtn: document.getElementById('skip-btn')
        };
    }

    bindEvents() {
        this.elements.completeBtn.addEventListener('click', () => this.handleComplete());
        this.elements.skipBtn.addEventListener('click', () => this.handleSkip());
    }

    getCurrentParent() {
        return this.queue.find(item => item.status === 'current') || null;
    }

    getWaitingParents() {
        return this.queue.filter(item => item.status === 'waiting').slice(0, 3);
    }

    renderCurrentParent(currentParent) {
        if (currentParent) {
            this.elements.currentParentCard.innerHTML = `
                <div class="parent-info">
                    <p><strong>家长姓名:</strong> ${this.escapeHtml(currentParent.parentName)}</p>
                    <p><strong>学生姓名:</strong> ${this.escapeHtml(currentParent.studentName)}</p>
                </div>
            `;
            this.elements.currentParentCard.style.display = 'block';
            this.elements.completeBtn.style.display = 'block';
            this.elements.skipBtn.style.display = 'block';
        } else {
            this.elements.currentParentCard.style.display = 'none';
            this.elements.completeBtn.style.display = 'none';
            this.elements.skipBtn.style.display = 'none';
        }
    }

    renderWaitingQueue(waitingParents) {
        this.elements.waitingQueue.innerHTML = '';
        
        if (waitingParents.length > 0) {
            waitingParents.forEach((parent, index) => {
                const card = document.createElement('div');
                card.className = 'waiting-parent-card';
                card.innerHTML = `
                    <div class="queue-number">${index + 1}</div>
                    <div class="parent-info">
                        <p><strong>家长姓名:</strong> ${this.escapeHtml(parent.parentName)}</p>
                        <p><strong>学生姓名:</strong> ${this.escapeHtml(parent.studentName)}</p>
                    </div>
                `;
                this.elements.waitingQueue.appendChild(card);
            });
        } else {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-waiting';
            emptyMsg.textContent = '暂无等待的家长';
            this.elements.waitingQueue.appendChild(emptyMsg);
        }
    }

    render() {
        const currentParent = this.getCurrentParent();
        const waitingParents = this.getWaitingParents();

        if (this.queue.length === 0) {
            this.elements.queueDisplay.style.display = 'none';
            this.elements.emptyQueue.style.display = 'block';
            return;
        }

        this.elements.queueDisplay.style.display = 'block';
        this.elements.emptyQueue.style.display = 'none';

        this.renderCurrentParent(currentParent);
        this.renderWaitingQueue(waitingParents);
    }

    handleComplete() {
        const currentParent = this.getCurrentParent();
        if (!currentParent) {
            return;
        }

        if (this.socket && this.socket.connected) {
            this.socket.emit('complete_parent', {
                teacherId: this.teacherId,
                parentId: currentParent.id || currentParent._id
            });
        } else {
            console.error('Socket 未连接');
        }
    }

    handleSkip() {
        const currentParent = this.getCurrentParent();
        if (!currentParent) {
            return;
        }

        if (this.socket && this.socket.connected) {
            this.socket.emit('skip_parent', {
                teacherId: this.teacherId,
                parentId: currentParent.id || currentParent._id
            });
        } else {
            console.error('Socket 未连接');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof queue !== 'undefined' && typeof teacherId !== 'undefined') {
        new QueueManager(queue, teacherId);
        console.log(queue, teacherId);
    } else {
        console.error('Queue or teacherId not defined');
    }
});
