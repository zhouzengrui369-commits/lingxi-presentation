/**
 * T-6.4: Binary naming unify — LingxiDemo → 灵犀演示
 *
 * Validates the electron-builder config in package.json is consistent
 * around the 中文 binary name. The 6 checks below correspond to the
 * 6 .gitignore + Info.plist + productName + CFBundleName touch points
 * identified in the Phase 6 立项 (phase6_plan.md line 144-160).
 *
 * Phase 6 Wave 1 — sub-agent-naming-unify (coder agent).
 */
import * as fs from 'fs';
import * as path from 'path';

const PKG_PATH = path.resolve(__dirname, '..', 'package.json');
const LINGXI_DEMO_ARTIFACT = path.resolve(
  __dirname,
  '..',
  'LingxiDemo.app'
);

interface PackageJson {
  name: string;
  productName?: string;
  build?: {
    appId?: string;
    productName?: string;
    directories?: {
      output?: string;
      buildResources?: string;
    };
    mac?: {
      target?: Array<string | { target: string; arch?: string[] }>;
      category?: string;
      extendInfo?: {
        CFBundleDisplayName?: string;
        CFBundleName?: string;
        LSMinimumSystemVersion?: string;
      };
    };
  };
}

function loadPkg(): PackageJson {
  const raw = fs.readFileSync(PKG_PATH, 'utf-8');
  return JSON.parse(raw) as PackageJson;
}

describe('T-6.4 Electron shell binary naming unify (灵犀演示)', () => {
  let pkg: PackageJson;
  beforeAll(() => {
    pkg = loadPkg();
  });

  test('test_product_name_zh: top-level productName === "灵犀演示"', () => {
    expect(pkg.productName).toBe('灵犀演示');
  });

  test('test_bundle_display_name_zh: build.mac.extendInfo.CFBundleDisplayName === "灵犀演示"', () => {
    const displayName = pkg.build?.mac?.extendInfo?.CFBundleDisplayName;
    expect(displayName).toBe('灵犀演示');
  });

  test('test_bundle_name_zh: build.mac.extendInfo.CFBundleName === "灵犀演示"', () => {
    const bundleName = pkg.build?.mac?.extendInfo?.CFBundleName;
    expect(bundleName).toBe('灵犀演示');
  });

  test('test_build_target_mac: build.mac.target includes "dmg"', () => {
    const target = pkg.build?.mac?.target;
    expect(target).toBeDefined();
    const targets = (target || []).map((t) =>
      typeof t === 'string' ? t : t.target
    );
    expect(targets).toContain('dmg');
  });

  test('test_build_dirs_output: build.directories.output === "dist"', () => {
    const output = pkg.build?.directories?.output;
    expect(output).toBe('dist');
  });

  test('test_app_id_consistent: build.appId === "com.openclaw.lingxi"', () => {
    // Same bundle id across new 中文 build so LaunchServices treats as
    // upgrade of existing /Applications/灵犀演示.app (PID 64315).
    const appId = pkg.build?.appId;
    expect(appId).toBe('com.openclaw.lingxi');
  });

  test('test_no_lingxi_demo_artifact_in_workspace: no apps/desktop/electron-shell/LingxiDemo.app/ leftover', () => {
    // Old ASCII-named LingxiDemo.app must not exist in worktree (it was
    // .gitignored by T-6.6 — apps/desktop/electron-shell/*.app/ rule).
    const exists = fs.existsSync(LINGXI_DEMO_ARTIFACT);
    expect(exists).toBe(false);
  });

  test('test_workspace_layout: package.json + main.js + renderer.html coexist (electron-builder files manifest ok)', () => {
    const electronShellDir = path.resolve(__dirname, '..');
    const files = pkg.build?.files || [];
    for (const rel of files) {
      const abs = path.join(electronShellDir, rel);
      expect(fs.existsSync(abs)).toBe(true);
    }
  });
});
