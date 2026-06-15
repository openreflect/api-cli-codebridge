import json, sys
path = sys.argv[1]
turn = sys.argv[2]
raw = open(path).read()
start = raw.find('{')
if start == -1:
    raise SystemExit('no_json_found')
data = json.loads(raw[start:])
meta = data.get('result', data).get('meta', {}).get('agentMeta', {})
payloads = data.get('result', data).get('payloads', [])
text = payloads[0].get('text') if payloads else ''
print(f"TURN {turn} provider={meta.get('provider')} model={meta.get('model')} text={text}")
