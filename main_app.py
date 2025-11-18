# coding=UTF-8
from flask import Flask, request, render_template, redirect, session, send_file, jsonify, Response
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_limiter import Limiter
import pymongo
import time
import secrets
import json
import os
import pandas as pd
from io import BytesIO
from datetime import datetime, timedelta


# ==================== 初始化配置 ====================
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
app.config['PARENT_KEY'] = 'parent'
app.config['TEACHER_KEY'] = 'teacher'

APPOINTMENT_START_TIME = datetime(2025, 11, 16, 19, 0, 0)
CONVERSION_START_TIME = "2025-11-16T17:00:00"
ENABLE_TIME_CHECK = True

# 初始化速率限制器
def get_real_ip():
    """获取真实客户端IP，处理反向代理情况"""
    if request.headers.get('X-Forwarded-For'):
        ips = request.headers['X-Forwarded-For'].split(',')
        return ips[0].strip()
    elif request.headers.get('X-Real-IP'):
        return request.headers['X-Real-IP']
    else:
        return request.remote_addr


mongodb_uri = f"mongodb://127.0.0.1:27017/"

limiter = Limiter(
    app=app,
    key_func=get_real_ip,
    storage_uri=mongodb_uri
)

os.makedirs('log', exist_ok=True)

# 初始化SocketIO
socketio = SocketIO(app, ping_interval=5, ping_timeout=20)

# 数据库连接
client = pymongo.MongoClient(mongodb_uri)
db = client['aqs']

with open('teacher.json', 'r', encoding='utf-8') as f:
    teachers = json.load(f)

with open('class.json', 'r', encoding='utf-8') as f:
    classes_data = json.load(f)

with open('notice.txt', 'r', encoding='utf-8') as file:
    notice = file.readlines()

setting_memory = {}
for i in teachers:
    data = db.teacher.find_one({'id': str(i['id'])})
    if data == None:
        db.teacher.insert_one({'id': str(i['id']), 'maxParents': 10, 'reservedStudents': [], 'queue': []})
        setting_memory[str(i['id'])] = {'maxParents': 10, 'peoples': 0}
    else:
        setting_memory[str(i['id'])] = {'maxParents': data['maxParents'], 'peoples': len(data['queue'])}


# ==================== Flask路由 ====================


@app.route('/favicon.ico')
def favicon():
    return send_file('static/images/icon.png', mimetype='image/vnd.microsoft.icon')


@app.route('/login')
def login():
    return render_template('login.html')


@app.route('/verify-key', methods=['POST'])
@limiter.limit('10 per hour')
def verify_key():
    key = request.json['key'].strip()
    if key == app.config['PARENT_KEY']:
        session['parent_verified'] = True
        session['role'] = 'parent'
        limiter.reset()
        return jsonify({'success': True, 'role': 'parent'})
    elif key == app.config['TEACHER_KEY']:
        session['teacher_verified'] = True
        session['role'] = 'teacher'
        limiter.reset()
        return jsonify({'success': True, 'role': 'teacher'})
    else:
        return jsonify({'success': False, 'message': '密钥错误，请重新输入'})


@app.route('/get_teachers')
def get_teachers():
    if not session.get('teacher_verified'):
        return redirect('/login')
    return jsonify(teachers)


@app.route('/get_classes')
def get_classes():
    if not session.get('parent_verified'):
        return redirect('/login')
    grade = request.args.get('grade', '初一')
    return jsonify({'grade': grade, 'classes': classes_data.get(grade, [])})

@app.route('/handle', methods=['POST'])
@limiter.limit('10 per hour')
def handle():
    if session['role'] == 'parent' and 'parent_verified' in session:
        session['name'] = request.json['name']
        session['className'] = request.json['className']
        session['id'] = session['className'] + session['name']
        limiter.reset()
        return jsonify({'success': True})
    elif session['role'] == 'teacher' and 'teacher_verified' in session:
        session['id'] = request.json['name']
        session['name'] = teachers[int(session['id'])-1]['name']
        limiter.reset()
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': '登录失败，请重试'})


@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')


@app.route('/parent')
def parent():
    if not session.get('parent_verified'):
        return redirect('/login')
    data = db.parent.find_one({'name': session['id']})
    if data == None:
        appointments = []
        must = []
    else:
        appointments = data['appointment']
        must = data['must']
    
    return render_template('parent.html', t_name=session['name'], t_appointment=appointments, t_must=must, t_setting=setting_memory, t_start_time=CONVERSION_START_TIME, t_teachers=teachers)


