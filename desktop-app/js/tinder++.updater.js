(function() {
  var gui = require('nw.gui');
  var currentVersion = gui.App.manifest.version;

  var updateParams = {
    'channel': 'beta',
    'currentVersion': currentVersion,
    'endpoint': 'http://tinderplusplus.com/update.json',
    'verify': false
  };

  var updater = require('nw-updater')(updateParams);
  updater.update();

  updater.on('download', function(version) {
    console.log('downloading new version: ' + version);
    ga_storage._trackEvent('Update', 'Download Started: ' + version);
  });

  updater.on('installed', function() {
    ga_storage._trackEvent('Update', 'Update Installed');
    alert('Tinder++ has just been updated to the latest version, please restart the app!');
  });

  updater.on('error', function(err) {
    console.log(err);
    ga_storage._trackEvent('Update', 'Error: ' + err.toString());
  });
})();
