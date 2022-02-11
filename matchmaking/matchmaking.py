from flask import Flask, redirect, render_template, jsonify, make_response, request
import requests
import sys
import jwt
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 's3cret'


@app.route('/get-ongoing-games', methods=['POST', 'GET'])
def get_ongoing_games(): 
    print("???", file=sys.stderr)
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


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=4200)