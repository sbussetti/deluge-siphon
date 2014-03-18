//these should hang around for the life of the controller,
//but shouldn't get put into local storage.
var DELUGE_CONFIG = null;
var DAEMON_INFO = {
	host_id: null,
	version: null,
	connected: false
};
var SERVER_URL = localStorage['server_url'];

String.prototype.hashCode = function(){
	var hash = 0, i, char;
	if (this.length == 0) return hash;
	for (i = 0, l = this.length; i < l; i++) {
		char  = this.charCodeAt(i);
		hash  = ((hash<<5)-hash)+char;
        hash |= 0; // Convert to 32bit integer
    }
    return 'x'+Math.abs(hash);
};

function delugeConnection(url, cookie_domain, silent){
	this.torrent_url = url;
	this.torrent_file = '';	
	this.tmp_download_file = '';
	this.state = '';
	this.silent = silent;
	
	//console.log(url, cookie_domain, silent);
	
	//invalidate cached config info on server change
	if (SERVER_URL != localStorage['server_url']) {
		DELUGE_CONFIG = null;
		DAEMON_INFO = {
			host_id: null,
			version: null,
			connected: false
		};
		SERVER_URL = localStorage['server_url'];		
	}
	
	//get cookies for the current domain
	chrome.cookies.getAll({'domain': cookie_domain}, function(cookies){
    var cookdict = {};
    // dedupe by hash collision
    for (var i = 0; i < cookies.length; i++)  {
      var cook = cookies[i];
      cookdict[cook.name] = cook.value;
    }
    var cooklist = [];
    for (var name in cookdict) {
      cooklist.push(name + '=' + cookdict[name])
    }
    //save out of scope..
    this.cookie = cooklist.join(';');
  }.bind(this));
	
	if (! this.silent)
		notify('Requesting link...', 1000, this.torrent_url.hashCode(), 'request');
		//post back to FE
	this._getSession(); /* 	right now getSession cascades through and ultimately downloads 
							(or until it hits a breakpoint, e.g. without a torrent_url it will never download...)
							this is to ensure we always have a fresh session with the server before we make any DL attempts. */
};
delugeConnection.prototype._getSession = function(){
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'auth.check_session',
    'params':[],
    'id':'-16990'
  });
  this.state = 'getsession';
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getSession__callback) },'application/json');
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
  var SERVER_PASS = localStorage['server_pass'];
  var url = SERVER_URL+'/json';
  var params = JSON.stringify({
    'method': 'auth.login',
    'params':[SERVER_PASS],
    'id':'-17000'
  });
  this.state = 'dologin';
  var connection = this;
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._doLogin__callback) },'application/json');
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
  ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._checkDaemonConnection__callback) },'application/json');
};
delugeConnection.prototype._checkDaemonConnection__callback = function(http, payload) {
	//console.log(payload.result, DAEMON_INFO['host_id']);
	if ( payload.result && DAEMON_INFO['host_id']) {
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
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getDaemons__callback) },'application/json');
};
delugeConnection.prototype._getDaemons__callback = function(http, payload) {
	if ( payload.result ) {
		var url = SERVER_URL+'/json';
		var connection = this;
		
		for (var i = 0; i < payload.result.length; i++){
			var host = payload.result[i];
			var params = JSON.stringify({
				'method': 'web.get_host_status',
				'params':[host[0]],
				'id':'-16992.'+i
			});
			
			//make synchronous calls back about each till we find one connected or exhaust the list
			ajax('POST', url, params, function(http){ connection.handle_readystatechange(http, function(http, payload){
						//["c6099253ba83ea059adb7f6db27cd80228572721", "127.0.0.1", 52039, "Connected", "1.3.5"] 
						if (payload.result) {
							DAEMON_INFO['host_id'] = payload.result[0];
							DAEMON_INFO['connected'] = (payload.result[3] == 'Connected');
							DAEMON_INFO['version'] = payload.result[4];
						} else {
							if (! connection.silent)
								//console.log('getDaemons failed', payload);
								notify('Error: cannot connect to deluge server', 3000, 'server', 'error');						
						}
					})}, 'application/json', false);
			// we're already connected
			if (DAEMON_INFO['connected']) break;
		}
		// if none connected use the last one we looked at and hope for the best,
		// otherwise carry on.
		if (DAEMON_INFO['connected']) 
			this._getCurrentConfig();
		else
			this._connectDaemon();
		
	} else {
		if (! this.silent) {
			//console.log('getDaemons failed', payload);
			notify('Error: cannot connect to deluge server', 3000, 'server', 'error');
		}
	}				
};
delugeConnection.prototype._connectDaemon = function() {
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
		'method': 'web.connect',
		'params':[DAEMON_INFO['host_id']],
		'id':'-16993'
	});
	this.state = 'connectdaemon';
	var connection = this;
	//console.log('connectdaemon', params);
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._connectDaemon__callback) },'application/json');
};
delugeConnection.prototype._connectDaemon__callback = function(http, payload) {
	if ( ! payload.error ) {
		//get config and carry on with execution...
		//console.log('connectdaemon', payload.error  + ' :: ' + http.responseText);
		if (! this.silent)
			notify('Reconnected to server', 3000, 'server');
		this._getCurrentConfig();
	} else {
		if (! this.silent) {
			//console.log('connectDaemons failed', payload);
			notify('Error: ' + payload.error, 3000, 'server', 'error');
		}
	}								
};
/* join point */
delugeConnection.prototype._getCurrentConfig = function(){
	//console.log(DELUGE_CONFIG);
	if ( DELUGE_CONFIG ) { // already cached
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
		ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getCurrentConfig__callback) },'application/json');
	}
};
delugeConnection.prototype._getCurrentConfig__callback = function(http, payload){
	//console.log(payload.result);
	DELUGE_CONFIG = JSON.stringify(payload.result);
	//if we have a torrent url, then next, we autodownload it.  
	//if not this is as far as we can cascade down the automatic chain...
	if ( this.torrent_url )
		this._addTorrent();
};
/* join point */
delugeConnection.prototype._addTorrent = function() {
	if (this.torrent_url.substr(0,7) == 'magnet:') {
		if (DAEMON_INFO['version'] < "1.3.3") 
			notify('Your version of Deluge [' + DAEMON_INFO['version'] + '] does not support magnet links. Consider upgrading.', -1, 'server', 'error')  //this ends the cascade.
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
	//console.log('DLPRAMS', params);
	var url = SERVER_URL+'/json';
	this.state = 'downloadlink';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._downloadTorrent__callback) },'application/json');
};
delugeConnection.prototype._downloadTorrent__callback = function(http, payload) {
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
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getTorrentInfo__callback) },'application/json');
};
delugeConnection.prototype._getTorrentInfo__callback = function(http, payload) {
	//console.log(this.state, http, payload);
	if (! payload || ! payload.result) {
		if (! this.silent)
			notify('Not a valid torrent: ' + this.torrent_url, 3000, this.torrent_url.hashCode(), 'error');
	} else {	
		this._addLocalTorrent();
	}
};
delugeConnection.prototype._addLocalTorrent = function() {
	var torrent_file = this.tmp_download_file;
	var options = JSON.parse(DELUGE_CONFIG);
	var params = JSON.stringify({	
		"method":"web.add_torrents",
		"params":[[{'path': torrent_file, 'options': options}]],
		"id":"-17004.0"
	});
	var url = SERVER_URL+'/json';
	this.state = 'addtorrent';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._addLocalTorrent__callback) },'application/json');
};
delugeConnection.prototype._addLocalTorrent__callback = function(http, payload) {
	if (! this.silent) 

		notify('Torrent added successfully', 1000, this.torrent_url.hashCode(), 'added');
	//console.log(this.torrent_url);
};
delugeConnection.prototype._addRemoteTorrent = function() {
	var torrent_file = this.torrent_url;
	var options = JSON.parse(DELUGE_CONFIG);
	var params = JSON.stringify({	
		"method":"web.add_torrents",
		"params":[[{'path': torrent_file, 'options': options}]],
		"id":"-17004.1"
	});
	var url = SERVER_URL+'/json';
	this.state = 'addtorrent';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._addLocalTorrent__callback) },'application/json');
};
delugeConnection.prototype._addRemoteTorrent__callback = function(http, payload) {
	if (! this.silent)
		notify('Torrent added successfully', 1000, this.torrent_url.hashCode(), 'added');
};
delugeConnection.prototype.handle_readystatechange = function(http, callback){  // this dispatches all the communication...
	if (xmlHttpTimeout) {
		clearTimeout(xmlHttpTimeout)
		xmlHttpTimeout = null;
	}
	if(http.readyState == 4) {
		if(http.status == 200) {
			var payload = JSON.parse(http.responseText||'{}');
			if ( payload.error ) {
				if (! this.silent)
					notify('Error: ' + (payload.error.message || this.state), 10000, this.torrent_url.hashCode(), 'error');
			} else {
				callback.apply(this, [http, payload]);
			}
		} else { //deluge-web error, or a deluged error that causes a web error
			if (this.state == 'checklink') {
				if (! this.silent)
					notify('Not a valid torrent: ' + this.torrent_url, 10000, this.torrent_url.hashCode(), 'error');
			} else {
				if (! this.silent) {
					notify('Your deluge server responded with an error trying to add: ' + this.torrent_url + '. Check the console of the background page for more details.', 10000, this.torrent_url.hashCode(), 'error');
					//console.log(this.state, http, payload);
				}
			}
		}
	}
}

