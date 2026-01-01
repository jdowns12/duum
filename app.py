from flask import Flask, render_template, jsonify, request
from config import Config
from database import db, init_db
from models import HighScore, GameSession
import uuid

app = Flask(__name__)
app.config.from_object(Config)
init_db(app)

# Prevent browser caching for HTML pages
@app.after_request
def add_cache_headers(response):
    if response.content_type and 'text/html' in response.content_type:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game')
def game():
    session_id = str(uuid.uuid4())
    return render_template('game.html', session_id=session_id)

@app.route('/api/scores', methods=['GET'])
def get_scores():
    mode = request.args.get('mode', 'normal')
    scores = HighScore.query.filter_by(mode=mode).order_by(HighScore.score.desc()).limit(10).all()
    return jsonify([s.to_dict() for s in scores])

@app.route('/api/scores', methods=['POST'])
def submit_score():
    data = request.json
    score = HighScore(
        player_name=data.get('player_name', 'Anonymous'),
        score=data.get('score', 0),
        level=data.get('level', 1),
        kills=data.get('kills', 0),
        time_played=data.get('time_played', 0),
        mode=data.get('mode', 'normal')
    )
    db.session.add(score)
    db.session.commit()
    return jsonify(score.to_dict()), 201

@app.route('/leaderboard')
def leaderboard():
    mode = request.args.get('mode', 'normal')
    easy_scores = HighScore.query.filter_by(mode='easy').order_by(HighScore.score.desc()).limit(20).all()
    normal_scores = HighScore.query.filter_by(mode='normal').order_by(HighScore.score.desc()).limit(20).all()
    return render_template('leaderboard.html', easy_scores=easy_scores, normal_scores=normal_scores, active_mode=mode)

@app.route('/gallery')
def gallery():
    return render_template('gallery.html')

@app.route('/changelog')
def changelog():
    return render_template('changelog.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=Config.GAME_PORT, debug=Config.DEBUG)
