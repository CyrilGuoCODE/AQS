document.addEventListener('DOMContentLoaded', function() {
    const appointmentStartTime = new Date(startTime);
    
    const allTeachers = [];
    
    if (typeof mustTeachers !== 'undefined' && Array.isArray(mustTeachers)) {
        mustTeachers.forEach(teacher => {
            allTeachers.push({...teacher, isMust: true});
        });
    }
    
    if (typeof appointmentTeachers !== 'undefined' && Array.isArray(appointmentTeachers)) {
        appointmentTeachers.forEach(teacher => {
            if (!allTeachers.find(t => t.teacher_id === teacher.teacher_id)) {
                allTeachers.push({...teacher, isMust: false});
            }
        });
    }

    allTeachers.forEach(teacher => {
        const waitingCount = teacher.ranking || 0;
        const totalWaiting = waitingCount;
        const estimatedTime = new Date(appointmentStartTime.getTime() + totalWaiting * 10 * 60000);
        const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;
        
        const waitingElement = document.querySelector(`[data-waiting="${teacher.teacher_id}"]`);
        const timeElement = document.querySelector(`[data-time="${teacher.teacher_id}"]`);
        
        if (waitingElement) {
            waitingElement.textContent = `${waitingCount}人`;
        }
        
        if (timeElement) {
            timeElement.textContent = estimatedTimeStr;
        }
    });
});

