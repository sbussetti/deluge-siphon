// debug
if (localStorage.enable_debug_logging) {
  console.log('Debug logging enabled');
} else {
  console.log = function() {};
}

// these should hang around for the life of the controller,
// but shouldn't get put into local storage.
var SERVER_CONFIG = null,
    PLUGINS = null,
    DAEMON_INFO = {
      status: '',
      port: null,
      ip: null,
      host_id: null,
      version: null
    },
    SERVER_URL = localStorage.deluge_server_url;

/* BEGIN delugeConnection */
function delugeConnection(cookie_domain, silent){
  console.log('delugeConnection', cookie_domain, silent);
  this.cookie_domain = cookie_domain;
  this.silent = !!silent;
}

/* public methods */
delugeConnection.prototype.addTorrent = function (url, label, options) {
  console.log('****> addTorrent', url, label, options);

  this.torrent_url = url;
  this.state = '';
  this.host_idx = 0;
  this.daemon_hosts = [];

  this.torrent_label = label;
  this.torrent_options = options || {};

  if (! this.silent)
    notify({
      'message': 'Requesting torrent...',
      'contextMessage': '' + this.torrent_url
    }, 1500, this._getNotificationId(), 'request');
  this._performAction(this._addTorrent.bind(this));
};

delugeConnection.prototype.getConfig = function (callback) {
  console.log('****> getConfig');
  this.state = '';
  this.host_idx = 0;
  this.daemon_hosts = [];
  if (! this.silent)
    notify({'message': 'Getting server config...'}, 1500, this._getNotificationId());
  this._performAction(callback);
};

delugeConnection.prototype.getTorrentInfo = function (url, callback) {
  console.log('****> getTorrentInfo', url);
  this.torrent_url = url;
  this.state = '';
  this.host_idx = 0;
  this.daemon_hosts = [];
  if (! this.silent)
    notify({'message': 'Getting torrent info...'}, 1500, this._getNotificationId());
  if (this.torrent_url.substr(0,7) == 'magnet:') {
    callback(); // no torrent info for magnet links
  } else {
    this._performAction(function (config, plugins) {
      this._downloadTorrent(function (torrent_file) {
        this._getTorrentInfo(torrent_file, function (info) {
          callback(config, plugins, info);
        });
      }.bind(this));
    }.bind(this));
  }
};

delugeConnection.prototype.supportsMagnetLinks = function (callback) {
  this._performAction(function () {
    callback(versionCompare(DAEMON_INFO.version, '1.3.3', {zeroExtend: true}) < 0);
  });
};

/* global ajax handlers ... */
delugeConnection.prototype._ajaxError = function (http, status, thrown) {
  if (this.state == 'checklink') {
    if (! this.silent)
      notify({
        message: 'Your Deluge server thinks this is not a valid torrent',
        contextMessage: this.torrent_url
      }, -1, this._getNotificationId(), 'error');
  } else {
    if (! this.silent)
      notify({
        message: 'Error communicating with your Deluge server',
        contextMessage: (!!this.torrent_url ? '' + this.torrent_url : '')
      }, -1, this._getNotificationId(), 'error');
    console.log(this.state + ': [' + http.statusCode() + '] ' + http.statusText);
  }
};

delugeConnection.prototype._serverError = function(payload){  // this dispatches all the communication...
  if (payload.error) {
    if (! this.silent) {
      notify({
        message: 'Your Deluge server responded with an error',
        contextMessage: '' + (payload.error.message || this.state)
      }, -1, this._getNotificationId(), 'error');
    }
    return true;
  }
  return false;
};

/* helpers */
delugeConnection.prototype._getNotificationId = function () {
  return !!this.torrent_url ? '' + this.torrent_url.hashCode() : 'server';
};

