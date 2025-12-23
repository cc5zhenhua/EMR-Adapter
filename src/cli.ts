#!/usr/bin/env node
// CLI 入口文件

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { EMRType, type Credentials, type Session, type VisitNote } from './index.js';
import { AuthenticationService } from './services/authentication-service.js';
import { VisitNoteService } from './services/visit-note-service.js';
import { getSessionFilePath } from './transport/session-manager.js';

const program = new Command();

program
  .name('emr-adapter')
  .description('EMR Adapter CLI - 统一管理多个 EMR 系统的访问')
  .version('1.0.0');

// 登录命令
const loginCommand = program
  .command('login')
  .description('登录到指定的 EMR 系统')
  .requiredOption('-e, --emr <type>', `EMR 类型 (可选值: ${Object.values(EMRType).join(', ')})`, (value) => {
    const emrType = value.toLowerCase();
    if (!Object.values(EMRType).includes(emrType as EMRType)) {
      throw new Error(`Unsupported EMR type: ${value}. Supported types: ${Object.values(EMRType).join(', ')}`);
    }
    return emrType as EMRType;
  })
  .option('-u, --username <username>', '用户名')
  .option('-p, --password <password>', '密码')
  .option('--url <url>', 'EMR 基础 URL（可选）');

loginCommand.action(async (options: any) => {
    try {
      let { username, password } = options;

      // If username or password not provided, interactive input
      if (!username || !password) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Please enter username:',
            when: !username,
          },
          {
            type: 'password',
            name: 'password',
            message: 'Please enter password:',
            when: !password,
          },
        ]);
        username = username || answers.username;
        password = password || answers.password;
      }

      if (!username || !password) {
        console.error(chalk.red('错误: 用户名和密码都是必需的'));
        process.exit(1);
      }

      const credentials: Credentials = {
        username,
        password,
        baseUrl: options.url,
      };

      console.log(chalk.blue(`正在登录到 ${options.emr}...`));

      const authService = new AuthenticationService(options.emr);
      const session = await authService.authenticate(credentials);

      console.log(chalk.green('✓ Login successful!'));
      console.log(chalk.gray(`Session cookies: ${session.cookies.length} items`));
      if (session.tokens && Object.keys(session.tokens).length > 0) {
        console.log(chalk.gray(`Tokens: ${Object.keys(session.tokens).join(', ')}`));
      }

      // Save session to file
      const sessionPath = getSessionFilePath(options.emr);
      try {
        const sessionData = {
          ...session,
          expiresAt: session.expiresAt?.toISOString(),
        };
        writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');
        console.log(chalk.gray(`Session saved to: ${sessionPath}`));
      } catch (error: any) {
        console.warn(chalk.yellow(`Warning: Unable to save session: ${error.message}`));
      }

      // Output structured JSON (for debugging)
      if (process.env.DEBUG) {
        console.log(JSON.stringify({
          success: true,
          emr: options.emr,
          session: {
            cookiesCount: session.cookies.length,
            hasTokens: !!session.tokens,
          },
        }, null, 2));
      }
    } catch (error: any) {
      console.error(chalk.red('✗ Login failed:'), error.message);
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
  });

// Post visit note command
const postNoteCommand = program
  .command('post-note')
  .description('Post visit note to the specified EMR system')
  .requiredOption('-e, --emr <type>', `EMR 类型 (可选值: ${Object.values(EMRType).join(', ')})`, (value) => {
    const emrType = value.toLowerCase();
    if (!Object.values(EMRType).includes(emrType as EMRType)) {
      throw new Error(`Unsupported EMR type: ${value}. Supported types: ${Object.values(EMRType).join(', ')}`);
    }
    return emrType as EMRType;
  })
  .option('-f, --file <file>', '从 JSON 文件读取 visit note')
  .option('-i, --interactive', '交互式输入 visit note')
  .option('-u, --username <username>', '用户名（如果未登录）')
  .option('-p, --password <password>', '密码（如果未登录）')
  .option('--url <url>', 'EMR 基础 URL（可选）');

