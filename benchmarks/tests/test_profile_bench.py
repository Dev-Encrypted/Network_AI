"""Exercise profile accounting against a bounded local HTTP fixture server."""
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from unittest import TestCase
from unittest.mock import patch
import json

from network_ai_bench.profile_bench import run


class ProfileBenchTests(TestCase):
    def exercise(self, mode):
        requests = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                models = [] if mode == 'missing_model' else [{'id': 'explicit-model'}]
                payload = json.dumps({'data': models}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def do_POST(self):
                requests.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                count = 1 if mode == 'counter_mismatch' else 2
                events = [
                    {'choices': [{'delta': {'content': '1,2'}, 'finish_reason': 'length'}]},
                    {'choices': [], 'usage': {'prompt_tokens': 1, 'completion_tokens': count}},
                ]
                payload = ''.join('data: ' + json.dumps(event) + '\n\n' for event in events)
                if mode != 'truncated':
                    payload += 'data: [DONE]\n\n'
                payload = payload.encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with TemporaryDirectory() as directory:
                fixture = Path(directory) / 'fixture.jsonl'
                fixture.write_text(json.dumps({
                    'profile': '1/2', 'sample': 0, 'warmup': False,
                    'messages': [{'role': 'user', 'content': 'test'}],
                    'prompt_tokens_with_template': 1, 'maximum_output_tokens': 2,
                    'generation': {'temperature': 0, 'min_tokens': 2, 'ignore_eos': True},
                }) + '\n', encoding='utf-8')
                with patch('network_ai_bench.profile_bench.gpu_snapshot', return_value=[]), redirect_stdout(StringIO()):
                    if mode == 'missing_model':
                        with self.assertRaisesRegex(ValueError, 'not advertised'):
                            run(f'http://127.0.0.1:{server.server_port}', 'explicit-model', fixture, Path(directory) / 'run')
                        self.assertEqual(requests, [])
                        return None
                    report = run(f'http://127.0.0.1:{server.server_port}', 'explicit-model', fixture, Path(directory) / 'run')
                self.assertEqual(requests[0]['model'], 'explicit-model')
                self.assertEqual(requests[0]['max_tokens'], 2)
                self.assertFalse(report['E01_fully_qualified'])
                return report
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_complete_counted_synthetic_load(self):
        report = self.exercise('complete')
        self.assertEqual(report['profiles']['1/2']['synthetic_loads_completed'], 1)

    def test_backend_counter_mismatch_is_not_success(self):
        report = self.exercise('counter_mismatch')
        self.assertEqual(report['profiles']['1/2']['synthetic_loads_completed'], 0)

    def test_missing_done_is_not_success(self):
        report = self.exercise('truncated')
        self.assertEqual(report['profiles']['1/2']['synthetic_loads_completed'], 0)

    def test_missing_model_does_not_send_inference(self):
        self.exercise('missing_model')