var notifications = {};
function notify(message, decay, id, type) {
	if (! localStorage['inpage_notification'])
		return; // this is just a noop if you have notifications off...
		
	var notification,
	title = 'DelugeSiphon',
	_decay = decay || 3000,
	_type = type ? 'notify_' + type : 'notify', 
	_icon = _icon = '/images/'+_type+'.png';
	
	//console.log('[notify]',  _type, _decay, id, message, id);
	
	// object attr misses are undefined, not null..
	if (notifications[id]){
		// * cannot modify a notification, so instead of this: 
		// notification = notifications[id][0];
		// notification.title = title;
		// notification.message = message;

		// * we do this (to replace the notification).. 
		notifications[id][0].cancel();
		notification = webkitNotifications.createNotification(
			chrome.extension.getURL(_icon),
			title,
			message
			); 
	} else {
		// create a new notification  if we were sent no ID or if we're not tracking this hash
		notification = webkitNotifications.createNotification(
			chrome.extension.getURL(_icon),
			title,
			message
		); 
	}
	notification.show();
	
	var _timeout;
	//negative decay means the user will have to close the window.
	if (_decay != -1) {
		if (notifications[id] && notifications[id][1])
			clearTimeout(notifications[id][1]);
			
		_timeout = setTimeout(function(){ 
			notification.cancel(); 
			if (id != null)
				delete notifications[id];
		}, _decay);
		
	}

	// we've got a notification no matter what, but if we have no
	// id we don't track it and let them stack
	if (id != null)
		notifications[id] = [notification, _timeout]
}

