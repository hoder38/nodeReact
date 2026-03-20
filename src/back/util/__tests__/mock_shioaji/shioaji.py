"""
Mock shioaji module for testing twse.py without real brokerage connection.

This shim is placed in PYTHONPATH before the real shioaji so twse.py imports
this instead. All API calls are controlled via environment variables:

  MOCK_SJ_BALANCE      - acc_balance (default: 500000)
  MOCK_SJ_ERRMSG       - balance error message (default: '')
  MOCK_SJ_SETTLEMENTS  - JSON array of settlement amounts (default: [-10000,-20000,-30000])
  MOCK_SJ_POSITIONS    - JSON array of {code,quantity,price} (default: [])
  MOCK_SJ_ORDERS       - JSON array of order objects (default: [])
  MOCK_SJ_LOGIN_FAIL   - number of times login should fail before success (default: 0)
  MOCK_SJ_PERSON_ID    - person_id for login result (default: 'A123456789')
"""

import os
import json
import datetime
import time
from unittest.mock import MagicMock

# When MOCK_SJ_FAST_RETRY is set, monkey-patch time.sleep to be instant
# so retryApi tests don't wait 30s per retry attempt.
if os.environ.get('MOCK_SJ_FAST_RETRY'):
    time.sleep = lambda s: None


def _env(key, default):
    return os.environ.get(key, default)


def _env_json(key, default):
    raw = os.environ.get(key)
    return json.loads(raw) if raw else default


# ---------------------------------------------------------------------------
# constant.Unit mock
# ---------------------------------------------------------------------------
class _Unit:
    Share = 'Share'
    Common = 'Common'


class constant:
    Unit = _Unit


# ---------------------------------------------------------------------------
# Data object builders
# ---------------------------------------------------------------------------
class _Balance:
    def __init__(self, acc_balance, errmsg=''):
        self.acc_balance = acc_balance
        self.errmsg = errmsg

    def __repr__(self):
        return f'Balance(acc_balance={self.acc_balance}, errmsg={self.errmsg!r})'


class _Settlement:
    def __init__(self, amount):
        self.amount = amount

    def __repr__(self):
        return f'Settlement(amount={self.amount})'


class _Position:
    def __init__(self, code, quantity, price):
        self.code = code
        self.quantity = quantity
        self.price = price


class _Deal:
    def __init__(self, price, ts, quantity):
        self.price = price
        self.ts = ts
        self.quantity = quantity


class _OrderStatus:
    def __init__(self, status, order_datetime, deals=None):
        self.status = status
        self.order_datetime = order_datetime
        self.deals = deals or []


class _OrderDetail:
    def __init__(self, action, quantity, price, price_type, order_lot, id='ORD001', order_type='ROD'):
        self.action = action
        self.quantity = quantity
        self.price = price
        self.price_type = price_type
        self.order_lot = order_lot
        self.id = id
        self.order_type = order_type


class _Contract:
    def __init__(self, code):
        self.code = code


class _Trade:
    def __init__(self, contract, order, status):
        self.contract = contract
        self.order = order
        self.status = status

    def __repr__(self):
        return f'Trade({self.contract.code})'


def _build_orders():
    """Build order/trade objects from MOCK_SJ_ORDERS env var."""
    raw = _env_json('MOCK_SJ_ORDERS', [])
    trades = []
    for o in raw:
        deals = []
        for d in o.get('deals', []):
            deals.append(_Deal(d['price'], d['ts'], d['quantity']))
        dt = datetime.datetime.fromtimestamp(o.get('order_datetime', 1700000000))
        status = _OrderStatus(o['status'], dt, deals)
        order = _OrderDetail(
            action=o.get('action', 'Buy'),
            quantity=o.get('quantity', 1),
            price=o.get('price', 100),
            price_type=o.get('price_type', 'LMT'),
            order_lot=o.get('order_lot', 'Common'),
            id=o.get('id', 'ORD001'),
        )
        contract = _Contract(o.get('code', '2330'))
        trades.append(_Trade(contract, order, status))
    return trades


# ---------------------------------------------------------------------------
# Shioaji class mock
# ---------------------------------------------------------------------------
class _StocksProxy:
    """Dict-like proxy for api.Contracts.Stocks[code]."""
    def __getitem__(self, code):
        return _Contract(code)


class _Contracts:
    Stocks = _StocksProxy()


class Shioaji:
    _login_fail_count = 0
    _login_fail_max = 0

    def __init__(self, simulation=False):
        self.simulation = simulation
        self.stock_account = MagicMock()
        self.Contracts = _Contracts()
        self._placed_orders = []
        self._cancelled_orders = []
        Shioaji._login_fail_max = int(_env('MOCK_SJ_LOGIN_FAIL', '0'))
        Shioaji._login_fail_count = 0

    def login(self, api_key=None, secret_key=None):
        if Shioaji._login_fail_count < Shioaji._login_fail_max:
            Shioaji._login_fail_count += 1
            raise ConnectionError(f'Mock login fail {Shioaji._login_fail_count}')
        person = MagicMock()
        person.person_id = _env('MOCK_SJ_PERSON_ID', 'A123456789')
        return [person]

    def account_balance(self, timeout=None):
        bal = float(_env('MOCK_SJ_BALANCE', '500000'))
        errmsg = _env('MOCK_SJ_ERRMSG', '')
        return _Balance(bal, errmsg)

    def settlements(self, account=None, timeout=None):
        amounts = _env_json('MOCK_SJ_SETTLEMENTS', [-10000, -20000, -30000])
        return [_Settlement(a) for a in amounts]

    def list_positions(self, account=None, unit=None, timeout=None):
        raw = _env_json('MOCK_SJ_POSITIONS', [])
        return [_Position(p['code'], p['quantity'], p['price']) for p in raw]

    def update_status(self, timeout=None):
        return None

    def list_trades(self):
        return _build_orders()

    def activate_ca(self, ca_path=None, ca_passwd=None, person_id=None):
        return None

    def cancel_order(self, trade, timeout=None):
        self._cancelled_orders.append(trade)
        return None

    def Order(self, **kwargs):
        return kwargs

    def place_order(self, contract, order, timeout=None):
        self._placed_orders.append({'contract': contract, 'order': order})
        return MagicMock()

    def logout(self):
        return None
