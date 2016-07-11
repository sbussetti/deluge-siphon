// debug
if (localStorage.enable_debug_logging) {
  console.log('Debug logging enabled');
} else {
  console.log = function() {};
}

// these should hang around for the life of the controller,
// but shouldn't get put into local storage.
var DELUGE_CONFIG = null,
    DAEMON_INFO = {
      host_id: null,
      version: null,
      connected: false
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
  console.log('addTorrent', url, label, options);

  this.torrent_url = url;
  this.torrent_label = label;
  this.torrent_options = options;
  this.torrent_file = '';
  this.tmp_download_file = '';

  this.state = '';

  this.host_idx = 0;
  this.daemon_hosts = [];

  if (! this.silent)
    notify({
      'message': 'Requesting torrent...',
      'contextMessage': '' + this.torrent_url
    }, 1500, this._getNotificationId(), 'request');
  this._performAction(this._addTorrent.bind(this));
};
delugeConnection.prototype.getConfig = function (callback) {
  if (! this.silent)
    notify({'message': 'Getting server config...'}, 1500, this._getNotificationId());
  this._performAction(callback);
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
    if (! this.silent) {
      notify({
        message: 'Error communicating with your Deluge server',
        contextMessage: (!!this.torrent_url ? '' + this.torrent_url : '')
      }, -1, this._getNotificationId(), 'error');
      console.log(this.state + ': [' + http.statusCode() + '] ' + http.statusText);
    }
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
delugeConnection.prototype._performAction = function (callback) {
  // ensure all our config stuff is up to date and then peform the
  // action in the callback

  //invalidate cached config info on server change
  if (SERVER_URL != localStorage.deluge_server_url) {
    DELUGE_CONFIG = null;
    DAEMON_INFO = {
      host_id: null,
      version: null,
      connected: false
    };
    SERVER_URL = localStorage.deluge_server_url;
  }

  this._getDomainCookies(callback);
};
delugeConnection.prototype._getNotificationId = function () {
  return !!this.torrent_url ? '' + this.torrent_url.hashCode() : 'server';
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
    this._getSession(callback);
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

      if ( payload.result ) {
        this._checkDaemonConnection(callback);
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

      if ( payload.result ) {
        this._checkDaemonConnection(callback);
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
      if ( payload.result && DAEMON_INFO.host_id) {
        this._getCurrentConfig(callback);
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

      if ( payload.result ) {
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
  var url = SERVER_URL+'/json',
      host = this.daemon_hosts[this.host_idx];

  var params = JSON.stringify({
    'method': 'web.get_host_status',
    'params': [host[0]],
    'id':'-16992.' + this.host_index
  });

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
        DAEMON_INFO.connected = (payload.result[3] == 'Connected');
        DAEMON_INFO.version = payload.result[4];
      } else {
        if (! connection.silent)
          console.log('getDaemons failed', payload);
          notify({'message': 'Error: cannot connect to deluge server'}, 3000, 'server', 'error');
      }

      // exit cases.
      this.host_index += 1;

      if (DAEMON_INFO.connected) {
        this._getCurrentConfig(callback);
      } else if (this.host_idx < this.daemon_hosts.length) { // can keep  trying
        this._getHostStatus(callback);
      } else { // exhaused hosts
        this._connectDaemon(callback);
      }
    },
    error: this._ajaxError
  });
};
delugeConnection.prototype._connectDaemon = function(callback) {
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'web.connect',
    'params':[DAEMON_INFO.host_id],
    'id':'-16993'
  });
  this.state = 'connectdaemon';
  console.log('connectdaemon', params);
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: function(payload) {
      if (this._serverError(payload)) return;
      //get config and carry on with execution...
      console.log('connectdaemon', payload.error  + ' :: ' + http.responseText);
      if (! this.silent)
        notify({'message': 'Reconnected to server'}, 1500, 'server');
      this._getCurrentConfig(callback);
    },
    error: this._ajaxError
  });
};
delugeConnection.prototype._getCurrentConfig = function(callback){
  if (DELUGE_CONFIG) { // already cached
    console.log('Server config', DELUGE_CONFIG);
    callback(DELUGE_CONFIG);
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
        DELUGE_CONFIG = $.extend(true, {}, payload.result);

        console.log('_getCurrentConfig__callback', this.torrent_url, payload.result);

        // execute the callback, everything worked and we have the config we need
        callback(DELUGE_CONFIG);
      },
      error: this._ajaxError
    });
  }
};
/* add torrent logic */
delugeConnection.prototype._addTorrent = function() {
  if (this.torrent_url.substr(0,7) == 'magnet:') {
    //this ends the cascade.
    if (versionCompare(DAEMON_INFO.version, '1.3.3', {zeroExtend: true}) < 0)
      notify({'message': 'Your version of Deluge [' + DAEMON_INFO.version + '] does not support magnet links. Consider upgrading.'}, -1, 'server', 'error');
    else
      this._addTorrentToServer(this.torrent_url);
  } else {
    this._downloadTorrent(); // which will download and then cascade to adding a local torrent
  }
};
delugeConnection.prototype._downloadTorrent = function() {
  var TORRENT_URL = this.torrent_url;
  var CLIENT_COOKIE = this.cookie;
  var params = JSON.stringify({
    "method":"web.download_torrent_from_url",
    "params":[TORRENT_URL, CLIENT_COOKIE],
    "id":"-17002"
  });
  console.log('_downloadTorrent DLPRAMS', params);
  var url = SERVER_URL+'/json';
  this.state = 'downloadlink';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: this._downloadTorrent__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._downloadTorrent__callback = function(payload) {
  if (this._serverError(payload)) return;

  console.log('_downloadTorrent__callback', payload.result);
  this.tmp_download_file = payload.result;
  this._getTorrentInfo();
};
delugeConnection.prototype._getTorrentInfo = function() {
  // this is validating that the torrent file was downloaded
  var TORRENT_URL = this.torrent_url;
  var CLIENT_COOKIE = this.cookie;
  var params = JSON.stringify({
    "method":"web.get_torrent_info",
    "params":[this.tmp_download_file],
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
    success: this._getTorrentInfo__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._getTorrentInfo__callback = function(payload) {
  if (this._serverError(payload)) return;

  console.log('_getTorrentInfo__callback', this.state, payload);
  if (! payload || ! payload.result) {
    if (! this.silent)
      notify({'message': 'Not a valid torrent: ' + this.torrent_url}, -1, this._getNotificationId(), 'error');
  } else {
    this._addTorrentToServer(this.tmp_download_file);
  }
};
delugeConnection.prototype._addTorrentToServer = function(torrent_file) {
  var options = $.extend(true, {}, DELUGE_CONFIG, options),
      params = JSON.stringify({
        "method":"web.add_torrents",
        "params":[[{
          'path': torrent_file,
          'options': DELUGE_CONFIG
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
    success: this._addTorrentToServer__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._addTorrentToServer__callback = function(payload) {
  if (this._serverError(payload)) return;

  if (! this.silent)
    notify({'message': 'Torrent added successfully'}, 1500, this._getNotificationId(), 'added');
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
        new delugeConnection(domain).getConfig(function (config) {
          communicator.sendMessage({
            'method': 'add_dialog',
            'url': torrentUrl,
            'domain': domain,
            'config': config
          }, null, null, communicator.getSenderID(sender));
        });
      }
    });
  });
}
if (localStorage.enable_context_menu) createContextMenu();

function handleMessage (request, sendResponse) {
  var bits = request.method.split('-');
  console.log('handleMessage', bits);
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
        url = request.url,
        silent = request.silent,
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
