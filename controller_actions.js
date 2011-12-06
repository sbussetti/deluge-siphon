function delugeConnection(url, silent){
	this.torrent_url = url;
	this.torrent_file = '';	
	this.state = '';
	this.silent = silent;
	
	if (! this.silent)
		notify('Deluge Siphon', 'Requesting link...');//post back to FE
	this._getSession(); /* 	right now getSession cascades through and ultimately downloads 
							(or until it hits a breakpoint, e.g. without a torrent_url it will never download...)
							this is to ensure we always have a fresh session with the server before we make any DL attempts. */
};
delugeConnection.prototype._getSession = function(){
	var SERVER_URL = localStorage['server_url'];
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
	var SERVER_URL = localStorage['server_url'];
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
			notify('Deluge Siphon', 'Error: Login failed');
	}	
};
/* join point */
delugeConnection.prototype._checkDaemonConnection = function() {
	var SERVER_URL = localStorage['server_url'];
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
	//console.log('checkdaemonconnection', payload.error, payload.result, http.responseText);
	if ( payload.result ) {
		this._getCurrentConfig();
	} else {
		if (! this.silent)
			notify('Deluge Siphon', 'Reconnecting');
		this._getDaemons();					
	}
};
delugeConnection.prototype._getDaemons = function() {
	var SERVER_URL = localStorage['server_url'];
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
delugeConnection.prototype._getDaemons__callback = function() {
	if ( payload.result ) {
		for (var i = 0; i < payload.result.length; i++){
			var host = payload.result[i];
			if ( host[3] == 'Online' ) {
				localStorage['host_id'] = host[0];
				break;
			}
		}
		// if none online pick the first one and hope for the best...
		// my current deluged version appears to incorrectly report online state...
		//console.log('getdaemons', payload.result);
		localStorage['host_id'] = typeof payload.result[0] == 'object' ? payload.result[0][0] : payload.result[0];
		this._connectDaemon();
	} else {
		if (! this.silent)
			notify('Deluge Siphon', 'Error: cannot connect to deluge server');
	}				
};
delugeConnection.prototype._connectDaemon = function() {
	var SERVER_URL = localStorage['server_url'];
	var HOST_ID = localStorage['host_id'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.connect',
			  'params':[HOST_ID],
			  'id':'-16993'
	});
	this.state = 'connectdaemon';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._connectDaemon__callback) },'application/json');
};
delugeConnection.prototype._connectDaemon__callback = function(http, payload) {
	//pretty cool, deluge returns the names of all available webui methods in result onconnect
	if ( payload.result ) {
		//get config and carry on with execution...
		//console.log('connectdaemon', payload.error  + ' :: ' + http.responseText);
		if (! this.silent)
			notify('Deluge Siphon', 'Reconnected to server');
		this._getCurrentConfig();
	} else {
		if (! this.silent)
			notify('Deluge Siphon', 'Error: cannot connect to deluge server');
	}								
};
/* join point */
delugeConnection.prototype._getCurrentConfig = function(){
	var SERVER_URL = localStorage['server_url'];
	if ( localStorage['local_deluge_config'] ) { // already cached
		this._downloadTorrent();
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
	localStorage['local_deluge_config'] = JSON.stringify(payload.result);
	//if we have a torrent url, then next, we autodownload it.  
	//if not this is as far as we can cascade down the automatic
	//chain...
	if ( this.torrent_url )
		this._downloadTorrent();
};
/* join point */
delugeConnection.prototype._downloadTorrent = function() {
	var cookie = localStorage['client_cookie'];
	var SERVER_URL = localStorage['server_url'];
	var TORRENT_URL = this.torrent_url;
	var params = JSON.stringify({	
					"method":"web.download_torrent_from_url",
					"params":[TORRENT_URL, cookie],
					"id":"-17002"
				});
	var url = SERVER_URL+'/json';
	this.state = 'downloadlink';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._downloadTorrent__callback) },'application/json');
};
delugeConnection.prototype._downloadTorrent__callback = function(http, payload) {
	localStorage['tmp_download_file'] = payload.result;
	this._addLocalTorrent();
};
/* join point */
delugeConnection.prototype._addLocalTorrent = function() {
	var SERVER_URL = localStorage['server_url'];
	var torrent_file = localStorage['tmp_download_file'];
	var options = JSON.parse(localStorage['local_deluge_config']);
	var params = JSON.stringify({	
					"method":"web.add_torrents",
					"params":[[{'path': torrent_file, 'options': options}]],
					"id":"-17003"
				});
	var url = SERVER_URL+'/json';
	this.state = 'addtorrent';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._addLocalTorrent__callback) },'application/json');
};
delugeConnection.prototype._addLocalTorrent__callback = function(http, payload) {
	if (! this.silent)
		notify('Deluge Siphon', 'Torrent added successfully');
};
delugeConnection.prototype.handle_readystatechange = function(http, callback){  // this dispatches all the communication...
	if (xmlHttpTimeout) {
		clearTimeout(xmlHttpTimeout)
		xmlHttpTimeout = null;
	}
	if((http.readyState == 4 && http.status == 200)) {
		var payload = JSON.parse(http.responseText||'{}');
		if ( payload.error ) {
			// probably deluged error
			if (! this.silent)
				notify('Deluge Siphon', 'Comm error: '+payload.error.message);
		} else {
			callback.apply(this, [http, payload]);
		}
	} else if(http.readyState == 4) { //deluge-web error, or a deluged error that causes a web error
		if (this.state == 'downloadlink') { //trying to download something that isn't a torrent file can cause this
			if (! this.silent)
				notify('Deluge Siphon', 'Are you sure this is a torrent file? '+this.torrent_url);
		} else {
			if (! this.silent)
				notify('Deluge Siphon', 'Communications Error: '+this.state);
		}
	} 
	
	return;
}

