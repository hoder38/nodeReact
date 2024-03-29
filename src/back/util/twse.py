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
pw = sys.argv[2]
if re.match(re.compile(r'^PAPIUSER\d+$'), sys.argv[1]):
    simulation = True

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

person_info = retryApi(lambda: api.login(api_key=sys.argv[1],secret_key=pw), 30)
acc_balance = retryApi(lambda: api.account_balance(timeout=10000))
print(acc_balance)
if acc_balance.errmsg != '':
    raise ValueError('Miss balance')
acc_settle = retryApi(lambda: api.settlements(api.stock_account, timeout=10000))
print(acc_settle)
if len(acc_settle) < 3 and len(sys.argv) != 3:
    raise ValueError('Miss settle')
acc_position = retryApi(lambda: api.list_positions(api.stock_account, unit=sj.constant.Unit.Share, timeout=10000))
retryApi(lambda: api.update_status(timeout=10000))
acc_order = api.list_trades()
now = datetime.datetime.now()

if len(acc_settle) >= 3 and acc_balance.acc_balance > 0:
    if int(now.hour) < 10:
        current_cash = (acc_balance.acc_balance + acc_settle[0].amount + acc_settle[1].amount + acc_settle[2].amount) / 10
    else:
        current_cash = (acc_balance.acc_balance + acc_settle[1].amount + acc_settle[2].amount) / 10
else:
    current_cash = 'same'
if len(sys.argv) == 3:
    position = []
    for p in acc_position:
        position.append('{\"symbol\":\"' + p.code + '\",\"amount\":' + str(p.quantity/10) + ',\"price\":' + str(p.price) + '}')
    position = '[' + ','.join(position) + ']'
    order = []
    fill_order = []
    for o in acc_order:
        if o.status.status == 'PendingSubmit' or o.status.status == 'PreSubmitted' or o.status.status == 'Submitted' or o.status.status == 'Filling':
            print(o)
            if o.order.action == 'Buy':
                order.append('{\"symbol\":\"' + o.contract.code + '\",\"amount\":' + str(o.order.quantity) + ',\"price\":' + str(o.order.price) + ',\"type\":\"' + o.order.price_type + o.order.order_lot + '\",\"time\":' + str(datetime.datetime.timestamp(o.status.order_datetime)) + '}')
            else :
                order.append('{\"symbol\":\"' + o.contract.code + '\",\"amount\":' + str(-o.order.quantity) + ',\"price\":' + str(o.order.price) + ',\"type\":\"' + o.order.price_type + o.order.order_lot + '\",\"time\":' + str(datetime.datetime.timestamp(o.status.order_datetime)) + '}')
        if o.status.status == 'Filled' or o.status.status == 'Filling':
            price = 0
            time = 0
            ptime = ''
            profit = ''
            quantity = 0
            quantitystr = ''
            for d in o.status.deals:
                price = d.price
                time = d.ts
                ptime = ptime + str(d.ts) + 't'
                quantity = quantity + d.quantity
                if o.order.order_lot == 'IntradayOdd':
                    profit = profit + str(d.price * d.quantity / 10) + 'p'
                else :
                    profit = profit + str(d.price * d.quantity * 100) + 'p'
            if o.order.order_lot == 'IntradayOdd':
                quantity = (o.order.quantity - quantity) // 10
                quantitystr = '\"oddquantity\":' + str(quantity)
            else :
                quantity = (o.order.quantity - quantity) * 100
                quantitystr = '\"quantity\":' + str(quantity)
            fill_order.append('{\"symbol\":\"' + o.contract.code + '\",\"id\":\"' + o.order.id + '\",\"profit\":\"' + profit + '\",\"price\":' + str(price) + ',\"type\":\"' + o.order.action + '\",\"time\":' + str(time) + ',\"ptime\":\"' + ptime + '\",' + quantitystr + ',\"starttime\":' + str(datetime.datetime.timestamp(o.status.order_datetime)) + '}')
    order = '[' + ','.join(order) + ']'
    fill_order = '[' + ','.join(fill_order) + ']'
    print("start result")
    print(current_cash)
    print(position)
    print(order)
    print(fill_order)
elif sys.argv[3] == 'submit':
    if current_cash == 'same':
        raise ValueError('Current cash error')
    if simulation == False:
        fd = open(sys.argv[5],'r')
        capw = fd.read()
        capw = capw[:-1]
        fd.close()
        api.activate_ca(
            ca_path = sys.argv[4],
            ca_passwd = capw,
            person_id = person_info[0].person_id,
        )
    for o in acc_order:
        if o.order.price_type == 'LMT' and (o.status.status == 'PendingSubmit' or o.status.status == 'PreSubmitted' or o.status.status == 'Submitted' or o.status.status == 'Filling'):
            api.cancel_order(o, timeout=10000)
    retryApi(lambda: api.update_status(timeout=10000))
    fee = float(sys.argv[6])
    current_cash = current_cash - 10000
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
            if buy > 0 and buy_price != 0:
                if current_cash < buy_price * buy * (1 + fee) * 4 / 3:
                    if current_cash < buy_price * buy * (1 + fee) * 2 / 3:
                        buy = 0
                    else:
                        buy = int(current_cash / (buy_price * (1 + fee)))
                current_cash = current_cash - buy_price * buy * (1 + fee)
                print(buy)
                print(buy_price)
                print(current_cash)
                if buy > 0:
                    if buy//100 > 0:
                        order = api.Order(price=buy_price,
                            quantity=buy//100,
                            action="Buy",
                            price_type="LMT",
                            order_type="ROD",
                            order_lot="Common",
                            account=api.stock_account
                            )
                        api.place_order(contract, order, timeout=10000)
                    if buy%100 > 0:
                        order = api.Order(price=buy_price,
                            quantity=buy%100*10,
                            action="Buy",
                            price_type="LMT",
                            order_type="ROD",
                            order_lot="IntradayOdd",
                            account=api.stock_account
                            )
                        api.place_order(contract, order, timeout=10000)
            if sell > 0 and sell_price != 0:
                q = 0
                for p in acc_position:
                    if p.code == match.group(1):
                        q = int(p.quantity)
                        break
                if q < sell * 4 / 3:
                    sell = q
                sell = sell * 10
                print(sell)
                print(sell_price)
                print(q)
                if sell > 0:
                    if sell//1000 > 0:
                        order = api.Order(price=sell_price,
                            quantity=sell//1000,
                            action="Sell",
                            price_type="LMT",
                            order_type="ROD",
                            order_lot="Common",
                            account=api.stock_account
                            )
                        api.place_order(contract, order, timeout=10000)
                    if sell%1000 > 0:
                        order = api.Order(price=sell_price,
                            quantity=sell%1000,
                            action="Sell",
                            price_type="LMT",
                            order_type="ROD",
                            order_lot="IntradayOdd",
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
            person_id = person_info[0].person_id,
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
            q = int(p.quantity // 1000)
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
#api.logout()
print(sys.argv)