delugeConnection.prototype._performAction = function (callback) {
  // ensure all our config stuff is up to date and then peform the
  // action in the callback

  // invalidate cached config info on server change
  // TODO: this needs to check more than  the url (should be timestamp  of
  // last settings change vs check)
  if (SERVER_URL != localStorage.deluge_server_url) {
    SERVER_CONFIG = null;
    PLUGINS = null;
    DAEMON_INFO = {
      status: '',
      port: null,
      ip: null,
      host_id: null,
      version: null
    };
    SERVER_URL = localStorage.deluge_server_url;
  }

  this._getDomainCookies(function () {
    this._getSession(function () {
      this._checkDaemonConnection(function () {
        this._getServerConfig(function (config) {
          this._getPlugins(function (plugins) {
            callback(config, plugins);
          }.bind(this));
        }.bind(this));
      }.bind(this));
    }.bind(this));
  }.bind(this));
};

/* get auth / config / setup logic */
delugeConnection.prototype._getDomainCookies = function (callback) {
  console.log('_getDomainCookies', this.cookie_domain, 'and', SERVER_URL, 'vs', localStorage.deluge_server_url);
  //get cookies for the current domain
  chrome.cookies.getAll({'domain': this.cookie_domain}, function(cookies){
    var cookdict = {};
    for (var i = 0, l = cookies.length; i < l; i++)  {
      var cook = cookies[i];
      cookdict[cook.name] = cook.value;
    }
    var cooklist = [];
    for (var name in cookdict) {
      cooklist.push(name + '=' + cookdict[name]);
    }
    //save out of scope..
    this.cookie = cooklist.join(';');
    callback();
  }.bind(this));
};

delugeConnection.prototype._getSession = function(callback){
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'auth.check_session',
    'params':[],
    'id':'-16990'
  });
  this.state = 'getsession';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload){
      if (this._serverError(payload)) return;
      if (!!payload.result) { // success
        callback(payload.result);
      } else {
        this._doLogin(callback);
      }
    },
    error: this._ajaxError
  });
};

delugeConnection.prototype._doLogin = function(callback){
  var SERVER_PASS = localStorage.server_pass;
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'auth.login',
    'params':[SERVER_PASS],
    'id':'-17000'
  });
  this.state = 'dologin';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload){
      if (this._serverError(payload)) return;
      if ( !!payload.result ) {
        callback(payload.result);
      } else {
        if (! this.silent)
          notify({'message': 'Error: Login failed'}, 3000, 'server', 'error');
      }
    },
    error: this._ajaxError
  });
};

delugeConnection.prototype._checkDaemonConnection = function(callback) {
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'web.connected',
    'params':[],
    'id':'-16991'
  });
  this.state = 'checkdaemonconnection';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload) {
      if (this._serverError(payload)) return;

      console.log('_checkDaemonConnection__callback', payload.result, DAEMON_INFO.host_id);
      if ( !!payload.result && !!DAEMON_INFO.host_id) {
        callback(payload.result);
      } else {
        this._getDaemons(callback);
      }
    },
    error: this._ajaxError
  });
};

delugeConnection.prototype._getDaemons = function(callback) {
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'web.get_hosts',
    'params':[],
    'id':'-16992'
  });
  this.state = 'getdaemons';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload) {
      if (this._serverError(payload)) return;
      console.log('_getDaemons__callback', payload);

      if (!!payload.result ) {
        // payload.result will be a list of one or more hosts....
        this.host_idx = 0;
        this.daemon_hosts = payload.result;
        this._getHostStatus(callback);
      } else {
        console.log('getDaemons failed', payload);
        if (! this.silent)
          notify({'message': 'Error: cannot connect to deluge server'}, 3000, 'server', 'error');
      }
    },
    error: this._ajaxError
  });
};

