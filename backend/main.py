import numpy as np
import requests
import json


url = "https://api.coindesk.com/v1/bpi/currentprice.json"
response = requests.get(url).json()

buyingPower = 25000
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
print(response['time']['updated'])



def calculateTotalValue():
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

sell(.5)