// debug
if ( localStorage.enable_debug_logging ) {
	console.log( 'Debug logging enabled' );
} else {
	console.log = function () {};
}

/* BEGIN delugeConnection */
var DAEMON_INFO = {
		status: '',
		port: null,
		ip: null,
		host_id: null,
		version: null
	},
	SERVER_URL = localStorage.deluge_server_url;

function delugeConnection ( cookie_domain, silent ) {
	console.log( 'delugeConnection', cookie_domain, silent );
	this.cookie_domain = cookie_domain;
	this.silent = !!silent;

	this.daemon_hosts = [];
	this.CONNECT_ATTEMPTS = 0;
}

/* public methods */

// TODO: RESOLVE CONSISTENT INTERFACE FOR PUBLICS WRT: PROMISES

delugeConnection.prototype.addTorrent = function ( url, label, options ) {

	console.log( '****> addTorrent', url, label, options );

	this.server_config = {};
	this.plugin_info = {};
	this.torrent_url = url;
	this.torrent_label = label;
	this.torrent_options = options || {};

	notify(
		{ 'message': 'Requesting torrent...', 'contextMessage': '' + this.torrent_url },
		1500,
		this._getNotificationId(),
		'request',
		this.silent
	);

	this

		._connect()

		.then( this._addTorrent.bind( this ) );
};

delugeConnection.prototype.getConfig = function ( callback ) {

	// TODO: kill callback pattern
	console.log( '****> getConfig' );

	notify( { 'message': 'Getting server config...' }, 1500, this._getNotificationId(), null, this.silent );
	this

		._connect()

		.then( callback );
};

delugeConnection.prototype.getTorrentInfo = function ( url ) {

	var $d = jQuery.Deferred();

	console.log( '****> getTorrentInfo', url );
	this.torrent_url = url;
	notify( { 'message': 'Getting torrent info...' }, 1500, this._getNotificationId(), null, this.silent );

	this

		._connect()

		// .then( this._getPlugins.bind( this ) )

		.then( this._downloadTorrent.bind( this ) )

		.then( this._getTorrentInfo.bind( this ) )

		.then( function () {
			console.log( this.plugin_info );
			$d.resolveWith( this, arguments );
		}.bind( this ) );

	return $d;
};

/* helpers */

delugeConnection.prototype._serverError = function ( payload ) { // this dispatches all the communication...
	if ( payload.error ) {
		console.log( '_serverError', payload );
		notify( {
			message: 'Your Deluge server responded with an error',
			contextMessage: '' + ( payload.error.message || this.state )
		}, -1, this._getNotificationId(), 'error', this.silent );
		return true;
	}
	return false;
};

delugeConnection.prototype._getNotificationId = function () {
	return !!this.torrent_url ? '' + this.torrent_url.hashCode() : 'server';
};

/* deferred helpers */

delugeConnection.prototype._connect = function () {
	// ensure all our config stuff is up to date and then peform the
	// action in the callback

	this.state = '';
	// invalidate cached config info on server change
	// TODO: this needs to check more than  the url (should be timestamp  of
	// last settings change vs check)
	if ( SERVER_URL != localStorage.deluge_server_url ) {
		this.daemon_hosts = [];
		this.CONNECT_ATTEMPTS = 0;
		DAEMON_INFO = {
			status: '',
			port: null,
			ip: null,
			host_id: null,
			version: null
		};
		SERVER_URL = localStorage.deluge_server_url;
	}

	return this._getDomainCookies()

		.then( this._getSession.bind( this ) )

		.then( null, this._doLogin.bind( this ) )

		.then( this._checkDaemonConnection.bind( this ) )

		.then( null, this._getDaemons.bind( this ) )

		.then( this._getConnectedDaemon.bind( this ) )

		.then( this._getServerConfig.bind( this ) )

        .promise();

};