@app.route('/parent/appointment')
def appointment():
    if not session.get('parent_verified'):
        return redirect('/login')
    
    if ENABLE_TIME_CHECK:
        current_time = datetime.now()
        if current_time < APPOINTMENT_START_TIME:
            return render_template('appointment_not_available.html', t_start_time=APPOINTMENT_START_TIME.strftime('%Y-%m-%d %H:%M:%S'))
    
    data = db.parent.find_one({'name': session['id']})
    if data == None:
        appointment = []
        must = []
    else:
        appointment = data['appointment']
        must = data['must']
    
    return render_template('appointment.html', t_name=session['name'], t_className=session['className'], t_teacher=teachers, t_notice=notice, t_appointment=appointment, t_must=must, t_setting=setting_memory, t_start_time=CONVERSION_START_TIME)


def dele(id, name):
    data = db.teacher.find_one({'id': id})
    i = 0
    while data['queue'][i]['name'] != name:
        i += 1
    i += 1
    while i < len(data['queue']):
        data1 = db.parent.find_one({'name': data['queue'][i]['name']})
        for j in data1['appointment']:
            if j['teacher_id'] == int(id):
                j['ranking'] -= 1
        db.parent.update_one({'name': data['queue'][i]['name']}, {'$set': {'appointment': data1['appointment']}})
        i += 1
    db.teacher.update_one({'id': id}, {'$pull': {'queue': {'name': name}}})


@app.route('/parent/appointment/save', methods=['POST'])
def save():
    if not session.get('parent_verified'):
        return redirect('/login')
    
    if ENABLE_TIME_CHECK:
        current_time = datetime.now()
        if current_time < APPOINTMENT_START_TIME:
            return jsonify({'success': False, 'message': f'预约尚未开放，开放时间为：{APPOINTMENT_START_TIME.strftime("%Y-%m-%d %H:%M:%S")}'})
    
    data = db.parent.find_one({'name': session['id']})
    old_appointments = []
    if data != None:
        for i in data['appointment']:
            old_appointments.append(i['teacher_id'])
    new_appointments = request.json['appointments']
    
    for teacher_id in new_appointments:
        if teacher_id not in old_appointments:
            teacher_setting = setting_memory.get(str(teacher_id), {})
            current_peoples = teacher_setting.get('peoples', 0)
            max_parents = teacher_setting.get('maxParents', 10)
            
            if current_peoples >= max_parents:
                return jsonify({'success': False, 'message': f'老师{teacher_id}的预约人数已满，无法预约'})
        
    if data == None:
        appointments = [] 
        db.parent.insert_one({'name': session['id'], 'appointment': appointments, 'must': []})
        for i in new_appointments:
            db.teacher.update_one({'id': str(i)}, {'$push': {'queue': {'name': session['id'], 'status': 'waiting'}}})
            setting_memory[str(i)]['peoples'] += 1
    else:
        appointments = data['appointment']
        for i in old_appointments:
            if i not in new_appointments:
                dele(str(i), session['id'])
                appointments = [item for item in appointments if item.get('teacher_id') != i]
                setting_memory[str(i)]['peoples'] -= 1
        for i in new_appointments:
            if i not in old_appointments:
                appointments.append({'teacher_id': i, 'ranking': setting_memory[str(i)]['peoples']})
                db.teacher.update_one({'id': str(i)}, {'$push': {'queue': {'name': session['id'], 'status': 'waiting'}}})
                setting_memory[str(i)]['peoples'] += 1
        data['appointment'] = appointments
        db.parent.update_one({'name': session['id']}, {'$set': data})
    return jsonify({'success': True})


@app.route('/teacher')
def teacher():
    if not session.get('teacher_verified'):
        return redirect('/login')
    return render_template('teacher.html', t_name=session['name'])


@app.route('/teacher/ontime')
def ontime():
    if not session.get('teacher_verified'):
        return redirect('/login')
    data = db.teacher.find_one({'id': session['id']})
    if data == None:
        data = []
    else:
        data = data['queue']
    return render_template('ontime.html', t_queue=data)


@app.route('/teacher/list')
def list():
    if not session.get('teacher_verified'):
        return redirect('/login')
    data = db.teacher.find_one({'id': session['id']})
    if data == None:
        data = []
    else:
        data = data['queue']
    return render_template('list.html', t_queue=data, t_start_time=APPOINTMENT_START_TIME)


@app.route('/teacher/setting')
def setting():
    if not session.get('teacher_verified'):
        return redirect('/login')
    data = db.teacher.find_one({'id': session['id']})
    maxParents = data['maxParents'] if data != None else 10
    reservedStudents = data['reservedStudents'] if data != None else []
    return render_template('setting.html', t_maxParents=maxParents, t_reservedStudents=reservedStudents)


