from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

PARENT_KEY = 'parent'
TEACHER_KEY = 'teacher'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/parent')
def parent():
    if not session.get('parent_verified'):
        return redirect(url_for('index'))
    return render_template('parent.html')

@app.route('/teacher')
def teacher():
    if not session.get('teacher_verified'):
        return redirect(url_for('index'))
    return render_template('teacher.html')

@app.route('/verify-key', methods=['POST'])
def verify_key():
    data = request.get_json()
    key = data.get('key', '').strip()
    
    if key == PARENT_KEY:
        session['parent_verified'] = True
        session['role'] = 'parent'
        return jsonify({'success': True, 'role': 'parent'})
    elif key == TEACHER_KEY:
        session['teacher_verified'] = True
        session['role'] = 'teacher'
        return jsonify({'success': True, 'role': 'teacher'})
    else:
        return jsonify({'success': False, 'message': '密钥错误，请重新输入'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)