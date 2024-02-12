import numpy as np
import requests
import json


url = "https://api.coindesk.com/v1/bpi/currentprice.json"
response = requests.get(url).json()

buyingPower = 25000
portfolio = {
    'BTC':0,
}
ticker = {
    'BTC':response['bpi']['USD']['rate']
}
totalValue = 0
commission = 0.002
print(ticker["BTC"])
print(response['time']['updated'])


def calculateTotalValue():
    my_shares = np.array(portfolio)
    prices = np.array(ticker)
    return buyingPower+np.sum(np.multiply(my_shares, prices))

def buy(n):
    global buyingPower, totalValue, portfolio
    cost = (n*ticker["BTC"])*(1+commission)
    if(cost>buyingPower):
        print("You don't have enough buying power")
        return
    print("Bought "+n+" shares at "+ticker["BTC"])
    buyingPower -= cost
    portfolio["BTC"] += n
    totalValue=calculateTotalValue()

def sell(n):
    global buyingPower, totalValue, portfolio
    cost = (n*ticker["BTC"])*(1-commission)
    if(n>portfolio["BTC"]):
        print("You don't have enough shares")
        return
    print("Sold "+n+" shares at "+ticker["BTC"])
    buyingPower += cost
    portfolio["BTC"] -= n
    totalValue=calculateTotalValue()