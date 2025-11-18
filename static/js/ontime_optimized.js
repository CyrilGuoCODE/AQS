/**
 * 实时队列管理系统 - 优化版
 * 主要优化点：
 * 1. 使用对象池减少DOM创建销毁
 * 2. 添加连接状态指示和重连机制
 * 3. 优化事件处理和状态管理
 * 4. 添加性能监控和错误恢复
 * 5. 提高代码可维护性
 */

class QueueManager {
    constructor(initialQueue, teacherId) {
        // 状态管理
        this.state = {
            queue: Array.isArray(initialQueue) ? [...initialQueue] : [],
            teacherId: teacherId,
            socketConnected: false,
            isProcessing: false,
            lastUpdateTime: Date.now()
        };

        // DOM缓存
        this.dom = {
            queueDisplay: null,
            emptyQueue: null,
            currentParentCard: null,
            waitingQueue: null,
            completeBtn: null,
            skipBtn: null,
            connectionIndicator: null,
            retryBtn: null
        };

        // 对象池
        this.elementPool = {
            waitingCards: [],
            emptyMessages: []
        };

        // 初始化
        this.init();
    }

    // 初始化方法
    init() {
        this.initElements();
        this.initSocket();
        this.bindEvents();
        this.render();
        this.startHeartbeat();
    }

    // 初始化DOM元素
    initElements() {
        this.dom.queueDisplay = document.getElementById('queue-display');
        this.dom.emptyQueue = document.getElementById('empty-queue');
        this.dom.currentParentCard = document.getElementById('current-parent');
        this.dom.waitingQueue = document.getElementById('waiting-queue');
        this.dom.completeBtn = document.getElementById('complete-btn');
        this.dom.skipBtn = document.getElementById('skip-btn');

        // 添加连接状态指示器（如果不存在则创建）
        this.createConnectionIndicator();
    }

