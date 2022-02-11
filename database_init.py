from pymongo import MongoClient
from datetime import datetime

# client = MongoClient('mongodb://0.0.0.0:27017')
# db=client["users_database"]
# col=db["users"]
# col.insert_one({"username": "kaktus", "password": "kaktus"})
# col.insert_one({"username": "kamil", "password": "kamil"})

client = MongoClient('mongodb://0.0.0.0:27019')
db=client["accounts_database"]
col=db["daily"]
matches =  col.find({"username": "cow"})
ls = matches[0]["last"]
print(ls.date())
print(datetime.today().date())
print(ls.date() > datetime.today().date())




