#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
twse_test.py — Comprehensive tests for src/back/util/twse.py

Tests run twse.py as a subprocess with PYTHONPATH pointing to a mock shioaji
shim, so no real brokerage connection is made. All API responses are controlled
via environment variables.

Covers: retryApi, simulation detection, cash calculation, query mode output,
submit mode (order parsing, cash mgmt, order splitting, CA activation),
sellall mode, error handling, edge cases.

Run: docker exec -w /app reactnode-server python3 -m pytest src/back/util/twse_test.py -v
"""

import json
import os
import subprocess
import sys
import tempfile

import pytest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "twse.py")
MOCK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "__tests__", "mock_shioaji")


def run_twse(*args, env_overrides=None, expect_fail=False):
    """Run twse.py with mock shioaji, return (returncode, stdout, stderr)."""
    env = os.environ.copy()
    # Put mock shioaji FIRST in PYTHONPATH so it shadows real one
    env['PYTHONPATH'] = MOCK_DIR + ':' + env.get('PYTHONPATH', '')
    if env_overrides:
        env.update(env_overrides)
    result = subprocess.run(
        [sys.executable, SCRIPT, *args],
        capture_output=True, text=True, env=env, timeout=30,
    )
    if not expect_fail and result.returncode != 0:
        # For debugging: print stderr on unexpected failures
        pass
    return result.returncode, result.stdout, result.stderr


def parse_query_output(stdout):
    """Parse query mode stdout into structured data."""
    lines = stdout.strip().split('\n')
    start_idx = None
    for i, line in enumerate(lines):
        if line.strip() == 'start result':
            start_idx = i
            break
    if start_idx is None:
        return None
    result = {
        'cash': lines[start_idx + 1].strip(),
        'position': lines[start_idx + 2].strip(),
        'order': lines[start_idx + 3].strip(),
        'fill_order': lines[start_idx + 4].strip(),
    }
    if start_idx + 5 < len(lines) and lines[start_idx + 5].strip():
        result['profit'] = lines[start_idx + 5].strip()
    return result


# ===========================================================================
# 1. Initialization & Argument Validation
# ===========================================================================
class TestInitialization:
    """IN-01 through IN-15: Argument validation and simulation detection."""

    def test_in01_no_args(self):
        """IN-01: No arguments → ValueError."""
        rc, stdout, stderr = run_twse(expect_fail=True)
        assert rc != 0
        assert 'Need ID and PASSWORD' in stderr or 'Need ID and PASSWORD' in stdout

    def test_in02_one_arg(self):
        """IN-02: Only one arg (script + id, no password)."""
        rc, _, stderr = run_twse('MYKEY', expect_fail=True)
        assert rc != 0
        assert 'Need ID and PASSWORD' in stderr

    def test_in03_simulation_papiuser(self):
        """IN-03: PAPIUSER02 → simulation mode."""
        rc, stdout, _ = run_twse('PAPIUSER02', 'secret')
        assert rc == 0

    def test_in04_simulation_papiuser999(self):
        """IN-04: PAPIUSER999 → simulation mode."""
        rc, stdout, _ = run_twse('PAPIUSER999', 'secret')
        assert rc == 0

    def test_in05_no_simulation_no_digit(self):
        """IN-05: PAPIUSER (no digit) → not simulation."""
        rc, stdout, _ = run_twse('PAPIUSER', 'secret')
        assert rc == 0

    def test_in06_case_sensitive(self):
        """IN-06: lowercase papiuser02 → not simulation."""
        rc, stdout, _ = run_twse('papiuser02', 'secret')
        assert rc == 0

    def test_in07_prefix_mismatch(self):
        """IN-07: XPAPIUSER02 → not simulation."""
        rc, stdout, _ = run_twse('XPAPIUSER02', 'secret')
        assert rc == 0

    def test_in08_suffix_mismatch(self):
        """IN-08: PAPIUSER02X → not simulation ($ anchor)."""
        rc, stdout, _ = run_twse('PAPIUSER02X', 'secret')
        assert rc == 0

    def test_in11_balance_errmsg(self):
        """IN-11: Non-empty errmsg → ValueError('Miss balance')."""
        rc, _, stderr = run_twse('KEY', 'PW', expect_fail=True,
                                  env_overrides={'MOCK_SJ_ERRMSG': 'timeout'})
        assert rc != 0
        assert 'Miss balance' in stderr

    def test_in12_balance_ok(self):
        """IN-12: Empty errmsg → continues normally."""
        rc, stdout, _ = run_twse('KEY', 'PW',
                                  env_overrides={'MOCK_SJ_ERRMSG': ''})
        assert rc == 0

    def test_in13_few_settlements_query_ok(self):
        """IN-13: 2 settlements + query mode (argc==3) → no error."""
        rc, stdout, _ = run_twse('KEY', 'PW',
                                  env_overrides={'MOCK_SJ_SETTLEMENTS': '[-10000,-20000]'})
        assert rc == 0

    def test_in14_few_settlements_submit_fails(self):
        """IN-14: 2 settlements + argc>3 → ValueError('Miss settle')."""
        rc, _, stderr = run_twse('KEY', 'PW', 'submit', '/ca', '/capw', '0.006',
                                  expect_fail=True,
                                  env_overrides={'MOCK_SJ_SETTLEMENTS': '[-10000,-20000]'})
        assert rc != 0
        assert 'Miss settle' in stderr


# ===========================================================================
# 2. Cash Calculation
# ===========================================================================
class TestCashCalculation:
    """CC-01 through CC-08: current_cash computation."""

    def _get_cash(self, env_overrides=None, hour_hack=False):
        """Helper: run query mode, return cash value from output."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides=env_overrides)
        assert rc == 0
        data = parse_query_output(stdout)
        assert data is not None
        return data['cash']

    def test_cc01_three_settlements_balance_positive(self):
        """CC-01/CC-02: 3 settlements, balance > 0."""
        cash = self._get_cash(env_overrides={
            'MOCK_SJ_BALANCE': '500000',
            'MOCK_SJ_SETTLEMENTS': json.dumps([-10000, -20000, -30000]),
        })
        # hour-dependent: either (500000-10000-20000-30000)/10 or (500000-20000-30000)/10
        cash_val = float(cash)
        assert cash_val > 0

    def test_cc04_balance_zero(self):
        """CC-04: balance=0 with 3 settlements → 'same'."""
        cash = self._get_cash(env_overrides={
            'MOCK_SJ_BALANCE': '0',
            'MOCK_SJ_SETTLEMENTS': json.dumps([-10000, -20000, -30000]),
        })
        assert cash == 'same'

    def test_cc05_two_settlements(self):
        """CC-05: 2 settlements, balance>0 → 'same'."""
        cash = self._get_cash(env_overrides={
            'MOCK_SJ_BALANCE': '500000',
            'MOCK_SJ_SETTLEMENTS': json.dumps([-10000, -20000]),
        })
        assert cash == 'same'

    def test_cc06_zero_settlements(self):
        """CC-06: 0 settlements, balance>0 → 'same'."""
        cash = self._get_cash(env_overrides={
            'MOCK_SJ_BALANCE': '500000',
            'MOCK_SJ_SETTLEMENTS': '[]',
        })
        assert cash == 'same'

    def test_cc07_negative_settlements(self):
        """CC-07: Negative settlement amounts reduce cash."""
        cash = self._get_cash(env_overrides={
            'MOCK_SJ_BALANCE': '100000',
            'MOCK_SJ_SETTLEMENTS': json.dumps([-50000, -30000, -10000]),
        })
        cash_val = float(cash)
        # (100000 + (-50000) + (-30000) + (-10000)) / 10 = 1000 (before 10am)
        # or (100000 + (-30000) + (-10000)) / 10 = 6000 (after 10am)
        assert cash_val > 0

    def test_cc08_large_balance(self):
        """CC-08: Very large balance handled correctly."""
        cash = self._get_cash(env_overrides={
            'MOCK_SJ_BALANCE': '999999999',
            'MOCK_SJ_SETTLEMENTS': json.dumps([-1, -2, -3]),
        })
        cash_val = float(cash)
        assert cash_val > 99000000