delugeConnection.prototype._getHostStatus = function(callback)  {
  if (this.host_idx >= this.daemon_hosts.length) { // we ran out
    if (! this.silent)
      notify({'message': 'Error: cannot connect to deluge server'}, 3000, 'server', 'error');
    console.log('getDaemons exhaused all hosts', this.daemon_hosts);
    return;
  }

  var url = SERVER_URL+'/json',
      host = this.daemon_hosts[this.host_idx];
  var params = JSON.stringify({
    'method': 'web.get_host_status',
    'params': [host[0]],
    'id':'-16992.' + this.host_idx
  });

  this.host_idx += 1;
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function (payload) {
      //["c6099253ba83ea059adb7f6db27cd80228572721", "127.0.0.1", 52039, "Connected", "1.3.5"]
      if (payload.result) {
        DAEMON_INFO.host_id = payload.result[0];
        DAEMON_INFO.ip = payload.result[1];
        DAEMON_INFO.port = payload.result[2];
        DAEMON_INFO.status = payload.result[3];
        DAEMON_INFO.version = payload.result[4];
      } else {
        if (! this.silent)
          notify({'message': 'Error: cannot connect to deluge server'}, 3000, 'server', 'error');
        console.log('getDaemons failed', payload);
        return;
      }

      console.log('_getHostStatus__callback', payload, DAEMON_INFO);
      // exit cases.
      if (DAEMON_INFO.status == 'Connected') {  // we're rolling
        callback(DAEMON_INFO);
      } else if (DAEMON_INFO.status == 'Online') { //okay, connect
        this._connectDaemon(callback);
      } else if (DAEMON_INFO.status == 'Offline') { //okay, start it
        this._startDaemon(callback);
      } else { // unknown status
        if (! this.silent)
          notify({'message': 'Error: cannot connect to deluge server'}, 3000, 'server', 'error');
        console.log('getDaemons failed', payload);
      }
    },
    error: this._ajaxError
  });
};

delugeConnection.prototype._startDaemon = function(callback) {
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'web.start_daemon',
    'params':[DAEMON_INFO.port],
    'id':'-16993'
  });
  this.state = 'startdaemon';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload) {
      if (this._serverError(payload)) return;

      if (!payload.error) {
        //get config and carry on with execution...
        if (! this.silent)
          notify({'message': 'Starting server ' + DAEMON_INFO.ip + ':' + DAEMON_INFO.port}, 1500, 'server');
        // restart the process
        this.host_idx = 0;
      }  else {
        // try to go to next
        console.log(this.state, 'ERROR', payload);
      }
      this._getHostStatus(callback);
    },
    error: this._ajaxError
  });
};

delugeConnection.prototype._connectDaemon = function(callback) {
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'web.connect',
    'params':[DAEMON_INFO.host_id],
    'id':'-16994'
  });
  this.state = 'connectdaemon';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload) {
      if (this._serverError(payload)) return;

      if (!payload.error) {
        //get config and carry on with execution...
        if (! this.silent)
          notify({'message': 'Reconnected to server'}, 1500, 'server');
        callback();
      }  else {
        // try next
        console.log(this.state, 'ERROR', payload);
        this._getHostStatus(callback);
      }
    },
    error: this._ajaxError
  });

};

delugeConnection.prototype._getServerConfig = function(callback){
  if (!!SERVER_CONFIG) { // already cached TODO: (this won't catch changes while extension is loaded)
    console.log('_getServerConfig', SERVER_CONFIG);
    callback(SERVER_CONFIG);
  } else {
    var url = SERVER_URL+'/json';
    var params = JSON.stringify({
      'method': 'core.get_config_values',
      'params': [[
        'download_location',
        'move_completed',
        'move_completed_path',
        'add_paused'
      ]],
      'id': '-17001'
    });
    this.state = 'getconfig';
    $.ajax(url, {
    contentType: "application/json",
    processData: false,
      context: this,
      data: params,
      method: 'POST',
      success: function(payload){
        if (this._serverError(payload)) return;
        // deep copy
        SERVER_CONFIG = $.extend(true, {}, payload.result);
        console.log('_getServerConfig__callback', payload.result);
        // execute the callback, everything worked and we have the config we need
        callback(SERVER_CONFIG);
      },
      error: this._ajaxError
    });
  }
};

