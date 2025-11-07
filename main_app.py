# coding=UTF-8
from flask import Flask, request, render_template, redirect, session, send_file, jsonify, Response
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_limiter import Limiter
import pymongo
import time


# ==================== 初始化配置 ====================
app = Flask(__name__)
app.secret_key = 'akjbqid'
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

limiter = Limiter(
    app=app,
    key_func=get_real_ip,
    storage_uri=mongodb_uri
)

# 初始化SocketIO
socketio = SocketIO(app, ping_interval=5, ping_timeout=20)

# 数据库连接
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
    """登录页面"""
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


@app.route('/logout')
def logout():
    """退出登录"""
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


# ==================== 错误处理 ====================
@app.errorhandler(404)
def handle_404(error):
    """错误处理-404"""
    return redirect('/home')


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

    return {'state': 'error', 'message': '请求过于频繁'}


# ==================== 启动应用 ====================
if __name__ == '__main__':
    # 根据配置决定是否启用SSL
    socketio.run(app, host='127.0.0.1', port=5001, debug=True)