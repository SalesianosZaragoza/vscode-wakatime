import * as vscode from 'vscode';
// import * as azdata from 'azdata';
import * as child_process from 'child_process';

import { Dependencies } from './dependencies';
import { LogLevel } from './constants';
import { Options } from './options';
import { Logger } from './logger';
import { Libs } from './libs';

export class WakaTime {
  private appNames = {
    'Azure Data Studio': 'azdata',
    'SQL Operations Studio': 'sqlops',
    'Visual Studio Code': 'vscode',
    Onivim: 'onivim',
    'Onivim 2': 'onivim',
  };
  private agentName: string;
  private extension;
  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  private disposable: vscode.Disposable;
  private lastFile: string;
  private lastHeartbeat: number = 0;
  private extensionPath: string;
  private dependencies: Dependencies;
  private options: Options;
  private logger: Logger;
  private getCodingActivityTimeout: NodeJS.Timer;
  private fetchTodayInterval: number = 60000;
  private lastFetchToday: number = 0;
  private showStatusBar: boolean;
  private showCodingActivity: boolean;
  private global: boolean;
  private standalone: boolean;
  private disabled: boolean = true;

  constructor(extensionPath: string, logger: Logger, options: Options) {
    this.extensionPath = extensionPath;
    this.logger = logger;
    this.options = options;
  }

  public initialize(global: boolean, standalone: boolean): void {
    this.global = global;
    this.standalone = standalone;
    this.dependencies = new Dependencies(
      this.options,
      this.extensionPath,
      this.logger,
      this.global,
      this.standalone,
    );
    this.statusBar.command = COMMAND_DASHBOARD;

    let extension = vscode.extensions.getExtension('WakaTime.vscode-wakatime');
    this.extension = (extension != undefined && extension.packageJSON) || { version: '0.0.0' };
    this.logger.debug(`Initializing WakaTime v${this.extension.version}`);
    this.agentName = this.appNames[vscode.env.appName] || 'vscode';
    this.statusBar.text = '$(clock) WakaTime Initializing...';
    this.statusBar.show();

    this.setupEventListeners();

   
  }

  public promptForDebug(): void {
      if (!defaultVal || defaultVal !== 'true') defaultVal = 'false';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then(newVal => {
        if (newVal == null) return;
        this.options.setSetting('settings', 'debug', newVal);
        if (newVal === 'true') {
          this.logger.setLevel(LogLevel.DEBUG);
          this.logger.debug('Debug enabled');
        } else {
          this.logger.setLevel(LogLevel.INFO);
        }
      });
  }

