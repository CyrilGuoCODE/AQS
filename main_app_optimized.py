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
import logging
from functools import wraps
import threading
from collections import defaultdict


# ==================== 初始化配置 ====================
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
app.config['PARENT_KEY'] = 'parent'
app.config['TEACHER_KEY'] = 'teacher'

APPOINTMENT_START_TIME = datetime(2025, 11, 16, 19, 0, 0)
CONVERSION_START_TIME = "2025-11-16T17:00:00"
ENABLE_TIME_CHECK = True

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('log/app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

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

# 创建索引以提高查询性能
db.teacher.create_index("id", unique=True)
db.parent.create_index("name", unique=True)

# 加载配置文件
def load_config():
    """加载配置文件并验证数据"""
    try:
        with open('teacher.json', 'r', encoding='utf-8') as f:
            teachers = json.load(f)

        # 检查并修复teacher.json中的重复ID问题
        seen_ids = set()
        fixed_teachers = []
        for teacher in teachers:
            teacher_id = str(teacher['id'])
            if teacher_id not in seen_ids:
                seen_ids.add(teacher_id)
                fixed_teachers.append(teacher)
            else:
                logger.warning(f"发现重复的教师ID: {teacher_id}，已跳过")

        # 修复后的教师数据
        teachers = fixed_teachers

        # 确保每个教师ID唯一
        id_map = {}
        for i, teacher in enumerate(teachers):
            id_map[str(teacher['id'])] = i

        with open('class.json', 'r', encoding='utf-8') as f:
            classes_data = json.load(f)

        with open('notice.txt', 'r', encoding='utf-8') as file:
            notice = file.readlines()

        return teachers, classes_data, notice, id_map
    except Exception as e:
        logger.error(f"加载配置文件失败: {str(e)}")
        raise

teachers, classes_data, notice, teacher_id_map = load_config()

# 缓存管理类
class CacheManager:
    def __init__(self):
        self._cache = {}
        self._locks = defaultdict(threading.Lock)
        self._last_updated = {}
        self.update_interval = 60  # 缓存更新间隔（秒）

    def get(self, key, update_func=None):
        """获取缓存数据，如果不存在或过期则更新"""
        with self._locks[key]:
            current_time = time.time()
            if (key not in self._cache or 
                key not in self._last_updated or 
                current_time - self._last_updated[key] > self.update_interval):

                if update_func:
                    self._cache[key] = update_func()
                    self._last_updated[key] = current_time
                    logger.info(f"更新缓存: {key}")

            return self._cache.get(key)

    def set(self, key, value):
        """设置缓存值"""
        with self._locks[key]:
            self._cache[key] = value
            self._last_updated[key] = time.time()

    def invalidate(self, key):
        """使缓存失效"""
        with self._locks[key]:
            if key in self._cache:
                del self._cache[key]
            if key in self._last_updated:
                del self._last_updated[key]

cache_manager = CacheManager()

# 初始化教师设置缓存
def init_teacher_settings():
    """初始化教师设置"""
    settings = {}
    try:
        # 批量查询所有教师设置
        teacher_ids = [str(t['id']) for t in teachers]
        teacher_data = list(db.teacher.find({'id': {'$in': teacher_ids}}))

        # 创建ID到数据的映射
        teacher_data_map = {doc['id']: doc for doc in teacher_data}

        # 初始化每个教师的设置
        for teacher in teachers:
            teacher_id = str(teacher['id'])
            if teacher_id in teacher_data_map:
                data = teacher_data_map[teacher_id]
                settings[teacher_id] = {
                    'maxParents': data.get('maxParents', 10), 
                    'peoples': len(data.get('queue', []))
                }
            else:
                # 创建新教师记录
                db.teacher.insert_one({
                    'id': teacher_id, 
                    'maxParents': 10, 
                    'reservedStudents': [], 
                    'queue': []
                })
                settings[teacher_id] = {'maxParents': 10, 'peoples': 0}

        return settings
    except Exception as e:
        logger.error(f"初始化教师设置失败: {str(e)}")
        # 返回基本设置
        return {str(t['id']): {'maxParents': 10, 'peoples': 0} for t in teachers}

# 初始化缓存
setting_memory = cache_manager.get('teacher_settings', init_teacher_settings)
if not setting_memory:
    setting_memory = init_teacher_settings()
    cache_manager.set('teacher_settings', setting_memory)

# 数据库操作辅助函数
def get_teacher_data(teacher_id, use_cache=True):
    """获取教师数据，可选择使用缓存"""
    if use_cache:
        cache_key = f'teacher_data_{teacher_id}'
        return cache_manager.get(cache_key, lambda: db.teacher.find_one({'id': teacher_id}))
    return db.teacher.find_one({'id': teacher_id})

def get_parent_data(parent_id, use_cache=True):
    """获取家长数据，可选择使用缓存"""
    if use_cache:
        cache_key = f'parent_data_{parent_id}'
        return cache_manager.get(cache_key, lambda: db.parent.find_one({'name': parent_id}))
    return db.parent.find_one({'name': parent_id})

def update_teacher_queue(teacher_id, operation, student_data):
    """更新教师队列"""
    try:
        if operation == 'add':
            result = db.teacher.update_one(
                {'id': teacher_id}, 
                {'$push': {'queue': student_data}}
            )
        elif operation == 'remove':
            result = db.teacher.update_one(
                {'id': teacher_id}, 
                {'$pull': {'queue': {'name': student_data['name']}}}
            )
        else:
            raise ValueError(f"不支持的操作: {operation}")

        # 使缓存失效
        cache_manager.invalidate(f'teacher_data_{teacher_id}')
        cache_manager.invalidate('teacher_settings')

        return result.modified_count > 0
    except Exception as e:
        logger.error(f"更新教师队列失败: {str(e)}")
        return False

def update_parent_appointments(parent_id, appointments, must=None):
    """更新家长预约信息"""
    try:
        update_data = {'appointment': appointments}
        if must is not None:
            update_data['must'] = must

        result = db.parent.update_one(
            {'name': parent_id}, 
            {'$set': update_data}
        )

        # 使缓存失效
        cache_manager.invalidate(f'parent_data_{parent_id}')

        return result.modified_count > 0
    except Exception as e:
        logger.error(f"更新家长预约失败: {str(e)}")
        return False

# 装饰器：检查用户权限
def require_role(role):
    """检查用户角色的装饰器"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            verified_key = f"{role}_verified"
            if not session.get(verified_key):
                return redirect('/login')
            return f(*args, **kwargs)
        return decorated_function
    return decorator

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
    """验证密钥并设置会话"""
    try:
        key = request.json['key'].strip()
        if key == app.config['PARENT_KEY']:
            session['parent_verified'] = True
            session['role'] = 'parent'
            limiter.reset()
            logger.info(f"家长登录成功: IP {get_real_ip()}")
            return jsonify({'success': True, 'role': 'parent'})
        elif key == app.config['TEACHER_KEY']:
            session['teacher_verified'] = True
            session['role'] = 'teacher'
            limiter.reset()
            logger.info(f"教师登录成功: IP {get_real_ip()}")
            return jsonify({'success': True, 'role': 'teacher'})
        else:
            logger.warning(f"登录失败: IP {get_real_ip()}, 错误密钥: {key[:2]}***")
            return jsonify({'success': False, 'message': '密钥错误，请重新输入'})
    except Exception as e:
        logger.error(f"验证密钥时出错: {str(e)}")
        return jsonify({'success': False, 'message': '验证过程中发生错误'})


@app.route('/get_teachers')
@require_role('teacher')
def get_teachers():
    """获取教师列表"""
    try:
        return jsonify(teachers)
    except Exception as e:
        logger.error(f"获取教师列表失败: {str(e)}")
        return jsonify({'success': False, 'message': '获取教师列表失败'})


@app.route('/get_classes')
@require_role('parent')
def get_classes():
    """获取班级列表"""
    try:
        grade = request.args.get('grade', '初一')
        return jsonify({'grade': grade, 'classes': classes_data.get(grade, [])})
    except Exception as e:
        logger.error(f"获取班级列表失败: {str(e)}")
        return jsonify({'success': False, 'message': '获取班级列表失败'})


@app.route('/handle', methods=['POST'])
@limiter.limit('10 per hour')
def handle():
    """处理用户登录后的信息设置"""
    try:
        if session['role'] == 'parent' and 'parent_verified' in session:
            session['name'] = request.json['name']
            session['className'] = request.json['className']
            session['id'] = session['className'] + session['name']
            limiter.reset()
            logger.info(f"家长 {session['name']}({session['id']}) 登录系统")
            return jsonify({'success': True})
        elif session['role'] == 'teacher' and 'teacher_verified' in session:
            teacher_id = request.json['name']
            session['id'] = teacher_id

            # 使用ID映射而不是直接索引，避免ID不连续问题
            if teacher_id in teacher_id_map:
                session['name'] = teachers[teacher_id_map[teacher_id]]['name']
                limiter.reset()
                logger.info(f"教师 {session['name']}({session['id']}) 登录系统")
                return jsonify({'success': True})
            else:
                logger.warning(f"无效的教师ID: {teacher_id}")
                return jsonify({'success': False, 'message': '无效的教师ID'})
        else:
            logger.warning("未授权的用户尝试登录")
            return jsonify({'success': False, 'message': '登录失败，请重试'})
    except Exception as e:
        logger.error(f"处理用户信息时出错: {str(e)}")
        return jsonify({'success': False, 'message': '处理过程中发生错误'})


@app.route('/logout')
def logout():
    """用户登出"""
    try:
        user_id = session.get('id', '未知')
        user_role = session.get('role', '未知')
        session.clear()
        logger.info(f"{user_role} {user_id} 已登出")
        return redirect('/login')
    except Exception as e:
        logger.error(f"登出时出错: {str(e)}")
        return redirect('/login')


@app.route('/parent')
@require_role('parent')
def parent():
    """家长主页"""
    try:
        data = get_parent_data(session['id'])
        if data is None:
            appointments = []
            must = []
        else:
            appointments = data.get('appointment', [])
            must = data.get('must', [])

        # 获取最新的教师设置
        teacher_settings = cache_manager.get('teacher_settings', init_teacher_settings)

        return render_template(
            'parent.html', 
            t_name=session['name'], 
            t_appointment=appointments, 
            t_must=must, 
            t_setting=teacher_settings, 
            t_start_time=CONVERSION_START_TIME, 
            t_teachers=teachers
        )
    except Exception as e:
        logger.error(f"加载家长页面失败: {str(e)}")
        return render_template('error.html', message="加载页面失败，请稍后再试")


@app.route('/parent/appointment')
@require_role('parent')
def appointment():
    """家长预约页面"""
    try:
        if ENABLE_TIME_CHECK:
            current_time = datetime.now()
            if current_time < APPOINTMENT_START_TIME:
                return render_template(
                    'appointment_not_available.html', 
                    t_start_time=APPOINTMENT_START_TIME.strftime('%Y-%m-%d %H:%M:%S')
                )

        data = get_parent_data(session['id'])
        if data is None:
            appointment = []
            must = []
        else:
            appointment = data.get('appointment', [])
            must = data.get('must', [])

        # 获取最新的教师设置
        teacher_settings = cache_manager.get('teacher_settings', init_teacher_settings)

        return render_template(
            'appointment.html', 
            t_name=session['name'], 
            t_className=session['className'], 
            t_teacher=teachers, 
            t_notice=notice, 
            t_appointment=appointment, 
            t_must=must, 
            t_setting=teacher_settings, 
            t_start_time=CONVERSION_START_TIME
        )
    except Exception as e:
        logger.error(f"加载预约页面失败: {str(e)}")
        return render_template('error.html', message="加载页面失败，请稍后再试")


# 优化后的删除队列项函数
def remove_from_queue(teacher_id, student_name):
    """从教师队列中移除学生，并更新后续排名"""
    try:
        teacher_data = get_teacher_data(teacher_id, use_cache=False)
        if not teacher_data or 'queue' not in teacher_data:
            return False

        queue = teacher_data['queue']
        student_index = None

        # 查找学生在队列中的位置
        for i, student in enumerate(queue):
            if student['name'] == student_name:
                student_index = i
                break

        if student_index is None:
            logger.warning(f"在教师{teacher_id}的队列中未找到学生{student_name}")
            return False

        # 更新后续学生的排名
        for i in range(student_index + 1, len(queue)):
            student_name_in_queue = queue[i]['name']
            parent_data = get_parent_data(student_name_in_queue, use_cache=False)

            if parent_data and 'appointment' in parent_data:
                # 更新预约排名
                for appointment in parent_data['appointment']:
                    if appointment.get('teacher_id') == int(teacher_id):
                        appointment['ranking'] -= 1

                # 更新数据库
                update_parent_appointments(student_name_in_queue, parent_data['appointment'])

        # 从队列中移除学生
        success = update_teacher_queue(teacher_id, 'remove', {'name': student_name})

        # 更新缓存中的计数
        if success:
            teacher_settings = cache_manager.get('teacher_settings', init_teacher_settings)
            if teacher_id in teacher_settings:
                teacher_settings[teacher_id]['peoples'] -= 1
                cache_manager.set('teacher_settings', teacher_settings)

        return success
    except Exception as e:
        logger.error(f"从队列中移除学生失败: {str(e)}")
        return False


@app.route('/parent/appointment/save', methods=['POST'])
@require_role('parent')
def save():
    """保存家长预约"""
    try:
        if ENABLE_TIME_CHECK:
            current_time = datetime.now()
            if current_time < APPOINTMENT_START_TIME:
                return jsonify({
                    'success': False, 
                    'message': f'预约尚未开放，开放时间为：{APPOINTMENT_START_TIME.strftime("%Y-%m-%d %H:%M:%S")}'
                })

        parent_data = get_parent_data(session['id'])
        old_appointments = []
        if parent_data:
            old_appointments = [app.get('teacher_id') for app in parent_data.get('appointment', [])]

        new_appointments = request.json['appointments']

        # 获取最新的教师设置
        teacher_settings = cache_manager.get('teacher_settings', init_teacher_settings)

        # 检查新预约是否超出限制
        for teacher_id in new_appointments:
            if str(teacher_id) not in old_appointments:
                teacher_setting = teacher_settings.get(str(teacher_id), {})
                current_peoples = teacher_setting.get('peoples', 0)
                max_parents = teacher_setting.get('maxParents', 10)

                if current_peoples >= max_parents:
                    return jsonify({
                        'success': False, 
                        'message': f'老师{teacher_id}的预约人数已满，无法预约'
                    })

        # 处理预约变更
        if not parent_data:
            # 新家长，创建预约记录
            appointments = []
            for teacher_id in new_appointments:
                teacher_id_str = str(teacher_id)
                ranking = teacher_settings[teacher_id_str]['peoples']
                appointments.append({'teacher_id': teacher_id, 'ranking': ranking})

                # 添加到教师队列
                update_teacher_queue(teacher_id_str, 'add', {
                    'name': session['id'], 
                    'status': 'waiting'
                })

                # 更新缓存计数
                teacher_settings[teacher_id_str]['peoples'] += 1

            # 创建家长记录
            db.parent.insert_one({
                'name': session['id'], 
                'appointment': appointments, 
                'must': []
            })
        else:
            # 已有记录，更新预约
            appointments = parent_data.get('appointment', [])

            # 移除不再预约的教师
            for teacher_id in old_appointments:
                if teacher_id not in new_appointments:
                    # 从队列中移除
                    remove_from_queue(str(teacher_id), session['id'])

                    # 从预约列表中移除
                    appointments = [a for a in appointments if a.get('teacher_id') != teacher_id]

                    # 更新缓存计数
                    teacher_id_str = str(teacher_id)
                    if teacher_id_str in teacher_settings:
                        teacher_settings[teacher_id_str]['peoples'] -= 1

            # 添加新预约的教师
            for teacher_id in new_appointments:
                if teacher_id not in old_appointments:
                    teacher_id_str = str(teacher_id)
                    ranking = teacher_settings[teacher_id_str]['peoples']
                    appointments.append({'teacher_id': teacher_id, 'ranking': ranking})

                    # 添加到教师队列
                    update_teacher_queue(teacher_id_str, 'add', {
                        'name': session['id'], 
                        'status': 'waiting'
                    })

                    # 更新缓存计数
                    teacher_settings[teacher_id_str]['peoples'] += 1

            # 更新家长预约信息
            update_parent_appointments(session['id'], appointments)

        # 更新缓存
        cache_manager.set('teacher_settings', teacher_settings)

        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"保存预约失败: {str(e)}")
        return jsonify({'success': False, 'message': '保存预约时发生错误'})


@app.route('/teacher')
@require_role('teacher')
def teacher():
    """教师主页"""
    try:
        return render_template('teacher.html', t_name=session['name'])
    except Exception as e:
        logger.error(f"加载教师页面失败: {str(e)}")
        return render_template('error.html', message="加载页面失败，请稍后再试")


@app.route('/teacher/ontime')
@require_role('teacher')
def ontime():
    """教师实时队列页面"""
    try:
        teacher_data = get_teacher_data(session['id'])
        queue = teacher_data.get('queue', []) if teacher_data else []
        return render_template('ontime.html', t_queue=queue)
    except Exception as e:
        logger.error(f"加载实时队列页面失败: {str(e)}")
        return render_template('error.html', message="加载页面失败，请稍后再试")


@app.route('/teacher/list')
@require_role('teacher')
def list():
    """教师列表页面"""
    try:
        teacher_data = get_teacher_data(session['id'])
        queue = teacher_data.get('queue', []) if teacher_data else []
        return render_template('list.html', t_queue=queue, t_start_time=APPOINTMENT_START_TIME)
    except Exception as e:
        logger.error(f"加载列表页面失败: {str(e)}")
        return render_template('error.html', message="加载页面失败，请稍后再试")


@app.route('/teacher/setting')
@require_role('teacher')
def setting():
    """教师设置页面"""
    try:
        teacher_data = get_teacher_data(session['id'])
        max_parents = teacher_data.get('maxParents', 10) if teacher_data else 10
        reserved_students = teacher_data.get('reservedStudents', []) if teacher_data else []

        return render_template(
            'setting.html', 
            t_maxParents=max_parents, 
            t_reservedStudents=reserved_students
        )
    except Exception as e:
        logger.error(f"加载设置页面失败: {str(e)}")
        return render_template('error.html', message="加载页面失败，请稍后再试")


# 优化后的添加函数
def add_reserved_student(student_name, teacher_id):
    """添加保留学生到教师队列"""
    try:
        # 检查家长是否存在
        parent_data = get_parent_data(student_name, use_cache=False)

        # 更新家长记录
        if parent_data:
            must_list = parent_data.get('must', [])
            # 检查是否已经在must列表中
            for item in must_list:
                if item.get('teacher_id') == int(teacher_id):
                    logger.info(f"学生{student_name}已在教师{teacher_id}的保留列表中")
                    return True

            # 添加到must列表
            must_list.append({
                'teacher_id': int(teacher_id), 
                'ranking': setting_memory[teacher_id]['peoples']
            })
            update_parent_appointments(student_name, parent_data.get('appointment', []), must_list)
        else:
            # 创建新的家长记录
            db.parent.insert_one({
                'name': student_name, 
                'appointment': [], 
                'must': [{'teacher_id': int(teacher_id), 'ranking': setting_memory[teacher_id]['peoples']}]
            })

        # 更新教师队列和缓存
        update_teacher_queue(teacher_id, 'add', {'name': student_name, 'status': 'waiting'})
        setting_memory[teacher_id]['peoples'] += 1

        return True
    except Exception as e:
        logger.error(f"添加保留学生失败: {str(e)}")
        return False


# 优化后的删除函数
def remove_reserved_student(student_name, teacher_id):
    """从教师队列中移除保留学生"""
    try:
        # 获取家长数据
        parent_data = get_parent_data(student_name, use_cache=False)

        if parent_data:
            must_list = parent_data.get('must', [])
            # 从must列表中移除
            must_list = [item for item in must_list if item.get('teacher_id') != int(teacher_id)]
            update_parent_appointments(student_name, parent_data.get('appointment', []), must_list)

        # 从教师队列中移除
        update_teacher_queue(teacher_id, 'remove', {'name': student_name})
        setting_memory[teacher_id]['peoples'] -= 1

        return True
    except Exception as e:
        logger.error(f"移除保留学生失败: {str(e)}")
        return False


@app.route('/teacher/setting/save', methods=['POST'])
@require_role('teacher')
def setting_save():
    """保存教师设置"""
    try:
        teacher_id = session['id']
        max_parents = request.json.get('maxParents', 10)
        reserved_students = request.json.get('reservedStudents', [])

        # 获取当前教师数据
        teacher_data = get_teacher_data(teacher_id, use_cache=False)

        if not teacher_data:
            # 新教师记录
            # 添加所有保留学生
            for student_name in reserved_students:
                add_reserved_student(student_name, teacher_id)

            # 创建教师记录
            db.teacher.insert_one({
                'id': teacher_id, 
                'maxParents': max_parents, 
                'reservedStudents': reserved_students, 
                'queue': []
            })
        else:
            # 已有教师记录
            old_reserved = teacher_data.get('reservedStudents', [])

            # 添加新的保留学生
            for student_name in reserved_students:
                if student_name not in old_reserved:
                    add_reserved_student(student_name, teacher_id)

            # 移除不再保留的学生
            for student_name in old_reserved:
                if student_name not in reserved_students:
                    remove_reserved_student(student_name, teacher_id)

            # 更新教师记录
            db.teacher.update_one(
                {'id': teacher_id},
                {'$set': {
                    'maxParents': max_parents,
                    'reservedStudents': reserved_students
                }}
            )

        # 更新缓存
        teacher_settings = cache_manager.get('teacher_settings', init_teacher_settings)
        if teacher_id in teacher_settings:
            teacher_settings[teacher_id]['maxParents'] = max_parents
            cache_manager.set('teacher_settings', teacher_settings)

        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"保存教师设置失败: {str(e)}")
        return jsonify({'success': False, 'message': '保存设置时发生错误'})


@app.route('/teacher/list/download')
@require_role('teacher')
def list_download():
    """下载预约列表"""
    try:
        teacher_name = session.get('name', '未知老师')
        teacher_id = session.get('id')

        teacher_data = get_teacher_data(teacher_id)
        queue = teacher_data.get('queue', []) if teacher_data else []

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
    except Exception as e:
        logger.error(f"下载预约列表失败: {str(e)}")
        return render_template('error.html', message="下载列表失败，请稍后再试")


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
    error_msg = f"[{error_time}] IP: {client_ip} - Route: {route_info} - Error: {str(error)}

"

    with open('log/error.log', 'a', encoding='utf-8') as f:
        f.write(error_msg)
    return redirect('/login')


@socketio.on_error()
def handle_500(error):
    """错误处理-ws错误"""
    client_ip = get_real_ip()
    error_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    error_msg = f"[{error_time}] IP: {client_ip} - Route: WebSocketEvent - Error: {str(error)}

"

    with open('log/error.log', 'a', encoding='utf-8') as f:
        f.write(error_msg)


# 添加速率限制错误处理
@app.errorhandler(429)
def ratelimit_handler(e):
    """速率限制错误处理"""
    client_ip = get_real_ip()
    route_info = f"{request.method} {request.path}"
    limit_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    limit_msg = f"[{limit_time}] IP: {client_ip} - Route: {route_info} - Rate limit exceeded: {e.description}

"

    with open('log/limit.log', 'a', encoding='utf-8') as f:
        f.write(limit_msg)

    return {'success': False, 'message': '请求过于频繁'}


# ==================== 启动应用 ====================
if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5001, debug=True)
