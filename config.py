import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.urandom(24).hex()
    BASEDIR = os.path.abspath(os.path.dirname(__file__))
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(BASEDIR, 'data', 'doom.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Game settings
    GAME_PORT = 5054
    DEBUG = False