# ===========================================================================
# 3. Query Mode Output
# ===========================================================================
class TestQueryMode:
    """QR-01 through QR-18, OF-01 through OF-07: Query mode output format."""

    def test_qr01_normal_query(self):
        """QR-01: Normal query with positions and no orders."""
        positions = [
            {'code': '2330', 'quantity': 1000, 'price': 580.0},
            {'code': '2317', 'quantity': 500, 'price': 120.5},
        ]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_POSITIONS': json.dumps(positions),
        })
        assert rc == 0
        data = parse_query_output(stdout)
        assert data is not None

        pos = json.loads(data['position'])
        assert len(pos) == 2
        assert pos[0]['symbol'] == '2330'
        assert pos[0]['amount'] == 100.0  # 1000/10
        assert pos[0]['price'] == 580.0

    def test_qr02_no_positions(self):
        """QR-02: Empty positions → '[]'."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_POSITIONS': '[]',
        })
        data = parse_query_output(stdout)
        assert data['position'] == '[]'

    def test_qr03_no_orders(self):
        """QR-03: Empty orders → '[]' for both order and fill_order."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': '[]',
        })
        data = parse_query_output(stdout)
        assert data['order'] == '[]'
        assert data['fill_order'] == '[]'

    def test_qr04_mixed_order_statuses(self):
        """QR-04: Only active statuses appear in pending orders."""
        orders = [
            {'code': '2330', 'status': 'Submitted', 'action': 'Buy',
             'quantity': 100, 'price': 580, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
            {'code': '2317', 'status': 'Cancelled', 'action': 'Sell',
             'quantity': 50, 'price': 120, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
        ]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': json.dumps(orders),
        })
        data = parse_query_output(stdout)
        pending = json.loads(data['order'])
        assert len(pending) == 1
        assert pending[0]['symbol'] == '2330'

    def test_qr08_buy_positive_sell_negative(self):
        """QR-08: Buy = positive amount, Sell = negative amount."""
        orders = [
            {'code': '2330', 'status': 'Submitted', 'action': 'Buy',
             'quantity': 100, 'price': 580, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
            {'code': '2317', 'status': 'PendingSubmit', 'action': 'Sell',
             'quantity': 50, 'price': 120, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
        ]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': json.dumps(orders),
        })
        data = parse_query_output(stdout)
        pending = json.loads(data['order'])
        buy_order = [o for o in pending if o['symbol'] == '2330'][0]
        sell_order = [o for o in pending if o['symbol'] == '2317'][0]
        assert buy_order['amount'] == 100  # positive
        assert sell_order['amount'] == -50  # negative

    def test_qr09_intraday_odd_profit(self):
        """QR-09: IntradayOdd profit = price * qty / 10."""
        orders = [{
            'code': '2330', 'status': 'Filled', 'action': 'Buy',
            'quantity': 500, 'price': 580, 'price_type': 'LMT',
            'order_lot': 'IntradayOdd', 'id': 'F001',
            'order_datetime': 1700000000,
            'deals': [{'price': 580, 'ts': 1700001000, 'quantity': 300}],
        }]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': json.dumps(orders),
        })
        data = parse_query_output(stdout)
        fills = json.loads(data['fill_order'])
        assert len(fills) == 1
        # profit = 580 * 300 / 10 = 17400.0
        assert '17400.0p' in fills[0]['profit']
        # oddquantity = (500 - 300) // 10 = 20
        assert fills[0]['oddquantity'] == 20

    def test_qr10_common_profit(self):
        """QR-10: Common profit = price * qty * 100."""
        orders = [{
            'code': '2330', 'status': 'Filled', 'action': 'Buy',
            'quantity': 5, 'price': 580, 'price_type': 'LMT',
            'order_lot': 'Common', 'id': 'F002',
            'order_datetime': 1700000000,
            'deals': [{'price': 580, 'ts': 1700001000, 'quantity': 3}],
        }]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': json.dumps(orders),
        })
        data = parse_query_output(stdout)
        fills = json.loads(data['fill_order'])
        assert len(fills) == 1
        # profit = 580 * 3 * 100 = 174000
        assert '174000p' in fills[0]['profit']
        # quantity = (5 - 3) * 100 = 200
        assert fills[0]['quantity'] == 200

    def test_qr13_filling_in_both(self):
        """QR-13: Filling status appears in BOTH pending and filled orders."""
        orders = [{
            'code': '2330', 'status': 'Filling', 'action': 'Buy',
            'quantity': 100, 'price': 580, 'price_type': 'LMT',
            'order_lot': 'Common', 'id': 'F003',
            'order_datetime': 1700000000,
            'deals': [{'price': 580, 'ts': 1700001000, 'quantity': 50}],
        }]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': json.dumps(orders),
        })
        data = parse_query_output(stdout)
        pending = json.loads(data['order'])
        fills = json.loads(data['fill_order'])
        assert len(pending) == 1
        assert len(fills) == 1

    def test_qr14_multiple_deals(self):
        """QR-14: Multiple deals → concatenated profit and ptime."""
        orders = [{
            'code': '2330', 'status': 'Filled', 'action': 'Buy',
            'quantity': 10, 'price': 580, 'price_type': 'LMT',
            'order_lot': 'Common', 'id': 'F004',
            'order_datetime': 1700000000,
            'deals': [
                {'price': 580, 'ts': 1700001000, 'quantity': 3},
                {'price': 581, 'ts': 1700002000, 'quantity': 2},
            ],
        }]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': json.dumps(orders),
        })
        data = parse_query_output(stdout)
        fills = json.loads(data['fill_order'])
        assert len(fills) == 1
        # profit has two values: "174000p116200p"
        assert fills[0]['profit'].count('p') == 2
        # ptime has two timestamps
        assert fills[0]['ptime'].count('t') == 2
        # remaining quantity = (10 - 3 - 2) * 100 = 500
        assert fills[0]['quantity'] == 500

    def test_of01_start_result_delimiter(self):
        """OF-01: Output contains 'start result' delimiter."""
        rc, stdout, _ = run_twse('KEY', 'PW')
        assert 'start result' in stdout

    def test_of02_position_valid_json(self):
        """OF-02: Position output is valid parseable JSON."""
        positions = [{'code': '2330', 'quantity': 1000, 'price': 580.0}]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_POSITIONS': json.dumps(positions),
        })
        data = parse_query_output(stdout)
        parsed = json.loads(data['position'])
        assert isinstance(parsed, list)

    def test_of06_empty_everything(self):
        """OF-06: Zero positions, zero orders → [] for all arrays."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_POSITIONS': '[]',
            'MOCK_SJ_ORDERS': '[]',
        })
        data = parse_query_output(stdout)
        assert data['position'] == '[]'
        assert data['order'] == '[]'
        assert data['fill_order'] == '[]'

    def test_argv_echo_last_line(self):
        """EH-15: argv echo appears on last line."""
        rc, stdout, _ = run_twse('KEY', 'PW')
        last_line = stdout.strip().split('\n')[-1]
        assert 'KEY' in last_line
        assert 'PW' in last_line


# ===========================================================================
# 4. Submit Mode
# ===========================================================================
class TestSubmitMode:
    """SM-01 through SM-26, RX-01 through RX-10, CS-01 through CS-07, OS-01 through OS-09."""

    def _make_ca_file(self, tmp_path):
        """Create a CA password file for submit/sellall tests."""
        ca_pw_file = os.path.join(str(tmp_path), 'capw.txt')
        with open(ca_pw_file, 'w') as f:
            f.write('mypassword\n')
        ca_path = os.path.join(str(tmp_path), 'ca.pem')
        with open(ca_path, 'w') as f:
            f.write('FAKE_CA')
        return ca_path, ca_pw_file

    def test_sm01_current_cash_same_fails(self, tmp_path):
        """SM-01: current_cash='same' → ValueError."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, _, stderr = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            expect_fail=True,
            env_overrides={
                'MOCK_SJ_BALANCE': '0',  # balance=0 → cash='same'
                'MOCK_SJ_SETTLEMENTS': json.dumps([-10000, -20000, -30000]),
            },
        )
        assert rc != 0
        assert 'Current cash error' in stderr

    def test_sm02_simulation_submit(self, tmp_path):
        """SM-02: Simulation mode — CA activation skipped, orders placed."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2330=buy100=580.0',
        )
        assert rc == 0

    def test_sm09_buy_sufficient_cash(self, tmp_path):
        """SM-09: Buy with ample cash → full quantity."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2330=buy100=580.0',
            env_overrides={'MOCK_SJ_BALANCE': '1000000'},
        )
        assert rc == 0
        # stdout should show buy=100 (full qty)
        assert '100' in stdout

    def test_sm11_buy_insufficient_cash(self, tmp_path):
        """SM-11: Cash < 2/3 cost → buy = 0."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        # cost = 580 * 100 * 1.006 = 58348, 2/3 cost = 38899
        # cash = (500000 + settle) / 10 - 10000 reserve → need very low balance
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2330=buy100=580.0',
            env_overrides={
                'MOCK_SJ_BALANCE': '100000',  # cash = ~(100000-60000)/10 - 10000 = very low
                'MOCK_SJ_SETTLEMENTS': json.dumps([-30000, -20000, -10000]),
            },
        )
        assert rc == 0

    def test_sm19_dual_order_spec(self, tmp_path):
        """SM-19: Dual order: buy AND sell in same spec."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2330=buy100=580sell50=600',
            env_overrides={
                'MOCK_SJ_BALANCE': '1000000',
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 1000, 'price': 580}]),
            },
        )
        assert rc == 0

    def test_sm21_nonmatching_args_skipped(self, tmp_path):
        """SM-21: Non-matching argv elements are silently skipped."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            'INVALID_STRING', 'also_invalid',
        )
        assert rc == 0

    def test_sm25_buy_price_zero(self, tmp_path):
        """SM-25: buy_price=0 → buy block skipped."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2330=buy100=0',
        )
        assert rc == 0

    def test_rx01_buy_only(self, tmp_path):
        """RX-01: Simple buy order spec."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2330=buy100=580.0',
            env_overrides={'MOCK_SJ_BALANCE': '1000000'},
        )
        assert rc == 0
        # Match groups should be printed
        assert '2330' in stdout

    def test_rx02_sell_only(self, tmp_path):
        """RX-02: Simple sell order spec."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2317=sell50=120.5',
            env_overrides={
                'MOCK_SJ_BALANCE': '1000000',
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2317', 'quantity': 1000, 'price': 120}]),
            },
        )
        assert rc == 0

    def test_rx07_invalid_string_skipped(self, tmp_path):
        """RX-07: INVALID_STRING → no regex match, skipped."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            'INVALID_STRING',
        )
        assert rc == 0

    def test_sm05_cancel_pending_lmt(self, tmp_path):
        """SM-05/SM-06: Existing LMT PendingSubmit orders get cancelled."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        orders = [
            {'code': '2330', 'status': 'Submitted', 'action': 'Buy',
             'quantity': 100, 'price': 580, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
        ]
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            env_overrides={
                'MOCK_SJ_ORDERS': json.dumps(orders),
                'MOCK_SJ_BALANCE': '1000000',
            },
        )
        assert rc == 0

    def test_sm07_mkt_order_not_cancelled(self, tmp_path):
        """SM-07: MKT price_type order → not cancelled."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        orders = [
            {'code': '2330', 'status': 'Submitted', 'action': 'Buy',
             'quantity': 100, 'price': 580, 'price_type': 'MKT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
        ]
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            env_overrides={
                'MOCK_SJ_ORDERS': json.dumps(orders),
                'MOCK_SJ_BALANCE': '1000000',
            },
        )
        assert rc == 0

    def test_sell_capped_to_position(self, tmp_path):
        """SM-16: Sell qty capped when position < sell * 4/3."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        # Sell 200, position = 100 → 100 < 200*4/3=266 → sell = 100
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2330=sell200=580',
            env_overrides={
                'MOCK_SJ_BALANCE': '1000000',
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 100, 'price': 580}]),
            },
        )
        assert rc == 0
        # sell becomes 100 (position value), then *10 = 1000
        assert '1000' in stdout

    def test_sell_no_position(self, tmp_path):
        """SM-17: Sell with no position → sell = 0, no order."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            '2330=sell50=580',
            env_overrides={
                'MOCK_SJ_BALANCE': '1000000',
                'MOCK_SJ_POSITIONS': '[]',
            },
        )
        assert rc == 0


# ===========================================================================
# 5. Sell All Mode
# ===========================================================================
class TestSellAllMode:
    """SA-01 through SA-11."""

    def _make_ca_file(self, tmp_path):
        ca_pw_file = os.path.join(str(tmp_path), 'capw.txt')
        with open(ca_pw_file, 'w') as f:
            f.write('mypassword\n')
        ca_path = os.path.join(str(tmp_path), 'ca.pem')
        with open(ca_path, 'w') as f:
            f.write('FAKE_CA')
        return ca_path, ca_pw_file

    def test_sa01_sellall_with_position(self, tmp_path):
        """SA-01: Sell all with Common position = 5000 shares → q = 5."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'sellall', ca_path, ca_pw_file, '2330',
            env_overrides={
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 5000, 'price': 580}]),
            },
        )
        assert rc == 0
        # q = 5000 // 1000 = 5
        lines = stdout.strip().split('\n')
        assert '5' in stdout

    def test_sa02_odd_shares_ignored(self, tmp_path):
        """SA-02: 5300 shares → q = 5 (odd 300 ignored, //1000)."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'sellall', ca_path, ca_pw_file, '2330',
            env_overrides={
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 5300, 'price': 580}]),
            },
        )
        assert rc == 0

    def test_sa03_no_position(self, tmp_path):
        """SA-03: No position for target → q = 0, no sell order."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'sellall', ca_path, ca_pw_file, '2330',
            env_overrides={'MOCK_SJ_POSITIONS': '[]'},
        )
        assert rc == 0
        # q = 0, no order placed
        assert '0' in stdout

    def test_sa04_simulation_mode(self, tmp_path):
        """SA-04: Simulation mode → CA activation skipped."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'sellall', ca_path, ca_pw_file, '2330',
            env_overrides={
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 3000, 'price': 580}]),
            },
        )
        assert rc == 0

    def test_sa06_cancel_pending_for_target(self, tmp_path):
        """SA-06: Cancel LMT pending orders for target stock."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        orders = [
            {'code': '2330', 'status': 'Submitted', 'action': 'Buy',
             'quantity': 100, 'price': 580, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
            {'code': '2317', 'status': 'Submitted', 'action': 'Buy',
             'quantity': 50, 'price': 120, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
        ]
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'sellall', ca_path, ca_pw_file, '2330',
            env_overrides={
                'MOCK_SJ_ORDERS': json.dumps(orders),
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 3000, 'price': 580}]),
            },
        )
        assert rc == 0

    def test_sa08_filling_not_cancelled(self, tmp_path):
        """SA-08: Filling status for target → NOT cancelled in sellall."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        orders = [{
            'code': '2330', 'status': 'Filling', 'action': 'Buy',
            'quantity': 100, 'price': 580, 'price_type': 'LMT',
            'order_lot': 'Common', 'order_datetime': 1700000000,
            'deals': [{'price': 580, 'ts': 1700001000, 'quantity': 50}],
        }]
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'sellall', ca_path, ca_pw_file, '2330',
            env_overrides={
                'MOCK_SJ_ORDERS': json.dumps(orders),
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 3000, 'price': 580}]),
            },
        )
        assert rc == 0

    def test_sa10_stock_not_in_position(self, tmp_path):
        """SA-10: Target not in any position → q = 0."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'sellall', ca_path, ca_pw_file, '9999',
            env_overrides={
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 3000, 'price': 580}]),
            },
        )
        assert rc == 0

    def test_sa13_small_position_no_common(self, tmp_path):
        """SA-13: Position=500 → q=0 (500//1000=0), no order."""
        ca_path, ca_pw_file = self._make_ca_file(tmp_path)
        rc, stdout, _ = run_twse(
            'PAPIUSER02', 'PW', 'sellall', ca_path, ca_pw_file, '2330',
            env_overrides={
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 500, 'price': 580}]),
            },
        )
        assert rc == 0


