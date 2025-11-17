function normalizeTeacherEntry(entry, fallbackId) {
    if (entry && typeof entry === 'object') {
        const teacherId = entry.teacher_id ?? fallbackId;
        if (teacherId === undefined || teacherId === null) return null;
        return {...entry, teacher_id: teacherId};
    }
    const teacherId = entry ?? fallbackId;
    if (teacherId === undefined || teacherId === null) return null;
    return {teacher_id: teacherId};
}

function normalizeTeacherEntries(source) {
    if (!source) return [];
    if (Array.isArray(source)) {
        return source.map(item => normalizeTeacherEntry(item)).filter(item => item !== null);
    }
    if (typeof source === 'object') {
        return Object.keys(source).map(key => normalizeTeacherEntry(source[key], key)).filter(item => item !== null);
    }
    return [];
}

document.addEventListener('DOMContentLoaded', function() {
    const appointmentStartTime = new Date(startTime);
    const teacherMap = new Map();
    normalizeTeacherEntries(typeof mustTeachers !== 'undefined' ? mustTeachers : null).forEach(teacher => {
        const teacherId = String(teacher.teacher_id);
        teacherMap.set(teacherId, {...teacher, isMust: true});
    });
    normalizeTeacherEntries(typeof appointmentTeachers !== 'undefined' ? appointmentTeachers : null).forEach(teacher => {
        const teacherId = String(teacher.teacher_id);
        if (teacherMap.has(teacherId)) {
            teacherMap.set(teacherId, {...teacherMap.get(teacherId), ...teacher});
        } else {
            teacherMap.set(teacherId, {...teacher, isMust: false});
        }
    });
    Array.from(teacherMap.values()).forEach(teacher => {
        const teacherId = String(teacher.teacher_id ?? '');
        if (!teacherId) return;
        const rankingValue = Number(teacher.ranking);
        const waitingCount = Number.isFinite(rankingValue) && rankingValue > 0 ? rankingValue - 1 : 0;
        const estimatedTime = new Date(appointmentStartTime.getTime() + waitingCount * 10 * 60000);
        const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;
        const waitingElement = document.querySelector(`[data-waiting="${teacherId}"]`);
        const timeElement = document.querySelector(`[data-time="${teacherId}"]`);
        if (waitingElement) {
            waitingElement.textContent = `${waitingCount}人`;
        }
        if (timeElement) {
            timeElement.textContent = estimatedTimeStr;
        }
    });
});