# coding=UTF-8
from flask import Flask, request, render_template, redirect, session, send_file, jsonify
from flask_socketio import SocketIO, emit, join_room
from flask_limiter import Limiter
from werkzeug.exceptions import HTTPException
import time
import secrets
import json
import os
import ipaddress
import threading
from pathlib import Path
from io import BytesIO
from datetime import datetime, timedelta


# ==================== 初始化配置 ====================
BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__)
with open(BASE_DIR / 'config.json', 'r', encoding='utf-8') as f:
    root_config = json.load(f)


def load_secret_key():
    """优先环境变量，其次本地密钥文件，保证重启后会话不失效"""
    env_key = os.environ.get('AQS_SECRET_KEY')
    if env_key:
        return env_key
    key_file = BASE_DIR / '.secret_key'
    if key_file.exists():
        stored = key_file.read_text(encoding='utf-8').strip()
        if stored:
            return stored
    key = secrets.token_hex(32)
    key_file.write_text(key, encoding='utf-8')
    return key


app.secret_key = load_secret_key()


def config_int(source, key, default, label, minimum=None, maximum=None):
    """读取整数配置项，配置非法时在启动阶段直接报错"""
    raw = source.get(key, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValueError(f'配置项 {label} 需为整数，当前为 {raw!r}')
    if minimum is not None and value < minimum:
        raise ValueError(f'配置项 {label} 不能小于 {minimum}')
    if maximum is not None and value > maximum:
        raise ValueError(f'配置项 {label} 不能大于 {maximum}')
    return value


def config_bool(source, key, default, label):
    raw = source.get(key, default)
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, int):
        return bool(raw)
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered in ('true', '1', 'yes', 'on'):
            return True
        if lowered in ('false', '0', 'no', 'off', ''):
            return False
    raise ValueError(f'配置项 {label} 需为布尔值，当前为 {raw!r}')


def config_time(value, label, fmt='%Y-%m-%d %H:%M:%S'):
    try:
        return datetime.strptime(str(value), fmt)
    except (TypeError, ValueError):
        raise ValueError(f'配置项 {label} 时间格式错误，应为 {fmt}')


security_config = root_config.get('security', {}) or {}
rate_limit_config = root_config.get('rate_limit', {}) or {}
server_config = root_config.get('server', {}) or {}

VERIFY_LIMIT = config_int(rate_limit_config, 'verify_per_hour', 120, 'rate_limit.verify_per_hour', 1)
HANDLE_LIMIT = config_int(rate_limit_config, 'handle_per_hour', 300, 'rate_limit.handle_per_hour', 1)
SAVE_LIMIT = config_int(rate_limit_config, 'save_per_hour', 120, 'rate_limit.save_per_hour', 1)
SETTING_LIMIT = config_int(rate_limit_config, 'setting_per_hour', 60, 'rate_limit.setting_per_hour', 1)
SERVER_HOST = os.environ.get('AQS_HOST') or str(server_config.get('host', '127.0.0.1'))
SERVER_PORT = config_int(server_config, 'port', 5001, 'server.port', 1, 65535)
if os.environ.get('AQS_PORT'):
    try:
        SERVER_PORT = int(os.environ['AQS_PORT'])
    except ValueError:
        raise ValueError(f'环境变量 AQS_PORT 需为整数，当前为 {os.environ["AQS_PORT"]!r}')
DEBUG = config_bool(root_config, 'debug', False, 'debug')

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=config_bool(security_config, 'session_cookie_secure', False, 'security.session_cookie_secure'),
    MAX_CONTENT_LENGTH=64 * 1024,
    JSON_AS_ASCII=False,
)

GRADE_NAMES = root_config.get('active_grades', [])
if not isinstance(GRADE_NAMES, list) or not GRADE_NAMES:
    raise ValueError('config.json 中 active_grades 需为非空数组')
GRADE_NAMES = [str(name).strip() for name in GRADE_NAMES if str(name).strip()]
if len(set(GRADE_NAMES)) != len(GRADE_NAMES):
    raise ValueError('config.json 中 active_grades 存在重复年级')
DEFAULT_GRADE = root_config.get('default_grade') or (GRADE_NAMES[0] if GRADE_NAMES else '')


