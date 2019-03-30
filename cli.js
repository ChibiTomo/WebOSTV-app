#! /usr/bin/env node

const path = require('path');
const fs = require('file-system');
const program = require('commander');
const childProcess = require('child_process');
const env = process.env;

program
	.version(env.npm_package_version)
	.option('--sdk-cli-path <path>', '(Required) Path to the WebOSTV SDK CLI dir')
	.option('--source-dir <path>', 'Path to the dir containing all metadatas', 'webos-meta-data')
	.option('--appinfo-name <name>', 'Name of the JSON file containing appinfo (eg: appinfo.json)', 'appinfo.json')
	.option('--no-override', 'Prevent appinfo.json to be overridden by package.json');

program
	.command('meta <destDir>')
	.description('Copy all metadatas to the specified folder. Meta are feed by package.json')
	.action(meta);

buildAresCommand('package', [
	['-c, --check', 'Check the application but don\'t package it'],
	['-o, --outdir <OUTPUT_DIR>', 'Use OUTPUT_DIR as the output directory'],
	['-e, --app-exclude <PATTERN>', 'Exclude files, given as a PATTERN'],
	['-h, --help', 'Display this help'],
	['-q', 'Display this verbose log'],
	['-n, --no-minify', 'Skip the minification phase'],
	['-r, --rom', 'Do not create ipk, instead output a folder structure']
]);

buildAresCommand('install', [
    ['-d, --device <DEVICE>', 'Specify DEVICE to use'],
    ['-D, --device-list', 'List the available DEVICEs'],
	['-l, --list', 'List the installed apps'],
	['-F, --listfull', 'List the detailed info of the installed apps'],
	['-h, --help', 'Display this help'],
	['-v', 'Display this verbose log'],
	['-S, --list-storage', 'List the storages of the DEVICE'],
	['-s, --storage <STORAGE>', 'Specify STORAGE to install'],
	['-r, --remove <APP_ID>', 'Specify the APP_ID to remove']
]);

buildAresCommand('inspect', [
    ['-o, --open', 'Open url with a web browser'],
    ['-d, --device <DEVICE>', 'Specify DEVICE to use'],
    ['-D, --device-list', 'List the available DEVICEs'],
    ['-h, --help', 'Display this help'],
    ['-v', 'Display this verbose log'],
	['-a, --app <APP_ID>', 'Specify the APP_ID to inspect'],
	['-s, --service <SERVICE_ID>', 'Specify the SERVICE_ID to inspect']
]);
	
program.parse(process.argv);


function buildAresCommand(name, cmds) {
	var command = program.command(name+' [args...]');
	
	for (var i = 0; i < cmds.length; ++i) {
		command.option.apply(command, cmds[i]);
	}
	
	command
		.description('Shortcut to ares-'+name)
		.action(function(args, optns) {
			runScript(name, args, optns);
		});
}

function meta(destDir, optns) {
	var fname = optns.appinfoName;
	var srcDir = optns.sourceDir;
	
	mustExists(srcDir+'/'+fname);
	
	var appInfo = JSON.parse(fs.readFileSync(srcDir+'/'+fname, 'utf-8'));
	
	appInfo.version = env.npm_package_version;
	appInfo.title = env.npm_package_name;
	appInfo.description = env.npm_package_description;
	
	copyImages(appInfo, srcDir, destDir);
	
	var appInfoStr = JSON.stringify(appInfo);
	fs.mkdirSync(destDir, {recursive: true});
	fs.writeFileSync(destDir+'/'+fname, appInfoStr);
}

function copyImages(appInfo, srcDir, destDir) {
	const array = ['icon', 'largeIcon', 'bgImage', 'splashBackground'];
	
	var attr;
	for (var i = 0; i < array.length; ++i) {
		attr = array[i];
		if (attr[i]) {
			mustExists(srcDir+'/'+appInfo[attr]);
			fs.copyFileSync(srcDir+'/'+appInfo[attr], destDir+'/'+appInfo[attr]);
		}
	}
}

function mustExists(fname, errorMsg) {
	if (!fs.existsSync(fname)) {
		throw new Error(errorMsg || '"' + fname + '" does not exist.');
	}
}

function toCamelCase(str) {
	var array = str.split('-');
	for (var j = 1; j < array.length; ++j) {
		array[j] = array[j][0].toUpperCase() + array[j].slice(1);
	}
	return array.join('');
}

function buildArgs(args, optns) {
	var optn, attr, val, reversed = false;
	for (var i = 0; i < optns.options.length; ++i) {
		optn = optns.options[i];
		if (optn.short) {
			reversed = !!optn.long.match('--no-');
			attr = toCamelCase(optn.long.replace(/^--no-|--/, ''));
		} else {
			attr = optn.long.replace(/^-/, '').toUpperCase();
		}
		
		if (optns.hasOwnProperty(attr)) {
			val = optns[attr];
			if (optn.optional && val) {
				val = '';
			}
			if (!reversed || !val) {
				args.push(optn.long);
				if ((optn.required || optn.optional) && val !== '') {
					args.push(val);
				}
			}
		}
	}
}

function runScript(name, args, optns) {
	if (!optns.parent.sdkCliPath) {
		throw new Error('You must specifie a path to WebOSTV SDK CLI dir');
	}
	buildArgs(args, optns)
    // keep track of whether callback has been invoked to prevent multiple invocations
    var invoked = false;
	
	var sname = optns.parent.sdkCliPath+'/bin/ares-'+name+'.js';
	console.log('Running '+sname+' '+args.join(' '));
    var process = childProcess.fork(sname, args);
	
	var callback = function (err) {
		if (err) {
			throw err;
		}
		console.log('finished running '+sname);
	};
    // listen for errors as they may prevent the exit event from firing
    process.on('error', function (err) {
        if (!invoked) {
			invoked = true;
			callback(err);
		}
    });

    // execute the callback once the process has finished running
    process.on('exit', function (code) {
        if (!invoked) {
			invoked = true;
			var err = code === 0 ? null : new Error('exit code ' + code);
			callback(err);
		}
    });
}