delugeConnection.prototype._request = function ( state, params ) {
	var $d = jQuery.Deferred();
	this.state = state;

	$.ajax( SERVER_URL + '/json', {
		contentType: "application/json",
		processData: false,
		data: JSON.stringify( params ),
		method: 'POST',
		timeout: 10000
	} ).then(
		// success
		function ( payload, status, jqhxr ) {

			// console.log( '_request__success', payload, status, jqhxr );
			if ( this._serverError( payload ) ) {
				$d.rejectWith( this );
			} else {
				$d.resolveWith( this, [ payload ] );
			}
		}.bind( this ),
		// fail
		function ( http, status, thrown ) {

			// console.log( '_request__fail', this.state, http.statusCode(), http.statusText );
			notify( {
				message: ( this.state == 'torrentinfo' ? 'Your Deluge server thinks this is not a valid torrent' : 'Error communicating with your Deluge server' ),
				contextMessage: ( !!this.torrent_url ? '' + this.torrent_url : '' )
			}, -1, this._getNotificationId(), 'error', this.silent );
			$d.rejectWith( this );

		}.bind( this )
	);

	return $d.promise();
};

/* get auth / config / setup logic */

delugeConnection.prototype._getDomainCookies = function () {

	var $d = jQuery.Deferred();

	if ( !this.cookie ) {
		console.log( '_getDomainCookies', 'for', this.cookie_domain );
		//, 'and', SERVER_URL, 'vs', localStorage.deluge_server_url );
		//get cookies for the current domain
		chrome.cookies.getAll( { 'domain': this.cookie_domain }, function ( cookies ) {

			var cookdict = {};
			for ( var i = 0, l = cookies.length; i < l; i++ ) {
				var cook = cookies[ i ];
				cookdict[ cook.name ] = cook.value;
			}
			var cooklist = [];
			for ( var name in cookdict ) {
				cooklist.push( name + '=' + cookdict[ name ] );
			}

			//save out of scope..
			this.cookie = cooklist.join( ';' );
			$d.resolveWith( this, [ this.cookie ] );
		}.bind( this ) );
	}

	return $d.promise();
};

delugeConnection.prototype._getSession = function () {

	var $d = jQuery.Deferred();
	this._request( 'getsession', {
		'method': 'auth.check_session',
		'params': [],
		'id': '-16990'
	} ).then( function ( payload ) {
		if ( !!payload.result ) { // success
			console.log( '_getSession', 'valid' );
			$d.resolveWith( this, [ payload.result ] );
		} else { // "fail"
			console.log( '_getSession', 'invalid' );
			$d.rejectWith( this );
		}
	} );
	return $d.promise();
};

delugeConnection.prototype._doLogin = function () {
	var $d = jQuery.Deferred();
	this._request( 'dologin', {
		'method': 'auth.login',
		'params': [ localStorage.server_pass ],
		'id': '-17000'
	} ).then( function ( payload ) {
		console.log( '_doLogin__callback', payload.result );
		if ( !!payload.result ) {
			$d.resolveWith( this, [ payload.result ] );
		} else {
			notify( { 'message': 'Error: Login failed' }, 3000, 'server', 'error', this.silent );
			$d.rejectWith( this );
		}
	} );
	return $d.promise();
};

delugeConnection.prototype._checkDaemonConnection = function () {

	var $d = jQuery.Deferred();

	console.log( '_checkDaemonConnection', DAEMON_INFO );

	if ( !DAEMON_INFO || !DAEMON_INFO.host_id ) {

		$d.rejectWith( this );

	} else {

		this._request( 'checkdaemonconnection', {
			'method': 'web.connected',
			'params': [],
			'id': '-16991'
		} ).then( function ( payload ) {

			console.log( '_checkDaemonConnection__callback', payload );

			if ( !!payload.result ) {

				$d.resolveWith( this );

			} else {

				$d.rejectWith( this );
			}
		} );
	}

	return $d.promise();
};

delugeConnection.prototype._getDaemons = function () {

	var $d = jQuery.Deferred();
	this._request( 'getdaemons', {
		'method': 'web.get_hosts',
		'params': [],
		'id': '-16992'
	} ).then( function ( payload ) {
		if ( !!payload.result ) {
			// payload.result will be a list of one or more hosts....
			this.daemon_hosts = payload.result;
			console.log( '_getDaemons__callback', payload );
			$d.resolveWith( this, [ payload.result ] );
		} else {
			this.daemon_hosts = [];
			console.log( '_getDaemons failed', payload );
			notify( { 'message': 'Error: cannot connect to deluge server' }, 3000, 'server', 'error', this.silent );
			$d.rejectWith( this );
		}
	} );
	return $d.promise();

};