def load_grade(grade_name):
    """加载并校验单个年级的独立配置"""
    config_path = BASE_DIR / 'grades' / f'{grade_name}.json'
    if not config_path.exists():
        raise ValueError(f'缺少年级配置文件：{config_path}')
    with open(config_path, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
    if not isinstance(cfg, dict):
        raise ValueError(f'[{grade_name}] 年级配置格式不正确')

    label = lambda key: f'[{grade_name}] {key}'
    cfg['grade'] = str(cfg.get('grade') or grade_name)

    time_settings = cfg.get('time_settings') or {}
    if 'appointment_start_time' not in time_settings or 'appointment_end_time' not in time_settings:
        raise ValueError(f'[{grade_name}] 缺少 time_settings.appointment_start_time / appointment_end_time')
    cfg['appointment_start'] = config_time(
        time_settings['appointment_start_time'], label('time_settings.appointment_start_time')
    )
    cfg['appointment_end'] = config_time(
        time_settings['appointment_end_time'], label('time_settings.appointment_end_time')
    )
    if cfg['appointment_end'] <= cfg['appointment_start']:
        raise ValueError(f'[{grade_name}] 预约结束时间必须晚于开始时间')

    cfg['conversion_start'] = str(time_settings.get('conversion_start_time') or '')
    if cfg['conversion_start']:
        cfg['conversion_start_dt'] = config_time(
            cfg['conversion_start'], label('time_settings.conversion_start_time'), '%Y-%m-%dT%H:%M:%S'
        )
    else:
        cfg['conversion_start_dt'] = cfg['appointment_end']
        cfg['conversion_start'] = cfg['appointment_end'].strftime('%Y-%m-%dT%H:%M:%S')
    cfg['enable_time_check'] = config_bool(
        time_settings, 'enable_time_check', True, label('time_settings.enable_time_check')
    )
    cfg['meeting_duration'] = config_int(
        time_settings, 'meeting_duration_minutes', 10, label('time_settings.meeting_duration_minutes'), 1, 240
    )

    teacher_settings = cfg.get('teacher_settings') or {}
    cfg['max_parents_limit'] = config_int(
        teacher_settings, 'max_parents_limit', 20, label('teacher_settings.max_parents_limit'), 1, 999
    )
    cfg['default_max_parents'] = config_int(
        teacher_settings, 'default_max_parents', 4, label('teacher_settings.default_max_parents'),
        1, cfg['max_parents_limit']
    )
    cfg['allow_capacity_edit'] = config_bool(
        teacher_settings, 'allow_capacity_edit', True, label('teacher_settings.allow_capacity_edit')
    )
    cfg['allow_reserved_list'] = config_bool(
        teacher_settings, 'allow_reserved_list', True, label('teacher_settings.allow_reserved_list')
    )
    cfg['max_reserved_students'] = config_int(
        teacher_settings, 'max_reserved_students', 100, label('teacher_settings.max_reserved_students'), 1, 500
    )

    parent_settings = cfg.get('parent_settings') or {}
    cfg['max_selectable'] = config_int(
        parent_settings, 'max_selectable_teachers', 2, label('parent_settings.max_selectable_teachers'), 1, 20
    )
    cfg['allow_modify_after_save'] = config_bool(
        parent_settings, 'allow_modify_after_save', True, label('parent_settings.allow_modify_after_save')
    )
    notice_countdown = config_int(
        parent_settings, 'notice_countdown_seconds', 5, label('parent_settings.notice_countdown_seconds'), 0, 60
    )

    keys = cfg.get('keys') or {}
    cfg['keys'] = {
        'parent_key': str(keys.get('parent_key') or ''),
        'teacher_key': str(keys.get('teacher_key') or ''),
    }
    if not cfg['keys']['parent_key'] or not cfg['keys']['teacher_key']:
        raise ValueError(f'[{grade_name}] 缺少 keys.parent_key 或 keys.teacher_key')
    if cfg['keys']['parent_key'] == cfg['keys']['teacher_key']:
        raise ValueError(f'[{grade_name}] 家长密钥和教师密钥不能相同')

    notice_lines = cfg.get('notice') or []
    if not isinstance(notice_lines, list):
        raise ValueError(f'[{grade_name}] notice 需为字符串数组')
    cfg['notice_lines'] = [str(line).strip() for line in notice_lines if str(line).strip()]
    cfg['notice_countdown'] = notice_countdown if cfg['notice_lines'] else 0

    classes = cfg.get('classes') or []
    if not isinstance(classes, list) or not classes:
        raise ValueError(f'[{grade_name}] classes 需为非空数组')
    cfg['classes'] = [str(item).strip() for item in classes if str(item).strip()]
    if not cfg['classes']:
        raise ValueError(f'[{grade_name}] classes 不能为空')

    per_class_start = time_settings.get('conversion_start_time_by_class') or {}
    if not isinstance(per_class_start, dict):
        raise ValueError(f'[{grade_name}] time_settings.conversion_start_time_by_class 需为对象')
    cfg['conversion_start_by_class'] = {}
    for class_name, value in per_class_start.items():
        class_name = str(class_name).strip()
        if class_name not in cfg['classes']:
            raise ValueError(f'[{grade_name}] conversion_start_time_by_class 中的班级不存在：{class_name}')
        cfg['conversion_start_by_class'][class_name] = config_time(
            value, label(f'time_settings.conversion_start_time_by_class.{class_name}'), '%Y-%m-%dT%H:%M:%S'
        )

    teachers = cfg.get('teachers') or []
    if not isinstance(teachers, list) or not teachers:
        raise ValueError(f'[{grade_name}] teachers 需为非空数组')
    seen_ids = set()
    normalized_teachers = []
    for teacher in teachers:
        if not isinstance(teacher, dict):
            raise ValueError(f'[{grade_name}] teachers 中存在格式不正确的条目')
        try:
            teacher_id = int(teacher.get('id'))
        except (TypeError, ValueError):
            raise ValueError(f'[{grade_name}] 老师 id 需为整数')
        if teacher_id in seen_ids:
            raise ValueError(f'[{grade_name}] 老师 id 重复：{teacher_id}')
        seen_ids.add(teacher_id)
        name = str(teacher.get('name') or '').strip()
        subject = str(teacher.get('subject') or '').strip()
        location = str(teacher.get('location') or '').strip()
        if not name or not subject:
            raise ValueError(f'[{grade_name}] 老师 id={teacher_id} 缺少 name 或 subject')
        teacher_classes = teacher.get('class') or []
        if not isinstance(teacher_classes, list):
            raise ValueError(f'[{grade_name}] 老师 {name} 的 class 需为数组')
        teacher_classes = [str(item).strip() for item in teacher_classes if str(item).strip()]
        unknown_classes = [item for item in teacher_classes if item not in cfg['classes']]
        if unknown_classes:
            print(f'[配置警告] {grade_name} 老师 {subject}{name} 的班级 {unknown_classes} 不在 classes 中，将不会匹配家长')
        normalized_teachers.append({
            'id': teacher_id,
            'name': name,
            'class': teacher_classes,
            'location': location,
            'subject': subject,
        })
    cfg['teachers'] = normalized_teachers
    cfg['teacher_map'] = {str(t['id']): t for t in cfg['teachers']}
    cfg['max_selectable'] = min(cfg['max_selectable'], len(cfg['teachers']))
    return cfg


GRADES = {name: load_grade(name) for name in GRADE_NAMES}
if not GRADES:
    raise ValueError('config.json 中 active_grades 不能为空')
if DEFAULT_GRADE not in GRADES:
    raise ValueError(f'default_grade {DEFAULT_GRADE!r} 不在 active_grades 中')


def get_real_ip():
    """仅当请求来自本机/内网代理时才信任转发头，避免伪造 IP 绕过限流"""
    remote = request.remote_addr or ''
    try:
        trusted = ipaddress.ip_address(remote).is_private
    except ValueError:
        trusted = False

    if trusted:
        forwarded = request.headers.get('X-Forwarded-For')
        if forwarded:
            return forwarded.split(',')[0].strip()
        real_ip = request.headers.get('X-Real-IP')
        if real_ip:
            return real_ip.strip()
    return remote


limiter = Limiter(app=app, key_func=get_real_ip, storage_uri='memory://')

os.makedirs(BASE_DIR / 'log', exist_ok=True)

socketio = SocketIO(app, ping_interval=5, ping_timeout=20, cors_allowed_origins=[])


@app.after_request
def apply_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; "
        "connect-src 'self' ws: wss:; base-uri 'self'; form-action 'self'; "
        "frame-ancestors 'none'"
    )
    return response

