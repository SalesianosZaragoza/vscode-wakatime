import * as adm_zip from 'adm-zip';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as process from 'process';
import * as request from 'request';
import * as rimraf from 'rimraf';
import * as vscode from 'vscode';
import * as which from 'which';

import { Options } from './options';
import { Logger } from './logger';

export class Dependencies {
  private cachedPythonLocation: string = '';
  private options: Options;
  private logger: Logger;
  private extensionPath: string;
  private s3urlprefix = 'https://wakatime-cli.s3-us-west-2.amazonaws.com/';
  private global: boolean;
  private standalone: boolean;

  constructor(
    options: Options,
    extensionPath: string,
    logger: Logger,
    global: boolean,
    standalone: boolean,
  ) {
    this.options = options;
    this.logger = logger;
    this.extensionPath = extensionPath;
    this.global = global;
    this.standalone = standalone;
  }

  

  public static isWindows(): boolean {
    return os.platform() === 'win32';
  }


  private architecture(): string {
    return os.arch().indexOf('32') > -1 ? '32' : '64';
  }

 
}
