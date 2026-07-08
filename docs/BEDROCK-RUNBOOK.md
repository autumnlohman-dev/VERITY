# Bedrock Runbook

How to flip VERITY's model inference from the direct Anthropic API to Claude
on AWS Bedrock (under the AWS BAA), verify it, and roll it back. The
transport lives in `src/lib/ai/phiBoundary.ts`; every model call in the
product goes through it.

Nothing in this runbook happens automatically. The flip is a deliberate,
human-initiated env change plus redeploy.

---

## 1. The five environment variables

| Name | Example value | Notes |
|---|---|---|
| `ANTHROPIC_BACKEND` | `bedrock` | The switch. Exactly the string `bedrock`; any other value (or unset) keeps the direct Anthropic API. |
| `AWS_REGION` | `us-east-1` | Region for the Bedrock runtime endpoint. Must be a region covered by the inference profile. |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-sonnet-4-6-v1:0` | **Must be the cross-region inference-profile ID** (`us.anthropic.claude-...`), not the bare model ID (`anthropic.claude-...`). Copy the exact Sonnet profile ID from the Bedrock console; on-demand throughput rejects the bare form. The boundary fail-fasts on the wrong shape. |
| `AWS_ACCESS_KEY_ID` | `AKIA...` | IAM user scoped to `bedrock:InvokeModel` only. |
| `AWS_SECRET_ACCESS_KEY` | (secret) | Pair of the above. |

The direct path uses only `ANTHROPIC_API_KEY`, which stays set regardless (it
is ignored while the backend is bedrock, and is the instant-rollback path).

## 2. Before the flip: smoke test

Run locally (or in any shell that has the five vars):

```
npm run bedrock:smoke
```

The script validates the configuration with the same fail-fast rules the
boundary enforces (model-ID shape, region, credentials present), then sends
one tiny non-PHI message ("Reply with OK") through the phiBoundary transport
with the Bedrock client. Success prints the model ID that served the call;
failure prints the status/name/message and the common causes (missing model
access grant, wrong region, bare model ID, under-scoped IAM key).

Do not flip production until the smoke test passes.

## 3. The singleton caveat (redeploy required)

The boundary's SDK client is a lazy per-process singleton: the backend is
chosen on a server instance's FIRST model call and never re-read. Changing
`ANTHROPIC_BACKEND` in Vercel does nothing to already-warm instances.
**Every backend change requires a redeploy** (which replaces all instances).
Assume mixed traffic is possible only during the deploy rollover window,
never after.

## 4. Flip procedure

1. Set the five variables on the Vercel project (Production environment).
2. Redeploy production (a fresh deployment, not an instance restart).
3. Verify (both signals):
   - **Boundary log line** in Vercel runtime logs: every model call logs
     `phiBoundary[<stage>]: class=..., backend=bedrock, model=us.anthropic...`.
     The `backend=bedrock` + `us.anthropic...` model ID pair on the
     `bill-extraction` and `eob-extraction` stages is the confirmation that
     raw-document (PHI-carrying) calls route through Bedrock. If any line
     still says `backend=direct`, the flip has not taken effect.
   - **CloudWatch**: Bedrock invocation metrics (`AWS/Bedrock` namespace,
     `Invocations` by model ID) climbing in the chosen region.
4. Exercise one real flow (upload a test bill on the gated preview) and
   confirm the extraction succeeds end to end.

Failure behavior after the flip is loud by design: Bedrock errors propagate
to callers (letter route 503, EOB extraction degrades to a bill-only audit
with the visible notice). **There is no silent fallback to the direct
Anthropic API** — a Bedrock outage degrades features rather than quietly
routing PHI to a non-BAA endpoint.

## 5. Rollback

1. Unset `ANTHROPIC_BACKEND` on the Vercel project (or set it to anything
   other than `bedrock`). Leave the AWS vars in place; they are inert.
2. Redeploy production (same singleton caveat).
3. Verify the boundary log lines read `backend=direct` again.

Rollback consequence to note: while rolled back, raw-document extraction
calls egress to Anthropic again (no BAA). Treat rollback as an incident
response, not a resting state.

## 6. Config validation reference

With `ANTHROPIC_BACKEND=bedrock`, the boundary throws at client
construction (before any request exists) when:

- `BEDROCK_MODEL_ID` is missing, or does not match `^us\.anthropic\.`
- `AWS_REGION` is missing

The error names the misconfigured variable. A bad AWS key is NOT caught at
construction (credentials are only exercised on the first invocation) —
that is what the smoke test is for.
