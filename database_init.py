from pymongo import MongoClient

client = MongoClient('mongodb://0.0.0.0:27017')
db=client["users_database"]
col=db["users"]
col.insert_one({"username": "kaktus", "password": "kaktus"})
col.insert_one({"username": "kamil", "password": "kamil"})

