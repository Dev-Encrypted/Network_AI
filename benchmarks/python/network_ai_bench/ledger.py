"""Integer TU ledger for experiments. No network, storage, consensus or real money.

All transfers are internal accounting movements required by service settlement.
There is deliberately no participant-to-participant transfer API.
"""
from dataclasses import dataclass

MAX_INTEGER = 2**63 - 1
WORKING = "COOP_WORKING"
RESERVE = "COOP_CORE_RESERVE"


def amount(value):
    if type(value) is not int or not 0 <= value <= MAX_INTEGER:
        raise ValueError("amount must be a nonnegative signed-64-bit integer")
    return value


@dataclass(frozen=True)
class Hold:
    owner: str
    value: int
    purpose: str


class Ledger:
    def __init__(self):
        self.free = {WORKING: 0, RESERVE: 0}
        self.holds = {}
        self.promises = {}
        self.reversals = {}
        self.closed = set()
        self.S = self.L = self.J = 0
        self.issued = self.burned = self.reinstated = 0
        self.contributor_issued = self.treasury_issued = self.grants_issued = 0
        self.refill_records = {}

    @property
    def exposure(self):
        return self.S + self.L + self.J

    def balance(self, account):
        return self.free.get(account, 0)

    def _new(self, key):
        if key in self.closed or key in self.holds or key in self.promises or key in self.reversals:
            raise ValueError("operation identifier already used")

    def promise(self, key, recipient, value, ceiling, kind="contributor"):
        self._new(key)
        amount(value)
        amount(ceiling)
        if kind not in ("contributor", "treasury", "grant"):
            raise ValueError("unknown issuance class")
        if self.exposure + value > min(ceiling, MAX_INTEGER):
            return False
        pending = sum(v for _, v, k in self.promises.values() if k == kind) if kind != "contributor" else 0
        if kind == "treasury" and self.treasury_issued + pending + value > self.contributor_issued // 19:
            return False
        if kind == "grant" and self.grants_issued + pending + value > self.contributor_issued // 49:
            return False
        self.promises[key] = (recipient, value, kind)
        self.L += value
        return True

    def release_promise(self, key):
        _, value, _ = self.promises.pop(key)
        self.L -= value
        self.closed.add(key)

    def issue(self, key):
        recipient, value, kind = self.promises.pop(key)
        self.L -= value
        self.S += value
        self.issued += value
        self.free[recipient] = self.balance(recipient) + value
        if kind == "contributor":
            self.contributor_issued += value
        elif kind == "treasury":
            self.treasury_issued += value
        else:
            self.grants_issued += value
        self.closed.add(key)
        return value

    def hold(self, key, owner, value, purpose):
        self._new(key)
        amount(value)
        if owner == "COOP_CONTINUITY" or purpose not in ("ready", "usage", "reversal"):
            raise ValueError("invalid journal compartment or purpose")
        if value > self.balance(owner):
            return False
        self.free[owner] = self.balance(owner) - value
        self.holds[key] = Hold(owner, value, purpose)
        return True

    def release(self, key):
        hold = self.holds.pop(key)
        self.free[hold.owner] = self.balance(hold.owner) + hold.value
        self.closed.add(key)

    def pay_ready(self, key, recipient):
        hold = self.holds[key]
        if hold.purpose != "ready" or hold.owner not in (WORKING, RESERVE):
            raise ValueError("READY must be funded by a treasury READY hold")
        self.holds.pop(key)
        self.free[recipient] = self.balance(recipient) + hold.value
        self.closed.add(key)
        return hold.value

    def finalize_usage(self, key, floor, working_target, reserve_target, priority="v6"):
        hold = self.holds[key]
        if hold.purpose != "usage":
            raise ValueError("usage settlement requires a usage hold")
        for target in (floor, working_target, reserve_target):
            amount(target)
        if priority not in ("v6", "reserve_first", "single"):
            raise ValueError("unknown refill priority")
        q = hold.value
        w0, r0 = self.balance(WORKING), self.balance(RESERVE)
        if priority == "v6":
            a = min(q, max(0, floor - w0))
            p = min(q - a, max(0, reserve_target - r0))
            w = min(q - a - p, max(0, working_target - w0 - a))
        elif priority == "reserve_first":
            a = 0
            p = min(q, max(0, reserve_target - r0))
            w = min(q - p, max(0, working_target - w0))
        else:
            a = p = 0
            w = min(q, max(0, working_target - w0))
        burn = q - a - p - w
        self.holds.pop(key)
        self.free[WORKING] = w0 + a + w
        self.free[RESERVE] = r0 + p
        self.S -= burn
        self.burned += burn
        self.closed.add(key)
        self.refill_records[key] = (hold.owner, a + w, p, burn)
        return a + w, p, burn

    def approve_reversal(self, key, original):
        """Reserve every recycled TU before approving; only the burned part enters J."""
        self._new(key)
        if original not in self.refill_records:
            raise ValueError("unknown or already reversed finalized charge")
        owner, w, r, burn = self.refill_records[original]
        if self.balance(WORKING) < w or self.balance(RESERVE) < r:
            return False
        if self.exposure + burn > MAX_INTEGER:
            return False
        self._new(key + ":w")
        self._new(key + ":r")
        self.hold(key + ":w", WORKING, w, "reversal")
        self.hold(key + ":r", RESERVE, r, "reversal")
        del self.refill_records[original]
        self.reversals[key] = (owner, w, r, burn)
        self.J += burn
        return True

    def post_reversal(self, key):
        owner, w, r, burn = self.reversals.pop(key)
        for suffix in (":w", ":r"):
            self.holds.pop(key + suffix)
            self.closed.add(key + suffix)
        self.free[owner] = self.balance(owner) + w + r + burn
        self.J -= burn
        self.S += burn
        self.reinstated += burn
        self.closed.add(key)

    def audit(self):
        assert all(type(v) is int and 0 <= v <= MAX_INTEGER for v in self.free.values())
        assert all(h.value >= 0 for h in self.holds.values())
        assert self.S == sum(self.free.values()) + sum(h.value for h in self.holds.values())
        assert self.L == sum(v for _, v, _ in self.promises.values())
        assert self.J == sum(v[3] for v in self.reversals.values())
        assert self.S == self.issued - self.burned + self.reinstated
        assert 0 <= self.exposure <= MAX_INTEGER
        assert self.treasury_issued <= self.contributor_issued // 19
        assert self.grants_issued <= self.contributor_issued // 49
        assert "COOP_CONTINUITY" not in self.free
