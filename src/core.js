module.exports = function() {

  let ProgressBar = require('progress');
  let Docker = require('dockerode');
  let fs = require('fs');
  let docker = new Docker({
    host: 'http://127.0.0.1', // TODO: put it on configuration
    port: 2375 // TODO: put it on configuration
  });

  let containers = [];

  var pullImageIfMissing = function(test, onFinished, onProgress) {
    docker.listImages({
      all: true
    }, function(err, images) {
      var image = images.find(i => i.RepoTags == test.slave_image);
      if (image) {
        onFinished();
      } else {
        docker.pull(test.slave_image, function(err, stream) {
          if (err) {
            console.log(err);
            process.exit(1);
          }
          docker.modem.followProgress(stream, onFinished, onProgress);
        });
      }
    });
  };

  return {
    go: function(test) {
      var bar = new ProgressBar('  downloading [:bar] :title :percent :etas', {
        total: 10
      });

      pullImageIfMissing(test, function() {
          console.log('Create directories');
          // Create base directories
          fs.mkdirSync(`${test.working}/${test.sessionId}`);
          fs.mkdirSync(`${test.working}/${test.sessionId}/logs`);

          const promises = Array.from(Array(test.nodes), (_, n) => {
            console.log('Create promise %s', n);
            fs.mkdirSync(`${test.working}/${test.sessionId}/logs/${n}`);
            fs.mkdirSync(`${test.working}/${test.sessionId}/${n}`);

            return new Promise(resolve => {
              docker.createContainer({
                Image: test.slave_image,
                name: `slave-${test.sessionId}-${n}`,
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
                    `${test.data}:/tests/data`,
                    `${test.working}/${test.sessionId}/logs/${n}:/tests/logs`,
                    `${test.working}/${test.sessionId}/${n}:/tests/work`
                  ]
                }
              }, function(err, container) {
                if (err) {
                  console.error(err);
                  resolve(err);
                }
                containers.push(container);
                container.start(function(err, data) {
                  console.log('start container');
                  container.inspect(function(err, d) {
                    resolve(d);
                  });
                });
              })
            });

          });

          Promise
            .all(promises)
            .then(values => {
              var slave_ips = values.map(x => x.NetworkSettings.IPAddress).join(',');
              console.log(slave_ips);
              console.log('All promises are fullfiled');

              docker.createContainer({
                Image: test.master_image,
                name: `master-${test.sessionId}`,
                Cmd: ['-n', '-t', `/scripts/${test.script}`, '-l', '/tests/logs/results.csv', '-LDEBUG', '-R${slave_ips}']
              }).then(function(container) {
                return container.start();
              }).then(function(container) {
                return container.wait();
              }).then(function(container) {
                // TODO: take all the logs from the slaves
                // TODO: stop all the slaves
                // TODO: remove all the slaves
                return container.stop();
              }).then(function(container) {
                return container.remove();
              }).then(function (){
                console.log('Test is completed');
              }).catch(function(err) {
                console.error(err);
              });
            });
        },
        function(event) {
          bar.tick({
            title: event.status
          });
        });
    }
  };
}