delugeConnection.prototype._getHostStatus = function ( hostId ) {

	console.log( '_getHostStatus', hostId );

	var $d = jQuery.Deferred();

	this._request( 'gethoststatus', {
		'method': 'web.get_host_status',
		'params': [ hostId ],
		'id': '-16992.' + this.host_idx
	} ).then( function ( payload ) {


		if ( !payload.result ) {

			console.log( '_getHostStatus__callback', hostId, 'failed', payload );

			notify( { 'message': 'Error: cannot connect to deluge server' }, 3000, 'server', 'error', this.silent );


			return $d.rejectWith( this );

		} else {

			// ["c6099253ba83ea059adb7f6db27cd80228572721", "127.0.0.1", 52039, "Connected", "1.3.5"]
			var daemon_info = {
				status: payload.result[ 3 ],
				port: payload.result[ 2 ],
				ip: payload.result[ 1 ],
				host_id: payload.result[ 0 ],
				version: payload.result[ 4 ]
			};

			console.log( '_getHostStatus__callback', daemon_info );

			$d.resolveWith( this, [ daemon_info ] );
		}

	}.bind( this ) );

	return $d.promise();
};

delugeConnection.prototype._getConnectedDaemon = function ( daemon_hosts ) {

	var promises = [];

	$.each( daemon_hosts, function ( i, daemon_host ) {

		// nested deferred...
		var $nd = this._getHostStatus( daemon_host[ 0 ] )

			.then( function ( daemon_info ) {

				var $d = jQuery.Deferred();

				// exit cases.
				switch ( daemon_info.status ) {

					case 'Connected':

						console.log( '_getConnectedDaemon__callback', 'Connected', daemon_info );

						$d.resolveWith( this, [ daemon_info ] );

						break;

					case 'Online':

						console.log( '_getConnectedDaemon__callback', 'Connecting' );

						$d = this._connectDaemon( daemon_info );

						break;

					case 'Offline':

						console.log( '_getConnectedDaemon__callback', 'Connecting' );

						$d = this._startDaemon( daemon_info )

							.then( this._connectDaemon.bind( this ) );

						break;

					default:

						console.log( '_getConnectedDaemon__callback', 'UNKNOWN STATUS: ' + daemon_info.status );

						notify(
							{
								'message': 'Error: failed to connect to deluge server: `' + daemon_info.ip + ':' + daemon_info.ip + '`'
							},
							3000,
							'server',
							'error',
							this.silent );

						$d.rejectWith( this );

						break;

				}

				return $d.promise();

			}.bind( this ) )

			.then( function ( daemon_info ) {

				DAEMON_INFO = daemon_info;
				this.CONNECT_ATTEMPTS = 0;

                return daemon_info;

			}.bind( this ) );

		promises.push( $nd );

	}.bind( this ) );


	var $d = jQuery.Deferred();

	$.when.apply( $, promises ).then( function () {

		$d.resolveWith( this, arguments );

	}.bind( this ) );

	return $d.promise();

};

delugeConnection.prototype._startDaemon = function ( daemon_info ) {

	var $d = jQuery.Deferred();

	console.log( '_startDaemon', daemon_info );

	this._request( 'startdaemon', {
		'method': 'web.start_daemon',
		'params': [ daemon_info.port ],
		'id': '-16993'
	} ).then( function ( payload ) {

		console.log( '_startDaemon__callback', payload );
		if ( !payload.error ) {

			//get config and carry on with execution...
			notify( { 'message': 'Starting server ' + daemon_info.ip + ':' + daemon_info.port }, 1500, 'server', null, this.silent );
			$d.resolveWith( this, [ daemon_info ] );

		} else {

			// try to go to next
			console.log( this.state, 'ERROR', payload );

			$d.rejectWith( this, [ daemon_info ] );
		}

	}.bind( this ) );

	return $d.promise();
};

