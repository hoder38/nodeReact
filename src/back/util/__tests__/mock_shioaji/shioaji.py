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


# Module-level Unit alias so `sj.Unit.Share` works (twse.py uses this form)
Unit = _Unit


# ---------------------------------------------------------------------------
# OrderState type markers for order_deal_records()
# ---------------------------------------------------------------------------
class _StockOrderState:
    def __str__(self):
        return 'StockOrder'

class _StockDealState:
    def __str__(self):
        return 'StockDeal'


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
    def __init__(self, action, quantity, price, price_type, order_lot, id='ORD000', ordno='ORD000', order_type='ROD'):
        self.action = action
        self.quantity = quantity
        self.price = price
        self.price_type = price_type
        self.order_lot = order_lot
        self.id = id
        self.ordno = ordno
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
    for i, o in enumerate(raw):
        deals = []
        for d in o.get('deals', []):
            deals.append(_Deal(d['price'], d['ts'], d['quantity']))
        dt = datetime.datetime.fromtimestamp(o.get('order_datetime', 1700000000))
        status = _OrderStatus(o['status'], dt, deals)
        ordno = o.get('id', f'ORD{i:03d}')
        order = _OrderDetail(
            action=o.get('action', 'Buy'),
            quantity=o.get('quantity', 1),
            price=o.get('price', 100),
            price_type=o.get('price_type', 'LMT'),
            order_lot=o.get('order_lot', 'Common'),
            id=ordno,
            ordno=ordno,
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

    def update_status(self, account=None, timeout=None):
        return None

    def list_trades(self):
        return _build_orders()

    def order_deal_records(self, account=None, timeout=None):
        """Convert MOCK_SJ_ORDERS to (state, event) tuples like real shioaji."""
        raw = _env_json('MOCK_SJ_ORDERS', [])
        records = []
        for i, o in enumerate(raw):
            ordno = o.get('id', f'ORD{i:03d}')
            order_qty = o.get('quantity', 1)
            status = o['status']
            action = o.get('action', 'Buy')
            code = o.get('code', '2330')
            order_lot = o.get('order_lot', 'Common')
            price_type = o.get('price_type', 'LMT')
            price = o.get('price', 100)
            exchange_ts = float(o.get('order_datetime', 1700000000))
            new_event = {
                'operation': {'op_type': 'New', 'op_code': '00'},
                'order': {
                    'id': ordno, 'ordno': ordno,
                    'action': action, 'price': price,
                    'quantity': order_qty, 'price_type': price_type,
                    'order_lot': order_lot,
                },
                'status': {
                    'exchange_ts': exchange_ts,
                    'cancel_quantity': 0,
                    'order_quantity': order_qty,
                },
                'contract': {'code': code},
            }
            records.append((_StockOrderState(), new_event))
            if status == 'Cancelled':
                cancel_event = {
                    'operation': {'op_type': 'Cancel', 'op_code': '00'},
                    'order': {'ordno': ordno},
                    'status': {
                        'exchange_ts': exchange_ts,
                        'cancel_quantity': order_qty,
                        'order_quantity': order_qty,
                    },
                    'contract': {'code': code},
                }
                records.append((_StockOrderState(), cancel_event))
            for d in o.get('deals', []):
                deal_event = {
                    'ordno': ordno,
                    'price': d['price'],
                    'quantity': d['quantity'],
                    'ts': d['ts'],
                    'action': action,
                    'code': code,
                    'order_lot': order_lot,
                }
                records.append((_StockDealState(), deal_event))
        return records

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
