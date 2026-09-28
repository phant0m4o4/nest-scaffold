import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function findCommand(command: string): string | undefined {
  try {
    return execFileSync(
      '/bin/bash',
      ['-c', 'command -v "$1"', 'bash', command],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
  } catch {
    return undefined;
  }
}

const rsyncPath = findCommand('rsync');
const fixtureName = 'fixture-user';
const fixtureEmail = '12345+fixture-user@users.noreply.github.com';

describe('项目初始化脚本', () => {
  let testDir: string;
  let sourceDir: string;
  let binaryDir: string;
  let gitPath: string;

  function isolatedEnvironment(path = binaryDir): NodeJS.ProcessEnv {
    return {
      PATH: path,
      GIT_CONFIG_GLOBAL: join(testDir, 'global.gitconfig'),
      GIT_CONFIG_NOSYSTEM: '1',
    };
  }

  function sourceGit(...args: string[]): string {
    return execFileSync(gitPath, ['-C', sourceDir, ...args], {
      env: isolatedEnvironment(),
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  }

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'nest-scaffold-bootstrap-'));
    sourceDir = join(testDir, 'source scaffold');
    binaryDir = join(testDir, 'bin');
    await mkdir(binaryDir);
    await writeFile(
      join(testDir, 'global.gitconfig'),
      '[commit]\n\tgpgsign = false\n',
    );

    // 隔离 PATH，确保 tar 用例真的运行无 rsync 的备用分支。
    for (const command of [
      'dirname',
      'mkdir',
      'cp',
      'sed',
      'cat',
      'python3',
      'git',
      'tar',
    ]) {
      const commandPath = findCommand(command);
      if (!commandPath) {
        throw new Error(`初始化脚本测试缺少命令: ${command}`);
      }
      await symlink(commandPath, join(binaryDir, command));
      if (command === 'git') gitPath = commandPath;
    }

    // 全部内容为合成数据，不复制真实 .env、密钥或本地 AI 设置。
    const fixtureFiles: Record<string, string> = {
      'package.json': JSON.stringify({
        name: 'original-app',
        version: '9.9.9',
      }),
      '.gitignore': '.env\n.env.*\n!.env.example\n',
      '.env.example': 'APP_NAME=original-app\nREDIS_HOST=localhost\n',
      'AGENTS.md': '# 开发约定\n\n[文档](docs/README.md)\n',
      'src/app/app.module.ts': '// 业务源码\n',
      'docs/README.md': '# 开发文档\n',
      'docs/getting-started.md': '# 快速开始\n',
      'docs/deployment.md': '# 部署说明\n',
      'scripts/templates/schema.ts.tpl': '// 生成模板\n',
      '.env': 'LOCAL_SECRET=fixture-private-value\n',
      '.env.production': 'LOCAL_SECRET=fixture-private-value\n',
      '.ssh/id_fixture': 'fixture-private-value',
      '.claude/settings.local.json': '{"private":"fixture-private-value"}',
      '.claude/skills/unused/SKILL.md': '不应复制的旧工具文件',
      '.git/old-history': '不应复制的旧提交历史',
      'node_modules/dependency/index.js': '不应复制的依赖',
      'dist/app.js': '不应复制的构建产物',
      'coverage/index.html': '不应复制的覆盖率产物',
      '.tmp/local-file': '不应复制的临时文件',
      'logs/app.log': '不应复制的日志',
      '.DS_Store': '不应复制的系统元数据',
      'src/app/.DS_STORE': '不应复制的嵌套系统元数据',
      'src/app/._app.module.ts': '不应复制的系统元数据',
    };
    for (const [file, content] of Object.entries(fixtureFiles)) {
      const path = join(sourceDir, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    await copyFile(
      resolve('scripts/bootstrap.sh'),
      join(sourceDir, 'scripts/bootstrap.sh'),
    );
    sourceGit('init', '-q', '-b', 'main', '--template=');
    sourceGit('config', '--local', 'user.name', fixtureName);
    sourceGit('config', '--local', 'user.email', fixtureEmail);
    sourceGit('add', '.');
    sourceGit('commit', '-qm', 'fixture initial');
  });

  afterAll(async () => {
    if (testDir) await rm(testDir, { recursive: true, force: true });
  });

  for (const copyMode of ['rsync', 'tar']) {
    it.skipIf(copyMode === 'rsync' && !rsyncPath)(
      `${copyMode} 应当保留源码和文档、过滤本地文件，并初始化独立 Git 仓库`,
      async () => {
        const modeBinaryDir = join(testDir, `${copyMode}-bin`);
        await mkdir(modeBinaryDir);
        if (copyMode === 'rsync' && rsyncPath) {
          await symlink(rsyncPath, join(modeBinaryDir, 'rsync'));
        }
        const targetDir = join(testDir, `generated ${copyMode}`);
        const env = isolatedEnvironment(`${modeBinaryDir}:${binaryDir}`);
        const output = execFileSync(
          '/bin/bash',
          [join(sourceDir, 'scripts/bootstrap.sh'), targetDir, 'sample-api'],
          {
            cwd: testDir,
            env,
            timeout: 15_000,
            encoding: 'utf8',
            stdio: 'pipe',
          },
        );
        expect(output).toContain('项目已创建');
        expect(output).not.toContain(fixtureName);
        expect(output).not.toContain(fixtureEmail);
        expect(output.indexOf('检查并修改 .env')).toBeLessThan(
          output.indexOf('docker compose'),
        );
        expect(
          JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')),
        ).toEqual({ name: 'sample-api', version: '0.0.1' });
        const expectedEnv = 'APP_NAME=sample-api\nREDIS_HOST=localhost\n';
        expect(await readFile(join(targetDir, '.env'), 'utf8')).toBe(
          expectedEnv,
        );
        expect(await readFile(join(targetDir, '.env.example'), 'utf8')).toBe(
          expectedEnv,
        );

        const files = await readdir(targetDir, { recursive: true });
        expect(files).toEqual(
          expect.arrayContaining([
            'AGENTS.md',
            'src/app/app.module.ts',
            'docs/README.md',
            'docs/getting-started.md',
            'docs/deployment.md',
            'scripts/bootstrap.sh',
            'scripts/templates/schema.ts.tpl',
          ]),
        );
        for (const excluded of [
          '.claude',
          '.ssh',
          '.env.production',
          '.git/old-history',
          'node_modules',
          'dist',
          'coverage',
          '.tmp',
          'logs',
          '.DS_Store',
          'src/app/.DS_STORE',
          'src/app/._app.module.ts',
        ]) {
          expect(files, excluded).not.toContain(excluded);
        }
        const git = (...args: string[]) =>
          execFileSync(gitPath, ['-C', targetDir, ...args], {
            env,
            encoding: 'utf8',
            stdio: 'pipe',
          }).trim();
        expect(git('branch', '--show-current')).toBe('main');
        expect(git('rev-list', '--count', 'HEAD')).toBe('1');
        expect(git('status', '--porcelain')).toBe('');
        expect(git('ls-files', '.env')).toBe('');
        expect(git('ls-files', '.env.example')).toBe('.env.example');
        expect(git('config', '--local', 'user.name')).toBe(fixtureName);
        expect(git('config', '--local', 'user.email')).toBe(fixtureEmail);
        expect(git('log', '-1', '--format=%an%n%ae')).toBe(
          `${fixtureName}\n${fixtureEmail}`,
        );
      },
    );
  }

  it.each(['源目录本身', '源目录内部', '符号链接指向源目录内部'])(
    '%s 应在创建目标或复制文件前拒绝',
    async (scenario) => {
      const guardBinaryDir = join(testDir, `guard-${scenario}`);
      await mkdir(guardBinaryDir);
      // 旧实现若漏掉路径检查，也只会遇到立即退出的复制替身，不发生自复制。
      await writeFile(join(guardBinaryDir, 'rsync'), '#!/bin/sh\nexit 79\n', {
        mode: 0o755,
      });
      let targetDir = sourceDir;
      let createdTarget: string | undefined;
      if (scenario === '源目录内部') {
        targetDir = './nested-project';
        createdTarget = join(sourceDir, 'nested-project');
      } else if (scenario === '符号链接指向源目录内部') {
        const alias = join(testDir, 'source-alias');
        await symlink(sourceDir, alias);
        targetDir = join(alias, 'nested-via-alias');
        createdTarget = join(sourceDir, 'nested-via-alias');
      }
      try {
        const result = spawnSync(
          '/bin/bash',
          [join(sourceDir, 'scripts/bootstrap.sh'), targetDir, 'sample-api'],
          {
            cwd: sourceDir,
            env: isolatedEnvironment(`${guardBinaryDir}:${binaryDir}`),
            timeout: 15_000,
            encoding: 'utf8',
          },
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('目标目录不能位于脚手架目录内');
        if (createdTarget) expect(existsSync(createdTarget)).toBe(false);
      } finally {
        if (createdTarget) {
          await rm(createdTarget, { recursive: true, force: true });
        }
      }
    },
  );

  it.each(['user.name', 'user.email'])(
    '源仓库缺少 %s 时应在创建目标前失败',
    (key) => {
      const targetDir = join(testDir, `missing-${key}`);
      sourceGit('config', '--local', '--unset', key);
      try {
        const result = spawnSync(
          '/bin/bash',
          [join(sourceDir, 'scripts/bootstrap.sh'), targetDir, 'sample-api'],
          {
            cwd: testDir,
            env: isolatedEnvironment(),
            timeout: 15_000,
            encoding: 'utf8',
          },
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          '源仓库必须配置 user.name 和 user.email',
        );
        expect(existsSync(targetDir)).toBe(false);
      } finally {
        sourceGit(
          'config',
          '--local',
          key,
          key === 'user.name' ? fixtureName : fixtureEmail,
        );
      }
    },
  );

  it('初始提交失败时应失败退出，不报告项目创建成功', async () => {
    const hookDir = join(testDir, 'failing-hooks');
    await mkdir(hookDir);
    await writeFile(join(hookDir, 'pre-commit'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    const failureConfig = join(testDir, 'failure.gitconfig');
    sourceGit('config', '--file', failureConfig, 'commit.gpgsign', 'false');
    sourceGit('config', '--file', failureConfig, 'core.hooksPath', hookDir);
    const result = spawnSync(
      '/bin/bash',
      [
        join(sourceDir, 'scripts/bootstrap.sh'),
        join(testDir, 'commit-failure'),
        'sample-api',
      ],
      {
        cwd: testDir,
        env: {
          ...isolatedEnvironment(),
          GIT_CONFIG_GLOBAL: failureConfig,
        },
        timeout: 15_000,
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('初始 commit 完成');
    expect(result.stdout).not.toContain('项目已创建');
  });

  it.each([
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_TEMPLATE_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_QUARANTINE_PATH',
    'GIT_GRAFT_FILE',
    'GIT_SHALLOW_FILE',
    'GIT_NAMESPACE',
    'GIT_REPLACE_REF_BASE',
    'GIT_CEILING_DIRECTORIES',
    'GIT_DISCOVERY_ACROSS_FILESYSTEM',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL',
    'GIT_TRACE',
    'GIT_TRACE_SETUP',
    'GIT_TRACE2',
    'GIT_TRACE2_EVENT',
    'GIT_TRACE2_PERF',
  ])('%s 应在任何 Git 调用和文件写入前拒绝', async (variable) => {
    const guardBinaryDir = join(testDir, `git-guard-${variable}`);
    await mkdir(guardBinaryDir);
    // 旧实现若越过环境检查，也不能通过本次回归触碰源仓库。
    await writeFile(join(guardBinaryDir, 'git'), '#!/bin/sh\nexit 79\n', {
      mode: 0o755,
    });
    const targetDir = join(testDir, `blocked-${variable}`);
    const inheritedValue = 'fixture-value-must-not-be-printed';
    const originalHead = sourceGit('rev-parse', 'HEAD');
    const originalIndex = await readFile(join(sourceDir, '.git/index'));
    const originalConfig = await readFile(join(sourceDir, '.git/config'));
    const result = spawnSync(
      '/bin/bash',
      [join(sourceDir, 'scripts/bootstrap.sh'), targetDir, 'sample-api'],
      {
        cwd: testDir,
        env: {
          ...isolatedEnvironment(`${guardBinaryDir}:${binaryDir}`),
          [variable]: inheritedValue,
        },
        timeout: 15_000,
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(variable);
    expect(result.stdout + result.stderr).not.toContain(inheritedValue);
    expect(existsSync(targetDir)).toBe(false);
    expect(sourceGit('rev-parse', 'HEAD')).toBe(originalHead);
    expect(await readFile(join(sourceDir, '.git/index'))).toEqual(
      originalIndex,
    );
    expect(await readFile(join(sourceDir, '.git/config'))).toEqual(
      originalConfig,
    );
  });
});