delugeConnection.prototype._connectDaemon = function ( daemon_info ) {

	var $d = jQuery.Deferred();

	console.log( '_connectDaemon', daemon_info );

	if ( daemon_info.status === 'Online' ) {

		this._request( 'connectdaemon', {
			'method': 'web.connect',
			'params': [ daemon_info.host_id ],
			'id': '-16994'
		} ).then( function ( payload ) {

			console.log( '_connectDaemon__callback', payload );
			if ( !payload.error ) {

				//get config and carry on with execution...
				notify( { 'message': 'Reconnected to server' }, 1500, 'server', null, this.silent );

				$d.resolveWith( this );

			} else {

				// try next
				console.log( '_connectDaemon__callback', this.state, 'ERROR', payload );
				$d.rejectWith( this, [ daemon_info ] );

			}

		}.bind( this ) );

	} else if ( this.CONNECT_ATTEMPTS > 5 ) {

		notify( { 'message': 'Gave up waiting on ' + daemon_info.ip + ':' + daemon_info.port }, 1500, 'server', 'error', this.silent );
		$d.rejectWith( this, [ daemon_info ] );

	} else {

		this.CONNECT_ATTEMPTS += 1;

		// not ready... wait a little, then try again
		notify( { 'message': daemon_info.ip + ':' + daemon_info.port + ' not ready to connect.  Waiting...' }, 1500, 'server', null, this.silent );

		setTimeout( function () {

			this._getHostStatus( daemon_info.host_id )

				.then( this._connectDaemon.bind( this ) )

				.then( function () {

					$d.resolveWith( this );

				}.bind( this ) );

		}.bind( this ), 5000 );

	}

	return $d.promise();
};

delugeConnection.prototype._getServerConfig = function ( daemon_info ) {

	console.log( '_getServerConfig', daemon_info );

	var $d = jQuery.Deferred();

	this._request( 'getconfig', {
		'method': 'core.get_config_values',
		'params': [ [
			'download_location',
			'move_completed',
			'move_completed_path',
			'add_paused'
		] ],
		'id': '-17001'
	} ).then( function ( payload ) {

		// TODO: no failure (empty payload) state

		console.log( '_getServerConfig__callback', payload.result );
		this.server_config = $.extend( true, {}, payload.result );
		$d.resolveWith( this, [ this.server_config, daemon_info ] );

	}.bind( this ) );

	return $d.promise();

};

/* NEW: GET PLUGIN DETAILS */

delugeConnection.prototype._getPlugins = function () {
	var $d = jQuery.Deferred();
	this._request( 'getplugins', {
		'method': 'web.get_plugins',
		'params': [],
		'id': '-17001.1'
	} ).then( function ( payload ) {
		console.log( '_getPlugins__callback', payload.result );
		if ( !!payload.result ) {
			var requests = $.map( payload.result.enabled_plugins, function ( name ) {
				if ( this[ '_get' + name + 'Info' ] ) return this[ '_get' + name + 'Info' ]();
			}.bind( this ) );

			$.when.apply( $, requests ).then( function () {
				this.plugin_info = $.makeArray( arguments ).reduce( function ( p, c ) {
					return $.extend( p, c );
				}, {} );
				$d.resolveWith( this, [ this.plugin_info ] );
			}.bind( this ) );
		} else {
			$d.rejectWith( this );
		}
	}.bind( this ) );
	return $d.promise();
};

delugeConnection.prototype._getLabelInfo = function () {
	return this._request( 'getlabelinfo', {
		'method': 'label.get_labels',
		'params': [],
		'id': '-17001.2'
	} ).then( function ( payload ) {
		console.log( '_getLabelInfo__callback', payload );
		return { 'Label': payload.result };
	} );
};

delugeConnection.prototype._getBlocklistInfo = function () {
	return this._request( 'getblocklistinfo', {
		'method': 'blocklist.get_status',
		'params': [],
		'id': '-17001.3'
	} ).then( function ( payload ) {
		console.log( '_getBlocklistInfo__callback', payload );
		return { 'Blocklist': payload.result };
	} );
};

/* add torrent logic */

delugeConnection.prototype._addTorrent = function ( server_config, daemon_info ) {

	console.log( '_addTorrent', server_config, daemon_info );

	var $d = jQuery.Deferred();

    this

        ._downloadTorrent( server_config )

        .then( this._getTorrentInfo.bind( this ) )

        .then( this._addTorrentToServer.bind( this ) )

        .then( function () {

            $d.resolveWith( this );

        }.bind( this ) );


	return $d.promise();

};

