"""Prepare exact-token synthetic input profiles with the pinned Qwen tokenizer."""
from hashlib import sha256
from pathlib import Path
import json
from transformers import AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / '.models/Qwen3-8B-b968826d9c46dd6066d109eabc6255188de91218'


def main():
    tokenizer = AutoTokenizer.from_pretrained(MODEL,local_files_only=True,trust_remote_code=False)
    rows = []
    for target,output in ((2048,256),(7168,1024)):
        for n in range(33):
            prefix = f'Experimento sintético de capacidade. Amostra {n:03d}. Dados de preenchimento:'
            suffix = '\nEscreva uma sequência longa de números, separados por vírgulas, começando em 1.'
            fillers = target
            for _ in range(6):
                prompt = prefix + ' x' * fillers + suffix
                messages = [{'role':'user','content':prompt}]
                encoded = tokenizer.apply_chat_template(messages,tokenize=True,add_generation_prompt=True,enable_thinking=False)
                ids = encoded['input_ids'] if hasattr(encoded,'keys') else encoded
                if len(ids) == 1 and isinstance(ids[0],list):
                    ids = ids[0]
                assert all(type(token) is int for token in ids)
                delta = target - len(ids)
                if not delta: break
                fillers += delta
            assert len(ids) == target and target + output <= 8192
            rows.append({'profile':f'{target}/{output}','sample':n,'warmup':n<3,'messages':messages,
                         'prompt_tokens_with_template':len(ids),'maximum_output_tokens':output,
                         'input_token_ids_sha256':sha256(json.dumps(ids,separators=(',',':')).encode()).hexdigest(),
                         'generation':{'temperature':0,'seed':20260914,'ignore_eos':True,'min_tokens':output},
                         'purpose':'synthetic prefill/decode load, not semantic answer quality'})
    out = ROOT / 'benchmarks/fixtures/qwen3-8b-e01.jsonl'
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text('\n'.join(json.dumps(row,ensure_ascii=False) for row in rows)+'\n',encoding='utf-8')
    report = {'artifact':'benchmarks/fixtures/qwen3-8b-e01.jsonl','sha256':sha256(out.read_bytes()).hexdigest(),
              'model_revision':'b968826d9c46dd6066d109eabc6255188de91218','samples_per_profile':30,'warmups_per_profile':3,
              'profiles':['2048/256','7168/1024'],'all_prompt_token_counts_verified':True,
              'template_kwargs':{'enable_thinking':False},'inference_executed':False,
              'limitations':['Forced minimum output is a throughput/VRAM workload, not a semantic quality test',
                             'Thirty samples cannot qualify p99 or the planned 1000-session production threshold']}
    target = ROOT / 'docs/execution/evidence/e01-fixtures.json'
    target.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    main()
