function addLinkToDeluge(port,url){
	if ( ! url || url.charAt((url.length - 1)) == '/' ) {
		port.postMessage({error:'Invalid URL.',notify:localStorage['inpage_notification']});
		return;
	}
	localStorage['tmp_download_url'] = url;
	port.postMessage({message:'Requesting link...',notify:localStorage['inpage_notification']});
	_getSession(port);
}

function _getSession(port){
	var SERVER_URL = localStorage['server_url'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'auth.check_session',
			  'params':[],
			  'id':'-1699'
	});
	ajax('POST',url,params,function(http){ handle_readystatechange(http,'getsession',port) },'application/json');
}

function _doLogin(port){
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
			port.postMessage({error:'Comm error: '+payload.error,notify:popups});
		} else {
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
					_getCurrentConfig(port);
				} else {
					port.postMessage({message:'Logging in...',notify:popups});
					_doLogin(port);
				}
			} else if ( type == 'dologin' ) {
				if ( payload.result ) {
					_getCurrentConfig(port);
				} else {
					port.postMessage({error:'Login failed, check password.',notify:popups});
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
