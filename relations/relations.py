from flask import Flask, render_template, jsonify, make_response, request
import jwt
import datetime
from pymongo import MongoClient
import sys

app = Flask(__name__)
app.config['SECRET_KEY'] = 's3cret'

def get_auth_username(request):
    try:
        auth_token = request.json["auth_token"]
        data = jwt.decode(auth_token, app.config['SECRET_KEY'], algorithms=["HS256"])
        username = data["user"]
        return username
    except:
        return None

def are_friends(col, a, b):
    x = len(list(col.find({"L": a, "R": b})))
    y = len(list(col.find({"L": b, "R": a})))
    return x + y > 0

def create_invite(_from, _to):
    client = MongoClient('mongodb://relations-db:27017')
    col = client["relations_database"]["invitations"]
    if are_friends(col, _from, _to):
        return
    col.insert_one({"from": _from, "to": _to})

@app.route('/invite', methods=['POST'])
def login():
    sender_username = get_auth_username(request)
    if not sender_username:
        return make_response('fail', 400)
    client = MongoClient('mongodb://relations-db:27017')
    col = client["relations_database"]["invitations"]
    create_invite(sender_username, request.json["to"])
    return make_response(sender_username, 200)

@app.route('/get-invites', methods=['POST'])
def get_invites():
    sender_username = get_auth_username(request)
    if not sender_username:
        return make_response('fail', 400)
    client = MongoClient('mongodb://relations-db:27017')
    col = client["relations_database"]["invitations"]
    matches = col.find({"to": sender_username})
    vals = []
    for x in matches:
        vals.append(x["from"])
    return jsonify(vals)

def clear_invitation(_from, _to):
    client = MongoClient('mongodb://relations-db:27017')
    col = client["relations_database"]["invitations"]
    matches = col.delete_many({"from": _from, "to": _to})
    return matches.deleted_count > 0


def add_friend(_to, _name):
    client = MongoClient('mongodb://relations-db:27017')
    col = client["relations_database"]["friends"]
    if are_friends(col, _to, _name):
        return
    col.insert_one({"L": _to, "R": _name})
    col.insert_one({"R": _to, "L": _name})

def get_friends(name):
    client = MongoClient('mongodb://relations-db:27017')
    col = client["relations_database"]["friends"]
    matches = col.find({"L": name})
    return [x["R"] for x in matches]

def get_invites(name):
    client = MongoClient('mongodb://relations-db:27017')
    col = client["relations_database"]["invitations"]
    matches = col.find({"to": name})
    return [x["from"] for x in matches]


def delete_friends(a, b):
    client = MongoClient('mongodb://relations-db:27017')
    col = client["relations_database"]["friends"]
    print(a, "|", b, file=sys.stderr)
    A = col.delete_many({"L": a, "R": b})
    B = col.delete_many({"R": a, "L": b})
    return A.deleted_count + B.deleted_count > 0


@app.route('/accept', methods=['POST'])
def accept():
    sender_username = get_auth_username(request)
    if not sender_username:
        return make_response('fail', 400)
    if clear_invitation(request.json["from"], sender_username):
        add_friend(sender_username, request.json["from"])
        return make_response("OK", 200)
    else:
        return make_response("fail", 400)

@app.route('/decline', methods=['POST'])
def decline():
    sender_username = get_auth_username(request)
    if not sender_username:
        return make_response('fail', 400)
    if clear_invitation(request.json["from"], sender_username):
        return make_response("OK", 200)
    else:
        return make_response("fail", 400)

@app.route('/unfriend', methods=['POST'])
def unfriend():
    sender_username = get_auth_username(request)
    if not sender_username:
        return make_response('fail', 400)
    if delete_friends(request.json["who"], sender_username):
        return make_response("OK", 200)
    else:
        return make_response("fail", 400)

@app.route('/friendscontent', methods=['POST'])
def friendscontent():
    sender_username = request.json["username"]
    return jsonify({
        "friends": get_friends(sender_username),
        "invites": get_invites(sender_username),
    })




if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=2138)