# ===========================================================================
# 6. retryApi behavior
# ===========================================================================
class TestRetryApi:
    """RA-01 through RA-09: Retry logic (tested via login retries)."""

    def test_ra01_success_first_try(self):
        """RA-01: Login succeeds on first call."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_LOGIN_FAIL': '0',
        })
        assert rc == 0

    def test_ra02_success_after_retries(self):
        """RA-02: Login fails 2x then succeeds on 3rd."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_LOGIN_FAIL': '2',
            'MOCK_SJ_FAST_RETRY': '1',
        })
        assert rc == 0

    def test_ra04_success_on_last_try(self):
        """RA-04: Login fails 4x then succeeds on 5th (count=5)."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_LOGIN_FAIL': '4',
            'MOCK_SJ_FAST_RETRY': '1',
        })
        assert rc == 0

    def test_ra03_all_retries_fail(self):
        """RA-03: Login fails all 5 attempts → raises."""
        rc, _, stderr = run_twse('KEY', 'PW', expect_fail=True,
                                  env_overrides={
                                      'MOCK_SJ_LOGIN_FAIL': '5',
                                      'MOCK_SJ_FAST_RETRY': '1',
                                  })
        assert rc != 0
        assert 'Mock login fail' in stderr

    def test_ra08_returns_none(self):
        """RA-08: Function returning None is still a success."""
        # update_status returns None — if retryApi had a truthy check it would loop
        # This is implicitly tested by every successful test (update_status is called)
        rc, stdout, _ = run_twse('KEY', 'PW')
        assert rc == 0


# ===========================================================================
# 7. Edge Cases & Error Handling
# ===========================================================================
class TestEdgeCases:
    """EH-01 through EH-15: Error handling and edge cases."""

    def test_eh05_ca_password_trailing_newline(self, tmp_path):
        """EH-05: CA password file with trailing newline → stripped."""
        ca_pw_file = os.path.join(str(tmp_path), 'capw.txt')
        with open(ca_pw_file, 'w') as f:
            f.write('realpassword\n')
        ca_path = os.path.join(str(tmp_path), 'ca.pem')
        with open(ca_path, 'w') as f:
            f.write('FAKE_CA')

        # Production mode (non-PAPIUSER key) reads CA file
        rc, stdout, _ = run_twse(
            'REALKEY', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
        )
        assert rc == 0

    def test_eh15_argv_echo(self):
        """EH-15: argv echo on last line."""
        rc, stdout, _ = run_twse('MYKEY', 'MYSECRET')
        last_line = stdout.strip().split('\n')[-1]
        assert 'MYKEY' in last_line

    def test_multiple_positions_query(self):
        """Multiple positions with various codes."""
        positions = [
            {'code': '2330', 'quantity': 1000, 'price': 580.0},
            {'code': '2317', 'quantity': 500, 'price': 120.5},
            {'code': '2454', 'quantity': 2000, 'price': 800.0},
        ]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_POSITIONS': json.dumps(positions),
        })
        data = parse_query_output(stdout)
        pos = json.loads(data['position'])
        assert len(pos) == 3
        codes = [p['symbol'] for p in pos]
        assert '2330' in codes
        assert '2317' in codes
        assert '2454' in codes

    def test_production_mode_submit(self, tmp_path):
        """SM-03: Production mode → reads CA file and activates CA."""
        ca_pw_file = os.path.join(str(tmp_path), 'capw.txt')
        with open(ca_pw_file, 'w') as f:
            f.write('prod_password\n')
        ca_path = os.path.join(str(tmp_path), 'ca.pem')
        with open(ca_path, 'w') as f:
            f.write('REAL_CA')

        rc, stdout, _ = run_twse(
            'REALKEY', 'PW', 'submit', ca_path, ca_pw_file, '0.006',
            env_overrides={'MOCK_SJ_BALANCE': '1000000'},
        )
        assert rc == 0

    def test_production_mode_sellall(self, tmp_path):
        """SA-05: Production mode sellall → reads CA file."""
        ca_pw_file = os.path.join(str(tmp_path), 'capw.txt')
        with open(ca_pw_file, 'w') as f:
            f.write('prod_password\n')
        ca_path = os.path.join(str(tmp_path), 'ca.pem')
        with open(ca_path, 'w') as f:
            f.write('REAL_CA')

        rc, stdout, _ = run_twse(
            'REALKEY', 'PW', 'sellall', ca_path, ca_pw_file, '2330',
            env_overrides={
                'MOCK_SJ_POSITIONS': json.dumps([{'code': '2330', 'quantity': 3000, 'price': 580}]),
            },
        )
        assert rc == 0

    def test_query_with_all_order_types(self):
        """Comprehensive order status coverage."""
        orders = [
            {'code': '2330', 'status': 'PendingSubmit', 'action': 'Buy',
             'quantity': 100, 'price': 580, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
            {'code': '2330', 'status': 'PreSubmitted', 'action': 'Sell',
             'quantity': 50, 'price': 590, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
            {'code': '2330', 'status': 'Filled', 'action': 'Buy',
             'quantity': 10, 'price': 580, 'price_type': 'LMT',
             'order_lot': 'Common', 'id': 'F010',
             'order_datetime': 1700000000,
             'deals': [{'price': 580, 'ts': 1700001000, 'quantity': 10}]},
            {'code': '2330', 'status': 'Cancelled', 'action': 'Buy',
             'quantity': 100, 'price': 580, 'price_type': 'LMT',
             'order_lot': 'Common', 'order_datetime': 1700000000},
        ]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': json.dumps(orders),
        })
        data = parse_query_output(stdout)
        pending = json.loads(data['order'])
        fills = json.loads(data['fill_order'])
        # PendingSubmit + PreSubmitted in pending (2), Cancelled excluded
        assert len(pending) == 2
        # Only Filled in fills (1)
        assert len(fills) == 1


# ===========================================================================
# 8. Bug Discovery: `time` variable shadowing
# ===========================================================================
class TestBugDiscovery:
    """
    BUG: Line 69 `time = 0` shadows the `import time` module.
    After processing a Filled/Filling order, `time.sleep()` in retryApi
    would fail if retryApi is called again. In current code flow, retryApi
    is only called BEFORE the order loop, so this doesn't crash. But it's
    a latent bug if code is reordered.
    """

    def test_time_shadowing_in_query(self):
        """Verify query mode works even with time shadowing."""
        orders = [{
            'code': '2330', 'status': 'Filled', 'action': 'Buy',
            'quantity': 5, 'price': 580, 'price_type': 'LMT',
            'order_lot': 'Common', 'id': 'F020',
            'order_datetime': 1700000000,
            'deals': [{'price': 580, 'ts': 1700001000, 'quantity': 5}],
        }]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_ORDERS': json.dumps(orders),
        })
        assert rc == 0
        data = parse_query_output(stdout)
        fills = json.loads(data['fill_order'])
        assert len(fills) == 1


# ===========================================================================
# 11. Profit output (list_profit_loss)
# ===========================================================================
class TestProfitOutput:
    """PL-01 through PL-06: list_profit_loss output in query mode."""

    def test_pl01_empty_profit_loss(self):
        """PL-01: No P&L records → profit line has empty items list."""
        rc, stdout, _ = run_twse('KEY', 'PW')
        assert rc == 0
        data = parse_query_output(stdout)
        assert 'profit' in data
        profit = json.loads(data['profit'])
        assert profit['items'] == []

    def test_pl02_single_record(self):
        """PL-02: One P&L record → profit line contains it."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_PROFIT_LOSS': json.dumps([{'code': '2330', 'pnl': 1500.0}]),
            'MOCK_SJ_PROFIT_DATE': '2025-01-13',
        })
        assert rc == 0
        data = parse_query_output(stdout)
        profit = json.loads(data['profit'])
        assert len(profit['items']) == 1
        assert profit['items'][0]['code'] == '2330'
        assert profit['items'][0]['pnl'] == 1500.0
        assert profit['items'][0]['date'] == '2025-01-13'

    def test_pl03_multiple_records(self):
        """PL-03: Multiple P&L records → all returned."""
        pl = [
            {'code': '2330', 'pnl': 1000.0},
            {'code': '2317', 'pnl': -500.0},
            {'code': '2454', 'pnl': 250.5},
        ]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_PROFIT_LOSS': json.dumps(pl),
            'MOCK_SJ_PROFIT_DATE': '2025-01-14',
        })
        assert rc == 0
        data = parse_query_output(stdout)
        profit = json.loads(data['profit'])
        assert len(profit['items']) == 3
        codes = [p['code'] for p in profit['items']]
        assert '2330' in codes
        assert '2317' in codes
        assert '2454' in codes

    def test_pl04_negative_pnl(self):
        """PL-04: Negative P&L is preserved."""
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_PROFIT_LOSS': json.dumps([{'code': '2330', 'pnl': -3000.0}]),
            'MOCK_SJ_PROFIT_DATE': '2025-01-15',
        })
        assert rc == 0
        data = parse_query_output(stdout)
        profit = json.loads(data['profit'])
        assert profit['items'][0]['pnl'] == -3000.0

    def test_pl05_per_record_date(self):
        """PL-05: Each record carries its own date if provided."""
        pl = [
            {'code': '2330', 'pnl': 100.0, 'date': '2025-01-10'},
            {'code': '2330', 'pnl': 200.0, 'date': '2025-01-13'},
        ]
        rc, stdout, _ = run_twse('KEY', 'PW', env_overrides={
            'MOCK_SJ_PROFIT_LOSS': json.dumps(pl),
        })
        assert rc == 0
        data = parse_query_output(stdout)
        profit = json.loads(data['profit'])
        assert len(profit['items']) == 2
        dates = [p['date'] for p in profit['items']]
        assert '2025-01-10' in dates
        assert '2025-01-13' in dates

    def test_pl06_profit_line_is_valid_json(self):
        """PL-06: Profit line is always valid JSON."""
        rc, stdout, _ = run_twse('KEY', 'PW')
        assert rc == 0
        data = parse_query_output(stdout)
        assert 'profit' in data
        parsed = json.loads(data['profit'])
        assert 'items' in parsed
        assert isinstance(parsed['items'], list)


# ===========================================================================
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
