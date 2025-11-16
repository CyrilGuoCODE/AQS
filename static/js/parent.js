document.addEventListener('DOMContentLoaded', function() {
    const appointmentStartTime = new Date(startTime);
    let currentPosition = 0;
    
    const allTeachers = [];
    
    if (typeof mustTeachers !== 'undefined' && Array.isArray(mustTeachers)) {
        mustTeachers.forEach(teacher => {
            allTeachers.push({...teacher, isMust: true});
        });
    }
    
    if (typeof appointmentTeachers !== 'undefined' && Array.isArray(appointmentTeachers)) {
        appointmentTeachers.forEach(teacher => {
            if (!allTeachers.find(t => t.id === teacher.id)) {
                allTeachers.push({...teacher, isMust: false});
            }
        });
    }
    
    allTeachers.forEach(teacher => {
        const teacherSetting = setting[String(teacher.id)] || {maxParents: 10, peoples: 0};
        const waitingCount = teacherSetting.peoples || 0;
        const totalWaiting = currentPosition + waitingCount;
        const estimatedTime = new Date(appointmentStartTime.getTime() + totalWaiting * 10 * 60000);
        const estimatedTimeStr = `${estimatedTime.getHours().toString().padStart(2, '0')}:${estimatedTime.getMinutes().toString().padStart(2, '0')}`;
        
        const waitingElement = document.querySelector(`[data-waiting="${teacher.id}"]`);
        const timeElement = document.querySelector(`[data-time="${teacher.id}"]`);
        
        if (waitingElement) {
            waitingElement.textContent = `${waitingCount}人`;
        }
        
        if (timeElement) {
            timeElement.textContent = estimatedTimeStr;
        }
        
        currentPosition += waitingCount;
    });
});

