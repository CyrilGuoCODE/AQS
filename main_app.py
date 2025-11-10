# coding=UTF-8
from flask import Flask, request, render_template, redirect, session, send_file, jsonify, Response
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_limiter import Limiter
import pymongo
import time
import secrets
import os
import logging
from pathlib import Path
import json


# ==================== 初始化配置 ====================
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
app.config['PARENT_KEY'] = 'parent'
app.config['TEACHER_KEY'] = 'teacher'


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

# Use MongoDB-backed limiter storage (no Redis)
limiter = Limiter(
    app=app,
    key_func=get_real_ip,
    storage_uri=mongodb_uri
)

# Ensure log directory exists
Path('log').mkdir(parents=True, exist_ok=True)
logging.basicConfig(filename='log/error.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# 初始化 SocketIO（不使用 Redis，单实例/单进程或 eventlet worker 下可用）
socketio = SocketIO(app, async_mode=os.getenv('SOCKETIO_ASYNC_MODE', 'eventlet'), ping_interval=5, ping_timeout=20)

# 数据库连接（MongoDB 用于持久化业务数据）
client = pymongo.MongoClient(mongodb_uri)
db = client['main']


# ==================== Flask路由 ====================
@app.before_request
def before_request():
    pass


@app.after_request
def after_request(response):
    return response


@app.route('/favicon.ico')
def favicon():
    return send_file('static/images/icon.png', mimetype='image/vnd.microsoft.icon')


@app.route('/login')
def login():
    return render_template('login.html')


@app.route('/verify-key', methods=['POST'])
@limiter.limit('1 per 5 seconds,10 per hour')
def verify_key():
    key = request.json['key'].strip()
    if key == app.config['PARENT_KEY']:
        session['parent_verified'] = True
        session['role'] = 'parent'
        return jsonify({'success': True, 'role': 'parent'})
    elif key == app.config['TEACHER_KEY']:
        session['teacher_verified'] = True
        session['role'] = 'teacher'
        return jsonify({'success': True, 'role': 'teacher'})
    else:
        return jsonify({'success': False, 'message': '密钥错误，请重新输入'})


@app.route('/handle', methods=['POST'])
@limiter.limit('1 per 5 seconds,10 per hour')
def handle():
    if 'parent_verified' in session:
        session['name'] = request.json['name']
        return jsonify({'success': True, 'role': 'parent'})
    elif 'teacher_verified' in session:
        session['name'] = request.json['name']
        return jsonify({'success': True, 'role': 'teacher'})
    else:
        return jsonify({'success': False, 'message': '密钥错误，请重新输入'})


@app.route('/logout')
def logout():
    session.clear()
    
    return redirect('/login')


@app.route('/parent')
def parent():
    if not session.get('parent_verified'):
        return redirect('/login')
    return render_template('parent.html')


@app.route('/teacher')
def teacher():
    if not session.get('teacher_verified'):
        return redirect('/login')
    return render_template('teacher.html')


@app.route('/user')
def user_info():
    """返回当前 session 的基本信息，便于前端联调使用。"""
    return jsonify({
        'parent_verified': bool(session.get('parent_verified')),
        'teacher_verified': bool(session.get('teacher_verified')),
        'role': session.get('role'),
        'name': session.get('name')
    })


@app.route('/api/teachers')
def api_teachers():
    """Return list of teachers read from teacher.json with dynamic waiting count from DB.
    Format: { teachers: [ {id, name, class, location, waiting}, ... ] }
    """
    try:
        with open('teacher.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logging.exception('Failed to load teacher.json: %s', e)
        return jsonify({'teachers': []})

    result = []
    for key, info in data.items():
        try:
            tid = int(key)
        except Exception:
            continue
        waiting = 0
        try:
            # Expecting a 'queues' collection where documents reference teacher_id and status
            waiting = db.queues.count_documents({'teacher_id': tid, 'status': 'waiting'})
        except Exception:
            # If the collection doesn't exist or Mongo error, fallback to 0
            waiting = 0

        result.append({
            'id': tid,
            'name': info.get('name'),
            'class': info.get('class'),
            'location': info.get('location'),
            'waiting': waiting
        })

    # sort by id
    result.sort(key=lambda x: x['id'])
    return jsonify({'teachers': result})


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

    logging.exception(error_msg)


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

    return {'state': 'error', 'message': '请求过于频繁'}


# ==================== WebSocket 事件处理 (推荐客户端在连接后发送 join 事件) ====================

@socketio.on('connect')
def ws_connect():
    # 连接建立时触发，注意：跨进程/跨节点时 session 可能不可用，推荐客户端发送 join 事件
    emit('connected', {'message': 'connected'})


@socketio.on('join')
def ws_join(data):
    """data: {"role": "parent"/"teacher", "name": "xxx", "room": "optional_room"}
    推荐根据角色分房间，方便广播到父母或教师。"""
    try:
        role = data.get('role')
        name = data.get('name')
        room = data.get('room') or role
        join_room(room)
        emit('joined', {'room': room, 'name': name}, room=room)
    except Exception as e:
        logging.exception('ws_join error: %s', e)


@socketio.on('message')
def ws_message(data):
    """广播或单房间消息： data: {"room": "room_name", "message": "..."} """
    try:
        room = data.get('room')
        msg = data.get('message')
        if room:
            emit('message', {'message': msg}, room=room)
        else:
            # 全局广播
            emit('message', {'message': msg}, broadcast=True)
    except Exception as e:
        logging.exception('ws_message error: %s', e)


@socketio.on('disconnect')
def ws_disconnect():
    # 可以在此清理连接相关资源
    logging.info('Client disconnected')


# ==================== 启动应用 ====================
if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5001, debug=True)