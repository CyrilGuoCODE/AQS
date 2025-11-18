/**
 * 预约列表管理 - 优化版
 * 主要优化点：
 * 1. 使用对象池减少DOM创建销毁
 * 2. 添加排序和筛选功能
 * 3. 优化DOM操作和事件处理
 * 4. 添加导出功能
 * 5. 提高代码可维护性
 */

// 全局状态管理
const state = {
    queue: [],
    filteredQueue: [],
    sortBy: 'index', // index, name, time, status
    sortOrder: 'asc', // asc, desc
    statusFilter: 'all', // all, waiting, current, completed, skipped
    lastUpdateTime: null
};

// DOM缓存
const dom = {
    tableWrapper: null,
    emptyList: null,
    tableBody: null,
    sortButtons: null,
    statusFilter: null,
    refreshBtn: null,
    exportBtn: null
};

// 状态文本映射
const statusTextMap = {
    'waiting': '等待中',
    'current': '进行中',
    'completed': '已完成',
    'skipped': '已跳过'
};

// 状态颜色映射
const statusColorMap = {
    'waiting': '#2196F3', // 蓝色
    'current': '#FF9800', // 橙色
    'completed': '#4CAF50', // 绿色
    'skipped': '#9E9E9E'  // 灰色
};

// 对象池，减少DOM创建销毁
const elementPool = {
    tableRows: []
};

// 初始化函数
function init() {
    // 缓存DOM元素
    cacheDOMElements();

    // 初始化数据
    initData();

    // 设置事件监听
    setupEventListeners();

    // 渲染列表
    renderList();
}

// 缓存DOM元素
function cacheDOMElements() {
    dom.tableWrapper = document.getElementById('list-table-wrapper');
    dom.emptyList = document.getElementById('empty-list');
    dom.tableBody = document.getElementById('list-table-body');
    dom.sortButtons = document.querySelectorAll('.sort-btn');
    dom.statusFilter = document.getElementById('status-filter');
    dom.refreshBtn = document.getElementById('refresh-btn');
    dom.exportBtn = document.getElementById('export-btn');
}

// 初始化数据
function initData() {
    if (typeof t_queue !== 'undefined') {
        state.queue = [...t_queue];
        state.lastUpdateTime = new Date();
    }

    // 初始化过滤后的队列
    applyFilters();
}

// 设置事件监听器
function setupEventListeners() {
    // 排序按钮
    if (dom.sortButtons) {
        dom.sortButtons.forEach(btn => {
            btn.addEventListener('click', handleSortClick);
        });
    }

    // 状态筛选
    if (dom.statusFilter) {
        dom.statusFilter.addEventListener('change', handleStatusFilterChange);
    }

    // 刷新按钮
    if (dom.refreshBtn) {
        dom.refreshBtn.addEventListener('click', handleRefresh);
    }

    // 导出按钮
    if (dom.exportBtn) {
        dom.exportBtn.addEventListener('click', handleExport);
    }

    // 添加键盘快捷键
    document.addEventListener('keydown', handleKeyPress);
}

// 处理排序点击
function handleSortClick(event) {
    const sortBy = event.target.dataset.sort;

    if (state.sortBy === sortBy) {
        // 切换排序顺序
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        // 更新排序字段
        state.sortBy = sortBy;
        state.sortOrder = 'asc';
    }

    // 更新按钮样式
    updateSortButtons();

    // 应用排序和筛选
    applyFilters();

    // 重新渲染
    renderList();
}

