from config import db

class Trade(db.Model):
    id = db.Column(db.Integer, primary_key = True)
    time = db.Column(db.Integer, unique =False, nullable=False)
    buyOrSell = db.Column(db.String(80), unique =False, nullable=False)
    instrument = db.Column(db.String(80), unique =True, nullable=False)
    #price = db.Column(db.Integer, unique =False, nullable=False)

    def to_json(self):
        return{
            "id" : self.id,
            "time" : self.time,
            "buyOrSell": self.buyOrSell,
            "instrument" : self.instrument,
        }