function createContextMenu(){
	chrome.contextMenus.create({
		'title': 'Send to deluge',
		'contexts': ['link'],
		'onclick':function (info, tab) { 
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

function handleContentRequests(request, sender, sendResponse){
	//field connections from the content-handler via Chrome's secure pipeline hooey
  if (request.method.substring(0,8) == "storage-") { //storage type request
  	var bits = request.method.split('-');
    // toss the prefix
    bits.shift();
	  var method = bits.shift(); //get or set?
	  var key = bits.join('-');  //rejoin the remainder in the case where it may have a hyphen in the key..
	  
    // if method is set, set it
	  if (method == 'set')
      localStorage[key] = request['value'];
	  // else respond with the value
	  else
      sendResponse({'value': localStorage[key]});
	  
	} else if (request.method == "contextmenu") {
    /*
      since you can only modify the contextmenu settings from the controller end
      this command allows the settings page to easily request that we enable or disable
      the global contextmenu entry.
    */
	  if (request['toggle']) {
	  	createContextMenu();
	  } else {
	  	chrome.contextMenus.removeAll();
	  }
	} else if (request.method.substring(0,8) == "addlink-" ) { //add to server request
		var url_match = false;
		var bits = request.method.split('-');
		var addtype = bits[1];
		var url = request['url'];
		var silent = request['silent'];
		var domain = request['domain'];

		if ( ! localStorage['server_url'] ) {
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
communicator.observeRequest(handleContentRequests);
/* setup right-click handler */
if (localStorage['enable_context_menu']) createContextMenu();