  public promptToDisable(): void {
      if (!currentVal || currentVal !== 'true') currentVal = 'false';
      let items: string[] = ['disable', 'enable'];
      const helperText = currentVal === 'true' ? 'disabled' : 'enabled';
      let promptOptions = {
        placeHolder: `disable or enable (extension is currently "${helperText}")`,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then(newVal => {
        if (newVal !== 'enable' && newVal !== 'disable') return;
        this.disabled = newVal === 'disable';
        if (this.disabled) {
          this.setStatusBarVisibility(false);
          this.logger.debug('Extension disabled, will not report coding stats to dashboard.');
        } else {
          if (this.showStatusBar) this.setStatusBarVisibility(true);
          this.logger.debug('Extension enabled and reporting coding stats to dashboard.');
        }
      });
  }

  public promptStatusBarIcon(): void {
      if (!defaultVal || defaultVal !== 'false') defaultVal = 'true';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then(newVal => {
        if (newVal !== 'true' && newVal !== 'false') return;
        this.showStatusBar = newVal === 'true'; // cache setting to prevent reading from disc too often
        this.setStatusBarVisibility(this.showStatusBar);
      });
  }

  public promptStatusBarCodingActivity(): void {
      if (!defaultVal || defaultVal !== 'false') defaultVal = 'true';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then(newVal => {
        if (newVal !== 'true' && newVal !== 'false') return;
        if (newVal === 'true') {
          this.logger.debug('Coding activity in status bar has been enabled');
          this.showCodingActivity = true;
          this.getCodingActivity(true);
        } else {
          this.logger.debug('Coding activity in status bar has been disabled');
          this.showCodingActivity = false;
          if (this.statusBar.text.indexOf('Error') == -1) {
            this.statusBar.text = '$(clock)';
          }
        }
      });
  }

  public dispose() {
    this.statusBar.dispose();
    this.disposable.dispose();
    clearTimeout(this.getCodingActivityTimeout);
  }




  private setStatusBarVisibility(isVisible: boolean): void {
    if (isVisible) {
      this.statusBar.show();
      this.logger.debug('Status bar icon enabled.');
    } else {
      this.statusBar.hide();
      this.logger.debug('Status bar icon disabled.');
    }
  }

  private setupEventListeners(): void {
    // subscribe to selection change and editor activation events
    let subscriptions: vscode.Disposable[] = [];
    vscode.window.onDidChangeTextEditorSelection(this.onChange, this, subscriptions);
    vscode.window.onDidChangeActiveTextEditor(this.onChange, this, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, subscriptions);

    // create a combined disposable from both event subscriptions
    this.disposable = vscode.Disposable.from(...subscriptions);
  }

  private onChange(): void {
    this.onEvent(false);
  }

  private onSave(): void {
    this.onEvent(true);
  }

  private onEvent(isWrite: boolean): void {
    if (this.disabled) return;

    let editor = vscode.window.activeTextEditor;
    if (editor) {
      let doc = editor.document;
      if (doc) {
        let file: string = doc.fileName;
        if (file) {
          let time: number = Date.now();
          if (isWrite || this.enoughTimePassed(time) || this.lastFile !== file) {
            this.sendHeartbeat(file, isWrite);
            this.lastFile = file;
            this.lastHeartbeat = time;
          }
        }
      }
    }
  }

  private sendHeartbeat(file: string, isWrite: boolean): void {
        if (this.global === undefined || this.standalone === undefined) return;
        if (this.global || this.standalone) {
          this._sendHeartbeat(file, isWrite);
        } 
      
  }

  private _sendHeartbeat(file: string, isWrite: boolean, pythonBinary?: string): void {
    let cli = this.dependencies.getCliLocation(this.global, this.standalone);
    let user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    let args = ['--file', Libs.quote(file), '--plugin', Libs.quote(user_agent)];
    if (!(this.global || this.standalone)) args.unshift(cli);
    let project = this.getProjectName(file);
    if (project) args.push('--alternate-project', Libs.quote(project));
    if (isWrite) args.push('--write');

    const binary = this.standalone || !pythonBinary ? cli : pythonBinary;
    this.logger.debug(`Sending heartbeat: ${this.formatArguments(binary, args)}`);
    const options = {
      windowsHide: true,
    };
    let process = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
      if (error != null) {
        if (stderr && stderr.toString() != '') this.logger.error(stderr.toString());
        if (stdout && stdout.toString() != '') this.logger.error(stdout.toString());
        this.logger.error(error.toString());
      }
    });
    process.on('close', (code, _signal) => {
      if (code == 0) {
        if (this.showStatusBar) {
          if (!this.showCodingActivity) this.statusBar.text = '$(clock)';
          this.getCodingActivity();
        }
        let today = new Date();
        this.logger.debug(`last heartbeat sent ${this.formatDate(today)}`);
      } else {
        let error_msg = `Unknown Error (${code}); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.statusBar.text = '$(clock) WakaTime Error';
          this.statusBar.tooltip = `WakaTime: ${error_msg}`;
        }
        this.logger.error(error_msg);
      }
    });
  }

  private getCodingActivity(force: boolean = false) {
    if (!this.showCodingActivity || !this.showStatusBar) return;
    const cutoff = Date.now() - this.fetchTodayInterval;
    if (!force && this.lastFetchToday > cutoff) return;

    this.lastFetchToday = Date.now();
    this.getCodingActivityTimeout = setTimeout(this.getCodingActivity, this.fetchTodayInterval);

      if (this.standalone) {
        this._getCodingActivity();
      } 
  }

  private _getCodingActivity(pythonBinary?: string) {
    let cli = this.dependencies.getCliLocation(this.global, this.standalone);
    let user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    let args = ['--today', '--plugin', Libs.quote(user_agent)];
    if (!this.standalone) args.unshift(cli);

    const binary = this.standalone || !pythonBinary ? cli : pythonBinary;
    this.logger.debug(
      `Fetching coding activity for Today from api: ${this.formatArguments(binary, args)}`,
    );
    const options = {
      windowsHide: true,
    };
    let process = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
      if (error != null) {
        if (stderr && stderr.toString() != '') this.logger.error(stderr.toString());
        if (stdout && stdout.toString() != '') this.logger.error(stdout.toString());
        this.logger.error(error.toString());
      }
    });
    let output = '';
    if (process.stdout) {
      process.stdout.on('data', (data: string | null) => {
        if (data) output += data;
      });
    }
    process.on('close', (code, _signal) => {
      if (code == 0) {
        if (output && this.showStatusBar && this.showCodingActivity) {
          this.statusBar.text = `$(clock) ${output}`;
          this.statusBar.tooltip = `WakaTime: You coded ${output.trim()} today.`;
        }
      } else if (code == 102) {
        // noop, working offline
      } else {
        let error_msg = `Error fetching today coding activity (${code}); Check your ${this.options.getLogFile()} file for more details`;
        this.logger.debug(error_msg);
      }
    });
  }

  private formatDate(date: Date): String {
    let months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    let ampm = 'AM';
    let hour = date.getHours();
    if (hour > 11) {
      ampm = 'PM';
      hour = hour - 12;
    }
    if (hour == 0) {
      hour = 12;
    }
    let minute = date.getMinutes();
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hour}:${
      minute < 10 ? `0${minute}` : minute
    } ${ampm}`;
  }

  private enoughTimePassed(time: number): boolean {
    return this.lastHeartbeat + 120000 < time;
  }

  private getProjectName(file: string): string {
    let uri = vscode.Uri.file(file);
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (vscode.workspace && workspaceFolder) {
      try {
        return workspaceFolder.name;
      } catch (e) {}
    }
    return '';
  }

  private obfuscateKey(key: string): string {
    let newKey = '';
    if (key) {
      newKey = key;
      if (key.length > 4)
        newKey = 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX' + key.substring(key.length - 4);
    }
    return newKey;
  }

  private wrapArg(arg: string): string {
    if (arg.indexOf(' ') > -1) return '"' + arg.replace(/"/g, '\\"') + '"';
    return arg;
  }

  private formatArguments(binary: string, args: string[]): string {
    let clone = args.slice(0);
    clone.unshift(this.wrapArg(binary));
    let newCmds: string[] = [];
    let lastCmd = '';
    for (let i = 0; i < clone.length; i++) {
      if (lastCmd == '--key') newCmds.push(this.wrapArg(this.obfuscateKey(clone[i])));
      else newCmds.push(this.wrapArg(clone[i]));
      lastCmd = clone[i];
    }
    return newCmds.join(' ');
  }
}