postNoteCommand.action(async (options: any) => {
    try {
      let visitNote: VisitNote | null = null;

      // 从文件读取或交互式输入
      if (options.file) {
        const fileContent = readFileSync(options.file, 'utf-8');
        const data = JSON.parse(fileContent);
        visitNote = {
          ...data,
          visitDate: data.visitDate ? new Date(data.visitDate) : new Date(),
        };
      } else if (options.interactive) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'visitId',
            message: 'Visit ID:',
            validate: (input) => !!input || 'Visit ID is required',
          },
          {
            type: 'input',
            name: 'patientId',
            message: 'Patient ID:',
            validate: (input) => !!input || 'Patient ID is required',
          },
          {
            type: 'input',
            name: 'caregiverId',
            message: 'Caregiver ID:',
            validate: (input) => !!input || 'Caregiver ID is required',
          },
          {
            type: 'input',
            name: 'visitDate',
            message: 'Visit Date (YYYY-MM-DD):',
            default: new Date().toISOString().split('T')[0],
            validate: (input) => {
          const date = new Date(input);
          return !isNaN(date.getTime()) || 'Invalid date format';
        },
          },
          {
            type: 'input',
            name: 'startTime',
            message: 'Start Time (HH:MM):',
          },
          {
            type: 'input',
            name: 'endTime',
            message: 'End Time (HH:MM):',
          },
          {
            type: 'input',
            name: 'note',
            message: 'Note Content:',
            validate: (input) => !!input || 'Note content is required',
          },
        ]);

        visitNote = {
          visitId: answers.visitId,
          patientId: answers.patientId,
          caregiverId: answers.caregiverId,
          visitDate: new Date(answers.visitDate),
          startTime: answers.startTime,
          endTime: answers.endTime,
          note: answers.note,
        };
      } else {
        console.error(chalk.red('错误: 必须提供 --file 或 --interactive 选项'));
        process.exit(1);
      }

      if (!visitNote) {
        console.error(chalk.red('错误: 无法创建 visit note'));
        process.exit(1);
      }

      // 创建 service 实例
      const visitNoteService = new VisitNoteService(options.emr);
      const adapter = visitNoteService.getAdapter();

      // 尝试加载已保存的 session
      const sessionPath = getSessionFilePath(options.emr);
      if (existsSync(sessionPath)) {
        try {
          const sessionData = JSON.parse(readFileSync(sessionPath, 'utf-8'));
          const session: Session = {
            cookies: sessionData.cookies || [],
            tokens: sessionData.tokens || {},
            ...(sessionData.expiresAt && { expiresAt: new Date(sessionData.expiresAt) }),
          };

          // 检查是否过期
          if (!session.expiresAt || new Date() < session.expiresAt) {
            const sessionManager = (adapter as any).sessionManager;
            if (sessionManager) {
              sessionManager.setSession(session);
              sessionManager.setSessionFilePath(sessionPath);
              console.log(chalk.gray('已加载保存的 session'));
            }
          }
        } catch (error) {
          // session 文件损坏，忽略
        }
      }

      // 检查是否需要登录
      if (!adapter.isAuthenticated()) {
        if (!options.username || !options.password) {
          console.error(chalk.red('错误: 需要先登录。请使用 --username 和 --password 选项，或先运行 login 命令'));
          process.exit(1);
        }

        console.log(chalk.blue('正在登录...'));
        const authService = new AuthenticationService(options.emr);
        const session = await authService.authenticate({
          username: options.username,
          password: options.password,
          baseUrl: options.url,
        });

        // 将新登录的 session 设置到当前 adapter
        const sessionManager = (adapter as any).sessionManager;
        if (sessionManager) {
          sessionManager.setSession(session);
          sessionManager.setSessionFilePath(sessionPath);
        }

        // 保存新登录的 session
        try {
          const sessionData = {
            ...session,
            expiresAt: session.expiresAt?.toISOString(),
          };
          writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');
        } catch (error: any) {
          console.warn(chalk.yellow(`警告: 无法保存 session: ${error.message}`));
        }
      }

      console.log(chalk.blue(`正在发布 visit note 到 ${options.emr}...`));
      const result = await visitNoteService.postVisitNote(visitNote);

      // 输出结果
      if (result.success) {
        console.log(chalk.green('✓ Visit note 发布成功!'));
      } else {
        console.log(chalk.yellow('⚠ Visit note 发布完成，但可能有警告'));
      }

      // 输出结构化 JSON
      const output = {
        success: result.success,
        emr: options.emr,
        visitId: result.visitId,
        timestamp: result.timestamp.toISOString(),
        request: result.request,
        response: result.response,
        error: result.error,
      };

      console.log(JSON.stringify(output, null, 2));
    } catch (error: any) {
      console.error(chalk.red('✗ 发布失败:'), error.message);
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
  });

// 解析命令行参数
// 如果没有提供任何参数，显示帮助信息
if (process.argv.length === 2) {
  program.help();
} else {
  program.parse();
}

