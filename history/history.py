from flask import Flask, jsonify, make_response, request
import jwt
from datetime import datetime
from pymongo import MongoClient
import sys

app = Flask(__name__)


def get_history(user):
    client = MongoClient('mongodb://history-db:27017')
    col = client["history_database"]["history"]
    matches = col.find({"user": user})
    history =  matches[0]["history"]
    history = history[:20]
    history.reverse()
    return history


def create_time_str():
    return str(datetime.now().replace(microsecond=0))


def add_to_history(user, change):
    client = MongoClient('mongodb://history-db:27017')
    col = client["history_database"]["history"]
    history = get_history(user)
    history.append({"time": create_time_str(), "change": change})
    query = { "user": user }
    newvalues = { "$set": { "history": history } }
    col.update_one(query, newvalues)

    

def init_history(user):
    client = MongoClient('mongodb://history-db:27017')
    col = client["history_database"]["history"]
    matches = col.find({"user": user})
    if len(list(matches)) > 0:
        return False
    col.insert_one({"user": user, "history": []})
    return True


@app.route('/init-history', methods=['POST'])
def api_init_history():
    print("JS", request.json, file=sys.stderr)
    if init_history(request.json["user"]):
        return make_response("OK", 200)
    return make_response("User already exists", 400)


@app.route('/get-history', methods=['POST'])
def api_get_history():
    return jsonify(get_history(request.json["user"]))


@app.route('/add-to-history', methods=['POST'])
def api_add_to_history():
    add_to_history(request.json["user"], request.json["amount"])
    return make_response("OK", 200)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=2190)