delugeConnection.prototype._downloadTorrent = function ( server_config ) {
	// download a remote torrent url, with authentication if needed to your server
	var $d = jQuery.Deferred();

	if ( this.torrent_url.substr( 0, 7 ) == 'magnet:' ) {

		$d.resolveWith( this, [ this.torrent_url, server_config ] );

	} else {

		console.log( '_downloadTorrent', this.state, [ this.torrent_url, this.cookie ] );
		this._request( 'downloadlink', {
			"method": "web.download_torrent_from_url",
			"params": [ this.torrent_url, this.cookie ],
			"id": "-17002"
		} ).then(
			function ( payload ) {
				if ( !payload || !payload.result ) {
					notify( { 'message': 'Failed to download torrent: ' + this.torrent_url }, -1, this._getNotificationId(), 'error', this.silent );
					$d.rejectWith( this );
				} else {

					console.log( '_downloadTorrent__callback', payload.result );
					$d.resolveWith( this, [ payload.result, server_config ] );

				}
			},
			function () {
				console.log( arguments );
				$d.rejectWith( this );
			}
		);

	}

	return $d.promise();
};

delugeConnection.prototype._getTorrentInfo = function ( torrent_file, server_config ) {
	console.log( '_getTorrentInfo', this.state, torrent_file );

	// get info about a previously downloaded torrent file or a magnet link
	var $d = jQuery.Deferred();

	this._request( 'torrentinfo', {
		"method": ( this.torrent_url.substr( 0, 7 ) == 'magnet:' ? "web.get_magnet_info" : "web.get_torrent_info" ),
		"params": [ torrent_file ],
		"id": "-17003"
	} ).then( function ( payload ) {
		console.log( '_getTorrentInfo__callback', this.state, payload );
		if ( !payload || !payload.result ) {
			notify( { 'message': 'Not a valid torrent: ' + this.torrent_url }, -1, this._getNotificationId(), 'error', this.silent );
			$d.rejectWith( this );
		} else {
			// TODO: CHECK FOR ERRORS
			$d.resolveWith( this, [ torrent_file, payload.result, server_config ] );
		}
	} );

	return $d.promise();
};

delugeConnection.prototype._addTorrentToServer = function ( torrent_file, torrent_info, server_config ) {

	this._request( 'addtorrent', {
		"method": "web.add_torrents",
		"params": [ [ {
			'path': torrent_file,
			'options': $.extend( true, {}, this.server_config, this.torrent_options )
		} ] ],
		"id": "-17004.0"
	} ).then( function ( payload ) {
		console.log( '_addTorrentToServer__callback', payload );
		notify( { 'message': 'Torrent added successfully' }, 1500, this._getNotificationId(), 'added', this.silent );
	} );

};

/* END delugeConnection */

/* BEGIN Setup */

var notificationTimeouts = {};

function notify ( opts, decay, id, icon_type, silent ) {
	if ( !!silent || !localStorage.inpage_notification )
		return; // this is just a noop if you have notifications off...

	if ( id === null )
		throw "Notification ID is required";

	var _decay = decay || 3000,
		// notify, error, added or request
		_icon = '/images/' + ( icon_type ? 'notify_' + icon_type : 'notify' ) + '.png',
		options = {
			title: 'delugesiphon',
			type: 'basic',
			iconUrl: chrome.extension.getURL( _icon )
		};

	for ( var attr in opts ) {
		options[ attr ] = opts[ attr ];
	}

	// console.log( '[[[ NOTIFICATION ]]]', options, _decay, id, icon_type, '[[[ NOTIFICATION ]]]' );

	chrome.notifications.create( id, options, function ( id ) {
		if ( notificationTimeouts[ id ] )
			clearTimeout( notificationTimeouts[ id ] );

		if ( _decay !== -1 ) {
			notificationTimeouts[ id ] = setTimeout( function () {
				// console.log( 'NOTIFY: clear notification timeout [' + id + ']' );
				chrome.notifications.clear( id, function ( cleared ) {} );
			}, _decay );
		}
	} );
}