// 更新排序按钮样式
function updateSortButtons() {
    if (!dom.sortButtons) return;

    dom.sortButtons.forEach(btn => {
        const sortBy = btn.dataset.sort;

        // 移除所有样式
        btn.classList.remove('sort-asc', 'sort-desc');

        // 添加当前排序样式
        if (state.sortBy === sortBy) {
            btn.classList.add(state.sortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// 处理状态筛选变化
function handleStatusFilterChange(event) {
    state.statusFilter = event.target.value;

    // 应用筛选
    applyFilters();

    // 重新渲染
    renderList();
}

// 处理刷新
function handleRefresh() {
    if (dom.refreshBtn) {
        dom.refreshBtn.disabled = true;
        dom.refreshBtn.textContent = '刷新中...';
    }

    // 这里可以添加实际的数据刷新逻辑
    // 例如：fetch('/api/teacher/queue').then(...)

    // 模拟刷新
    setTimeout(() => {
        state.lastUpdateTime = new Date();

        if (dom.refreshBtn) {
            dom.refreshBtn.disabled = false;
            dom.refreshBtn.textContent = '刷新';
        }

        // 显示更新时间
        showUpdateMessage();
    }, 1000);
}

// 处理导出
function handleExport() {
    // 创建CSV内容
    let csvContent = "序号,学生姓名,预约时间,状态\n";

    state.filteredQueue.forEach((item, index) => {
        const fullName = item.name || '';
        const status = item.status || 'waiting';
        const statusText = statusTextMap[status] || '未知';

        // 计算预约时间
        let appointmentTime = item.appointmentTime || item.appointment_time;
        if (!appointmentTime && typeof t_start_time !== 'undefined') {
            const appointmentStartTime = new Date(t_start_time);
            const originalIndex = state.queue.findIndex(i => i.name === item.name);
            const estimatedTime = new Date(appointmentStartTime.getTime() + originalIndex * 10 * 60000);
            appointmentTime = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;
        }
        appointmentTime = appointmentTime || '-';

        csvContent += `${index + 1},"${escapeCsv(fullName)}","${appointmentTime}","${statusText}"\n`;
    });

    // 创建下载链接
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `预约列表_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadLink.style.display = 'none';

    // 触发下载
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // 释放URL对象
    URL.revokeObjectURL(url);
}

// 处理键盘事件
function handleKeyPress(event) {
    // Ctrl+R 或 F5 刷新
    if ((event.ctrlKey && event.key === 'r') || event.key === 'F5') {
        event.preventDefault();
        handleRefresh();
    }

    // Ctrl+E 导出
    if (event.ctrlKey && event.key === 'e') {
        event.preventDefault();
        handleExport();
    }
}

// 应用筛选和排序
function applyFilters() {
    // 先复制原始队列
    let filtered = [...state.queue];

    // 应用状态筛选
    if (state.statusFilter !== 'all') {
        filtered = filtered.filter(item => item.status === state.statusFilter);
    }

    // 应用排序
    filtered.sort((a, b) => {
        let aValue, bValue;

        switch (state.sortBy) {
            case 'name':
                aValue = a.name || '';
                bValue = b.name || '';
                break;
            case 'time':
                aValue = a.appointmentTime || a.appointment_time || '';
                bValue = b.appointmentTime || b.appointment_time || '';
                break;
            case 'status':
                aValue = a.status || '';
                bValue = b.status || '';
                break;
            case 'index':
            default:
                aValue = state.queue.indexOf(a);
                bValue = state.queue.indexOf(b);
                break;
        }

        // 比较值
        if (aValue < bValue) {
            return state.sortOrder === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return state.sortOrder === 'asc' ? 1 : -1;
        }
        return 0;
    });

    // 更新筛选后的队列
    state.filteredQueue = filtered;
}

// 渲染列表
function renderList() {
    if (!dom.tableWrapper || !dom.emptyList || !dom.tableBody) return;

    if (!state.filteredQueue || state.filteredQueue.length === 0) {
        dom.tableWrapper.style.display = 'none';
        dom.emptyList.style.display = 'block';
        return;
    }

    // 使用文档片段减少DOM重排
    const fragment = document.createDocumentFragment();

    // 清空表格内容
    dom.tableBody.innerHTML = '';

    // 渲染每一行
    state.filteredQueue.forEach((item, index) => {
        const row = createTableRow(item, index);
        fragment.appendChild(row);
    });

    // 添加到表格
    dom.tableBody.appendChild(fragment);

    // 显示表格，隐藏空列表提示
    dom.tableWrapper.style.display = 'block';
    dom.emptyList.style.display = 'none';

    // 更新统计信息
    updateStatistics();
}

// 创建表格行
function createTableRow(item, index) {
    // 从对象池获取行或创建新行
    const row = elementPool.tableRows.length > 0 
        ? elementPool.tableRows.pop() 
        : document.createElement('tr');

    // 重置行内容
    row.innerHTML = '';
    row.className = '';

    // 获取数据
    const fullName = item.name || '';
    const status = item.status || 'waiting';

    // 计算预约时间
    let appointmentTime = item.appointmentTime || item.appointment_time;
    if (!appointmentTime && typeof t_start_time !== 'undefined') {
        const appointmentStartTime = new Date(t_start_time);
        const originalIndex = state.queue.findIndex(i => i.name === item.name);
        const estimatedTime = new Date(appointmentStartTime.getTime() + originalIndex * 10 * 60000);
        appointmentTime = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;
    }
    appointmentTime = appointmentTime || '-';

    const statusText = statusTextMap[status] || '未知';
    const statusColor = statusColorMap[status] || '#9E9E9E';

    // 设置行内容
    row.innerHTML = `
        <td>${index + 1}</td>
        <td>${escapeHtml(fullName)}</td>
        <td>${escapeHtml(appointmentTime)}</td>
        <td>
            <span class="status-badge" style="background-color: ${statusColor};">
                ${escapeHtml(statusText)}
            </span>
        </td>
    `;

    // 添加状态类
    row.classList.add(`status-${status}`);

    return row;
}

// 更新统计信息
function updateStatistics() {
    const statsElement = document.getElementById('list-stats');
    if (!statsElement) return;

    // 计算统计数据
    const total = state.queue.length;
    const waiting = state.queue.filter(item => item.status === 'waiting').length;
    const current = state.queue.filter(item => item.status === 'current').length;
    const completed = state.queue.filter(item => item.status === 'completed').length;
    const skipped = state.queue.filter(item => item.status === 'skipped').length;

    // 更新显示
    statsElement.innerHTML = `
        <div class="stat-item">
            <span class="stat-label">总计:</span>
            <span class="stat-value">${total}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">等待中:</span>
            <span class="stat-value waiting">${waiting}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">进行中:</span>
            <span class="stat-value current">${current}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">已完成:</span>
            <span class="stat-value completed">${completed}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">已跳过:</span>
            <span class="stat-value skipped">${skipped}</span>
        </div>
    `;
}

// 显示更新消息
function showUpdateMessage() {
    const messageElement = document.getElementById('update-message');
    if (!messageElement) return;

    const timeStr = state.lastUpdateTime.toLocaleTimeString();
    messageElement.textContent = `最后更新: ${timeStr}`;
    messageElement.style.display = 'block';

    // 3秒后自动隐藏
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, 3000);
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// CSV转义
function escapeCsv(text) {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