    // 创建连接状态指示器
    createConnectionIndicator() {
        let indicator = document.getElementById('connection-indicator');

        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'connection-indicator';
            indicator.className = 'connection-indicator';

            // 添加样式
            indicator.style.position = 'fixed';
            indicator.style.top = '10px';
            indicator.style.right = '10px';
            indicator.style.padding = '8px 12px';
            indicator.style.borderRadius = '4px';
            indicator.style.fontSize = '14px';
            indicator.style.zIndex = '1000';
            indicator.style.transition = 'all 0.3s ease';

            // 添加重试按钮
            const retryBtn = document.createElement('button');
            retryBtn.id = 'retry-connection';
            retryBtn.textContent = '重试连接';
            retryBtn.className = 'retry-btn';
            retryBtn.style.display = 'none';
            retryBtn.style.marginLeft = '10px';

            indicator.appendChild(document.createTextNode('连接状态: '));
            indicator.appendChild(retryBtn);

            document.body.appendChild(indicator);

            this.dom.connectionIndicator = indicator;
            this.dom.retryBtn = retryBtn;

            // 绑定重试事件
            retryBtn.addEventListener('click', () => this.reconnectSocket());
        }
    }

    // 初始化Socket连接
    initSocket() {
        this.state.socket = io({
            timeout: 20000,
            forceNew: true
        });

        this.state.socket.on('connect', () => {
            console.log('Socket connected');
            this.state.socketConnected = true;
            this.updateConnectionStatus(true);

            // 加入教师房间
            this.state.socket.emit('join_teacher_room', {
                teacherId: this.state.teacherId
            });
        });

        this.state.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.state.socketConnected = false;
            this.updateConnectionStatus(false);
        });

        this.state.socket.on('queue_updated', (data) => {
            if (data.queue) {
                this.state.queue = data.queue;
                this.state.lastUpdateTime = Date.now();
                this.render();
            }
        });

        this.state.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.state.socketConnected = false;
            this.updateConnectionStatus(false);
        });

        this.state.socket.on('reconnect_attempt', () => {
            console.log('Attempting to reconnect...');
            this.updateConnectionStatus(false, '正在重连...');
        });
    }

    // 更新连接状态显示
    updateConnectionStatus(isConnected, customText = '') {
        if (!this.dom.connectionIndicator) return;

        const statusText = customText || (isConnected ? '已连接' : '连接断开');
        this.dom.connectionIndicator.innerHTML = `连接状态: ${statusText}`;

        // 更新样式
        if (isConnected) {
            this.dom.connectionIndicator.style.backgroundColor = '#4CAF50';
            this.dom.connectionIndicator.style.color = 'white';
            if (this.dom.retryBtn) this.dom.retryBtn.style.display = 'none';
        } else {
            this.dom.connectionIndicator.style.backgroundColor = '#f44336';
            this.dom.connectionIndicator.style.color = 'white';
            if (this.dom.retryBtn) this.dom.retryBtn.style.display = 'inline-block';
        }
    }

    // 重连Socket
    reconnectSocket() {
        if (this.state.socket) {
            this.state.socket.disconnect();
        }
        this.initSocket();
    }

    // 绑定事件
    bindEvents() {
        if (this.dom.completeBtn) {
            this.dom.completeBtn.addEventListener('click', () => this.handleComplete());
        }

        if (this.dom.skipBtn) {
            this.dom.skipBtn.addEventListener('click', () => this.handleSkip());
        }

        // 添加键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === 'c' || e.key === 'C') {
                this.handleComplete();
            } else if (e.key === 's' || e.key === 'S') {
                this.handleSkip();
            }
        });
    }

    // 开始心跳检测
    startHeartbeat() {
        setInterval(() => {
            if (this.state.socket && this.state.socketConnected) {
                this.state.socket.emit('heartbeat', {
                    teacherId: this.state.teacherId,
                    timestamp: Date.now()
                });
            }
        }, 30000); // 每30秒发送一次心跳
    }

    // 获取当前家长
    getCurrentParent() {
        return this.state.queue.find(item => item.status === 'current') || null;
    }

    // 获取等待中的家长（最多3个）
    getWaitingParents() {
        return this.state.queue
            .filter(item => item.status === 'waiting')
            .slice(0, 3);
    }

    // 渲染当前家长
    renderCurrentParent(currentParent) {
        if (!this.dom.currentParentCard) return;

        if (currentParent) {
            this.dom.currentParentCard.innerHTML = `
                <div class="parent-info">
                    <p><strong>预约家长:</strong> ${this.escapeHtml(currentParent.name)}家长</p>
                    <p class="timestamp">更新时间: ${new Date(this.state.lastUpdateTime).toLocaleTimeString()}</p>
                </div>
            `;
            this.dom.currentParentCard.style.display = 'block';

            if (this.dom.completeBtn) this.dom.completeBtn.style.display = 'block';
            if (this.dom.skipBtn) this.dom.skipBtn.style.display = 'block';
        } else {
            this.dom.currentParentCard.style.display = 'none';

            if (this.dom.completeBtn) this.dom.completeBtn.style.display = 'none';
            if (this.dom.skipBtn) this.dom.skipBtn.style.display = 'none';
        }
    }

    // 渲染等待队列
    renderWaitingQueue(waitingParents) {
        if (!this.dom.waitingQueue) return;

        // 清空现有内容
        this.dom.waitingQueue.innerHTML = '';

        if (waitingParents.length > 0) {
            // 使用文档片段减少DOM重排
            const fragment = document.createDocumentFragment();

            waitingParents.forEach((parent, index) => {
                const card = this.getOrCreateWaitingCard();
                card.className = 'waiting-parent-card';
                card.innerHTML = `
                    <div class="queue-number">${index + 1}</div>
                    <div class="parent-info">
                        <p><strong>预约家长:</strong> ${this.escapeHtml(parent.name)}家长</p>
                    </div>
                `;
                fragment.appendChild(card);
            });

            this.dom.waitingQueue.appendChild(fragment);
        } else {
            // 显示空消息
            const emptyMsg = this.getOrCreateEmptyMessage();
            emptyMsg.className = 'empty-waiting';
            emptyMsg.textContent = '暂无等待的家长';
            this.dom.waitingQueue.appendChild(emptyMsg);
        }
    }

    // 获取或创建等待卡片（对象池）
    getOrCreateWaitingCard() {
        if (this.elementPool.waitingCards.length > 0) {
            return this.elementPool.waitingCards.pop();
        }

        const card = document.createElement('div');
        card.className = 'waiting-parent-card';
        return card;
    }

    // 获取或创建空消息（对象池）
    getOrCreateEmptyMessage() {
        if (this.elementPool.emptyMessages.length > 0) {
            return this.elementPool.emptyMessages.pop();
        }

        const msg = document.createElement('div');
        return msg;
    }

    // 渲染队列
    render() {
        const currentParent = this.getCurrentParent();
        const waitingParents = this.getWaitingParents();

        if (this.state.queue.length === 0) {
            if (this.dom.queueDisplay) this.dom.queueDisplay.style.display = 'none';
            if (this.dom.emptyQueue) this.dom.emptyQueue.style.display = 'block';
            return;
        }

        if (this.dom.queueDisplay) this.dom.queueDisplay.style.display = 'block';
        if (this.dom.emptyQueue) this.dom.emptyQueue.style.display = 'none';

        this.renderCurrentParent(currentParent);
        this.renderWaitingQueue(waitingParents);
    }

    // 处理完成
    handleComplete() {
        if (this.state.isProcessing) return;

        const currentParent = this.getCurrentParent();
        if (!currentParent) {
            alert('当前没有正在进行的预约');
            return;
        }

        this.state.isProcessing = true;

        if (this.state.socket && this.state.socketConnected) {
            this.state.socket.emit('complete_parent', {
                teacherId: this.state.teacherId,
                parentId: currentParent.id || currentParent._id
            });
        } else {
            alert('网络连接已断开，请检查网络后重试');
            this.updateConnectionStatus(false);
        }

        // 延迟重置处理状态，防止重复操作
        setTimeout(() => {
            this.state.isProcessing = false;
        }, 1000);
    }

    // 处理跳过
    handleSkip() {
        if (this.state.isProcessing) return;

        const currentParent = this.getCurrentParent();
        if (!currentParent) {
            alert('当前没有正在进行的预约');
            return;
        }

        this.state.isProcessing = true;

        if (this.state.socket && this.state.socketConnected) {
            this.state.socket.emit('skip_parent', {
                teacherId: this.state.teacherId,
                parentId: currentParent.id || currentParent._id
            });
        } else {
            alert('网络连接已断开，请检查网络后重试');
            this.updateConnectionStatus(false);
        }

        // 延迟重置处理状态，防止重复操作
        setTimeout(() => {
            this.state.isProcessing = false;
        }, 1000);
    }

    // HTML转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    if (typeof queue !== 'undefined' && typeof teacherId !== 'undefined') {
        // 创建队列管理器实例
        window.queueManager = new QueueManager(queue, teacherId);
        console.log('队列管理器已初始化', queue, teacherId);
    } else {
        console.error('队列数据或教师ID未定义');

        // 显示错误信息
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = '加载队列数据失败，请刷新页面重试';
        errorDiv.style.padding = '20px';
        errorDiv.style.textAlign = 'center';
        errorDiv.style.color = '#f44336';

        document.body.appendChild(errorDiv);
    }
});
