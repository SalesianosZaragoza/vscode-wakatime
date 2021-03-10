import * as vscode from 'vscode';

import {
  COMMAND_DEBUG,
  COMMAND_DISABLE,
  COMMAND_STATUS_BAR_CODING_ACTIVITY,
  COMMAND_STATUS_BAR_ENABLED,
  LogLevel,
} from './constants';
import { Logger } from './logger';
import { Options } from './options';
import { WakaTime } from './wakatime';

var logger = new Logger(LogLevel.INFO);
var wakatime: WakaTime;

export function activate(ctx: vscode.ExtensionContext) {
  var options = new Options();

  wakatime = new WakaTime(ctx.extensionPath, logger, options);

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_DEBUG, function () {
      wakatime.promptForDebug();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_DISABLE, function () {
      wakatime.promptToDisable();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_STATUS_BAR_ENABLED, function () {
      wakatime.promptStatusBarIcon();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_STATUS_BAR_CODING_ACTIVITY, function () {
      wakatime.promptStatusBarCodingActivity();
    }),
  );


  ctx.subscriptions.push(wakatime);


}

export function deactivate() {
  wakatime.dispose();
  logger.debug('WakaTime has been disabled.');
}
