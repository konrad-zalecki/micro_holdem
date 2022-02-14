from flask import Flask, render_template, jsonify, make_response, request
import jwt
import datetime
from pymongo import MongoClient
import sys

app = Flask(__name__)
app.config['SECRET_KEY'] = 's3cret'

@app.route('/login', methods=['POST'])
def login():
    username = request.json["username"]
    password = request.json["password"]
    query = { "username": username, "password": password }
    client = MongoClient('mongodb://users-db:27017,users-db-2:27017/?replicaSet=rs0')
    col = client["users_database"]["users"]
    matches = col.find(query)
    if len(list(matches)) > 0:
        token = jwt.encode({'user': username, 
                'exp': datetime.datetime.utcnow() + datetime.timedelta(days=10)},
                app.config['SECRET_KEY'])
        return jsonify({'token': token})
    else:
        return make_response("Bad password", 400)

@app.route('/register', methods=['POST'])
def register():
    username = request.json["username"]
    password = request.json["password"]
    query = { "username": username}
    client = MongoClient('mongodb://users-db:27017,users-db-2:27017/?replicaSet=rs0')
    col = client["users_database"]["users"]
    matches = col.find(query)
    if len(list(matches)) == 0:
        col.insert_one({"username": username, "password": password})
        return make_response("OK", 200)
    else:
        return make_response("Username not available", 400)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=6969)