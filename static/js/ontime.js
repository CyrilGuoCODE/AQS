class QueueManager {
    constructor(initialQueue, teacherId) {
        this.queue = Array.isArray(initialQueue) ? [...initialQueue] : [];
        this.teacherId = teacherId;
        this.socket = null;
        this.pendingConfirmTimer = null;
        this.pendingParentId = null;
        this.skipUntilQueueUpdate = false;
        this.confirmDelay = 2000;
        this.initElements();
        this.initSocket();
        this.bindEvents();
        this.render();
    }

    initSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.setConnectionState(true);
            this.socket.emit('join_teacher_room', { teacherId: this.teacherId });
        });

        this.socket.on('disconnect', () => {
            this.setConnectionState(false);
        });

        this.socket.on('queue_update', (data) => {
            if (!data || String(data.teacherId) !== String(this.teacherId)) {
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
            if (data.teacherId && String(data.teacherId) !== String(this.teacherId)) {
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
            skipBtn: document.getElementById('skip-btn'),
            liveBadge: document.getElementById('live-badge'),
            liveText: document.getElementById('live-text'),
            waitingCount: document.getElementById('waiting-count')
        };
    }

    setConnectionState(online) {
        if (this.elements.liveBadge) {
            this.elements.liveBadge.classList.toggle('offline', !online);
        }
        if (this.elements.liveText) {
            this.elements.liveText.textContent = online ? '实时' : '离线';
        }
    }

    bindEvents() {
        this.elements.completeBtn.addEventListener('click', () => this.handleComplete());
        this.elements.skipBtn.addEventListener('click', () => this.handleSkip());
    }

    getCurrentParent() {
        return this.queue.find(item => item.status === 'current') || null;
    }

    getWaitingParents() {
        return this.queue.filter(item => item.status === 'waiting');
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
        const card = this.elements.currentParentCard;

        if (currentParent) {
            card.classList.remove('is-empty');
            card.innerHTML = `
                <div class="current-main">
                    <span class="current-avatar"><svg class="icon" aria-hidden="true"><use href="#i-user"></use></svg></span>
                    <div class="current-info">
                        <div class="current-meta">
                            <p class="current-label">预约家长</p>
                            <span class="status-badge status-current">进行中</span>
                        </div>
                        <p class="current-name">${this.escapeHtml(currentParent.name || '')}家长</p>
                    </div>
                </div>
            `;
            card.style.display = 'flex';
            this.elements.completeBtn.style.display = '';
            this.elements.skipBtn.style.display = '';
        } else {
            card.classList.add('is-empty');
            card.innerHTML = `
                <div class="current-main">
                    <span class="current-avatar"><svg class="icon" aria-hidden="true"><use href="#i-user"></use></svg></span>
                    <div class="current-info">
                        <div class="current-meta">
                            <p class="current-label">当前状态</p>
                        </div>
                        <p class="current-name">暂无正在谈话的家长</p>
                    </div>
                </div>
            `;
            card.style.display = 'flex';
            this.elements.completeBtn.style.display = 'none';
            this.elements.skipBtn.style.display = 'none';
        }
    }

    renderWaitingQueue(waitingParents) {
        const container = this.elements.waitingQueue;
        container.innerHTML = '';

        if (this.elements.waitingCount) {
            this.elements.waitingCount.textContent = `${waitingParents.length} 位`;
        }

        if (waitingParents.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'empty-hint';
            emptyMsg.textContent = '暂无等待的家长';
            container.appendChild(emptyMsg);
            return;
        }

        const visibleParents = waitingParents.slice(0, 4);
        visibleParents.forEach((parent, index) => {
            const card = document.createElement('div');
            card.className = 'waiting-item';
            card.style.animationDelay = `${index * 35}ms`;
            card.innerHTML = `
                <span class="queue-number">${index + 1}</span>
                <div class="parent-info">
                    <p>${this.escapeHtml(parent.name || '')}家长</p>
                </div>
            `;
            container.appendChild(card);
        });

        const remaining = waitingParents.length - visibleParents.length;
        if (remaining > 0) {
            const more = document.createElement('div');
            more.className = 'waiting-more';
            more.textContent = `另有 ${remaining} 位家长等待`;
            container.appendChild(more);
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
            if (this.elements.waitingCount) {
                this.elements.waitingCount.textContent = '0 位';
            }
            this.elements.queueDisplay.style.display = 'none';
            this.elements.emptyQueue.style.display = 'block';
            return;
        }

        this.elements.queueDisplay.style.display = 'grid';
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
            showToast('连接已断开，请刷新页面后重试');
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
            showToast('连接已断开，请刷新页面后重试');
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
    } else {
        console.error('Queue or teacherId not defined');
    }
});
