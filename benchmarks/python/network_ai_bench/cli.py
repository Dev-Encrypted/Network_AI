import argparse
import json

def main():
    parser = argparse.ArgumentParser(description='NETWORK AI local F0 bench')
    commands = parser.add_subparsers(dest='command', required=True)
    bench = commands.add_parser('http')
    bench.add_argument('--base-url', required=True)
    bench.add_argument('--model', required=True)
    bench.add_argument('--output', required=True)
    bench.add_argument('--samples', type=int, default=30)
    bench.add_argument('--warmups', type=int, default=3)
    bench.add_argument('--max-output-tokens', type=int, default=64)
    economy = commands.add_parser('economy')
    economy.add_argument('--manifest', default='benchmarks/economy-study-v1.json')
    economy.add_argument('--output', required=True)
    economy.add_argument('--phase', choices=('calibration','holdout'), required=True)
    economy.add_argument('--workers', type=int, choices=range(1,9), default=4)
    profile = commands.add_parser('profile')
    profile.add_argument('--base-url',required=True)
    profile.add_argument('--model',default='network-ai-qwen3-8b-bf16')
    profile.add_argument('--fixtures',default='benchmarks/fixtures/qwen3-8b-e01.jsonl')
    profile.add_argument('--output',required=True)
    args = parser.parse_args()
    if args.command == 'http':
        from .http_bench import run
        result = run(args.base_url,args.model,args.output,args.samples,args.warmups,args.max_output_tokens)
        print(json.dumps(result,ensure_ascii=False,indent=2))
    elif args.command == 'economy':
        from .economy import study
        result = study(args.manifest,args.output,args.phase,args.workers)
        print(json.dumps({'completed_runs':result['completed_runs'],'public_launch_approved':False}))
    elif args.command == 'profile':
        from .profile_bench import run
        result = run(args.base_url,args.model,args.fixtures,args.output)
        print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
