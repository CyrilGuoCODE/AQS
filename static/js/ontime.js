class QueueManager {
    constructor(initialQueue, teacherId) {
        this.queue = Array.isArray(initialQueue) ? [...initialQueue] : [];
        this.teacherId = teacherId;
        this.socket = null;
        this.pendingConfirmTimer = null;
        this.pendingParentId = null;
        this.skipUntilQueueUpdate = false;
        this.confirmDelay = 2000;
        this.initSocket();
        this.initElements();
        this.bindEvents();
        this.render();
    }

    initSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.socket.emit('join_teacher_room', { teacherId: this.teacherId });
        });

        this.socket.on('queue_update', (data) => {
            if (!data || data.teacherId !== this.teacherId) {
                return;
            }
            if (data.queue) {
                this.queue = data.queue;
                this.skipUntilQueueUpdate = false;
                this.resetPendingConfirm();
                this.render();
            }
        });

        this.socket.on('promote_rejected', (data = {}) => {
            if (data.teacherId && data.teacherId !== this.teacherId) {
                return;
            }
            this.handlePromotionRejected();
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

    resetPendingConfirm() {
        if (this.pendingConfirmTimer) {
            clearTimeout(this.pendingConfirmTimer);
            this.pendingConfirmTimer = null;
        }
        this.pendingParentId = null;
    }

    promoteFirstWaiting() {
        if (this.queue.length === 0) {
            return null;
        }

        const waitingIndex = this.queue.findIndex(item => item.status === 'waiting');
        if (waitingIndex === -1) {
            return null;
        }

        let promotedParent = null;
        this.queue = this.queue.map((item, index) => {
            if (item.status === 'current') {
                return { ...item, status: 'waiting' };
            }
            if (index === waitingIndex) {
                promotedParent = { ...item, status: 'current' };
                return promotedParent;
            }
            return item;
        });

        return promotedParent;
    }

    requestPromoteConfirm(promotedParent) {
        if (!promotedParent || !this.socket) {
            return;
        }
        this.resetPendingConfirm();
        this.pendingParentId = promotedParent.id || promotedParent._id || null;
        this.pendingConfirmTimer = setTimeout(() => {
            if (this.socket.connected) {
                const parentName = promotedParent.name || promotedParent.parentName || '';
                this.socket.emit('promote_first_waiting', {
                    teacherId: this.teacherId,
                    parentId: this.pendingParentId,
                    parentName
                });
            } else {
                console.warn('Socket 未连接，无法通知后端确认');
            }
            this.pendingConfirmTimer = null;
        }, this.confirmDelay);
    }

    handlePromotionRejected() {
        if (this.pendingParentId) {
            this.queue = this.queue.map((item) => {
                const itemId = item.id || item._id;
                if (itemId === this.pendingParentId) {
                    return { ...item, status: 'waiting' };
                }
                return item;
            });
        }
        this.skipUntilQueueUpdate = true;
        this.resetPendingConfirm();
        this.render();
    }

    renderCurrentParent(currentParent) {
        if (currentParent) {
            this.elements.currentParentCard.innerHTML = `
                <div class="parent-info">
                    <p><strong>预约家长:</strong> ${this.escapeHtml(currentParent.name)}家长</p>
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
                        <p><strong>预约家长:</strong> ${this.escapeHtml(parent.name)}家长</p>
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
        let currentParent = this.getCurrentParent();

        if (!currentParent && !this.skipUntilQueueUpdate) {
            const promotedParent = this.promoteFirstWaiting();
            if (promotedParent) {
                currentParent = promotedParent;
                this.requestPromoteConfirm(promotedParent);
            }
        }

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
                parentId: currentParent.id || currentParent._id,
                parentName: currentParent.name || currentParent.parentName || ''
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
                parentId: currentParent.id || currentParent._id,
                parentName: currentParent.name || currentParent.parentName || ''
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