def add(name, id):
    data = db.parent.find_one({'name': name})
    if data != None:
        db.parent.update_one({'name': name}, {'$push': {'must': {'teacher_id': id, 'ranking': setting_memory[str(id)]['peoples']}}})
    else:
        db.parent.insert_one({'name': name, 'appointment': [], 'must': [{'teacher_id': id, 'ranking': setting_memory[str(id)]['peoples']}]})
    setting_memory[str(id)]['peoples'] += 1
    db.teacher.update_one({'id': str(id)}, {'$push': {'queue': {'name': name, 'status': 'waiting'}}})

def delete(name, id):
    data = db.parent.find_one({'name': name})
    if data != None:
        db.parent.update_one({'name': name}, {'$pull': {'must': {'teacher_id': id}}})
        setting_memory[str(id)]['peoples'] -= 1
    db.teacher.update_one({'id': str(id)}, {'$pull': {'queue': {'name': name}}})


@app.route('/teacher/setting/save', methods=['POST'])
def setting_save():
    if not session.get('teacher_verified'):
        return redirect('/login')
    data = db.teacher.find_one({'id': session['id']})
    if data == None:
        for i in request.json.get('reservedStudents'):
            add(i, int(session['id']))
        db.teacher.insert_one({'id': session['id'], 'maxParents': request.json.get('maxParents'), 'reservedStudents': request.json.get('reservedStudents'), 'queue': []})
    else:
        for i in request.json.get('reservedStudents'):
            if i not in data['reservedStudents']:
                add(i, int(session['id']))
        for i in data['reservedStudents']:
            if i not in request.json.get('reservedStudents'):
                delete(i, int(session['id']))
        db.teacher.update_one({'id': session['id']},{'$set': {'maxParents': request.json.get('maxParents'),'reservedStudents': request.json.get('reservedStudents')}})
    setting_memory[session['id']]['maxParents'] = request.json.get('maxParents')
    return jsonify({'success': True})


@app.route('/teacher/list/download')
def list_download():
    if not session.get('teacher_verified'):
        return redirect('/login')
    
    teacher_name = session.get('name', '未知老师')
    teacher_id = session.get('id')
    
    teacher_data = db.teacher.find_one({'id': teacher_id})
    if teacher_data == None:
        queue = []
    else:
        queue = teacher_data['queue']
    
    status_text_map = {
        'waiting': '等待中',
        'current': '进行中',
        'completed': '已完成',
        'skipped': '已跳过'
    }
    
    data_list = []
    for index, item in enumerate(queue, 1):
        full_name = item.get('name', '')
        status = item.get('status', 'waiting')
        appointment_time = item.get('appointmentTime', item.get('appointment_time'))
        if not appointment_time:
            appointment_datetime = APPOINTMENT_START_TIME + timedelta(minutes=(index-1) * 10)
            appointment_time = appointment_datetime.strftime('%H:%M')
        status_text = status_text_map.get(status, '未知')
        
        data_list.append({
            '序号': index,
            '学生姓名': full_name,
            '预约时间': appointment_time,
            '状态': status_text
        })
    
    df = pd.DataFrame(data_list)
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='预约列表')
    
    output.seek(0)
    filename = f"{teacher_name}的预约列表.xlsx"
    
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename
    )

# ==================== 错误处理 ====================
@app.errorhandler(404)
def handle_404(error):
    """错误处理-404"""
    return redirect('/login')


@app.errorhandler(Exception)
def handle_500(error):
    """错误处理-500"""
    client_ip = get_real_ip()
    route_info = f"{request.method} {request.path}"
    error_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    error_msg = f"[{error_time}] IP: {client_ip} - Route: {route_info} - Error: {str(error)}\n\n"

    with open('log/error.log', 'a', encoding='utf-8') as f:
        f.write(error_msg)
    return redirect('/login')


@socketio.on_error()
def handle_500(error):
    """错误处理-ws错误"""
    client_ip = get_real_ip()
    error_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    error_msg = f"[{error_time}] IP: {client_ip} - Route: WebSocketEvent - Error: {str(error)}\n\n"

    with open('log/error.log', 'a', encoding='utf-8') as f:
        f.write(error_msg)


# 添加速率限制错误处理
@app.errorhandler(429)
def ratelimit_handler(e):
    """速率限制错误处理"""
    client_ip = get_real_ip()
    route_info = f"{request.method} {request.path}"
    limit_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    limit_msg = f"[{limit_time}] IP: {client_ip} - Route: {route_info} - Rate limit exceeded: {e.description}\n\n"

    with open('log/limit.log', 'a', encoding='utf-8') as f:
        f.write(limit_msg)

    return {'success': False, 'message': '请求过于频繁'}


# ==================== 启动应用 ====================
if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5001, debug=True)