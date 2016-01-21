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

function delugeConnection(url, cookie_domain, silent){
  console.log('delugeConnection', url, cookie_domain, silent);

  this.torrent_url = url;
  this.torrent_file = '';
  this.tmp_download_file = '';
  this.state = '';
  this.silent = silent;

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
      notify('Requesting link...', 1500, this.torrent_url.hashCode(), 'request');
    this._getSession();
    /*
       getSession cascades through and ultimately downloads
       (or until it hits a breakpoint, e.g. without a torrent_url it will never download...)
       this is to ensure we always have a fresh session with the server before we make any DL attempts.
    */
  }.bind(this));

}
delugeConnection.prototype._getSession = function(){
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'auth.check_session',
    'params':[],
    'id':'-16990'
  });
  this.state = 'getsession';
  var connection = this;
  ajax('POST', url, params, function(http){ connection.handle_readystatechange(http, connection._getSession__callback); });
};
delugeConnection.prototype._getSession__callback = function(http, payload){
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
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._doLogin__callback); });
};
delugeConnection.prototype._doLogin__callback = function(http, payload){
  if ( payload.result ) {
    this._checkDaemonConnection();
  } else {
    if (! this.silent)
      notify('Error: Login failed', 3000, 'server', 'error');
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
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._checkDaemonConnection__callback); });
};
delugeConnection.prototype._checkDaemonConnection__callback = function(http, payload) {
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
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getDaemons__callback); });
};
delugeConnection.prototype._getDaemons__callback = function(http, payload) {
  if ( payload.result ) {
    var url = SERVER_URL+'/json';
    var connection = this;
    // payload.result will be a list of one or more hosts....
    var i = 0,
        hosts = payload.result,
        thar = this;

    var checkHost = function() {
      var host = hosts[i];
      var params = JSON.stringify({
        'method': 'web.get_host_status',
        'params':[host[0]],
        'id':'-16992.'+i
      });

      ajax('POST', url, params, function(http){
        connection.handle_readystatechange(http, function(http, payload){
          //["c6099253ba83ea059adb7f6db27cd80228572721", "127.0.0.1", 52039, "Connected", "1.3.5"]
          if (payload.result) {
            DAEMON_INFO.host_id = payload.result[0];
            DAEMON_INFO.connected = (payload.result[3] == 'Connected');
            DAEMON_INFO.version = payload.result[4];
          } else {
            if (! connection.silent)
              console.log('getDaemons failed', payload);
              notify('Error: cannot connect to deluge server', 3000, 'server', 'error');
          }

          // exit cases.
          i += 1;

          if (DAEMON_INFO.connected) {
            thar._getCurrentConfig();
          } else if (i < hosts.length) {
            checkHost();
          } else { // exhaused hosts
            thar._connectDaemon();
          }
        });
      });
    };

    checkHost();

  } else {
    if (! this.silent) {
      console.log('getDaemons failed', payload);
      notify('Error: cannot connect to deluge server', 3000, 'server', 'error');
    }
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
  var connection = this;
  console.log('connectdaemon', params);
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._connectDaemon__callback); });
};
delugeConnection.prototype._connectDaemon__callback = function(http, payload) {
  if ( ! payload.error ) {
    //get config and carry on with execution...
    console.log('connectdaemon', payload.error  + ' :: ' + http.responseText);
    if (! this.silent)
      notify('Reconnected to server', 1500, 'server');
    this._getCurrentConfig();
  } else {
    if (! this.silent) {
      console.log('connectDaemons failed', payload);
      notify('Error: ' + payload.error, -1, 'server', 'error');
    }
  }
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
    var connection = this;
    ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getCurrentConfig__callback); });
  }
};
delugeConnection.prototype._getCurrentConfig__callback = function(http, payload){
  console.log('_getCurrentConfig__callback', this.torrent_url, payload.result);
  // okay really this should be a deep copy so as to not hang onto a ref to to the result..
  DELUGE_CONFIG = JSON.parse(JSON.stringify(payload.result));
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
      notify('Your version of Deluge [' + DAEMON_INFO.version + '] does not support magnet links. Consider upgrading.', -1, 'server', 'error');
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
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._downloadTorrent__callback); });
};
delugeConnection.prototype._downloadTorrent__callback = function(http, payload) {
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
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getTorrentInfo__callback); });
};
delugeConnection.prototype._getTorrentInfo__callback = function(http, payload) {
  console.log(this.state, http, payload);
  if (! payload || ! payload.result) {
    if (! this.silent)
      notify('Not a valid torrent: ' + this.torrent_url, -1, this.torrent_url.hashCode(), 'error');
  } else {
    this._addLocalTorrent();
  }
};
delugeConnection.prototype._addLocalTorrent = function() {
  var torrent_file = this.tmp_download_file;
  var params = JSON.stringify({
    "method":"web.add_torrents",
    "params":[[{'path': torrent_file, 'options': DELUGE_CONFIG}]],
    "id":"-17004.0"
  });
  var url = SERVER_URL+'/json';
  this.state = 'addtorrent';
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._addLocalTorrent__callback); });
};
delugeConnection.prototype._addLocalTorrent__callback = function(http, payload) {
  if (! this.silent)
    notify('Torrent added successfully', 1500, this.torrent_url.hashCode(), 'added');
  console.log(this.torrent_url);
};
delugeConnection.prototype._addRemoteTorrent = function() {
  var torrent_file = this.torrent_url;
  var params = JSON.stringify({
    "method":"web.add_torrents",
    "params":[[{'path': torrent_file, 'options': DELUGE_CONFIG}]],
    "id":"-17004.1"
  });
  var url = SERVER_URL+'/json';
  this.state = 'addtorrent';
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._addLocalTorrent__callback); });
};
delugeConnection.prototype._addRemoteTorrent__callback = function(http, payload) {
  if (! this.silent)
    notify('Torrent added successfully', 1500, this.torrent_url.hashCode(), 'added');
};
delugeConnection.prototype.handle_readystatechange = function(http, callback){  // this dispatches all the communication...
  if(http.readyState == 4) {
    if(http.status == 200) {
      var payload = JSON.parse(http.responseText||'{}');
      if ( payload.error ) {
        if (! this.silent)
          notify('Error: ' + (payload.error.message || this.state), -1, this.torrent_url.hashCode(), 'error');
      } else {
        callback.apply(this, [http, payload]);
      }
    } else { // deluge-web error, or a deluged error that causes a web error
      if (this.state == 'checklink') {
        if (! this.silent)
          notify('Not a valid torrent: ' + this.torrent_url, -1, this.torrent_url.hashCode(), 'error');
      } else {
        if (! this.silent) {
          notify('Your deluge server responded with an error trying to add: ' + this.torrent_url + '. Check the console of the background page for more details.', -1, this.torrent_url.hashCode(), 'error');
          console.log('COMMS ERROR', this.state, http);
        }
      }
    }
  }
};

