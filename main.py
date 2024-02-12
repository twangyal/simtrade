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
investments = {
    'BTC' : 0
}
totalValue = 0
commission = 0.002
print(ticker["BTC"])
print(response['time']['updated'])
def calculateTotalValue():
    p=1+1

def buy(n):
    global buyingPower, totalValue, portfolio
    cost = (n*ticker["BTC"])*(1+commission)
    if(cost>buyingPower):
        print("You don't have enough buying power")
        return
    print("Bought "+n+" shares at "+ticker["BTC"])
    buyingPower -= cost
    portfolio["BTC"] += n*ticker["BTC"]
    totalValue = buyingPower + sum(portfolio.values())
    calculateTotalValue()