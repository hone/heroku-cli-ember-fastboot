/* global ROOT_DEFAULT */
'use strict';

let fs = require('mz/fs');
let fsExtra = require('node-fs-extra');
let Bluebird = require('bluebird');
let mktmpdir = Bluebird.promisify(require("mktmpdir"));
let archiver = require('archiver');
let cli = require('heroku-cli-util');
let config = require('../config');
let upload = require('../upload');
let spawn = require('child_process').spawn;

let paths = {};

const FASTBOOT_DIST = 'fastboot-dist';
const ASSETS_DIR = 'dist';
const PROCFILE = 'Procfile';
const WEB_PROCESS = 'web: ember-fastboot --dist-file fastboot-dist --port $PORT';

function deployCommand(context, heroku) {
  let fastBootBuild = spawn('ember', ['fastboot:build', '--environment', 'production']);

  fastBootBuild.stdout.on('data', (data) => {
    console.log(`fastboot: ${data.toString().trim()}`);
  });

  fastBootBuild.stderr.on('data', (data) => {
    console.error(`fastboot: ${data.toString().trim()}`);
  });

  fastBootBuild.on('close', (fastBootCode) => {
    if(fastBootCode == 0) {
      mktmpdir('heroku-cli-ember-fastboot-').spread(function (tmpDir, done) {
        paths.tar = `${tmpDir}/source.tar.gz`;
        paths.fastboot = FASTBOOT_DIST;
        paths.assets = ASSETS_DIR;

        let appDir = `${tmpDir}/app`;
        fs.mkdirSync(appDir);
        fsExtra.copySync(FASTBOOT_DIST, `${appDir}/${FASTBOOT_DIST}`);
        fsExtra.copySync(ASSETS_DIR, `${appDir}/${ASSETS_DIR}`);
        fsExtra.copySync('package.json', `${appDir}/package.json`);

        try {
          let stats = fs.statSync(PROCFILE);
          fsExtra.copySync(PROCFILE, `${appDir}/${PROCFILE}`);
        } catch(error) {
          console.log("No Procfile detected, using ember-fastboot server.");
          fs.writeFileSync(`${appDir}/${PROCFILE}`, WEB_PROCESS);
        }

        let archive = archiver('tar', { gzip: true })
        archive.on('finish', upload.bind(null, heroku, context, paths))
        archive.pipe(fs.createWriteStream(paths.tar))
        archive.bulk([{
          src: ['package.json', PROCFILE, `${paths.fastboot}/**`, `${paths.assets}/**`],
          expand: true,
          dot: true,
          dest: false,
          cwd: appDir
        }])
        archive.finalize();
      }).catch(function (err) {
        console.error(err, 'error');
      });
    } else {
      console.error(`Couldn't build assets, ${fastBootCode}`);
    }
  })
}

module.exports = {
  topic: config.topic,
  command: 'deploy',
  needsApp: true,
  needsAuth: true,
  run: cli.command(deployCommand),
  description: 'build and deploy an ember fastboot app',
  help: `This will run \`ember fastboot:build --environment production\` locally and deploy these assets to Heroku.

  Example:

  $ heroku ember-fastboot:deploy
  `
};
