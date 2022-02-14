from flask import Flask, jsonify, request
import requests
import sys
import jwt
import json
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 's3cret'

private_games_codes = set()

@app.route('/get-ongoing-games', methods=['POST', 'GET'])
def get_ongoing_games(): 
    response = requests.get(
        'http://game-node:5000/get-ongoing-games',
    )
    if response.status_code != 200:
        return []

    games = json.loads(response.json())
    context = []

    #game = {'gameID':  ,'playersCt':  , 'playerNames':  }
    emptyGames = 0
    print(games, file=sys.stderr)
    for game in games:
        if game['playersCt'] < 6:
            context.append(game)
        if game['playersCt'] == 0:
            emptyGames += 1

    if len(context) == 0 or emptyGames == 0:
        response = requests.get(
            'http://game-node:5000/create-new-game',
        )
        if response.status_code == 200:
            context.append(json.loads(response.json()))

    print(context, file=sys.stderr)
    return json.dumps(context)


@app.route('/create-private-game', methods=['POST', 'GET'])
def create_private_game(): 
    global private_games_codes
    new_code = random.randrange(10000, 100000)
    while new_code in private_games_codes:
        new_code = random.randrange(10000, 100000)
    private_games_codes.add(new_code)

    response = requests.post(
        'http://game-node:5000/create-private-game',
        json={"code": new_code}
    )
    if response.status_code != 200:
        return jsonify({"code": -1})
    headers = {'Access-Control-Allow-Origin': '*'}
    content = json.dumps(new_code)
    return content, 200, headers

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=4200)