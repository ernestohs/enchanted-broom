module.exports = function() {

  let ProgressBar = require('progress');
  let Docker = require('dockerode');
  let fs = require('fs');
  let docker = new Docker({
    host: 'http://127.0.0.1',
    port: 2375
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
                  console.log(values.map(x => x.NetworkSettings.IPAddress));
                // Execute master container with parameters
                console.log('All promises are fullfiled');
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
