function resolveTeacherIdentifier(entry, fallbackKey) {
    const candidates = [
        'teacher_id',
        'teacherId',
        'id',
        '_id',
        'teacher id',
        'teacher ID'
    ];
    if (entry && typeof entry === 'object') {
        for (let i = 0; i < candidates.length; i++) {
            const key = candidates[i];
            if (Object.prototype.hasOwnProperty.call(entry, key) && entry[key] !== undefined && entry[key] !== null) {
                return entry[key];
            }
        }
    }
    if (fallbackKey !== undefined && fallbackKey !== null) {
        if (typeof fallbackKey === 'string') {
            const matchedDigits = fallbackKey.match(/(\d+)/);
            if (matchedDigits && matchedDigits[0] !== undefined) {
                return matchedDigits[0];
            }
        }
        return fallbackKey;
    }
    return null;
}

function resolveRankingValue(entry) {
    if (!entry || typeof entry !== 'object') return undefined;
    const rankingKeys = ['ranking', 'Ranking', 'rank', 'Rank', 'position', 'Position', '名次', '排名'];
    for (let i = 0; i < rankingKeys.length; i++) {
        const key = rankingKeys[i];
        if (Object.prototype.hasOwnProperty.call(entry, key) && entry[key] !== undefined && entry[key] !== null) {
            const parsed = Number(entry[key]);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return undefined;
}

function normalizeTeacherEntries(source) {
    if (!source) return [];
    const result = [];
    const normalizeSingle = (value, fallbackKey) => {
        if (value && typeof value === 'object') {
            const teacherIdentifier = resolveTeacherIdentifier(value, fallbackKey);
            if (teacherIdentifier === null) return null;
            const rankingValue = resolveRankingValue(value);
            return { ...value, teacherId: String(teacherIdentifier), ranking: rankingValue };
        }
        const teacherIdentifier = value ?? fallbackKey;
        if (teacherIdentifier === undefined || teacherIdentifier === null) return null;
        return { teacherId: String(teacherIdentifier) };
    };
    if (Array.isArray(source)) {
        source.forEach(item => {
            const normalized = normalizeSingle(item);
            if (normalized) {
                result.push(normalized);
            }
        });
        return result;
    }
    if (typeof source === 'object') {
        Object.keys(source).forEach(key => {
            const normalized = normalizeSingle(source[key], key);
            if (normalized) {
                result.push(normalized);
            }
        });
    }
    return result;
}

function getWaitingCountFromRanking(ranking) {
    if (!Number.isFinite(ranking)) return 0;
    if (ranking <= 0) return 0;
    return ranking - 1;
}

function createScheduleItemElement(entry, appointmentStartTime) {
    const waitingCount = getWaitingCountFromRanking(entry.ranking);
    const estimatedTime = new Date(appointmentStartTime.getTime() + waitingCount * 10 * 60000);
    const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;
    const item = document.createElement('div');
    item.className = 'schedule-item';
    if (entry.isMust) {
        item.classList.add('must');
    }
    item.dataset.teacherId = entry.teacherId;
    const subject = entry.subject || '';
    const teacherName = entry.name || '';
    const location = entry.location || '';
    item.innerHTML = `
        <div class="schedule-item-header">
            <span class="schedule-teacher-name">${subject}${teacherName}</span>
        </div>
        <div class="schedule-details">
            <div class="teacher-info">
                <span><strong>地点:</strong> <span class="waiting-count">${location}</span></span>
            </div>
            <div class="teacher-info">
                <span><strong>前方等待:</strong> <span class="waiting-count">${waitingCount}人</span></span>
            </div>
            <div class="teacher-info">
                <span><strong>预计时间:</strong> <span class="waiting-count">${estimatedTimeStr}</span></span>
            </div>
        </div>
    `;
    return item;
}

function renderScheduleList() {
    const appointmentStartTime = new Date(startTime);
    const mustEntries = normalizeTeacherEntries(typeof mustTeachers !== 'undefined' ? mustTeachers : null).map(entry => ({
        ...entry,
        isMust: true
    }));
    const mustIds = new Set(mustEntries.map(entry => entry.teacherId));
    const appointmentEntries = normalizeTeacherEntries(typeof appointmentTeachers !== 'undefined' ? appointmentTeachers : null)
        .filter(entry => !mustIds.has(entry.teacherId))
        .map(entry => ({
            ...entry,
            isMust: false
        }));
    const scheduleList = document.getElementById('schedule-list');
    const emptyText = document.getElementById('empty-text');
    const actionBtn = document.getElementById('schedule-action-btn');
    if (!scheduleList) return;
    scheduleList.innerHTML = '';
    const hasEntries = mustEntries.length + appointmentEntries.length > 0;
    if (!hasEntries) {
        if (emptyText) {
            emptyText.hidden = false;
        }
        if (actionBtn) {
            actionBtn.textContent = '前往预约';
        }
        return;
    }
    if (emptyText) {
        emptyText.hidden = true;
    }
    if (actionBtn) {
        actionBtn.textContent = '更改预约';
    }
    mustEntries.concat(appointmentEntries).forEach(entry => {
        const item = createScheduleItemElement(entry, appointmentStartTime);
        scheduleList.appendChild(item);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    renderScheduleList();
});