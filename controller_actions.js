function retrieveStorage(port,key){
	port.postMessage({key:localStorage[key]});
}

function handleRequests(request, sender, sendResponse){
    if (request.method.substring(0,8) == "storage-") {
	  var bits = request.method.split('-');
	  var key = bits[1];
      sendResponse({'value': localStorage[key]});
    } else {
      sendResponse({}); // snub them.	
	}
}


function addLinkToDeluge(port,url){
	//console.log('addLinkToDeluge', port);		
	var popup = localStorage['inpage_notification'];
	if ( ! localStorage['server_url'] ) {
		port.postMessage({error:'Please configure extension.',notify:true});
		return;
	}
	
	if ( ! url || url.charAt((url.length - 1)) == '/' ) {
		port.postMessage({error:'Invalid URL.',notify:popup});
		return;
	}
	localStorage['tmp_download_url'] = url;
	port.postMessage({message:'Requesting link...',notify:popup});
	_getSession(port);
}


/* This is silly and when i stop being lazy should be reafactored */

function _getSession(port){
	//console.log('_getSession');
	var SERVER_URL = localStorage['server_url'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'auth.check_session',
			  'params':[],
			  'id':'-1699'
	});
	ajax('POST',url,params,function(http){ handle_readystatechange(http,'getsession',port) },'application/json');
}


function _checkDaemonConnection (port) {
	//console.log('_checkDaemonConnection');
	var SERVER_URL = localStorage['server_url'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.connected',
			  'params':[],
			  'id':'-16990'
	});
	ajax('POST',url,params,function(http){ handle_readystatechange(http,'checkdaemonconnection',port) },'application/json');
}

function _getDaemons (port) {
	//console.log('_getDaemons');
	var SERVER_URL = localStorage['server_url'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.get_hosts',
			  'params':[],
			  'id':'-16990'
	});
	ajax('POST',url,params,function(http){ handle_readystatechange(http,'getdaemons',port) },'application/json');
}

function _connectDaemon (port) {
	//console.log('_connectDaemon');
	var SERVER_URL = localStorage['server_url'];
	var HOST_ID = localStorage['host_id'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.connect',
			  'params':[HOST_ID],
			  'id':'-16991'
	});
	ajax('POST',url,params,function(http){ handle_readystatechange(http,'connectdaemon',port) },'application/json');
}

function _doLogin(port){
	//console.log('_doLogin');
	var SERVER_URL = localStorage['server_url'];
	var SERVER_PASS = localStorage['server_pass'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'auth.login',
			  'params':[SERVER_PASS],
			  'id':'-1700'
	});
	ajax('POST',url,params,function(http){ handle_readystatechange(http,'dologin',port) },'application/json');
}

function _getCurrentConfig(port){
	//console.log('_getCurrentConfig');
	var SERVER_URL = localStorage['server_url'];
	if ( localStorage['local_deluge_config'] ) {
		_downloadTorrent(port);
	} else {
		var url = SERVER_URL+'/json';
		var params = JSON.stringify({
				  'method': 'core.get_config_values',
				  'params': [['add_paused', 'compact_allocation', 'download_location',
					'max_connections_per_torrent', 'max_download_speed_per_torrent',
					'max_upload_speed_per_torrent', 'max_upload_slots_per_torrent',
					'prioritize_first_last_pieces']],
				  'id': '-1701'
			});
		ajax('POST',url,params,function(http){ handle_readystatechange(http,'getconfig',port) },'application/json');
	}
}

function _downloadTorrent (port) {
	//console.log('_downloadTorrent');
	var SERVER_URL = localStorage['server_url'];
	var torrent_url = localStorage['tmp_download_url'];
	var params = JSON.stringify({	
					"method":"web.download_torrent_from_url",
					"params":[torrent_url,''],
					"id":"-1702"
				});
	var url = SERVER_URL+'/json';
	ajax('POST',url,params,function(http){ handle_readystatechange(http,'downloadlink',port) },'application/json');
}

function _addLocalTorrent (port) {
	//console.log('_addLocalTorrent');
	var SERVER_URL = localStorage['server_url'];
	var torrent_file = localStorage['tmp_download_file'];
	var options = JSON.parse(localStorage['local_deluge_config']);
	var params = JSON.stringify({	
					"method":"web.add_torrents",
					"params":[[{'path': torrent_file, 'options': options}]],
					"id":"-1703"
				});
	var url = SERVER_URL+'/json';
	ajax('POST',url,params,function(http){ handle_readystatechange(http,'addtorrent',port) },'application/json');
}

function handle_readystatechange(http,type,port){
	if(http.readyState == 4 && http.status == 200) {
		var payload = JSON.parse(http.responseText||'{}');
		var popups = localStorage['inpage_notification'];
		if ( payload.error ) {
			// error
			port.postMessage({error:'Comm error: '+payload.error.message,notify:popups});
		} else {
			//console.log(type, payload.result);		
			if ( type == 'downloadlink' ) {
				localStorage['tmp_download_file'] = payload.result;
				_addLocalTorrent(port);
			} else if ( type == 'addtorrent' ) {
				//notify success
				port.postMessage({message:'Torrent added successfully.',notify:popups});
			} else if ( type == 'getconfig' ) {
				localStorage['local_deluge_config'] = JSON.stringify(payload.result);
				_downloadTorrent(port);
			} else if ( type == 'getsession' ) {
				if ( payload.result ) {
					_checkDaemonConnection(port);			
				} else {
					port.postMessage({message:'Logging in...',notify:popups});
					_doLogin(port);					
				}
			} else if ( type == 'dologin' ) {
				if ( payload.result ) {
					//_getCurrentConfig(port);
					_checkDaemonConnection(port);			
				} else {
					port.postMessage({error:'Login failed.',notify:popups});
				}				
			} else if ( type == 'checkdaemonconnection' ) {
				if ( payload.result ) {
					_getCurrentConfig(port);
				} else {
					_getDaemons(port);
					port.postMessage({message:'Reconnecting...',notify:popups});
				}
			} else if ( type == 'getdaemons' ) {
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
					_connectDaemon(port);
				} else {
					port.postMessage({message:'Failed, check your deluge server...',notify:popups});
				}				
			} else if ( type == 'connectdaemon' ) {
				//pretty cool, deluge returns the names of all available webui methods in result onconnect
				if ( payload.result ) {
					//get config and carry on with execution...
					port.postMessage({message:'Reconnected to host.',notify:popups});
					_getCurrentConfig(port);
				} else {
					port.postMessage({message:'Failed, check your deluge server...',notify:popups});
				}								
			} else {
				// error
				port.postMessage({error:'I do not understand: '+type,notify:popups});
			}
		}
	} else if(http.readyState == 4) {
		port.postMessage({error:'Communications Error: '+type,notify:popups});
	} 
}

function ajax(method,url,params,callback,content_type){
	var http = new XMLHttpRequest();
	method = method || 'GET';
	callback = typeof callback == 'function' ? callback : function(){};
	content_type = content_type || 'text/plain';
	http.open(method,url,true);
	params = params || false;
	http.setRequestHeader("Content-type", content_type);
	http.onreadystatechange = function(){ callback(http); };
	http.send(params);
}

//oh hooray for new context menu api	
chrome.extension.onConnect.addListener(function(port){
	function handle_context_click(info, tab) {
		addLinkToDeluge(port, info.linkUrl);
	}
	var ctx_id = chrome.contextMenus.create({
			'title': 'Send to deluge',
			'contexts': ['link'],
			'onclick':handle_context_click
		});
});
