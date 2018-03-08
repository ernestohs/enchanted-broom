module.exports = function() {
  var chalk = require('chalk');
  var fs = require('fs');
  const path = require('path');
  var program = require('commander');
  var unique = require('short-unique-id');

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

    return this;
  };

  program.execute = function() {

    console.log('Create %d containers', program.nodes);

    const {
      Docker
    } = require('node-docker-api');

    const docker = new Docker({
      host: '127.0.0.1',
      port: '2375'
    });

    let containers = [];

    fs.mkdirSync(`${program.working}/${program.sessionId}`);
    fs.mkdirSync(`${program.working}/${program.sessionId}/logs`);

    const promises = Array.from(Array(program.nodes), (_, n) => {
      fs.mkdirSync(`${program.working}/${program.sessionId}/logs/${n}`);
      fs.mkdirSync(`${program.working}/${program.sessionId}/${n}`);

      return new Promise(resolve => docker.container.create({
          Image: 'tutum/hello-world',
          name: `slave-${program.sessionId}-${n}`,
          HostConfig: {
            PortBindings: {
              "1099/tcp": [{
                "HostPort": `${49500+n+n}`
              }], // READ
              "60000/tcp": [{
                "HostPort": `${49501+n+n}`
              }] // WRITE
            },
            Binds: [
              `${program.data}:/tests/data`,
              `${program.working}/${program.sessionId}/logs/${n}:/tests/logs`,
              `${program.working}/${program.sessionId}/${n}:/tests/work`
            ]
          }
        })
        .then(container => container.start())
        .then(container => containers.push(container))
        //.then(() => containers[containers.length - 1].status()) // TODO: Get server ips
        .catch(error => console.log(error)));
    });

    Promise.all(promises)
      .then(values => {

        docker.container.create({
            Image: 'tutum/hello-world',
            name: 'master',

            Binds: [
              `${program.data}:/tests/data`,
              `${program.working}/${program.sessionId}/logs/${n}:/tests/logs`,
              `${program.working}/${program.sessionId}/${n}:/tests/scripts`
            ]
          })
          .then(container => container.start())
          .then(container => {
            containers.forEach(c => {
              c.stop();
              c.delete({
                force: true
              });
            });
            return container;
          })
          .then(container => container.delete({
            force: true
          }))
          .then(congainer => console.log('Its done'));
      });

    return this;
  };

  var absolutePath = function(p) {
    if (path.isAbsolute(p)) return;

    var fixed = path.normalize(path.join(__dirname, p));

    return fixed;
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
