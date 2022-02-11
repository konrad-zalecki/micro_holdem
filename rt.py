import redis

rc = redis.Redis(host='0.0.0.0', port=6379, db=1)
print(rc.get('n').decode('ascii'))