delugeConnection.prototype._getPlugins = function(callback){
  if (!!PLUGINS) { // already cached TODO: (this won't catch changes while extension is loaded)
    console.log('_getPlugins', PLUGINS);
    callback(PLUGINS);
  } else {
    var url = SERVER_URL+'/json';
    var params = JSON.stringify({
      'method': 'web.get_plugins',
      'params': [],
      'id': '-17001.1'
    });
    this.state = 'getplugins';
    $.ajax(url, {
    contentType: "application/json",
    processData: false,
      context: this,
      data: params,
      method: 'POST',
      success: function(payload){
        if (this._serverError(payload)) return;
        // deep copy
        PLUGINS = payload.result.enabled_plugins.reduce(function(res, item) {
          res[item] = true;
          return res;
        }, {});
        console.log('_getPlugins__callback', payload.result);
        // execute the callback, everything worked and we have the config we need
        callback(PLUGINS);
      },
      error: this._ajaxError
    });
  }
};

/* add torrent logic */
delugeConnection.prototype._addTorrent = function() {
  if (this.torrent_url.substr(0,7) == 'magnet:') {
    this.supportsMagnetLinks(function (supported) {
      if (supported) {
        this._addTorrentToServer(this.torrent_url);
      } else {
        if (! this.silent)
          notify({'message': 'Your version of Deluge [' + DAEMON_INFO.version + '] does not support magnet links. Consider upgrading.'}, -1, 'server', 'error');
      }
    }.bind(this));
  } else {
    this._downloadTorrent(this._addTorrentToServer.bind(this));
  }
};

delugeConnection.prototype._downloadTorrent = function(callback) {
  var url = SERVER_URL+'/json',
      params = JSON.stringify({
        "method":"web.download_torrent_from_url",
        "params":[this.torrent_url, this.client_cookie],
        "id":"-17002"
      });
  this.state = 'downloadlink';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload) {
      if (this._serverError(payload)) return;
      console.log('_downloadTorrent__callback', payload.result);
      callback(payload.result);
    },
    error: this._ajaxError
  });
};

delugeConnection.prototype._getTorrentInfo = function(torrent_file, callback) {
  // get info about a previously downloaded torrent file
  var params = JSON.stringify({
    "method":"web.get_torrent_info",
    "params":[torrent_file],
    "id":"-17003"
  });
  var url = SERVER_URL+'/json';
  this.state = 'checklink';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload) {
      if (this._serverError(payload)) return;
      console.log('_getTorrentInfo__callback', this.state, payload);
      if (! payload || ! payload.result) {
        if (! this.silent)
          notify({'message': 'Not a valid torrent: ' + this.torrent_url}, -1, this._getNotificationId(), 'error');
        return;
      }

      callback(SERVER_CONFIG, payload.result);
    },
    error: this._ajaxError
  });
};

delugeConnection.prototype._addTorrentToServer = function(torrent_file) {
  var params = JSON.stringify({
        "method":"web.add_torrents",
        "params":[[{
          'path': torrent_file,
          'options': $.extend(true, {}, SERVER_CONFIG, this.torrent_options)
        }]],
        "id":"-17004.0"
      }),
      url = SERVER_URL+'/json';
  this.state = 'addtorrent';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload) {
      if (this._serverError(payload)) return;
      console.log('_addTorrentToServer__callback', payload);
      if (! this.silent)
        notify({'message': 'Torrent added successfully'}, 1500, this._getNotificationId(), 'added');
    },
    error: this._ajaxError
  });
};
/* END delugeConnection */

/* BEGIN Setup */
var notificationTimeouts = {};
function notify (opts, decay, id, icon_type) {
  if (! localStorage.inpage_notification)
    return; // this is just a noop if you have notifications off...

  if (id === null)
    throw "Notification ID is required";

  var _decay = decay || 3000,
      // notify, error, added or request
      _icon = '/images/' + (icon_type ? 'notify_' + icon_type : 'notify') + '.png',
      options = {
        title: 'DelugeSiphon',
        type: 'basic',
        iconUrl: chrome.extension.getURL(_icon)
      };

  for (var attr in opts) { options[attr] = opts[attr]; }

  console.log('NOTIFY', options, _decay, id, icon_type);

  chrome.notifications.create(id, options, function(id) {
    if (notificationTimeouts[id])
      clearTimeout(notificationTimeouts[id]);

    if (_decay !== -1) {
      notificationTimeouts[id] = setTimeout(function(){
        console.log('NOTIFY: clear notification timeout [' + id + ']');
        chrome.notifications.clear(id, function(cleared){});
      }, _decay);
    }
  });
}

