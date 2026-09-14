# 02. Research, comparisons, and reuse decisions

## Compare execution mechanisms, not slogans

The original September 13 research surveyed systems with different purposes. A distributed model runtime, a request-routing pool, a GPU marketplace, and a training network solve different problems. Their user interfaces or advertised GPU totals do not establish compatibility with NETWORK AI's large-model objective.

The original detailed comparison, collected revisions, and licensing observations remain in the [historical planning source](../publication/README.md). The [evidence inventory](evidence/README.md) records snapshots; it should not be read as a live maintenance report.

## Mechanisms relevant to the design

| Category | References investigated | Question for NETWORK AI |
|---|---|---|
| A model divided between participants | Petals and its Hivemind substrate | Can supported blocks execute with measured parity, state handling, and recovery on uneven devices? |
| Local or nearby distributed execution | exo and engine-supported multi-GPU configurations | Which exact hardware/topology can act as one qualified route? |
| Cooperative request distribution | AI Horde | Which queue, participation, and credit ideas apply to whole-request workers? |
| Compute marketplaces | Golem, Akash, io.net, Salad | Which offer, contract, availability, and cost concepts can inform optional capacity sales? |
| Incentive or broader research networks | Bittensor, Gensyn, Prime Intellect | Which assumptions differ from an inference usage-credit network? |
| Numerical inference engines | vLLM, SGLang, llama.cpp, TensorRT-LLM | Which pinned engine supports the target architecture, precision, device, and partition? |

These rows are a map of the research, not a certification of current upstream features, uptime, prices, or support for arbitrary models. Recheck the exact release before adopting a component.

## Why build a coordination layer

NETWORK AI needs common identity, model qualification, admission, contributor contracts, fair access, and accounting across several execution profiles. No upstream benchmark substitutes for validating that combined system.

The chosen direction is to reuse numerical engines and transport libraries while implementing the network-specific control and accounting layer. A fork is justified only by a concrete compatibility need and a sustainable maintenance plan. New numerical kernels require stronger justification than a desire to own every component.

## What the relevant sources establish

vLLM documents strategies for running a model on one device, across GPUs on a host, and across hosts. Petals' authors report distributed inference with heterogeneous participants and Internet links. These are reasons to investigate both nearby clusters and cross-participant pipelines; their performance results belong to their tested systems. [vLLM documentation](https://docs.vllm.ai/en/latest/serving/parallelism_scaling/), [Petals paper](https://arxiv.org/abs/2312.08361).

The repository's own Petals experiment is narrower: BLOOM-560m on two CPU processes on one host. Its transport benchmark is also separate from the integrated private product. [F0 results](../execution/README.md).

## Adoption checklist

Before choosing a runtime for a model above 27B, record the release and license, supported architecture, precision and kernels, minimum executable partition, memory peak, network requirements, cancellation behavior, and recovery semantics. Run quality/parity and complete-request tests on the intended devices.

For a transport, test identity, replay, bounded messages, backpressure, disconnect, NAT, relay, and restart. For a marketplace adapter, test liabilities and payment finality separately from numerical correctness. A component is adopted only for the role and profile that its evidence supports.
