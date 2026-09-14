import json
from pathlib import Path
import unittest

from network_ai_bench.economy import Experiment

PARAMETERS = json.loads(Path('benchmarks/economy-study-v1.json').read_text())['parameters']


class EventEconomyTests(unittest.TestCase):
    def test_same_inputs_are_deterministic_and_mature_issuance_stops(self):
        p = {**PARAMETERS,'days':6,'mature_days':2,'observation_starts_day':1,'requests_per_day':24}
        a = Experiment(p,'steady_zero_buyers',730031,'v6_demand_split').run()
        b = Experiment(p,'steady_zero_buyers',730031,'v6_demand_split').run()
        self.assertEqual(a,b)
        self.assertTrue(a['gates']['accounting_and_resource_invariants'])
        self.assertTrue(a['gates']['mature_no_new_issuance'])
        self.assertEqual(len(a['daily']),6)
        self.assertGreater(a['metrics']['ready_receipts'],0)
        self.assertGreater(a['metrics']['ordinary_new_issuance_microtu'],0)

    def test_zero_use_never_fabricates_consumption(self):
        p = {**PARAMETERS,'days':5,'mature_days':2,'observation_starts_day':1}
        a = Experiment(p,'zero_use',730032,'v6_demand_split').run()
        self.assertEqual(a['metrics'].get('finalized_consumption_microtu',0),0)
        self.assertEqual(a['metrics'].get('desired',0),0)
        self.assertFalse(a['synthetic_candidate_passed'])

    def test_initial_balances_are_zero_and_24h_receipts_are_unspendable(self):
        p = {**PARAMETERS,'days':6,'mature_days':2,'observation_starts_day':1}
        exp = Experiment(p,'steady_zero_buyers',730033,'v6_demand_split')
        exp.day_boundary()
        exp.lease_start()
        self.assertEqual(exp.ledger.S,0)
        self.assertGreater(exp.ledger.L,0)
        self.assertEqual(exp.ledger.balance('node:0'),0)
        exp.ledger.audit()


if __name__ == '__main__':
    unittest.main()
