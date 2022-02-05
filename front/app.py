from tkinter import E
from flask import Flask, redirect, render_template, jsonify, make_response, request
import requests
import sys
import jwt
from functools import wraps

app = Flask(__name__)


app.config['SECRET_KEY'] = 's3cret'

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get('auth_token')
        if not token:
            return redirect('/login')
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        except:
            return 'Invalid token'
        return f(*args, **kwargs)
    return decorated

def token_prohibited(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get('auth_token')
        if not token:
            return f(*args, **kwargs)
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        except:
            return f(*args, **kwargs)
        return redirect('/')
    return decorated


@app.route('/')
@token_required
def root():
    return render_template('main.html')


@app.route('/login', methods=['POST', 'GET'])
@token_prohibited
def login():
    if request.method == 'GET':
        return render_template('login.html')
    elif request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        response = requests.post(
            'http://users-node:6969/login',
            json={'password': password, 'username': username}
        )
    if response.status_code == 200:
        resp = make_response(redirect('/'))
        resp.set_cookie('auth_token', response.json()['token'])
        return resp
    return render_template('login.html', fail_info="Invalid data")


@app.route('/register', methods=['POST', 'GET'])
@token_prohibited
def register():
    if request.method == 'GET':
        return render_template('register.html')
    elif request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        response = requests.post(
            'http://users-node:6969/register',
            json={'password': password, 'username': username}
        )
    if response.status_code == 200:
        return render_template('register.html', succ_info="Account created")
    else:
        return render_template('register.html', fail_info="Username not available")


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=2137)