from pymongo import MongoClient
from datetime import datetime
from time import sleep

client = MongoClient(replicaset='rs0')
print(client.nodes)
sleep(2)
print(client.nodes)
print('AHA')





