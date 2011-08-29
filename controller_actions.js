function delugeConnection(url){
	this.torrent_url = url;
	this.torrent_file = '';	
	this.state = '';
	notify('Deluge Siphon', 'Requesting link...');//post back to FE
	this._getSession(); // right now getSession cascades through and ultimately downloads, to ensure we always have a fresh session with the server.
};
delugeConnection.prototype._getSession = function(){
	var SERVER_URL = localStorage['server_url'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'auth.check_session',
			  'params':[],
			  'id':'-1699'
	});
	this.state = 'getsession';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http) },'application/json');
};
delugeConnection.prototype._checkDaemonConnection = function(connection) {
	var SERVER_URL = localStorage['server_url'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.connected',
			  'params':[],
			  'id':'-16990'
	});
	this.state = 'checkdaemonconnection';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http) },'application/json');
};
delugeConnection.prototype._getDaemons = function() {
	var SERVER_URL = localStorage['server_url'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.get_hosts',
			  'params':[],
			  'id':'-16990'
	});
	this.state = 'getdaemons';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http) },'application/json');
};
delugeConnection.prototype._connectDaemon = function() {
	var SERVER_URL = localStorage['server_url'];
	var HOST_ID = localStorage['host_id'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.connect',
			  'params':[HOST_ID],
			  'id':'-16991'
	});
	this.state = 'connectdaemon';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http) },'application/json');
};
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
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http) },'application/json');
};
delugeConnection.prototype._getCurrentConfig = function(){
	var SERVER_URL = localStorage['server_url'];
	if ( localStorage['local_deluge_config'] ) { // already cached
		this._downloadTorrent();
	} else {
		var url = SERVER_URL+'/json';
		var params = JSON.stringify({
				  'method': 'core.get_config_values',
				  'params': [['add_paused', 'compact_allocation', 'download_location',
					'max_connections_per_torrent', 'max_download_speed_per_torrent',
					'max_upload_speed_per_torrent', 'max_upload_slots_per_torrent',
					'prioritize_first_last_pieces']],
				  'id': '-17001'
			});
		this.state = 'getconfig';
		var connection = this;
		ajax('POST',url,params,function(http){ connection.handle_readystatechange(http) },'application/json');
	}
};
delugeConnection.prototype._downloadTorrent = function() {
	var SERVER_URL = localStorage['server_url'];
	var TORRENT_URL = this.torrent_url;
	var params = JSON.stringify({	
					"method":"web.download_torrent_from_url",
					"params":[TORRENT_URL,''],
					"id":"-17002"
				});
	var url = SERVER_URL+'/json';
	this.state = 'downloadlink';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http) },'application/json');
};
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
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http) },'application/json');
};
delugeConnection.prototype.handle_readystatechange = function(http){  // this dispatches all the communication...
	if (xmlHttpTimeout) {
		clearTimeout(xmlHttpTimeout)
		xmlHttpTimeout = null;
	}
	if(http.readyState == 4 && http.status == 200) {
		var payload = JSON.parse(http.responseText||'{}');
		if ( payload.error ) {
			// error
			notify('Deluge Siphon', 'Comm error: '+payload.error.message);
		} else {
			if ( this.state == 'downloadlink' ) {
				localStorage['tmp_download_file'] = payload.result;
				this._addLocalTorrent();
			} else if ( this.state == 'addtorrent' ) {
				notify('Deluge Siphon', 'Torrent added successfully');
			} else if ( this.state == 'getconfig' ) {
				localStorage['local_deluge_config'] = JSON.stringify(payload.result);
				this._downloadTorrent();
			} else if ( this.state == 'getsession' ) {
				if ( payload.result ) {
					this._checkDaemonConnection();			
				} else {
					this._doLogin();					
				}
			} else if ( this.state == 'dologin' ) {
				if ( payload.result ) {
					this._checkDaemonConnection();			
				} else {
					notify('Deluge Siphon', 'Error: Login failed');
				}				
			} else if ( this.state == 'checkdaemonconnection' ) {
				if ( payload.result ) {
					this._getCurrentConfig();
				} else {
					notify('Deluge Siphon', 'Reconnecting...');
					this._getDaemons();					
				}
			} else if ( this.state == 'getdaemons' ) {
				if ( payload.result ) {
					for (var i = 0; i < payload.result.length; i++){
						var host = payload.result[i];
						if ( host[3] == 'Online' ) {
							localStorage['host_id'] = host[0];
							break;
						}
					}
					// if none online pick the first one and hope for the best...
					// my current version appears to incorrectly report online state...
					localStorage['host_id'] = payload.result[0][0];
					this._connectDaemon();
				} else {
					notify('Deluge Siphon', 'Error: cannot connect to deluge server');
				}				
			} else if ( this.state == 'connectdaemon' ) {
				//pretty cool, deluge returns the names of all available webui methods in result onconnect
				if ( payload.result ) {
					//get config and carry on with execution...
					notify('Deluge Siphon', 'Reconnected to server');
					this._getCurrentConfig();
				} else {
					notify('Deluge Siphon', 'Error: cannot connect to deluge server');
				}								
			} else {
				// error
				notify('Deluge Siphon', 'Error: I do not understand: '+this.state);
			}
		}
	} else if(http.readyState == 4) {
		notify('Deluge Siphon', 'Communications Error: '+this.state);
	} 
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

function handleRequests(request, sender, sendResponse){
    if (request.method.substring(0,8) == "storage-") { //storage type request
	  var bits = request.method.split('-');
	  var key = bits[1];
      sendResponse({'value': localStorage[key]});
	} else if (request.method.substring(0,8) == "addlink-" ) { //add to server request
	  var bits = request.method.split('-');
	  var addtype = bits[1];
	  
	  var url = request.url;
	  var popup = localStorage['inpage_notification'];
	  if ( ! localStorage['server_url'] ) {
			notify('Deluge Siphon', 'Please configure extension');
			return;
	  }
	  if ( ! url || url.charAt((url.length - 1)) == '/' ) {
			notify('Deluge Siphon', 'Error: Invalid URL ['+url+']');
			return;
	  }
	  new delugeConnection(url);
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
communicator.observeRequest(handleRequests);
/* setup right-click handler */
chrome.contextMenus.create({
		'title': 'Send to deluge',
		'contexts': ['link'],
		'onclick':function (info, tab) { new delugeConnection(info.linkUrl); }
	});