var notificationTimeouts = {};
function notify(message, decay, id, type) {
  console.log(message, decay, id, type, localStorage.inpage_notification);
  if (id === null)
    throw "Notification ID is required";
  if (! localStorage.inpage_notification)
    return; // this is just a noop if you have notifications off...

  var _decay = decay || 3000,
      _type = type ? 'notify_' + type : 'notify',
      icon = '/images/' + _type + '.png';

  chrome.notifications.create(id, {
    type: 'basic',
    title: 'DelugeSiphon',
    message: message,
    iconUrl: chrome.extension.getURL(icon)
  }, function(id) {
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

function createContextMenu(){
  chrome.contextMenus.create({
    'title': 'Send to Deluge',
    'contexts': ['link'],
    'onclick': function (info, tab) {
      var torrent_url;
      // extract domain from url..
      var s1 = info.linkUrl.indexOf('//') + 2;
      var domain = info.linkUrl.substring(s1);
      var s2 = domain.indexOf('/');
      if (s2 >= 0) { domain = domain.substring(0, s2); }
      if (endsWith(domain, 'tvtorrents.com')) {
        // in this case, the linkUrl is bogus
        torrent_url = localStorage["site_current_url_" + domain];
      } else {
        torrent_url = info.linkUrl;
      }
      new delugeConnection(torrent_url, domain);
    }
  });
}

function handleMessage(request, sender, sendResponse){
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
      notify('Please configure extension options', -1, 'config', 'error');
      return;
    }
    if (!url) {
      notify('Error: Empty URL detected', 3000, 'server', 'error');
      return;
    }

    url_match = url.match(/^(magnet\:)|((file|(ht|f)tp(s?))\:\/\/).+/) ;
    if (!url_match) {
      notify('Error: Invalid URL ['+url+']', 3000, 'server', 'error');
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
