module.exports = function() {

  const chalk = require('chalk');
  const fs = require('fs');
  const path = require('path');
  const unique = require('short-unique-id');

  let engine = require('./core.js');
  let program = require('commander');

  var absolutePath = function(p) {
    if (path.isAbsolute(p)) return;

    var fixed = path.normalize(path.join(__dirname, p));

    return fixed;
  };

  program.validateArguments = function() {
    if (program.script) {

      if (!fs.existsSync(program.script)) {
        console.log(chalk.red('Script file name `' + program.script + '` does not exists'));
        process.exit(1);
      }

      if (program.nodes === undefined) {
        program.nodes = 1;
        console.log(chalk.yellow('Number of nodes was not specified, the test will run with only one node.'));
      }

      if (program.threads === undefined) {
        program.threads = 1;
        console.log(chalk.yellow('Number of threads was not specified, the test will run with only one thread.'));
      }

      if (program.data === undefined) {
        program.data = __dirname;
        console.log(chalk.yellow('The path of the data directory was not specified, the test will run using the current path as the data directory.'));
      } else if (!fs.existsSync(program.data)) {
        console.log(chalk.red('The path `' + program.data + '` does not exists'));
        process.exit(1);
      }

      if (program.working === undefined) {
        program.working = __dirname;
        console.log(chalk.yellow('The path for the working forlder for the script was not specified, the test will run using the current path as the working directory.'));
      } else if (!fs.existsSync(program.working)) {
        console.log(chalk.red('The path `' + program.data + '` does not exists'));
        process.exit(1);
      }

    } else {
      program.help();
      process.exit(1);
    }

    var uid = new unique();
    program.sessionId = uid.randomUUID(8);
    program.slave_image = 'tutum/hello-world:latest';
    
    return this;
  };

  program.execute = function() {
    return engine()
      .go(this);
  };

  program
    .version('0.0.1')
    .description('Distributed testing with the help of multiple docker containers')
    .option('-n, --nodes <nodes>', 'Number of test nodes', parseInt)
    .option('-t, --threads <threads>', 'Number of threads', parseInt)
    .option('-s, --script <filename>', 'Script file')
    .option('-d, --data <directory>', 'Data directory', absolutePath)
    .option('-w, --working <directory>', 'Working directory', absolutePath)
    .parse(process.argv)
    .validateArguments();

  return program;
}
