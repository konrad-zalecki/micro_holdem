from flask import Flask, render_template, jsonify, make_response, request
import jwt
import datetime
from pymongo import MongoClient
import sys
import redis
from datetime import datetime, timedelta

app = Flask(__name__)
app.config['SECRET_KEY'] = 's3cret'

DAILY_BONUS = 50
NEW_ACCOUNT_BALANCE = 1000

def update_balance_if_cached(key, value):
    rc = redis.Redis(host='redis-cache', port=6379, db=0)
    val = rc.get(key)
    if val is not None:
        rc.set(key, value)

def get_auth_username(request):
    try:
        auth_token = request.json["auth_token"]
        data = jwt.decode(auth_token, app.config['SECRET_KEY'], algorithms=["HS256"])
        username = data["user"]
        return username
    except:
        return None

def has_account(col, user):
    return len(list(col.find({"username": user}))) > 0

def db_create_account(user):
    client = MongoClient('mongodb://accounts-db:27017')
    col = client["accounts_database"]["accounts"]
    if has_account(col, user):
        return False
    col.insert_one({
        "username": user,
        "balance": NEW_ACCOUNT_BALANCE,
    })
    col = client["accounts_database"]["daily"]
    col.insert_one({
        "username": user,
        "last": datetime.today() - timedelta(days=1)
    })
    return True

def get_user_balance(user):
    client = MongoClient('mongodb://accounts-db:27017')
    col = client["accounts_database"]["accounts"]
    if not has_account(col, user):
        return None
    matches = col.find({
        "username": user,
    })
    return matches[0]["balance"]

def try_getting_amount(user, amount):
    client = MongoClient('mongodb://accounts-db:27017')
    col = client["accounts_database"]["accounts"]
    if not has_account(col, user):
        return (False, 'unknown user')
    cur_balance = get_user_balance(user)
    if cur_balance < amount:
        return (False, 'insufficient funds')
    myquery = { "username": user }
    new_balance = cur_balance - amount
    newvalues = { "$set": { "balance": new_balance } }
    update_balance_if_cached(user, new_balance)
    col.update_one(myquery, newvalues)
    return (True, 'OK')

def add_amount(user, amount):
    client = MongoClient('mongodb://accounts-db:27017')
    col = client["accounts_database"]["accounts"]
    if not has_account(col, user):
        return False
    cur_balance = get_user_balance(user)
    myquery = { "username": user }
    new_balance = cur_balance + amount
    newvalues = { "$set": { "balance": new_balance } }
    update_balance_if_cached(user, new_balance)
    col.update_one(myquery, newvalues)
    return True

    


@app.route('/create-account', methods=['POST'])
def create_account():
    if db_create_account(request.json["user"]):
        return make_response("OK", 200)
    return make_response("fail no such user", 400)

@app.route('/get-balance', methods=["POST"])
def get_balance():
    balance = get_user_balance(request.json["user"])
    if balance is None:
        return make_response("fail no user", 400)
    return jsonify({"balance": balance})

@app.route('/get-coins', methods=["POST"])
def get_coins_for_game():
    # sender_username = get_auth_username(request)
    # if not sender_username:
    #     return make_response('fail', 400)
    success, message = try_getting_amount(request.json["user"], request.json["amount"])
    if success:
        return make_response(message, 200)
    return make_response(message, 400)

@app.route('/add-coins', methods=["POST"])
def return_coins_after_game():
    print('abba ojcze', file=sys.stderr)
    print(request.json, file=sys.stderr)
    if add_amount(request.json['user'], request.json["amount"]):
        return make_response('OK', 200)
    make_response('adding balance failed', 400)

def save_transaction(_from, _to, amount, time):
    client = MongoClient('mongodb://accounts-db:27017')
    col = client["accounts_database"]["transactions"]
    col.insert_one({"from": _from, "to": _to, "amount": amount, "time": time})

@app.route('/transfer', methods=["POST"])
def transfer_coins():
    sender_username = get_auth_username(request)
    if not sender_username:
        return make_response('fail', 400)
    succ, mess = try_getting_amount(sender_username, request.json["amount"])
    if not succ:
        return make_response(mess, 400)
    add_amount(request.json["to"], request.json["amount"])
    save_transaction(sender_username, request.json["to"], request.json["amount"], datetime.today().replace(microsecond=0))
    return make_response("OK", 200)

def get_user_transactions(user):
    client = MongoClient('mongodb://accounts-db:27017')
    col = client["accounts_database"]["transactions"]
    trans = []
    matches = col.find({"from": user})
    for x in matches:
        trans.append({
            "desc" : str(x["time"]) + " | " + str(x["amount"]) + " transfered to " + x["to"],
            "time": x["time"]
        })
    matches = col.find({"to": user})
    for x in matches:
        trans.append({
            "desc" : str(x["time"]) + " | " + str(x["amount"]) + " received from " + x["from"],
            "time": x["time"]
        })
    return trans

@app.route('/get-transactions', methods=["POST"])
def get_transactions():
    user = request.json["user"]
    transactions = get_user_transactions(user)
    return jsonify(transactions)

def set_cached_daily(key, value):
    rc = redis.Redis(host='redis-cache', port=6379, db=1)
    rc.set(key, value)

def received_daily(user):
    client = MongoClient('mongodb://accounts-db:27017')
    col = client["accounts_database"]["daily"]
    matches =  col.find({"username": user})
    last = matches[0]["last"]
    result = last.date() < datetime.today().date()
    if result:
        myquery = { "username": user }
        newvalues = { "$set": { "last": datetime.now() } }
        col.update_one(myquery, newvalues)
    return result

@app.route('/daily', methods=["POST"])
def check_daily():
    user = request.json["user"]
    if received_daily(user):
        add_amount(user, DAILY_BONUS)
        save_transaction('DAILY BONUS', user, DAILY_BONUS, datetime.now())
    set_cached_daily(user, 'Y')
    return make_response("OK", 200)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=2139)