function createContextMenu () {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      'id': 'add',
      'title': 'Add',
      'contexts': ['link'],
      'onclick': function (info, tab) {
        // extract domain from url..
        var torrentUrl = info.linkUrl,
            s1 = torrentUrl.indexOf('//') + 2,
            domain = torrentUrl.substring(s1),
            s2 = domain.indexOf('/');
        if (s2 >= 0) { domain = domain.substring(0, s2); }

        new delugeConnection(domain).addTorrent(torrentUrl);
      }
    });

    chrome.contextMenus.create({
      'id': 'add-with-options',
      'title': 'Add with Options',
      'contexts': ['link'],
      'onclick': function (info, tab) {
        // extract domain from url..
        var torrentUrl = info.linkUrl,
            s1 = torrentUrl.indexOf('//') + 2,
            domain = torrentUrl.substring(s1),
            s2 = domain.indexOf('/');
        if (s2 >= 0) { domain = domain.substring(0, s2); }

        var sender = $.extend(true, {}, info, {'tab': tab});
        new delugeConnection(domain).getTorrentInfo(torrentUrl, function (config, plugins, info) {
          communicator.sendMessage({
            'method': 'add_dialog',
            'url': torrentUrl,
            'domain': domain,
            'config': config,
            'info': info,
            'plugins': plugins
          }, null, null, communicator.getSenderID(sender));
        });
      }
    });
  });
}
if (localStorage.enable_context_menu) createContextMenu();

function handleMessage (request, sendResponse) {
  var bits = request.method.split('-');
  console.log('handleMessage', bits, request);
  //field connections from the content-handler via Chrome's secure pipeline hooey
  if (request.method == "contextmenu") {
    /*
      since you can only modify the contextmenu settings from the controller end
      this command allows the settings page to easily request that we enable or disable
      the global contextmenu entry.
    */
    if (request.toggle) {
      createContextMenu();
    } else {
      chrome.contextMenus.removeAll();
    }
  } else if (request.method == "notify") {
    notify (request.opts, request.decay, 'content', request.type);
  } else if (request.method.substring(0,8) == "storage-") { //storage type request
    // toss the prefix
    bits.shift();
    var method = bits.shift(); //get or set?
    var key = bits.join('-');  //rejoin the remainder in the case where it may have a hyphen in the key..

    // if method is set, set it
    if (method == 'set')
      localStorage[key] = request.value;
    // else respond with the value
    else
      sendResponse({'value': localStorage[key]});

  } else if (request.method.substring(0,8) == "addlink-" ) { //add to server request
    var url_match = false,
        addtype = bits[1],
        silent = request.silent,
        url = request.url,
        domain = request.domain,
        label = request.label,
        options = request.options;

    if ( ! localStorage.deluge_server_url ) {
      notify({'message': 'Please configure extension options'}, -1, 'config', 'error');
      return;
    }
    if (!url) {
      notify({'message': 'Error: Empty URL'}, 3000, 'server', 'error');
      return;
    }
    url_match = url.match(/^(magnet\:)|((file|(ht|f)tp(s?))\:\/\/).+/) ;
    if (!url_match) {
      notify({'message': 'Error: Invalid URL `' + url + '`'}, 3000, 'server', 'error');
      return;
    }

    if (addtype == 'todeluge') {
      new delugeConnection(domain, silent).addTorrent(url, label, options);
    } else {
      notify({'message': 'Unknown server type: `' + addtype + '`'}, 3000, 'server', 'error');
    }
  } else {
    sendResponse({'error': 'unknown method: `' + request.method + '`'}); // snub them.
  }
}
communicator.init();
communicator.observePortMessage(handleMessage);
