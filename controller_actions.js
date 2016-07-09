// debug
if (localStorage.enable_debug_logging) {
  console.log('Debug logging enabled');
} else {
  console.log = function() {};
}

// these should hang around for the life of the controller,
// but shouldn't get put into local storage.
var DELUGE_CONFIG = null;
var DAEMON_INFO = {
  host_id: null,
  version: null,
  connected: false
};
var SERVER_URL = localStorage.deluge_server_url;

String.prototype.hashCode = function(){
  var hash = 0, i, char;
  if (this.length === 0) return hash;
  for (i = 0, l = this.length; i < l; i++) {
    char  = this.charCodeAt(i);
    hash  = ((hash<<5)-hash)+char;
        hash |= 0; // Convert to 32bit integer
    }
    return 'x'+Math.abs(hash);
};

/* BEGIN delugeConnection */

function delugeConnection(url, cookie_domain, silent){
  console.log('delugeConnection', url, cookie_domain, silent);

  this.torrent_url = url;
  this.torrent_file = '';
  this.tmp_download_file = '';
  this.state = '';
  this.silent = silent;
  this.host_idx = 0;
  this.daemon_hosts = [];

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

  //get cookies for the current domain
  console.log(cookie_domain, 'and', SERVER_URL, 'vs', localStorage.deluge_server_url);
  chrome.cookies.getAll({'domain': cookie_domain}, function(cookies){
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
    if (! this.silent)
      notify({'message': 'Requesting link...'}, 1500, this.torrent_url.hashCode(), 'request');
    this._getSession();
    /*
       getSession cascades through and ultimately downloads
       (or until it hits a breakpoint, e.g. without a torrent_url it will never download...)
       this is to ensure we always have a fresh session with the server before we make any DL attempts.
    */
  }.bind(this));

}
/* global ajax handlers ... */
delugeConnection.prototype._ajaxError = function (http, status, thrown) {
  if (this.state == 'checklink') {
    if (! this.silent)
      notify({
        message: 'Your Deluge server thinks this is not a valid torrent',
        contextMessage: this.torrent_url
      }, -1, this.torrent_url.hashCode(), 'error');
  } else {
    if (! this.silent) {
      notify({
        message: 'Error communicating with your Deluge server',
        contextMessage: '' + this.torrent_url
      }, -1, this.torrent_url.hashCode(), 'error');
      console.log('Communications error: ' + this.torrent_url, http.responseText, this.state, http);
    }
  }
};
delugeConnection.prototype._serverError = function(payload){  // this dispatches all the communication...
  if (payload.error) {
    if (! this.silent) {
      notify({
        message: 'Your Deluge server responded with an error',
        contextMessage: '' + (payload.error.message || this.state)
      }, -1, this.torrent_url.hashCode(), 'error');
    }
    return true;
  }
  return false;
};
delugeConnection.prototype._getSession = function(){
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
    success: this._getSession__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._getSession__callback = function(payload){
  if (this._serverError(payload)) return;

  if ( payload.result ) {
    this._checkDaemonConnection();
  } else {
    this._doLogin();
  }
};
/* start point */
delugeConnection.prototype._doLogin = function(){
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
    success: this._doLogin__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._doLogin__callback = function(payload){
  if (this._serverError(payload)) return;

  if ( payload.result ) {
    this._checkDaemonConnection();
  } else {
    if (! this.silent)
      notify({'message': 'Error: Login failed'}, 3000, 'server', 'error');
  }
};
/* join point */
delugeConnection.prototype._checkDaemonConnection = function() {
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
    success: this._checkDaemonConnection__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._checkDaemonConnection__callback = function(payload) {
  if (this._serverError(payload)) return;

  console.log(payload.result, DAEMON_INFO.host_id);
  if ( payload.result && DAEMON_INFO.host_id) {
    this._getCurrentConfig();
  } else {
    this._getDaemons();
  }
};
delugeConnection.prototype._getDaemons = function() {
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
    success: this._getDaemons__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._getDaemons__callback = function(payload) {
  if (this._serverError(payload)) return;

  if ( payload.result ) {
    // payload.result will be a list of one or more hosts....
    this.host_idx = 0;
    this.daemon_hosts = payload.result;
    this._getHostStatus();
  } else {
    if (! this.silent) {
      console.log('getDaemons failed', payload);
      notify({'message': 'Error: cannot connect to deluge server'}, 3000, 'server', 'error');
    }
  }
};
delugeConnection.prototype._getHostStatus = function()  {
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
    success: this._getHostStatus__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._getHostStatus__callback = function (payload) {
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
    this._getCurrentConfig();
  } else if (this.host_idx < this.daemon_hosts.length) { // can keep  trying
    this._getHostStatus();
  } else { // exhaused hosts
    this._connectDaemon();
  }
};
delugeConnection.prototype._connectDaemon = function() {
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
    success: this._connectDaemon__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._connectDaemon__callback = function(payload) {
  if (this._serverError(payload)) return;
  //get config and carry on with execution...
  console.log('connectdaemon', payload.error  + ' :: ' + http.responseText);
  if (! this.silent)
    notify({'message': 'Reconnected to server'}, 1500, 'server');
  this._getCurrentConfig();
};
/* join point */
delugeConnection.prototype._getCurrentConfig = function(){
  if (DELUGE_CONFIG) { // already cached
    console.log('Server config', DELUGE_CONFIG);
    this._addTorrent();
  } else {
    var url = SERVER_URL+'/json';
    var params = JSON.stringify({
      'method': 'core.get_config_values',
      'params': [['download_location']],
      'id': '-17001'
    });
    this.state = 'getconfig';
    $.ajax(url, {
    contentType: "application/json",
    processData: false,
      context: this,
      data: params,
      method: 'POST',
      success: this._getCurrentConfig__callback,
      error: this._ajaxError
    });
  }
};
delugeConnection.prototype._getCurrentConfig__callback = function(payload){
  if (this._serverError(payload)) return;

  console.log('_getCurrentConfig__callback', this.torrent_url, payload.result);
  // deep copy
  DELUGE_CONFIG = $.extend(true, payload.result, {});
  //if we have a torrent url, then next, we autodownload it.
  //if not this is as far as we can cascade down the automatic chain...
  if ( this.torrent_url )
    this._addTorrent();
};
/* join point */
delugeConnection.prototype._addTorrent = function() {
  if (this.torrent_url.substr(0,7) == 'magnet:') {
    //this ends the cascade.
    if (versionCompare(DAEMON_INFO.version, '1.3.3', {zeroExtend: true}) < 0)
      notify({'message': 'Your version of Deluge [' + DAEMON_INFO.version + '] does not support magnet links. Consider upgrading.'}, -1, 'server', 'error');
    else
      this._addRemoteTorrent();
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

  console.log(this.state, payload);
  if (! payload || ! payload.result) {
    if (! this.silent)
      notify({'message': 'Not a valid torrent: ' + this.torrent_url}, -1, this.torrent_url.hashCode(), 'error');
  } else {
    this._addLocalTorrent();
  }
};
delugeConnection.prototype._addLocalTorrent = function() {
  var torrent_file = this.tmp_download_file;
  var params = JSON.stringify({
    "method":"web.add_torrents",
    "params":[[{
      'path': torrent_file,
      'options': DELUGE_CONFIG
    }]],
    "id":"-17004.0"
  });
  var url = SERVER_URL+'/json';
  this.state = 'addtorrent';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: this._addLocalTorrent__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._addLocalTorrent__callback = function(payload) {
  if (this._serverError(payload)) return;

  if (! this.silent)
    notify({'message': 'Torrent added successfully'}, 1500, this.torrent_url.hashCode(), 'added');
  console.log(this.torrent_url);
};
delugeConnection.prototype._addRemoteTorrent = function() {
  var torrent_file = this.torrent_url;
  var params = JSON.stringify({
    "method":"web.add_torrents",
    "params":[[{
      'path': torrent_file,
      'options': DELUGE_CONFIG
    }]],
    "id":"-17004.1"
  });
  var url = SERVER_URL+'/json';
  this.state = 'addtorrent';
  $.ajax(url, {
    contentType: "application/json",
    processData: false,
    context: this,
    data: params,
    method: 'POST',
    success: this._addLocalTorrent__callback,
    error: this._ajaxError
  });
};
delugeConnection.prototype._addRemoteTorrent__callback = function(payload) {
  if (this._serverError(payload)) return;

  if (! this.silent)
    notify({'message': 'Torrent added successfully'}, 1500, this.torrent_url.hashCode(), 'added');
};

/* END delugeConnection */

/* BEGIN notifications */

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

  console.log(options, _decay, id, icon_type);

  chrome.notifications.create(id, options, function(id) {
    if (notificationTimeouts[id])
      clearTimeout(notificationTimeouts[id]);

    if (_decay !== -1) {
      notificationTimeouts[id] = setTimeout(function(){
        console.log('clear notification timeout [' + id + ']');
        chrome.notifications.clear(id, function(cleared){});
      }, _decay);
    }
  });
}

function createContextMenu () {
  chrome.contextMenus.create({
    'title': 'Add to Deluge',
    'contexts': ['link'],
    'onclick': function (info, tab) {
      // extract domain from url..
      var torrentUrl = info.linkUrl,
          s1 = torrentUrl.indexOf('//') + 2,
          domain = torrentUrl.substring(s1),
          s2 = domain.indexOf('/');
      if (s2 >= 0) { domain = domain.substring(0, s2); }

      new delugeConnection(torrentUrl, domain);
    }
  });
}

function handleMessage (request, sender, sendResponse) {
  var bits = request.method.split('-');
  console.log('handleMessage', sender, bits);
  //field connections from the content-handler via Chrome's secure pipeline hooey
  if (request.method.substring(0,8) == "storage-") { //storage type request
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

  } else if (request.method == "contextmenu") {
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
  } else if (request.method.substring(0,8) == "addlink-" ) { //add to server request
    var url_match = false;
    var addtype = bits[1];
    var url = request.url;
    var silent = request.silent;
    var domain = request.domain;

    if ( ! localStorage.deluge_server_url ) {
      notify({'message': 'Please configure extension options'}, -1, 'config', 'error');
      return;
    }
    if (!url) {
      notify({'message': 'Error: Empty URL detected'}, 3000, 'server', 'error');
      return;
    }

    url_match = url.match(/^(magnet\:)|((file|(ht|f)tp(s?))\:\/\/).+/) ;
    if (!url_match) {
      notify({'message': 'Error: Invalid URL ['+url+']'}, 3000, 'server', 'error');
      return;
    }

    new delugeConnection(url, domain, silent);

  } else {
      sendResponse({}); // snub them.
  }
}

/* Setup */
communicator.connectToContentScript();
/* process all requests */
communicator.observeMessage(handleMessage);
/* setup right-click handler */
if (localStorage.enable_context_menu) createContextMenu();