function createContextMenu () {
	chrome.contextMenus.removeAll( function () {

		chrome.contextMenus.create( {
			'id': 'add-with-options',
			'title': 'Add with Options',
			'contexts': [ 'link' ],
			'onclick': function ( info, tab ) {
				// extract domain from url..
				var torrentUrl = info.linkUrl,
					s1 = torrentUrl.indexOf( '//' ) + 2,
					domain = torrentUrl.substring( s1 ),
					s2 = domain.indexOf( '/' );
				if ( s2 >= 0 ) {
					domain = domain.substring( 0, s2 );
				}

				var sender = $.extend( true, {}, info, { 'tab': tab } );
				new delugeConnection( domain )
					.getTorrentInfo( torrentUrl )
					.done( function ( file_name, info ) {
						communicator.sendMessage( {
							'method': 'add_dialog',
							'url': torrentUrl,
							'domain': domain,
							'config': this.server_config,
							'info': info,
							'plugins': this.plugin_info
						}, null, null, communicator.getSenderID( sender ) );
					} );
			}
		} );

		chrome.contextMenus.create( {
			'id': 'add',
			'title': 'Add',
			'contexts': [ 'link' ],
			'onclick': function ( info, tab ) {
				// extract domain from url..
				var torrentUrl = info.linkUrl,
					s1 = torrentUrl.indexOf( '//' ) + 2,
					domain = torrentUrl.substring( s1 ),
					s2 = domain.indexOf( '/' );
				if ( s2 >= 0 ) {
					domain = domain.substring( 0, s2 );
				}

				new delugeConnection( domain ).addTorrent( torrentUrl );
			}
		} );

	} );
}

if ( localStorage.enable_context_menu ) {

	createContextMenu();

}

function handleMessage ( request, sendResponse ) {
	console.log( 'HANDLE MESSAGE', request );
	var bits = request.method.split( '-' );
	//field connections from the content-handler via Chrome's secure pipeline hooey
	if ( request.method == "contextmenu" ) {
		/*
		  since you can only modify the contextmenu settings from the controller end
		  this command allows the settings page to easily request that we enable or disable
		  the global contextmenu entry.
		  */
		if ( request.toggle ) {
			createContextMenu();
		} else {
			chrome.contextMenus.removeAll();
		}
	} else if ( request.method == "notify" ) {
		notify( request.opts, request.decay, 'content', request.type );
	} else if ( request.method.substring( 0, 8 ) == "storage-" ) { //storage type request
		// toss the prefix
		bits.shift();
		var method = bits.shift(); //get or set?
		var key = bits.join( '-' ); //rejoin the remainder in the case where it may have a hyphen in the key..

		// if method is set, set it
		if ( method == 'set' )
			localStorage[ key ] = request.value;
		// else respond with the value
		else
			sendResponse( { 'value': localStorage[ key ] } );

	} else if ( request.method.substring( 0, 8 ) == "addlink-" ) { //add to server request

		var url_match = false,
			addtype = bits[ 1 ],
			silent = request.silent,
			url = request.url,
			domain = request.domain,
			label = request.label,
			options = request.options;

		if ( !localStorage.deluge_server_url ) {
			notify( { 'message': 'Please configure extension options' }, -1, 'config', 'error' );
			return;
		}
		if ( !url ) {
			notify( { 'message': 'Error: Empty URL' }, 3000, 'server', 'error' );
			return;
		}
		url_match = url.match( /^(magnet\:)|((file|(ht|f)tp(s?))\:\/\/).+/ );
		if ( !url_match ) {
			notify( { 'message': 'Error: Invalid URL `' + url + '`' }, 3000, 'server', 'error' );
			return;
		}

		if ( addtype === 'todeluge' ) {

			new delugeConnection( domain, silent )
				.addTorrent( url, label, options );

		} else if ( addtype === 'todeluge:withoptions' ) {

			new delugeConnection( domain, silent )
				.getTorrentInfo( url )
				.done( function ( file_name, info ) {
					sendResponse( {
						'method': 'add_dialog',
						'url': url,
						'domain': domain,
						'config': this.server_config,
						'info': info,
						'plugins': this.plugin_info
					} );
				} );

		} else {
			notify( { 'message': 'Unknown server type: `' + addtype + '`' }, 3000, 'server', 'error' );
		}
	} else {
		sendResponse( { 'error': 'unknown method: `' + request.method + '`' } ); // snub them.
	}
}

communicator
	.observeMessage( handleMessage )
	.init();

chrome.runtime.onInstalled.addListener( function () {
	chrome.tabs.create( { url: 'https://sbussetti.github.io/deluge-siphon/' } );
} );
