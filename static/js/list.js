document.addEventListener('DOMContentLoaded', function() {
    const statusTextMap = {
        'waiting': '等待中',
        'current': '进行中',
        'completed': '已完成',
        'skipped': '已跳过'
    };
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function renderList(queue) {
        const tableWrapper = document.getElementById('list-table-wrapper');
        const emptyList = document.getElementById('empty-list');
        const tableBody = document.getElementById('list-table-body');
        
        if (!queue || queue.length === 0) {
            tableWrapper.style.display = 'none';
            emptyList.style.display = 'block';
            return;
        }
        
        tableBody.innerHTML = '';
        
        queue.forEach((item, index) => {
            const fullName = item.name || '';
            const status = item.status || 'waiting';
            const appointmentTime = item.appointmentTime || item.appointment_time || '-';
            const statusText = statusTextMap[status] || '未知';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${escapeHtml(fullName)}</td>
                <td>${escapeHtml(appointmentTime)}</td>
                <td>
                    <span class="status-badge status-${status}">
                        ${escapeHtml(statusText)}
                    </span>
                </td>
            `;
            tableBody.appendChild(row);
        });
        
        tableWrapper.style.display = 'block';
        emptyList.style.display = 'none';
    }
    
    if (typeof t_queue !== 'undefined') {
        renderList(t_queue);
    } else {
        const emptyList = document.getElementById('empty-list');
        const tableWrapper = document.getElementById('list-table-wrapper');
        tableWrapper.style.display = 'none';
        emptyList.style.display = 'block';
    }
});