# 单文件数据存储；同一进程内的写操作锁，避免并发提交造成超额预约
STORE_FILE = Path(os.environ.get('AQS_DATA_FILE') or (BASE_DIR / 'data.json'))
write_lock = threading.RLock()


def empty_store():
    data = {}
    for grade_name, cfg in GRADES.items():
        data[grade_name] = {
            'teachers': {
                str(teacher['id']): {
                    'maxParents': cfg['default_max_parents'],
                    'reservedStudents': [],
                    'queue': []
                }
                for teacher in cfg['teachers']
            },
            'parents': {}
        }
    return data


def load_store():
    if STORE_FILE.exists():
        with open(STORE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = empty_store()

    for grade_name, cfg in GRADES.items():
        grade_data = data.setdefault(grade_name, {})
        grade_data.setdefault('teachers', {})
        grade_data.setdefault('parents', {})
        for teacher in cfg['teachers']:
            teacher_id = str(teacher['id'])
            doc = grade_data['teachers'].setdefault(teacher_id, {})
            doc.setdefault('maxParents', cfg['default_max_parents'])
            doc.setdefault('reservedStudents', [])
            doc.setdefault('queue', [])
    return data


DATA = load_store()


def persist():
    """原子写入单个 JSON 数据文件"""
    with write_lock:
        tmp_file = STORE_FILE.with_name(STORE_FILE.name + '.tmp')
        with open(tmp_file, 'w', encoding='utf-8') as f:
            json.dump(DATA, f, ensure_ascii=False, indent=2)
        os.replace(tmp_file, STORE_FILE)


persist()


def teacher_coll(grade):
    return DATA[grade]['teachers']


def parent_coll(grade):
    return DATA[grade]['parents']


def ensure_teacher_doc(grade, teacher_id, persist_now=True):
    teacher_id = str(teacher_id)
    teachers = teacher_coll(grade)
    if teacher_id not in teachers:
        teachers[teacher_id] = {
            'maxParents': GRADES[grade]['default_max_parents'],
            'reservedStudents': [],
            'queue': []
        }
        if persist_now:
            persist()
    return teachers[teacher_id]


# ==================== 通用工具 ====================
def current_grade():
    return session.get('grade')


def current_cfg():
    return GRADES.get(current_grade())


def active_count(queue):
    return sum(1 for item in queue if item.get('status') != 'completed')


def get_teacher_doc(grade, teacher_id):
    return teacher_coll(grade).get(str(teacher_id))


def get_teacher_queue(grade, teacher_id):
    doc = get_teacher_doc(grade, teacher_id)
    return doc.get('queue', []) if doc else []


def teacher_settings_payload(grade):
    """返回该年级所有教师的实时容量与排队人数"""
    cfg = GRADES[grade]
    teachers = teacher_coll(grade)
    payload = {}
    for teacher in cfg['teachers']:
        teacher_id = str(teacher['id'])
        doc = teachers.get(teacher_id) or {}
        payload[teacher_id] = {
            'maxParents': int(doc.get('maxParents', cfg['default_max_parents'])),
            'peoples': active_count(doc.get('queue', []))
        }
    return payload


def recalculate_rankings(grade, teacher_id):
    """按照队列顺序重算家长的前方等待人数，避免完成/跳过/取消后排名漂移"""
    queue = get_teacher_queue(grade, teacher_id)
    parents = parent_coll(grade)
    position = 0
    for item in queue:
        if item.get('status') == 'completed':
            continue
        parent_name = item.get('name')
        field = 'must' if item.get('type') == '指定预约' else 'appointment'
        doc = parents.get(parent_name)
        if doc:
            for record in doc.get(field, []):
                if str(record.get('teacher_id')) == str(teacher_id):
                    record['ranking'] = position
        position += 1


def ensure_current(queue):
    """保证队列中有且仅有一个 current，且优先取排队最前的家长"""
    active = [item for item in queue if item.get('status') != 'completed']
    if not active:
        return queue
    currents = [item for item in active if item.get('status') == 'current']
    if not currents:
        active[0]['status'] = 'current'
    else:
        for item in currents[1:]:
            item['status'] = 'waiting'
    return queue


def save_queue(grade, teacher_id, queue):
    ensure_current(queue)
    teacher = ensure_teacher_doc(grade, teacher_id)
    teacher['queue'] = queue
    recalculate_rankings(grade, teacher_id)
    persist()
    emit_queue_update(grade, teacher_id, queue)


def emit_queue_update(grade, teacher_id, queue=None, room=None):
    if queue is None:
        queue = get_teacher_queue(grade, teacher_id)
    payload = {'teacherId': str(teacher_id), 'grade': grade, 'queue': queue}
    socketio.emit('queue_update', payload, room=room or room_name(grade, teacher_id))


def room_name(grade, teacher_id):
    return f'teacher_{grade}_{teacher_id}'


def push_queue_item(grade, teacher_id, parent_name, item_type, persist_now=True):
    """把家长追加到队尾，返回其前方等待人数"""
    teacher = ensure_teacher_doc(grade, teacher_id, persist_now)
    queue = teacher.setdefault('queue', [])
    ranking = active_count(queue)
    queue.append({'name': parent_name, 'status': 'waiting', 'type': item_type})
    ensure_current(queue)
    if persist_now:
        persist()
    return ranking


def remove_queue_item(grade, teacher_id, parent_name, persist_now=True):
    teacher = get_teacher_doc(grade, teacher_id)
    if teacher is None:
        return False
    queue = teacher.get('queue', [])
    new_queue = [item for item in queue if item.get('name') != parent_name]
    if len(new_queue) == len(queue):
        return False
    teacher['queue'] = new_queue
    recalculate_rankings(grade, teacher_id)
    if persist_now:
        persist()
    return True


def add_reserved(grade, teacher_id, parent_name, persist_now=True):
    parents = parent_coll(grade)
    doc = parents.get(parent_name)
    if doc is None:
        doc = {'name': parent_name, 'appointment': [], 'must': []}
        parents[parent_name] = doc

    teacher_id = str(teacher_id)
    has_must = any(str(record.get('teacher_id')) == teacher_id for record in doc.get('must', []))
    appointment_records = [
        record for record in doc.get('appointment', [])
        if str(record.get('teacher_id')) == teacher_id
    ]
    queue = get_teacher_queue(grade, teacher_id)
    queue_index = next(
        (index for index, item in enumerate(queue) if item.get('name') == parent_name),
        None
    )

    changed = False
    if queue_index is None:
        ranking = push_queue_item(grade, teacher_id, parent_name, '指定预约', persist_now=False)
        changed = True
    else:
        ranking = sum(1 for item in queue[:queue_index] if item.get('status') != 'completed')
        if appointment_records:
            # 自主预约转为指定预约，避免同一老师出现两条预约记录
            doc['appointment'] = [
                record for record in doc.get('appointment', [])
                if str(record.get('teacher_id')) != teacher_id
            ]
            appointment_records = []
            changed = True
        if queue[queue_index].get('type') != '指定预约':
            queue[queue_index]['type'] = '指定预约'
            changed = True

    if not has_must:
        doc.setdefault('must', []).append({'teacher_id': int(teacher_id), 'ranking': ranking})
        changed = True

    if changed and persist_now:
        persist()


def remove_reserved(grade, teacher_id, parent_name, persist_now=True):
    teacher_id = str(teacher_id)
    changed = False
    doc = parent_coll(grade).get(parent_name)
    has_appointment = False
    if doc is not None:
        remaining = [
            record for record in doc.get('must', [])
            if str(record.get('teacher_id')) != teacher_id
        ]
        if len(remaining) != len(doc.get('must', [])):
            doc['must'] = remaining
            changed = True
        has_appointment = any(
            str(record.get('teacher_id')) == teacher_id
            for record in doc.get('appointment', [])
        )

    if has_appointment:
        # 家长仍有该老师的自主预约，只解除指定，保留队列
        for item in get_teacher_queue(grade, teacher_id):
            if item.get('name') == parent_name:
                item['type'] = '自主预约'
                changed = True
    elif remove_queue_item(grade, teacher_id, parent_name, persist_now=False):
        changed = True

    if changed and persist_now:
        persist()


def class_start_dt(cfg, class_name):
    """班级对应的叫号起点，未单独配置时使用年级默认值"""
    return cfg['conversion_start_by_class'].get(class_name, cfg['conversion_start_dt'])


def parent_class_name(grade, parent_name):
    """从“班级+姓名”的家长标识中解析班级"""
    for class_name in sorted(GRADES[grade]['classes'], key=len, reverse=True):
        if parent_name.startswith(class_name):
            return class_name
    return ''


def build_queue_times(grade, queue):
    """按队列顺序推算每位未完成家长的预计时间，兼顾不同班级的开始时间"""
    cfg = GRADES[grade]
    times = []
    current = None
    for item in queue:
        if item.get('status') == 'completed':
            times.append(None)
            continue
        class_start = class_start_dt(cfg, parent_class_name(grade, item.get('name', '')))
        slot = class_start if current is None else max(
            class_start, current + timedelta(minutes=cfg['meeting_duration'])
        )
        times.append(slot)
        current = slot
    return times


def build_parent_schedule(grade, parent_name, class_name=''):
    """构建家长端展示用的预约明细（实时状态与等待人数）"""
    cfg = GRADES[grade]
    doc = parent_coll(grade).get(parent_name)
    if doc is None:
        return []

    start_dt = class_start_dt(cfg, class_name or parent_class_name(grade, parent_name))
    status_text = {'waiting': '等待中', 'current': '进行中', 'completed': '已完成'}
    schedule = []
    for field, is_must in (('must', True), ('appointment', False)):
        for record in doc.get(field, []):
            teacher_id = str(record.get('teacher_id'))
            teacher = cfg['teacher_map'].get(teacher_id)
            if teacher is None:
                continue
            queue = get_teacher_queue(grade, teacher_id)
            queue_times = build_queue_times(grade, queue)
            position = None
            status = record.get('status', 'waiting')
            slot = None
            for index, item in enumerate(queue):
                if item.get('name') == parent_name:
                    position = index
                    status = item.get('status', 'waiting')
                    slot = queue_times[index]
                    break
            if position is None:
                waiting = int(record.get('ranking', 0))
                slot = start_dt + timedelta(minutes=waiting * cfg['meeting_duration'])
            else:
                waiting = sum(1 for item in queue[:position] if item.get('status') != 'completed')

            if status == 'completed' or slot is None:
                estimated = '已完成'
            else:
                estimated = slot.strftime('%H:%M')

            schedule.append({
                'teacher_id': record.get('teacher_id'),
                'subject': teacher.get('subject', ''),
                'name': teacher.get('name', ''),
                'location': teacher.get('location', ''),
                'waiting': waiting,
                'status': status,
                'status_text': status_text.get(status, '等待中'),
                'estimated': estimated,
                'is_must': is_must
            })
    return schedule


def build_appointment_records(grade, parent_name, field):
    """预约页使用的精简记录（含实时等待人数）"""
    doc = parent_coll(grade).get(parent_name)
    if doc is None:
        return []
    records = []
    for record in doc.get(field, []):
        teacher_id = record.get('teacher_id')
        if str(teacher_id) not in GRADES[grade]['teacher_map']:
            continue
        queue = get_teacher_queue(grade, teacher_id)
        position = None
        status = record.get('status', 'waiting')
        for index, item in enumerate(queue):
            if item.get('name') == parent_name:
                position = index
                status = item.get('status', 'waiting')
                break
        waiting = int(record.get('ranking', 0)) if position is None else sum(
            1 for item in queue[:position] if item.get('status') != 'completed'
        )
        records.append({'teacher_id': teacher_id, 'ranking': waiting, 'status': status})
    return records


# ==================== Flask路由 ====================
@app.route('/favicon.ico')
def favicon():
    return send_file(BASE_DIR / 'static' / 'images' / 'icon.png', mimetype='image/vnd.microsoft.icon')


@app.route('/')
def index():
    if request.query_string:
        return redirect('/login?' + request.query_string.decode('utf-8'))
    return redirect('/login')


@app.route('/login')
def login():
    if session.get('teacher_verified') and session.get('id'):
        return redirect('/teacher')
    if session.get('parent_verified') and session.get('id'):
        return redirect('/parent')
    return render_template('login.html', t_grades=GRADE_NAMES, t_default_grade=DEFAULT_GRADE)


@app.route('/get_grades')
def get_grades():
    return jsonify({'grades': GRADE_NAMES, 'default': DEFAULT_GRADE})


@app.route('/verify-key', methods=['POST'])
@limiter.limit(f'{VERIFY_LIMIT} per hour')
def verify_key():
    data = request.get_json(silent=True) or {}
    grade = str(data.get('grade', '')).strip()
    key = str(data.get('key', '')).strip()
    cfg = GRADES.get(grade)

    if cfg is None:
        return jsonify({'success': False, 'message': '请选择有效的年级'}), 400

    parent_key = cfg.get('keys', {}).get('parent_key') or ''
    teacher_key = cfg.get('keys', {}).get('teacher_key') or ''

    if key and parent_key and secrets.compare_digest(key, parent_key):
        session.clear()
        session['grade'] = grade
        session['parent_verified'] = True
        session['role'] = 'parent'
        return jsonify({'success': True, 'role': 'parent', 'grade': grade})
    if key and teacher_key and secrets.compare_digest(key, teacher_key):
        session.clear()
        session['grade'] = grade
        session['teacher_verified'] = True
        session['role'] = 'teacher'
        return jsonify({'success': True, 'role': 'teacher', 'grade': grade})
    return jsonify({'success': False, 'message': '密钥错误，请重新输入'}), 401


@app.route('/get_teachers')
def get_teachers():
    cfg = current_cfg()
    if not session.get('teacher_verified') or cfg is None:
        return jsonify({'success': False, 'message': '未授权'}), 401
    return jsonify(cfg['teachers'])


@app.route('/get_classes')
def get_classes():
    cfg = current_cfg()
    if cfg is None or not (session.get('parent_verified') or session.get('teacher_verified')):
        return jsonify({'success': False, 'message': '未授权'}), 401
    return jsonify({'grade': current_grade(), 'classes': cfg['classes']})


@app.route('/handle', methods=['POST'])
@limiter.limit(f'{HANDLE_LIMIT} per hour')
def handle():
    data = request.get_json(silent=True) or {}
    cfg = current_cfg()
    if cfg is None:
        return jsonify({'success': False, 'message': '登录状态已失效，请重新登录'})

    if session.get('role') == 'parent' and session.get('parent_verified'):
        name = str(data.get('name', '')).strip()
        class_name = str(data.get('className', '')).strip()
        if not name:
            return jsonify({'success': False, 'message': '请输入孩子姓名'})
        if len(name) > 20:
            return jsonify({'success': False, 'message': '姓名过长'})
        if class_name not in cfg['classes']:
            return jsonify({'success': False, 'message': '请选择正确的班级'})
        session['name'] = name
        session['className'] = class_name
        session['id'] = class_name + name
        return jsonify({'success': True})

    if session.get('role') == 'teacher' and session.get('teacher_verified'):
        teacher_id = str(data.get('name', '')).strip()
        teacher = cfg['teacher_map'].get(teacher_id)
        if teacher is None:
            return jsonify({'success': False, 'message': '请选择正确的老师'})
        session['id'] = teacher_id
        session['name'] = teacher['name']
        return jsonify({'success': True})

    return jsonify({'success': False, 'message': '登录失败，请重试'})


@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')


@app.route('/parent')
def parent():
    if not session.get('parent_verified') or not session.get('id'):
        return redirect('/login')
    cfg = current_cfg()
    if cfg is None:
        return redirect('/login')

    schedule = build_parent_schedule(current_grade(), session['id'], session.get('className', ''))
    parent_doc = parent_coll(current_grade()).get(session['id'])
    can_modify = cfg['allow_modify_after_save'] or not (parent_doc and parent_doc.get('appointment'))
    return render_template(
        'parent.html',
        t_name=session.get('name', ''),
        t_grade=current_grade(),
        t_schedule=schedule,
        t_allow_modify=can_modify
    )


@app.route('/parent/appointment')
def appointment():
    if not session.get('parent_verified') or not session.get('id'):
        return redirect('/login')
    cfg = current_cfg()
    if cfg is None:
        return redirect('/login')

    if cfg['enable_time_check']:
        current_time = datetime.now()
        if current_time < cfg['appointment_start']:
            return render_template(
                'appointment_not_available.html',
                t_title='预约未开始',
                t_grade=current_grade(),
                t_start_time=cfg['appointment_start'].strftime('%Y-%m-%d %H:%M:%S'),
                t_end_time=cfg['appointment_end'].strftime('%Y-%m-%d %H:%M:%S')
            )
        if current_time > cfg['appointment_end']:
            return render_template(
                'appointment_not_available.html',
                t_title='预约已结束',
                t_grade=current_grade(),
                t_start_time=cfg['appointment_start'].strftime('%Y-%m-%d %H:%M:%S'),
                t_end_time=cfg['appointment_end'].strftime('%Y-%m-%d %H:%M:%S')
            )

    parent_doc = parent_coll(current_grade()).get(session['id'])
    if not cfg['allow_modify_after_save'] and parent_doc and parent_doc.get('appointment'):
        return redirect('/parent')

    start_dt = class_start_dt(cfg, session.get('className', ''))
    return render_template(
        'appointment.html',
        t_name=session.get('name', ''),
        t_className=session.get('className', ''),
        t_grade=current_grade(),
        t_teacher=cfg['teachers'],
        t_notice=cfg['notice_lines'],
        t_notice_countdown=cfg['notice_countdown'],
        t_appointment=build_appointment_records(current_grade(), session['id'], 'appointment'),
        t_must=build_appointment_records(current_grade(), session['id'], 'must'),
        t_setting=teacher_settings_payload(current_grade()),
        t_start_time=start_dt.strftime('%Y-%m-%dT%H:%M:%S'),
        t_meeting_duration=cfg['meeting_duration'],
        t_max_selectable=cfg['max_selectable']
    )


@app.route('/parent/appointment/save', methods=['POST'])
@limiter.limit(f'{SAVE_LIMIT} per hour')
def save():
    cfg = current_cfg()
    if cfg is None or not session.get('parent_verified') or not session.get('id'):
        return jsonify({'success': False, 'message': '登录状态已失效，请重新登录'})

    if cfg['enable_time_check']:
        current_time = datetime.now()
        if current_time < cfg['appointment_start']:
            return jsonify({'success': False, 'message': f'预约尚未开放，开放时间为：{cfg["appointment_start"].strftime("%Y-%m-%d %H:%M:%S")}'})
        if current_time > cfg['appointment_end']:
            return jsonify({'success': False, 'message': f'预约已截止，截止时间为：{cfg["appointment_end"].strftime("%Y-%m-%d %H:%M:%S")}'})

    data = request.get_json(silent=True) or {}
    raw_ids = data.get('appointments')
    if not isinstance(raw_ids, list):
        return jsonify({'success': False, 'message': '预约数据格式不正确'})

    new_ids = []
    for item in raw_ids:
        try:
            new_ids.append(int(item))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': '预约数据格式不正确'})
    if len(set(new_ids)) != len(new_ids):
        return jsonify({'success': False, 'message': '预约老师重复'})
    if len(new_ids) > cfg['max_selectable']:
        return jsonify({'success': False, 'message': f'最多只能选择{cfg["max_selectable"]}位老师'})

    class_name = session.get('className', '')
    for teacher_id in new_ids:
        teacher = cfg['teacher_map'].get(str(teacher_id))
        if teacher is None:
            return jsonify({'success': False, 'message': '包含无效的老师'})
        if class_name not in teacher.get('class', []):
            return jsonify({'success': False, 'message': f'{teacher.get("name", "")}不负责该班级'})

    grade = current_grade()
    parent_name = session['id']
    parents = parent_coll(grade)

    with write_lock:
        doc = parents.get(parent_name)
        old_ids = [int(record['teacher_id']) for record in doc.get('appointment', [])] if doc else []
        old_set = set(old_ids)
        new_set = set(new_ids)

        must_ids = {
            int(record['teacher_id']) for record in (doc or {}).get('must', [])
            if str(record.get('teacher_id', '')).lstrip('-').isdigit()
        }
        duplicated_must = new_set & must_ids
        if duplicated_must:
            teacher = cfg['teacher_map'].get(str(sorted(duplicated_must)[0]), {})
            return jsonify({
                'success': False,
                'message': f'{teacher.get("name", "该老师")}已指定预约，无需重复选择'
            })

        if not cfg['allow_modify_after_save'] and old_set and old_set != new_set:
            return jsonify({'success': False, 'message': '本年级预约提交后不可自行更改，请联系管理员'})

        for teacher_id in new_set - old_set:
            teacher_doc = get_teacher_doc(grade, teacher_id)
            max_parents = int(teacher_doc.get('maxParents', cfg['default_max_parents'])) if teacher_doc else cfg['default_max_parents']
            queue = teacher_doc.get('queue', []) if teacher_doc else []
            if active_count(queue) >= max_parents:
                teacher = cfg['teacher_map'].get(str(teacher_id), {})
                return jsonify({
                    'success': False,
                    'message': f'{teacher.get("name", "该老师")}的预约人数已满，无法预约',
                    'setting': teacher_settings_payload(grade)
                })

        if doc is None:
            doc = {'name': parent_name, 'appointment': [], 'must': []}
            parents[parent_name] = doc

        for teacher_id in old_set - new_set:
            remove_queue_item(grade, teacher_id, parent_name, persist_now=False)
            doc['appointment'] = [
                record for record in doc.get('appointment', [])
                if int(record.get('teacher_id')) != teacher_id
            ]

        for teacher_id in new_set - old_set:
            ranking = push_queue_item(grade, teacher_id, parent_name, '自主预约', persist_now=False)
            doc.setdefault('appointment', []).append({'teacher_id': teacher_id, 'ranking': ranking})

        persist()

    for teacher_id in sorted(old_set ^ new_set):
        emit_queue_update(grade, teacher_id)

    return jsonify({'success': True})


@app.route('/teacher')
def teacher():
    if not session.get('teacher_verified') or not session.get('id'):
        return redirect('/login')
    if current_cfg() is None:
        return redirect('/login')
    return render_template('teacher.html', t_name=session.get('name', ''), t_grade=current_grade())


@app.route('/teacher/ontime')
def ontime():
    if not session.get('teacher_verified') or not session.get('id'):
        return redirect('/login')
    if current_cfg() is None:
        return redirect('/login')
    return render_template('ontime.html', t_queue=get_teacher_queue(current_grade(), session['id']), t_grade=current_grade())


@app.route('/teacher/list')
def teacher_list():
    if not session.get('teacher_verified') or not session.get('id'):
        return redirect('/login')
    if current_cfg() is None:
        return redirect('/login')
    queue = get_teacher_queue(current_grade(), session['id'])
    queue_times = build_queue_times(current_grade(), queue)
    queue_view = []
    for item, slot in zip(queue, queue_times):
        record = dict(item)
        record['appointmentTime'] = slot.strftime('%H:%M') if slot else '-'
        queue_view.append(record)
    return render_template(
        'list.html',
        t_grade=current_grade(),
        t_queue=queue_view
    )


@app.route('/teacher/setting')
def setting():
    if not session.get('teacher_verified') or not session.get('id'):
        return redirect('/login')
    cfg = current_cfg()
    if cfg is None:
        return redirect('/login')
    doc = get_teacher_doc(current_grade(), session['id'])
    max_parents = doc.get('maxParents', cfg['default_max_parents']) if doc else cfg['default_max_parents']
    reserved_students = doc.get('reservedStudents', []) if doc else []
    return render_template(
        'setting.html',
        t_maxParents=max_parents,
        t_reservedStudents=reserved_students,
        t_grade=current_grade(),
        t_maxParentsLimit=cfg['max_parents_limit'],
        t_capacityEditable=cfg['allow_capacity_edit'],
        t_allowReserved=cfg['allow_reserved_list'],
        t_maxReserved=cfg['max_reserved_students']
    )


@app.route('/teacher/setting/save', methods=['POST'])
@limiter.limit(f'{SETTING_LIMIT} per hour')
def setting_save():
    cfg = current_cfg()
    if cfg is None or not session.get('teacher_verified') or not session.get('id'):
        return jsonify({'success': False, 'message': '登录状态已失效，请重新登录'})

    grade = current_grade()
    teacher_id = str(session['id'])
    doc = get_teacher_doc(grade, teacher_id) or {}

    if cfg['allow_capacity_edit']:
        data = request.get_json(silent=True) or {}
        try:
            max_parents = int(data.get('maxParents'))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': '请输入有效的家长数量'})
        if max_parents < 1 or max_parents > cfg['max_parents_limit']:
            return jsonify({
                'success': False,
                'message': f'家长数量需在 1 到 {cfg["max_parents_limit"]} 之间'
            })
    else:
        max_parents = int(doc.get('maxParents', cfg['default_max_parents']))

    if cfg['allow_reserved_list']:
        raw_reserved = (request.get_json(silent=True) or {}).get('reservedStudents') or []
        if not isinstance(raw_reserved, list):
            return jsonify({'success': False, 'message': '名单格式不正确'})
        if len(raw_reserved) > cfg['max_reserved_students']:
            return jsonify({
                'success': False,
                'message': f'名单最多 {cfg["max_reserved_students"]} 人'
            })
        reserved_students = list(dict.fromkeys(
            str(name).strip() for name in raw_reserved if str(name).strip()
        ))
        if any(len(name) > 30 for name in reserved_students):
            return jsonify({'success': False, 'message': '单个姓名过长'})
    else:
        reserved_students = list(doc.get('reservedStudents', []))

    ensure_teacher_doc(grade, teacher_id, persist_now=False)

    with write_lock:
        doc = get_teacher_doc(grade, teacher_id)
        current_reserved = set((doc or {}).get('reservedStudents', []))
        target_reserved = set(reserved_students)

        for name in target_reserved - current_reserved:
            add_reserved(grade, teacher_id, name, persist_now=False)
        for name in current_reserved - target_reserved:
            remove_reserved(grade, teacher_id, name, persist_now=False)

        doc = ensure_teacher_doc(grade, teacher_id, persist_now=False)
        doc['maxParents'] = max_parents
        doc['reservedStudents'] = reserved_students
        persist()

    emit_queue_update(grade, teacher_id)
    return jsonify({'success': True})


def match_queue_item(item, parent_id=None, parent_name=None):
    if parent_id:
        item_id = item.get('id') or item.get('_id')
        if item_id and str(item_id) == str(parent_id):
            return True
    if parent_name and item.get('name') == parent_name:
        return True
    return False


def socket_teacher_context():
    if not session.get('teacher_verified') or not session.get('id'):
        return None, None
    grade = current_grade()
    if grade not in GRADES:
        return None, None
    return grade, str(session['id'])


@socketio.on('join_teacher_room')
def handle_join_teacher_room(data=None):
    grade, teacher_id = socket_teacher_context()
    if grade is None:
        return
    join_room(room_name(grade, teacher_id))
    emit_queue_update(grade, teacher_id, room=request.sid)


@socketio.on('complete_parent')
def handle_complete_parent(data=None):
    grade, teacher_id = socket_teacher_context()
    if grade is None:
        return

    with write_lock:
        queue = get_teacher_queue(grade, teacher_id)
        updated = False
        for item in queue:
            if item.get('status') == 'current':
                item['status'] = 'completed'
                updated = True
                break
        if updated:
            save_queue(grade, teacher_id, queue)

    if not updated:
        emit_queue_update(grade, teacher_id)


@socketio.on('skip_parent')
def handle_skip_parent(data=None):
    grade, teacher_id = socket_teacher_context()
    if grade is None:
        return

    with write_lock:
        queue = get_teacher_queue(grade, teacher_id)
        current_index = None
        for index, item in enumerate(queue):
            if item.get('status') == 'current':
                current_index = index
                break
        if current_index is None:
            return
        item = queue.pop(current_index)
        item['status'] = 'waiting'
        queue.append(item)
        save_queue(grade, teacher_id, queue)


@socketio.on('promote_first_waiting')
def handle_promote_first_waiting(data=None):
    grade, teacher_id = socket_teacher_context()
    if grade is None:
        return

    data = data or {}
    parent_id = data.get('parentId')
    parent_name = data.get('parentName')

    with write_lock:
        queue = get_teacher_queue(grade, teacher_id)
        target_index = None
        for index, item in enumerate(queue):
            if item.get('status') == 'completed':
                continue
            if match_queue_item(item, parent_id, parent_name):
                target_index = index
                break
        if target_index is None:
            socketio.emit('promote_rejected', {'teacherId': teacher_id, 'grade': grade}, room=room_name(grade, teacher_id))
            return
        for item in queue:
            if item.get('status') == 'current':
                item['status'] = 'waiting'
        queue[target_index]['status'] = 'current'
        save_queue(grade, teacher_id, queue)


@app.route('/teacher/list/download')
def list_download():
    if not session.get('teacher_verified') or not session.get('id'):
        return redirect('/login')
    cfg = current_cfg()
    if cfg is None:
        return redirect('/login')

    teacher = cfg['teacher_map'].get(str(session['id']), {})
    teacher_name = teacher.get('name') or session.get('name', '未知老师')
    subject = teacher.get('subject', '')
    queue = get_teacher_queue(current_grade(), session['id'])

    status_text_map = {
        'waiting': '等待中',
        'current': '进行中',
        'completed': '已完成',
        'skipped': '已跳过'
    }

    data_list = []
    queue_times = build_queue_times(current_grade(), queue)
    for index, (item, slot) in enumerate(zip(queue, queue_times), 1):
        estimated_time = slot.strftime('%H:%M') if slot else '-'
        data_list.append({
            '序号': index,
            '学生姓名': item.get('name', ''),
            '预计时间': estimated_time,
            '状态': status_text_map.get(item.get('status', 'waiting'), '未知')
        })

    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = '预约列表'
    sheet.append(['序号', '学生姓名', '预计时间', '状态'])
    for row in data_list:
        sheet.append([row['序号'], row['学生姓名'], row['预计时间'], row['状态']])
    sheet.column_dimensions['A'].width = 8
    sheet.column_dimensions['B'].width = 18
    sheet.column_dimensions['C'].width = 12
    sheet.column_dimensions['D'].width = 10

    output = BytesIO()
    workbook.save(output)
    output.seek(0)

    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=f'{subject}{teacher_name}的预约列表.xlsx'
    )


