import io
import json
import unittest
from unittest.mock import patch
from network_ai_bench.http_bench import local_url, sse_payloads, sample, MAX_SSE_LINE

class Reply(io.BytesIO):
    status = 200

class HttpBenchTests(unittest.TestCase):
    def test_nonlocal_or_credential_urls_rejected(self):
        for value in ('http://example.com','http://secret@localhost','http://localhost/?key=secret'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                local_url(value)

    def test_multiline_and_comment_sse(self):
        source=Reply(b': keepalive\n\ndata: one\ndata: two\n\ndata: [DONE]\n\n')
        self.assertEqual(list(sse_payloads(source)),['one\ntwo','[DONE]'])

    def test_oversized_event_rejected(self):
        with self.assertRaises(ValueError):
            list(sse_payloads(Reply(b'data: '+b'x'*(MAX_SSE_LINE+1))))

    def test_reasoning_is_not_a_visible_answer(self):
        events=[{'choices':[{'delta':{'reasoning_content':'brasília'},'finish_reason':None}]},
                {'choices':[{'delta':{'content':'Roma'},'finish_reason':'stop'}]}]
        raw=''.join('data: '+json.dumps(e)+'\n\n' for e in events)+'data: [DONE]\n\n'
        with patch('urllib.request.urlopen',return_value=Reply(raw.encode())):
            result=sample('http://127.0.0.1:1235','fixture',0)
        self.assertFalse(result['correct_synthetic_answer'])
        self.assertEqual(result['synthetic_output'],'Roma')
        self.assertTrue(result['completed'])
        self.assertLess(result['generation_ttft_seconds'],result['ttft_seconds'])

    def test_length_cutoff_distinct_from_stream_completion(self):
        raw=b'data: {"choices":[{"delta":{"content":"42"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'
        with patch('urllib.request.urlopen',return_value=Reply(raw)):
            result=sample('http://127.0.0.1:1235','fixture',1)
        self.assertTrue(result['completed'])
        self.assertFalse(result['response_finished_without_length_cutoff'])

    def test_truncated_stream_is_not_complete(self):
        raw=b'data: {"choices":[{"delta":{"content":"42"},"finish_reason":null}]}\n\n'
        with patch('urllib.request.urlopen',return_value=Reply(raw)):
            result=sample('http://127.0.0.1:1235','fixture',1)
        self.assertFalse(result['completed'])

if __name__ == '__main__':
    unittest.main()
