from database import db
from datetime import datetime

class HighScore(db.Model):
    __tablename__ = 'high_scores'

    id = db.Column(db.Integer, primary_key=True)
    player_name = db.Column(db.String(50), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    level = db.Column(db.Integer, default=1)
    kills = db.Column(db.Integer, default=0)
    time_played = db.Column(db.Integer, default=0)  # seconds
    mode = db.Column(db.String(20), default='normal')  # 'easy' or 'normal'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'player_name': self.player_name,
            'score': self.score,
            'level': self.level,
            'kills': self.kills,
            'time_played': self.time_played,
            'mode': self.mode,
            'created_at': self.created_at.isoformat()
        }

class GameSession(db.Model):
    __tablename__ = 'game_sessions'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(100), unique=True, nullable=False)
    player_name = db.Column(db.String(50))
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime)
    final_score = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'player_name': self.player_name,
            'started_at': self.started_at.isoformat(),
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'final_score': self.final_score
        }
