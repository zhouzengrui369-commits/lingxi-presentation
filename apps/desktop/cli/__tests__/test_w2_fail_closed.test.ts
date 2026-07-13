import { spawn, spawnSync } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import {
  W2_FAIL_CLOSED_CASES,
  runW2FailClosedCases,
  isValidPptx,
  isValidPdf,
} from '../real-runtime-validate';

async function killAllDaemons() {
  try {
    spawnSync('pkill', ['-9', '-f', 'daemon.server']);
  } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 1500));
}

describe('W2 fail-closed: 7 negative + 1 positive', () => {
  beforeAll(async () => {
    await killAllDaemons();
  });
  afterAll(async () => {
    await killAllDaemons();
  });

  // Increase timeout to 60s per case (each case starts/stops a daemon)
  jest.setTimeout(60_000);

  it('runs 7 negative + 1 positive = 8/8 stable', async () => {
    const result = await runW2FailClosedCases({ LINGXI_DAEMON_PORT: '50998' });
    console.log('Verdict:', result.verdict);
    console.log('Pass:', result.passCount, 'Fail:', result.failCount);
    for (const c of result.results) {
      console.log(`  ${c.verdictPass ? '✓' : '✗'} ${c.id} (${c.isPositive ? 'positive' : 'negative'}): ${c.detail}`);
    }
    expect(result.verdict).toBe('PASS');
  }, 240_000);
});