# ==================== 错误处理 ====================
def wants_json_response():
    return request.path.startswith('/parent/appointment/save') or request.is_json


@app.errorhandler(404)
def handle_404(error):
    if wants_json_response():
        return jsonify({'success': False, 'message': '接口不存在'}), 404
    return redirect('/login')


@app.errorhandler(Exception)
def handle_500(error):
    if isinstance(error, HTTPException):
        return error

    client_ip = get_real_ip()
    route_info = f'{request.method} {request.path}'
    error_time = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    error_msg = f'[{error_time}] IP: {client_ip} - Route: {route_info} - Error: {str(error)}\n\n'
    with open(BASE_DIR / 'log' / 'error.log', 'a', encoding='utf-8') as f:
        f.write(error_msg)

    if wants_json_response():
        return jsonify({'success': False, 'message': '服务器处理失败，请稍后重试'}), 500
    return redirect('/login')


@socketio.on_error()
def handle_socket_error(error):
    client_ip = get_real_ip()
    error_time = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    error_msg = f'[{error_time}] IP: {client_ip} - Route: WebSocketEvent - Error: {str(error)}\n\n'
    with open(BASE_DIR / 'log' / 'error.log', 'a', encoding='utf-8') as f:
        f.write(error_msg)


@app.errorhandler(429)
def ratelimit_handler(e):
    client_ip = get_real_ip()
    route_info = f'{request.method} {request.path}'
    limit_time = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    limit_msg = f'[{limit_time}] IP: {client_ip} - Route: {route_info} - Rate limit exceeded: {e.description}\n\n'
    with open(BASE_DIR / 'log' / 'limit.log', 'a', encoding='utf-8') as f:
        f.write(limit_msg)
    return jsonify({'success': False, 'message': '请求过于频繁，请稍后再试'}), 429


# ==================== 启动应用 ====================
if __name__ == '__main__':
    socketio.run(app, host=SERVER_HOST, port=SERVER_PORT, debug=DEBUG)
