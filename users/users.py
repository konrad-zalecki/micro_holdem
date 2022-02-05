from flask import Flask, render_template, jsonify, make_response, request
import jwt
import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 's3cret'

@app.route('/login', methods=['POST'])
def login():
    username = request.json["username"]
    password = request.json["password"]
    token = jwt.encode({'user': username, 
              'exp': datetime.datetime.utcnow() + datetime.timedelta(days=10)},
              app.config['SECRET_KEY'])
    return jsonify({'token': token})

@app.route('/register')
def register():
    return render_template('register.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=6969)