var xmlHttpTimeout;
function ajax(method, url, params, callback, content_type){
	var http = new XMLHttpRequest();
	method = method || 'GET';
	callback = typeof callback == 'function' ? callback : function(){};
	content_type = content_type || 'text/plain';
	http.open(method,url,true);
	params = params || false;
	http.setRequestHeader("Content-type", content_type);
	http.onreadystatechange = function(){ callback(http); };
	http.send(params);
	xmlHttpTimeout=setTimeout(function(){
		if (http.readyState) //still going..
			http.abort();
	},5000);
}
function handleContentRequests(request, sender, sendResponse){
	//field connections from the content-handler via Chrome's secure pipeline hooey
    if (request.method.substring(0,8) == "storage-") { //storage type request
	  var bits = request.method.split('-');
	  var method = bits[1]; //get or set?
	  var key = bits[2];
	  
	  if (method == 'set') 
		localStorage[key] = request['value'];
	  //console.log('storage', method, key, localStorage[key]);
	  //always return the current value as a response..
      sendResponse({'value': localStorage[key]});
	  
	} else if (request.method.substring(0,6) == "login-" ) { // poll for login
	  var bits = request.method.split('-');
	  var addtype = bits[1];
	  var silent = request['silent'];	  
	  if ( ! localStorage['server_url'] ) {
			notify('Deluge Siphon', 'Please configure extension');
			return;
	  }
	  new delugeConnection('', 'checkdaemonconnection', silent);
	  
	} else if (request.method.substring(0,8) == "addlink-" ) { //add to server request
	  var bits = request.method.split('-');
	  var addtype = bits[1];
	  var url = request['url'];
	  var silent = request['silent'];
	  if ( ! localStorage['server_url'] ) {
			notify('Deluge Siphon', 'Please configure extension');
			return;
	  }
	  if ( ! url || ! url.match(/^((file|(ht|f)tp(s?))\:\/\/).+/) ) {
			notify('Deluge Siphon', 'Error: Invalid URL ['+url+']');
			return;
	  }
	  new delugeConnection(url, null, silent);
	  
    } else {
      sendResponse({}); // snub them.	
	  
	}
}
function notify(title, message, decay) {
	if (!decay)
		decay = 3000;
	if (localStorage['inpage_notification']) {
		var notification = webkitNotifications.createNotification('icon-48.png',title,message); 
		notification.show();
		setTimeout(function(){ notification.cancel() }, decay);
	}
}

/* Setup */
communicator.connectToContentScript();
/* process all requests */
communicator.observeRequest(handleContentRequests);
/* setup right-click handler */
chrome.contextMenus.create({
		'title': 'Send to deluge',
		'contexts': ['link'],
		'onclick':function (info, tab) { new delugeConnection(info.linkUrl); }
	});