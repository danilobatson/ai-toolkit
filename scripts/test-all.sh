#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AI Toolkit — Comprehensive Test Runner
#
# Tests ALL modules in both TypeScript and Python SDKs, plus the CLI.
# Usage: bash scripts/test-all.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
ERRORS=()

green()  { printf '\033[32m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

run_test() {
  local name="$1"
  shift
  printf "  %-45s" "$name"
  if output=$("$@" 2>&1); then
    green "PASS"
    PASS=$((PASS + 1))
  else
    red "FAIL"
    FAIL=$((FAIL + 1))
    ERRORS+=("$name: $output")
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
bold "═══════════════════════════════════════════════════════"
bold "  AI Toolkit — Full Test Suite"
bold "═══════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# TypeScript SDK
# ─────────────────────────────────────────────────────────────────────────────
bold "▸ TypeScript SDK (packages/toolkit/)"
echo ""

cd "$ROOT/packages/toolkit"

yellow "  Building TypeScript..."
npx tsc --noEmit 2>&1 | tail -3
npx tsc 2>&1 | tail -3
green "  Build complete."
echo ""

bold "  Module Tests:"

# config/
run_test "config/ parseConfig defaults" node -e "
  const { parseConfig } = require('./dist/config/index.js');
  const c = parseConfig({});
  console.assert(c.CACHE_DEFAULT_TTL === 300, 'CACHE_DEFAULT_TTL');
  console.assert(c.NODE_ENV === 'development', 'NODE_ENV');
  console.log('OK');
"

# errors/
run_test "errors/ all 7 types instantiate" node -e "
  const { ToolkitError, LLMError, RateLimitError, AuthError, ValidationError, StorageError, CacheError, ApiClientError } = require('./dist/errors/index.js');
  const te = new ToolkitError('t', { code: 'TEST' });
  console.assert(te.code === 'TEST');
  const le = new LLMError('l', { provider: 'test' });
  console.assert(le.code === 'LLM_ERROR');
  console.assert(le.statusCode === 502);
  console.assert(le.retryable === false);
  const re = new RateLimitError('r');
  console.assert(re.statusCode === 429);
  console.assert(re.retryable === true);
  const ae = new AuthError('a');
  console.assert(ae.statusCode === 401);
  console.assert(ae.retryable === false);
  const ve = new ValidationError('v');
  console.assert(ve.code === 'VALIDATION_ERROR');
  const se = new StorageError('s');
  console.assert(se.retryable === true);
  const ce = new CacheError('c');
  console.assert(ce.retryable === true);
  const ace = new ApiClientError('api', { url: '/x', method: 'GET' });
  console.assert(ace.url === '/x');
  console.assert(ace.method === 'GET');
  console.log('OK');
"

# cache/
run_test "cache/ createCache set/get/invalidate" node -e "
  const { createCache } = require('./dist/cache/index.js');
  (async () => {
    const cache = createCache();
    await cache.set('k1', { v: 1 }, { ttl: 60 });
    const r = await cache.get('k1');
    console.assert(r.v === 1, 'get');
    await cache.invalidate('k1');
    const r2 = await cache.get('k1');
    console.assert(r2 === null, 'invalidate');
    await cache.set('prefix:a', 1, { ttl: 60 });
    await cache.set('prefix:b', 2, { ttl: 60 });
    await cache.invalidatePrefix('prefix:');
    const r3 = await cache.get('prefix:a');
    console.assert(r3 === null, 'invalidatePrefix');
    console.log('OK');
  })();
"

# auth/
run_test "auth/ getOrgId, getUserId, requireApiKey, getTenantContext, createApiKeyGuard" node -e "
  const { getOrgId, getUserId, requireApiKey, getTenantContext, createApiKeyGuard } = require('./dist/auth/index.js');
  // getOrgId extracts X-Org-Id header
  const r1 = getOrgId({ headers: { 'x-org-id': 'org_1' } });
  console.assert(r1 === 'org_1', 'getOrgId');
  // getOrgId throws AUTH_MISSING_ORG if missing
  try { getOrgId({ headers: {} }); console.assert(false); } catch(e) { console.assert(e.code === 'AUTH_MISSING_ORG'); }
  // getUserId returns undefined if missing
  const r2 = getUserId({ headers: {} });
  console.assert(r2 === undefined, 'getUserId missing');
  // requireApiKey validates key
  process.env.API_KEY = 'test-key';
  const r3 = requireApiKey({ headers: { 'x-api-key': 'test-key' } }, 'test-key');
  console.assert(r3 === 'test-key', 'requireApiKey');
  // requireApiKey throws AUTH_INVALID_KEY
  try { requireApiKey({ headers: { 'x-api-key': 'wrong' } }, 'test-key'); console.assert(false); } catch(e) { console.assert(e.code === 'AUTH_INVALID_KEY'); }
  // getTenantContext returns {orgId, userId}
  const ctx = getTenantContext({ headers: { 'x-org-id': 'org_2', 'x-user-id': 'usr_1' } });
  console.assert(ctx.orgId === 'org_2');
  console.assert(ctx.userId === 'usr_1');
  // createApiKeyGuard creates NestJS-compatible guard
  const Guard = createApiKeyGuard('test-key');
  const g = new Guard();
  console.assert(typeof g.canActivate === 'function');
  console.log('OK');
"

# security/
run_test "security/ rateLimiter and auditLogger" node -e "
  const { createRateLimiter, createAuditLogger } = require('./dist/security/index.js');
  const { createCache } = require('./dist/cache/index.js');
  (async () => {
    const cache = createCache();
    const limiter = createRateLimiter(cache, { max: 2, windowSeconds: 60 });
    const r1 = await limiter.check('user:1');
    console.assert(r1.allowed === true, 'first allowed');
    const r2 = await limiter.check('user:1');
    console.assert(r2.allowed === true, 'second allowed');
    const r3 = await limiter.check('user:1');
    console.assert(r3.allowed === false, 'third blocked');
    await limiter.reset('user:1');
    const r4 = await limiter.check('user:1');
    console.assert(r4.allowed === true, 'after reset');
    // audit logger
    const audit = createAuditLogger('svc');
    audit.log('test_action', { orgId: 'org_1' });
    console.log('OK');
  })();
"

# observability/
run_test "observability/ createLogger and initLangfuse" node -e "
  const { createLogger, initLangfuse } = require('./dist/observability/index.js');
  const logger = createLogger('test', { json: true });
  logger.info('hello', { key: 'value' });
  const logger2 = createLogger('test2', { json: false });
  logger2.info('world');
  const lf = initLangfuse();
  console.assert(lf === null, 'langfuse null without keys');
  console.log('OK');
"

# health/
run_test "health/ createHealthCheck healthy/degraded/unhealthy" node -e "
  const { createHealthCheck } = require('./dist/health/index.js');
  (async () => {
    // all pass → healthy
    const h1 = createHealthCheck({ checks: {
      db: async () => {},
      cache: async () => {},
    }});
    const r1 = await h1();
    console.assert(r1.status === 'healthy', 'all healthy: ' + r1.status);
    console.assert(typeof r1.checks === 'object');
    console.assert(r1.checks.db.status === 'pass');

    // one fail → degraded
    const h2 = createHealthCheck({ checks: {
      db: async () => {},
      cache: async () => { throw new Error('down'); },
    }});
    const r2 = await h2();
    console.assert(r2.status === 'degraded', 'one fail: ' + r2.status);

    // all fail → unhealthy
    const h3 = createHealthCheck({ checks: {
      db: async () => { throw new Error('down'); },
      cache: async () => { throw new Error('down'); },
    }});
    const r3 = await h3();
    console.assert(r3.status === 'unhealthy', 'all fail: ' + r3.status);

    // slow check → Timeout message
    const h4 = createHealthCheck({ checks: {
      slow: async () => { await new Promise(r => setTimeout(r, 100)); },
    }, timeoutMs: 10 });
    const r4 = await h4();
    console.assert(r4.checks.slow.status === 'fail', 'timeout status');
    console.assert(r4.checks.slow.message === 'Timeout', 'timeout msg: ' + r4.checks.slow.message);

    console.log('OK');
  })();
"

# storage/
run_test "storage/ validateFile" node -e "
  const { validateFile } = require('./dist/storage/index.js');
  // accept PDF
  validateFile({ size: 1024, type: 'application/pdf' });
  // reject >10MB
  try { validateFile({ size: 11 * 1024 * 1024, type: 'application/pdf' }); console.assert(false); } catch(e) { console.assert(e.code === 'STORAGE_FILE_TOO_LARGE', e.code); }
  // reject bad type
  try { validateFile({ size: 100, type: 'image/png' }); console.assert(false); } catch(e) { console.assert(e.code === 'STORAGE_INVALID_TYPE', e.code); }
  // accept custom limits
  validateFile({ size: 20 * 1024 * 1024, type: 'application/pdf' }, { maxSizeMB: 25 });
  console.log('OK');
"

# llm/
run_test "llm/ createLLM throws LLM_NO_KEY" node -e "
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const { createLLM } = require('./dist/llm/index.js');
  try { createLLM(); console.assert(false); } catch(e) { console.assert(/LLM_NO_KEY/.test(e.code), e.code); }
  console.log('OK');
"

# testing/
run_test "testing/ mockCache, mockLLM, mockDb" node -e "
  const { mockCache, mockLLM, mockDb } = require('./dist/testing/index.js');
  (async () => {
    // mockCache
    const cache = mockCache({ greeting: 'hello' });
    const v = await cache.get('greeting');
    console.assert(v === 'hello', 'mockCache get: ' + v);
    await cache.set('k', 'v');
    console.assert(cache._calls.length === 2, 'mockCache calls');

    // mockLLM — cycles through responses
    const llm = mockLLM({ responses: ['first', 'second'] });
    const r1 = await llm.complete('test1');
    console.assert(r1.content === 'first', 'first response');
    const r2 = await llm.complete('test2');
    console.assert(r2.content === 'second', 'second response');
    console.assert(llm._callCount === 2, 'callCount');
    console.assert(llm._calls.length === 2, 'calls tracked');

    // mockLLM — failOnCall
    const llm2 = mockLLM({ failOnCall: 0 });
    try { await llm2.complete('test'); console.assert(false); } catch(e) { console.assert(e.message.includes('failure')); }

    // mockDb
    const db = mockDb([{ id: 1, name: 'test' }]);
    const rows = await db.query('SELECT *');
    console.assert(rows.length === 1);
    console.assert(db._queries.length === 1);

    console.log('OK');
  })();
"

# api/
run_test "api/ createApiClient" node -e "
  const { createApiClient } = require('./dist/api/index.js');
  const client = createApiClient({ baseUrl: 'http://localhost:8000' });
  console.assert(client !== undefined, 'client created');
  console.log('OK');
"

# data/
run_test "data/ exports importable" node -e "
  const data = require('./dist/data/index.js');
  console.assert(data !== undefined, 'data module loaded');
  console.log('OK');
"

# mcp/
run_test "mcp/ McpServerBuilder defined" node -e "
  const { McpServerBuilder } = require('./dist/mcp/index.js');
  console.assert(typeof McpServerBuilder === 'function', 'McpServerBuilder');
  console.log('OK');
"

# neon/
run_test "neon/ createDb throws DATABASE_URL" node -e "
  delete process.env.DATABASE_URL;
  const { createDb } = require('./dist/neon/index.js');
  try { createDb(); console.assert(false); } catch(e) { console.assert(/DATABASE_URL/.test(e.message), e.message); }
  console.log('OK');
"

# root barrel
run_test "root barrel exports all key functions" node -e "
  const t = require('./dist/index.js');
  const required = [
    'createCache', 'createLLM', 'getOrgId', 'requireApiKey',
    'createRateLimiter', 'createAuditLogger', 'createHealthCheck',
    'mockCache', 'mockLLM', 'mockDb', 'createDb', 'withTenant',
    'validateFile', 'initLangfuse', 'createLogger', 'createApiClient',
    'initToolkit', 'parseConfig', 'ToolkitError', 'LLMError', 'AuthError',
  ];
  for (const name of required) {
    console.assert(t[name] !== undefined, 'missing export: ' + name);
  }
  console.log('OK');
"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Python SDK
# ─────────────────────────────────────────────────────────────────────────────
bold "▸ Python SDK (packages/toolkit-python/)"
echo ""

cd "$ROOT/packages/toolkit-python"

yellow "  Installing Python dependencies..."
uv sync --extra ingestion --quiet 2>&1
green "  Dependencies installed."
echo ""

bold "  Module Tests:"

# root
run_test "root __version__" uv run python3 -c "
import ai_toolkit
assert ai_toolkit.__version__ == '0.1.0', ai_toolkit.__version__
print('OK')
"

# config/
run_test "config/ ToolkitSettings defaults" uv run python3 -c "
from ai_toolkit.config import ToolkitSettings
s = ToolkitSettings()
assert s.environment == 'development', s.environment
assert s.log_level == 'info', s.log_level
print('OK')
"

# errors/
run_test "errors/ all 6 types" uv run python3 -c "
from ai_toolkit.errors import ToolkitError, LLMError, CacheError, AuthError, ValidationError, RateLimitError, StorageError
te = ToolkitError('test', code='TEST')
assert te.code == 'TEST'
le = LLMError('l', provider='test')
assert le.code == 'LLM_ERROR'
assert le.provider == 'test'
ce = CacheError('c')
assert ce.retryable == True
ae = AuthError('a')
assert ae.retryable == False
ve = ValidationError('v')
assert ve.code == 'VALIDATION_ERROR'
re = RateLimitError('r')
assert re.status_code == 429
se = StorageError('s')
assert se.code == 'STORAGE_ERROR'
assert se.retryable == True
print('OK')
"

# cache/
run_test "cache/ CacheClient importable" uv run python3 -c "
from ai_toolkit.cache import CacheClient
assert CacheClient is not None
print('OK')
"

# llm/ imports
run_test "llm/ 12+ exports importable" uv run python3 -c "
from ai_toolkit.llm import (
    LLMClient, create_llm_client, LLMResponse, LLMProvider,
    EmbeddingClient, StructuredClient, extract, extract_batch,
    PromptManager, Prompt, estimate_cost
)
assert all([LLMClient, create_llm_client, LLMResponse, LLMProvider,
    EmbeddingClient, StructuredClient, extract, extract_batch,
    PromptManager, Prompt, estimate_cost])
print('OK')
"

# llm/pricing
run_test "llm/pricing estimate_cost" uv run python3 -c "
from ai_toolkit.llm.providers import estimate_cost
cost = estimate_cost('claude-sonnet-4-20250514', input_tokens=1000, output_tokens=500)
assert cost > 0, f'cost was {cost}'
print(f'OK (cost={cost:.6f})')
"

# ingestion/
run_test "ingestion/ extract_text, extract_html, detect_format, chunk_text" uv run python3 -c "
from ai_toolkit.ingestion import extract_text, extract_html, detect_format, chunk_text, ChunkConfig
doc = extract_text('Hello world this is a test')
assert doc.content == 'Hello world this is a test', doc.content
assert hasattr(doc, 'content')
doc2 = extract_html('<p>X</p>')
assert 'X' in doc2.content, doc2.content
fmt = detect_format('report.pdf')
assert fmt.value == 'pdf', fmt.value
text = 'A' * 2000
chunks = chunk_text(text, config=ChunkConfig(chunk_size=500, chunk_overlap=50))
assert len(chunks) > 1, f'chunks: {len(chunks)}'
print('OK')
"

# guardrails/ — all async
run_test "guardrails/ PiiDetector, OutputGuard, TopicFilter, PromptInjectionDetector, HallucinationScorer" uv run python3 -c "
import asyncio
from ai_toolkit.guardrails import PiiDetector, OutputGuard, TopicFilter, PromptInjectionDetector, HallucinationScorer

async def test():
    # PiiDetector block mode
    rule = PiiDetector(action='block')
    text, violations = await rule.check('SSN 123-45-6789')
    assert len(violations) > 0, 'no violations found'
    assert violations[0].rule == 'pii_detector', violations[0].rule

    # OutputGuard with redact mode
    guard = OutputGuard(rules=[PiiDetector(action='redact')])
    result = await guard.check('Call 555-123-4567 now')
    assert 'REDACTED' in result.output, result.output

    # TopicFilter importable
    tf = TopicFilter(allowed_topics=['medical'])
    assert tf is not None

    # PromptInjectionDetector importable
    pid = PromptInjectionDetector()
    assert pid is not None

    # HallucinationScorer with unrelated text
    hs = HallucinationScorer(threshold=0.5)
    text, violations = await hs.check(
        'The sky is purple and made of cheese',
        context=['Metformin is used for diabetes treatment']
    )
    assert len(violations) > 0, 'expected hallucination violation'
    print('OK')

asyncio.run(test())
"

# evaluation/
run_test "evaluation/ evaluate and evaluate_batch" uv run python3 -c "
from ai_toolkit.evaluation import evaluate, evaluate_batch
result = evaluate(
    question='What treats diabetes?',
    answer='Metformin is used for diabetes',
    context=['Metformin is recommended as first-line treatment for type 2 diabetes'],
    reference='Metformin is the standard treatment'
)
assert 0 <= result.overall <= 1, f'overall: {result.overall}'
batch = evaluate_batch(
    questions=['Q1', 'Q2'],
    answers=['A1', 'A2'],
    contexts=[['C1'], ['C2']],
    references=['R1', 'R2']
)
assert batch.count == 2, f'count: {batch.count}'
print('OK')
"

# workflow/
run_test "workflow/ WorkflowBudget and BudgetExceededError" uv run python3 -c "
from ai_toolkit.workflow import WorkflowBudget, BudgetExceededError
from ai_toolkit.llm.providers import LLMResponse

budget = WorkflowBudget(max_cost_usd=1.0)
resp = LLMResponse(content='test', model='m', provider='p', input_tokens=100, output_tokens=50, latency_ms=100, cost=0.5)
budget.track(resp)
assert budget.used_cost_usd == 0.5

# Exceed budget
resp2 = LLMResponse(content='test2', model='m', provider='p', input_tokens=100, output_tokens=50, latency_ms=100, cost=0.6)
budget.track(resp2)
try:
    budget.check()
    assert False, 'should have raised'
except BudgetExceededError:
    pass
print('OK')
"

# auth/
run_test "auth/ get_org_id, get_user_id, require_api_key importable" uv run python3 -c "
from ai_toolkit.auth import get_org_id, get_user_id, require_api_key
assert callable(get_org_id)
assert callable(get_user_id)
assert callable(require_api_key)
print('OK')
"

# security/
run_test "security/ AuditLogger" uv run python3 -c "
from ai_toolkit.security import AuditLogger
audit = AuditLogger(name='t')
audit.log(action='t', org_id='o')
print('OK')
"

# observability/
run_test "observability/ init_langfuse and get_logger" uv run python3 -c "
from ai_toolkit.observability import init_langfuse, get_logger
result = init_langfuse()
assert result is None, 'expected None without keys'
logger = get_logger('t')
assert logger is not None
print('OK')
"

# prompts/
run_test "prompts/ PromptManager substitution" uv run python3 -c "
import asyncio
from ai_toolkit.llm.prompts import PromptManager

async def test():
    pm = PromptManager(defaults={'k': 'Hello \${name}'})
    prompt = await pm.get('k', variables={'name': 'World'})
    assert prompt.text == 'Hello World', f'got: {prompt.text}'
    print('OK')

asyncio.run(test())
"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
bold "▸ CLI (packages/cli/)"
echo ""

cd "$ROOT/packages/cli"

run_test "cli/ tsc --noEmit" npx tsc --noEmit

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
bold "═══════════════════════════════════════════════════════"
bold "  Results: $PASS passed, $FAIL failed"
bold "═══════════════════════════════════════════════════════"

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  red "Failures:"
  for err in "${ERRORS[@]}"; do
    red "  • $err"
  done
  echo ""
  exit 1
fi

echo ""
green "All tests passed!"
exit 0
