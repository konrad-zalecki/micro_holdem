import redis
import pickle

rc = redis.Redis(host='0.0.0.0', port=6379, db=2)
x = ["oro", "jezioro", "guwno też"]
x = pickle.dumps(x)
print(type(x))
rc.set('a', x)
y = rc.get('a')
print(type(y))
z = pickle.loads(y)
print(z)