#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import shioaji as sj
import datetime
import time
import sys
import re

if len(sys.argv) < 3:
    raise ValueError('Need ID and PASSWORD')

simulation = False
pw = ''
if re.match(re.compile(r'^PAPIUSER\d+$'), sys.argv[1]):
    simulation = True
    pw = sys.argv[2]
else:
    fd = open(sys.argv[2],'r')
    pw = fd.read()
    pw = pw[:-1]
    fd.close()

api = sj.Shioaji(simulation=simulation)

def retryApi(fun, wait = 10, count = 5):
    apiCount = 0
    while True:
        try:
            return fun()
        except:
            apiCount = apiCount + 1
            if apiCount < count:
                time.sleep(wait)
            else:
                raise

retryApi(lambda: api.login(person_id=sys.argv[1],passwd=pw), 30)
acc_balance = retryApi(lambda: api.account_balance(timeout=10000))
if len(acc_balance) > 0:
    acc_balance = acc_balance[0]
else:
    raise ValueError('Miss balance')
acc_settle = retryApi(lambda: api.list_settlements(api.stock_account, timeout=10000))
if len(acc_settle) > 0:
    acc_settle = acc_settle[0]
elif len(sys.argv) != 3:
    raise ValueError('Miss settle')
acc_position = retryApi(lambda: api.list_positions(api.stock_account, timeout=10000))
retryApi(lambda: api.update_status(timeout=10000))
acc_order = api.list_trades()
now = datetime.datetime.now()

if len(acc_settle) > 0:
    if int(now.hour) < 12:
        current_cash = (acc_balance.acc_balance + acc_settle.t_money + acc_settle.t1_money + acc_settle.t2_money) / 1000
    else:
        current_cash = (acc_balance.acc_balance + acc_settle.t1_money + acc_settle.t2_money) / 1000
else:
    current_cash = 'same'
if len(sys.argv) == 3:
    position = []
    for p in acc_position:
        position.append('{\"symbol\":\"' + p.code + '\",\"amount\":' + str(p.quantity) + ',\"price\":' + str(p.price) + '}')
    position = '[' + ','.join(position) + ']'
    order = []
    fill_order = []
    for o in acc_order:
        if o.status.status == 'PendingSubmit' or o.status.status == 'PreSubmitted' or o.status.status == 'Submitted':
            print(o)
            if o.order.action == 'Buy':
                order.append('{\"symbol\":\"' + o.contract.code + '\",\"amount\":' + str(o.order.quantity) + ',\"price\":' + str(o.order.price) + ',\"type\":\"' + o.order.price_type + '\",\"time\":' + str(datetime.datetime.timestamp(o.status.order_datetime)) + '}')
            else :
                order.append('{\"symbol\":\"' + o.contract.code + '\",\"amount\":' + str(-o.order.quantity) + ',\"price\":' + str(o.order.price) + ',\"type\":\"' + o.order.price_type + '\",\"time\":' + str(datetime.datetime.timestamp(o.status.order_datetime)) + '}')
        elif o.status.status == 'Filled':
            price = 0
            time = 0
            profit = 0
            for d in o.status.deals:
                price = d.price
                time = d.ts
                profit = profit + d.price * d.quantity
            fill_order.append('{\"symbol\":\"' + o.contract.code + '\",\"id\":\"' + o.order.id + '\",\"profit\":' + str(profit) + ',\"price\":' + str(price) + ',\"type\":\"' + o.order.action + '\",\"time\":' + str(time) + '}')
    order = '[' + ','.join(order) + ']'
    fill_order = '[' + ','.join(fill_order) + ']'
    print("start result")
    print(current_cash)
    print(position)
    print(order)
    print(fill_order)
elif sys.argv[3] == 'submit':
    if simulation == False:
        fd = open(sys.argv[5],'r')
        capw = fd.read()
        capw = capw[:-1]
        fd.close()
        api.activate_ca(
            ca_path = sys.argv[4],
            ca_passwd = capw,
            person_id = sys.argv[1],
        )
    for o in acc_order:
        if o.order.price_type == 'LMT' and (o.status.status == 'PendingSubmit' or o.status.status == 'PreSubmitted' or o.status.status == 'Submitted'):
            api.cancel_order(o, timeout=10000)
    retryApi(lambda: api.update_status(timeout=10000))
    fee = float(sys.argv[6])
    for a in sys.argv:
        p = re.compile(r'^(.+)\=(buy|sell)(\d+)\=(\d+\.?\d*)((buy|sell)(\d+)\=(\d+\.?\d*))?$')
        match = re.match(p, a)
        if match:
            print(match.groups())
            contract = api.Contracts.Stocks[match.group(1)]
            print(contract)
            buy = 0
            buy_price = 0
            sell = 0
            sell_price = 0
            if match.group(2):
                if match.group(2) == 'buy':
                    buy = int(match.group(3))
                    buy_price = float(match.group(4))
                else:
                    sell = int(match.group(3))
                    sell_price = float(match.group(4))
            if match.group(6):
                if match.group(6) == 'buy':
                    buy = int(match.group(7))
                    buy_price = float(match.group(8))
                else:
                    sell = int(match.group(7))
                    sell_price = float(match.group(8))
            if buy > 0:
                if current_cash < buy_price * buy * (1 + fee):
                    buy = int(current_cash / (buy_price * (1 + fee)))
                current_cash = current_cash - buy_price * buy * (1 + fee)
                print(buy)
                print(buy_price)
                print(current_cash)
                if buy > 0:
                    order = api.Order(price=buy_price,
                        quantity=buy,
                        action="Buy",
                        price_type="LMT",
                        order_type="ROD",
                        account=api.stock_account
                        )
                    api.place_order(contract, order, timeout=10000)
            if sell > 0:
                q = 0
                for p in acc_position:
                    if p.code == match.group(1):
                        q = int(p.quantity)
                        break
                if q < sell:
                    sell = q
                print(sell)
                print(sell_price)
                print(q)
                if sell > 0:
                    order = api.Order(price=sell_price,
                        quantity=sell,
                        action="Sell",
                        price_type="LMT",
                        order_type="ROD",
                        account=api.stock_account
                        )
                    api.place_order(contract, order, timeout=10000)
elif sys.argv[3] == 'sellall':
    if simulation == False:
        fd = open(sys.argv[5],'r')
        capw = fd.read()
        capw = capw[:-1]
        fd.close()
        api.activate_ca(
            ca_path = sys.argv[4],
            ca_passwd = capw,
            person_id = sys.argv[1],
        )
    index = sys.argv[6]
    print(index)
    for o in acc_order:
        if o.contract.code == index and o.order.price_type == 'LMT' and (o.status.status == 'PendingSubmit' or o.status.status == 'PreSubmitted' or o.status.status == 'Submitted'):
            api.cancel_order(o, timeout=10000)
    retryApi(lambda: api.update_status(timeout=10000))
    q = 0
    for p in acc_position:
        if p.code == index:
            q = int(p.quantity)
            break
    print(q)
    if q > 0:
        contract = api.Contracts.Stocks[index]
        order = api.Order(price=10000,
            quantity=q,
            action="Sell",
            price_type="MKT",
            order_type="ROD",
            account=api.stock_account
        )
        api.place_order(contract, order, timeout=10000)
api.logout()
print(sys.argv)