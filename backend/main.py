import numpy as np
import requests
import json
import datetime

from models import Trade
from flask import request, jsonify
from config import app, db


"""buyingPower = 25000
portfolio = {
    'BTC':.5,
}
ticker = {
    'BTC':float(
        ['USD']['rate'].replace(',', ''))
}
totalValue = 0
commission = 0.002
print(type(ticker["BTC"]))
print(response['time']['updated'])"""

#Get a database of all trades made
@app.route("/trades",methods=["GET"])
def get_trades():
    trades = Trade.query.all()
    json_trades = list(map(lambda x: x.to_json(), trades))
    return jsonify({"trades": json_trades}),200

#Make a trade
@app.route("/create_trade", methods=["POST"])
def create_trade():
    buy_or_sell = request.json.get("buyOrSell")
    instrument = request.json.get("instrument")
    time = int(datetime.now())

    if not buy_or_sell or not instrument:
        return(
            jsonify({"message": "You must include an instrument"}),
            400,
        )

    new_trade = Trade(instrument=instrument,buy_or_sell=buy_or_sell,time=time)
    try:
        db.session.add(new_trade)
        db.session.commit()
    except Exception as e:
        return jsonify({"message":str(e)}),400
    return jsonify({"message":"Trade Executed!"}),201





"""def calculateTotalValue():
    my_shares = np.array([portfolio[key] for key in sorted(portfolio.keys())])
    prices = np.array([ticker[key] for key in sorted(ticker.keys())])
    return buyingPower+np.sum(np.multiply(my_shares, prices))

def buy(n):
    global buyingPower, totalValue, portfolio
    cost = (n*ticker["BTC"])*(1+commission)
    if(cost>buyingPower):
        print("You don't have enough buying power")
        return
    print("Bought "+str(n)+" shares at "+str(ticker["BTC"]))
    buyingPower -= cost
    portfolio["BTC"] += n
    totalValue=calculateTotalValue()
    print(totalValue)

def sell(n):
    global buyingPower, totalValue, portfolio
    cost = (n*ticker["BTC"])*(1-commission)
    if(n>portfolio["BTC"]):
        print("You don't have enough shares")
        return
    print("Sold "+str(n)+" shares at "+str(ticker["BTC"]))
    buyingPower += cost
    portfolio["BTC"] -= n
    totalValue=calculateTotalValue()
    print(totalValue)

sell(.5)"""