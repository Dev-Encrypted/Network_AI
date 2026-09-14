import random
import unittest

from network_ai_bench.ledger import Ledger, WORKING, RESERVE, MAX_INTEGER


def credited(value=1000):
    ledger = Ledger()
    assert ledger.promise("earned", "alice", value, MAX_INTEGER)
    ledger.issue("earned")
    return ledger


class LedgerSafetyTests(unittest.TestCase):
    def test_exposure_reserves_before_issuance(self):
        ledger = Ledger()
        self.assertTrue(ledger.promise("a", "alice", 80, 100))
        self.assertFalse(ledger.promise("b", "bob", 21, 100))
        self.assertEqual((ledger.S,ledger.L,ledger.exposure),(0,80,80))
        ledger.issue("a")
        self.assertEqual((ledger.S,ledger.L,ledger.exposure),(80,0,80))
        ledger.audit()

    def test_held_balance_cannot_be_spent_again(self):
        ledger = credited()
        self.assertTrue(ledger.hold("h", "alice", 900, "usage"))
        self.assertFalse(ledger.hold("h2", "alice", 101, "usage"))
        self.assertEqual(ledger.exposure,1000)
        ledger.release("h")
        self.assertEqual(ledger.balance("alice"),1000)
        with self.assertRaises((KeyError, ValueError)):
            ledger.release("h")
        ledger.audit()

    def test_floor_prevents_reserve_starvation(self):
        ledger = credited(100)
        ledger.hold("h", "alice", 100, "usage")
        self.assertEqual(ledger.finalize_usage("h",60,100,100),(60,40,0))
        control = credited(100)
        control.hold("h", "alice", 100, "usage")
        self.assertEqual(control.finalize_usage("h",60,100,100,"reserve_first"),(0,100,0))
        ledger.audit()

    def test_reversal_holds_recycled_balance_and_uses_J_only_for_burn(self):
        ledger = credited()
        ledger.hold("h", "alice", 1000, "usage")
        ledger.finalize_usage("h",100,300,200)
        self.assertEqual((ledger.S,ledger.burned),(500,500))
        self.assertTrue(ledger.approve_reversal("undo", "h"))
        self.assertEqual((ledger.S,ledger.J,ledger.exposure),(500,500,1000))
        self.assertFalse(ledger.promise("over", "bob", 1, 1000))
        self.assertEqual(ledger.balance(WORKING),0)
        ledger.audit()
        ledger.post_reversal("undo")
        self.assertEqual((ledger.balance("alice"),ledger.J),(1000,0))
        with self.assertRaises((KeyError,ValueError)):
            ledger.approve_reversal("again","h")
        ledger.audit()

    def test_unfunded_reversal_does_not_mint_recycled_portion(self):
        ledger = credited(100)
        ledger.hold("h", "alice", 100, "usage")
        ledger.finalize_usage("h",100,100,0)
        ledger.hold("ready", WORKING, 100, "ready")
        ledger.pay_ready("ready", "bob")
        self.assertFalse(ledger.approve_reversal("undo","h"))
        self.assertEqual(ledger.J,0)
        self.assertEqual(ledger.balance("alice"),0)
        ledger.audit()

    def test_recycled_rewards_do_not_expand_issuance_base(self):
        ledger = credited(1900)
        self.assertTrue(ledger.promise("treasury",WORKING,100,10000,"treasury"))
        ledger.issue("treasury")
        ledger.hold("ready",WORKING,100,"ready")
        ledger.pay_ready("ready","bob")
        self.assertEqual(ledger.contributor_issued,1900)
        self.assertFalse(ledger.promise("treasury2",WORKING,1,10000,"treasury"))
        self.assertTrue(ledger.promise("grant","user",38,10000,"grant"))
        self.assertFalse(ledger.promise("grant2","user",1,10000,"grant"))
        ledger.audit()

    def test_invalid_amounts_and_aggregate_compartment(self):
        ledger = credited()
        for value in (-1,1.5,True,MAX_INTEGER+1):
            with self.assertRaises(ValueError):
                ledger.hold(str(value),"alice",value,"usage")
        with self.assertRaises(ValueError):
            ledger.hold("aggregate","COOP_CONTINUITY",0,"ready")
        ledger.audit()

    def test_many_settlements_conserve_supply_and_reverse_exactly(self):
        rng = random.Random(730031)
        ledger = credited(1000000)
        for i in range(200):
            value = rng.randrange(1,1000)
            key = f"charge:{i}"
            self.assertTrue(ledger.hold(key,"alice",value,"usage"))
            ledger.finalize_usage(key,1000,10000,10000)
            if i % 3 == 0:
                self.assertTrue(ledger.approve_reversal(f"undo:{i}",key))
                ledger.audit()
                ledger.post_reversal(f"undo:{i}")
            ledger.audit()


if __name__ == "__main__":
    unittest.main()
