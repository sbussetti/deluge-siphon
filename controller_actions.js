// debug
if ( localStorage.enable_debug_logging ) {
  console.log( 'Debug logging enabled' );
} else {
  console.log = function () {};
}

// globals...
var UA = navigator.userAgent,
  COOKIES = {}; // we need to hang onto your cookies so deluge can ask your sites for files directly..

  /* BEGIN DelugeConnection */

  function DelugeConnection () {

    console.log( 'new DelugeConnection' );

    this._initState();
  }

DelugeConnection.prototype._initState = function () {

  this.state = '';
  this.daemon_hosts = [];
  this.CONNECT_ATTEMPTS = 0;
  this.DAEMON_INFO = {
    status: '',
    port: null,
    ip: null,
    host_id: null,
    version: null
  };
  if ($.type(localStorage.connections) === 'string') {
    try {
      this.CONNECTION_INFO = JSON.parse(localStorage.connections);
    } catch (e) {}
  }
  if (! $.isArray(this.CONNECTION_INFO)) {
    this.CONNECTION_INFO = [];
  }

  this.SERVER_URL = this.CONNECTION_INFO.length ? this.CONNECTION_INFO[0].url : null;
  this.SERVER_PASS = this.CONNECTION_INFO.length ? this.CONNECTION_INFO[0].pass : null;
  this.server_config = {};
  this.plugin_info = {};

  return this;
};


/* public methods */
DelugeConnection.prototype.connectToServer = function ( ) {
  // just logs in and connects and gets server config
  if ( !this.SERVER_URL ) {

    notify( {
      message: 'Server URL is not set',
      contextMessage: 'Click here to visit the options page!',
      isClickable: true,
      requireInteraction: true
    }, -1, 'needs-settings', 'error' );

    return jQuery.Deferred().rejectWith( this, arguments );
  }

  return this._connect();
}

DelugeConnection.prototype.addTorrent = function ( url, cookie_domain, plugins, options ) {

  var $d = jQuery.Deferred();

  if ( !this.SERVER_URL ) {
    $d.rejectWith( this, arguments );

    notify( {
      'message': 'Please visit the options page to get started!'
    }, -1, this._getNotificationId(), 'error' );

    return $d;
  }

  console.log( '****> addTorrent', url, cookie_domain, plugins, options );

  notify(
    {
      'message': 'Adding torrent' + (!!plugins && !!plugins.Label ? ' with label: ' + plugins.Label : '') + '...',
      'contextMessage': '' + url
    },
    3000, this._getNotificationId( url ), 'request' );

  this

    ._connect()

    .then( this._getDomainCookies.curry( cookie_domain ).bind( this ) )

    .then( this._addTorrentUrlToServer.curry( url, options, cookie_domain ).bind( this ) )

    .then( this._processPluginOptions.curry( url, plugins ).bind( this ) )

    .then( function () {

      $d.resolveWith( this, arguments );

    }.bind( this ) );

  return $d;
};

DelugeConnection.prototype.getTorrentInfo = function ( url, cookie_domain ) {

  var $d = jQuery.Deferred();

  if ( !this.SERVER_URL ) {
    $d.rejectWith( this, arguments );

    notify( {
      'message': 'Please visit the options page to get started!'
    }, -1, this._getNotificationId(), 'error' );

    return $d;
  }

  console.log( '****> getTorrentInfo', url, cookie_domain );
  notify( { 'message': 'Getting torrent info...' }, 3000, this._getNotificationId( url ), null );

  this

    ._connect()

    .then( this._getDomainCookies.curry( cookie_domain ).bind( this ) )

    .then( this._getPlugins.bind( this ) )

    .then( this._downloadTorrent.curry( url, cookie_domain ).bind( this ) )

    .then( this._getTorrentInfo.bind( this ) )

    .then( function () {

      $d.resolveWith( this, arguments );

    }.bind( this ) );

  return $d;
};

DelugeConnection.prototype.getPluginInfo = function (silent) {
  return this._connect(silent).then( this._getPlugins.bind( this ) )
};

/* helpers */

DelugeConnection.prototype._serverError = function ( payload, silent ) { // this dispatches all the communication...

    if ( payload.error ) {
      console.error( '_serverError', payload );
      var contextMessage = '' + ( payload.error.message || this.state );
      if (!silent && !!contextMessage && contextMessage !== 'Not authenticated') {
        notify( {
          message: 'Your Deluge server responded with an error',
          contextMessage: contextMessage
        }, -1, this._getNotificationId(), 'error' );
      }
      return true;
    }
  return false;

};

DelugeConnection.prototype._getNotificationId = function ( torrent_url ) {

  return !!torrent_url ? '' + torrent_url.hashCode() : 'server';

};

/* deferred helpers */

DelugeConnection.prototype._connect = function (silent) {
  // ensure all our config stuff is up to date and then peform the
  // action in the callback

  return this

    ._getSession()

    .then( null, function () {
      return this._doLogin(silent);
    }.bind( this ) )

    .then( this._checkDaemonConnection.bind( this ) )

    .then( null, this._getDaemons.bind( this ) )

    .then( this._getConnectedDaemon.bind( this ) )

    .then( this._getServerConfig.bind( this ) )

    .promise();

};

DelugeConnection.prototype._request = function ( state, params, silent ) {
  var $d = jQuery.Deferred();
  this.state = state;

  $.ajax( this.SERVER_URL + '/json', {
    contentType: "application/json",
    processData: false,
    data: JSON.stringify( params ),
    method: 'POST',
    timeout: 10000
  } ).then(
    // success
    function ( payload, status, jqhxr ) {

      // console.log( '_request__success', payload, status, jqhxr );
      if ( this._serverError( payload, silent ) ) {
        $d.rejectWith( this );
      } else {
        $d.resolveWith( this, [ payload ] );
      }
    }.bind( this ),
    // fail
    function ( http, status, thrown ) {
      console.error(http, status, thrown);
      if (!silent && http.status != 0) {
        notify( {
          message: 'Error communicating with your Deluge server',
          contextMessage: http.status + ': ' + status
        }, -1, this._getNotificationId(), 'error' );
      }

      $d.rejectWith( this );

    }.bind( this )
  );

  return $d.promise();
};

/* get auth / config / setup logic */

DelugeConnection.prototype._getDomainCookies = function ( cookie_domain ) {

  var $d = jQuery.Deferred();

  var cookie = COOKIES[ cookie_domain ];

  console.log( '_getDomainCookies', 'for', cookie_domain );

  if ( !!cookie ) {
    $d.resolveWith( this, [ cookie ] );
  } else {
    // get cookies for the current domain
    chrome.cookies.getAll( { 'domain': cookie_domain }, function ( cookies ) {

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
      cookie = cooklist.join( ';' );
      COOKIES[ cookie_domain ] = cookie;
      $d.resolveWith( this, [ cookie ] );

    }.bind( this ) );
  }

  return $d.promise();
};

DelugeConnection.prototype._getSession = function () {

  var $d = jQuery.Deferred();
  this._request( 'getsession', {
    'method': 'auth.check_session',
    'params': [],
    'id': '-16990'
  } ).then( function ( payload ) {
    if ( !!payload.result ) { // success
      console.log( '_getSession', 'valid', payload );
      $d.resolveWith( this, [ payload.result ] );
    } else { // "fail"
      console.error( '_getSession', 'invalid', payload );
      $d.rejectWith( this );
    }
  } );
  return $d.promise();
};

DelugeConnection.prototype._doLogin = function (silent) {
  var $d = jQuery.Deferred();
  this._request( 'dologin', {
    'method': 'auth.login',
    'params': [ this.SERVER_PASS ],
    'id': '-17000'
  }, silent ).then(
    function ( payload ) {
      console.log( '_doLogin__callback', payload.result );
      if ( !!payload.result ) {
        $d.resolveWith( this, [ payload.result ] );
      } else {
        if (!silent) {
          notify( {
            message: 'Login failed',
            contextMessage: 'Click here to visit the options page!',
            isClickable: true,
            requireInteraction: true
          }, -1, 'needs-settings', 'error' );
        }
        $d.rejectWith( this );
      }
    }
  );
  return $d.promise();
};

DelugeConnection.prototype._checkDaemonConnection = function () {

  var $d = jQuery.Deferred();

  console.log( '_checkDaemonConnection', this.DAEMON_INFO );

  if ( !this.DAEMON_INFO || !this.DAEMON_INFO.host_id ) {

    $d.rejectWith( this );

  } else {

    this._request( 'checkdaemonconnection', {
      'method': 'web.connected',
      'params': [],
      'id': '-16991'
    } ).then( function ( payload ) {

      console.log( '_checkDaemonConnection__callback', payload, this.DAEMON_INFO );

      if ( !!payload.result ) {

        $d.resolveWith( this );

      } else {

        $d.rejectWith( this );
      }
    } );
  }

  return $d.promise();
};

DelugeConnection.prototype._getDaemons = function () {

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
      console.error( '_getDaemons failed', payload );
      notify( { 'message': 'Error: cannot connect to deluge server' }, 3000, 'server', 'error' );
      $d.rejectWith( this );
    }
  } );
  return $d.promise();

};

DelugeConnection.prototype._getHostStatus = function ( hostId ) {

  console.log( '_getHostStatus', hostId );

  var $d = jQuery.Deferred();

  this._request( 'gethoststatus', {
    'method': 'web.get_host_status',
    'params': [ hostId ],
    'id': '-16992.' + this.host_idx
  } ).then( function ( payload ) {


    if ( !payload.result ) {

      console.error( '_getHostStatus__callback', hostId, 'failed', payload );

      notify( { 'message': 'Error: cannot connect to deluge server' }, 3000, 'server', 'error' );


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

DelugeConnection.prototype._getConnectedDaemon = function ( daemon_hosts ) {

  var $d = jQuery.Deferred();

  if ( !!this.DAEMON_INFO.host_id ) {

    $d.resolveWith( this, [ this.DAEMON_INFO ] );

  } else {
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

            console.warn( '_getConnectedDaemon__callback', 'UNKNOWN STATUS: ' + daemon_info.status );

            notify( {
              'message': 'Error: failed to connect to deluge server: `' + daemon_info.ip + ':' + daemon_info.port + '`'
            }, 3000, 'server', 'error' );

            $d.rejectWith( this );

            break;

          }

          return $d.promise();

        }.bind( this ) )

        .then( function ( daemon_info ) {

          this.DAEMON_INFO = daemon_info;
          this.CONNECT_ATTEMPTS = 0;

          return daemon_info;

        }.bind( this ) );

      promises.push( $nd );

    }.bind( this ) );


    $.when.apply( $, promises ).then( function () {

      $d.resolveWith( this, arguments );

    }.bind( this ) );
  }

  return $d.promise();

};

DelugeConnection.prototype._startDaemon = function ( daemon_info ) {

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
      notify( { 'message': 'Starting server ' + daemon_info.ip + ':' + daemon_info.port }, 1500, 'server' );
      $d.resolveWith( this, [ daemon_info ] );

    } else {

      // try to go to next
      console.error( this.state, 'ERROR', payload );

      $d.rejectWith( this, [ daemon_info ] );
    }

  }.bind( this ) );

  return $d.promise();
};

DelugeConnection.prototype._connectDaemon = function ( daemon_info ) {

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
        notify( { 'message': 'Reconnected to server' }, 1500, 'server' );

        $d.resolveWith( this );

      } else {

        // try next
        console.error( '_connectDaemon__callback', this.state, 'ERROR', payload );
        $d.rejectWith( this, [ daemon_info ] );

      }

    }.bind( this ) );

  } else if ( this.CONNECT_ATTEMPTS > 5 ) {

    notify( { 'message': 'Gave up waiting on ' + daemon_info.ip + ':' + daemon_info.port }, 1500, 'server', 'error' );
    $d.rejectWith( this, [ daemon_info ] );

  } else {

    this.CONNECT_ATTEMPTS += 1;

    // not ready... wait a little, then try again
    notify( { 'message': daemon_info.ip + ':' + daemon_info.port + ' not ready to connect.  Waiting...' }, 1500, 'server' );

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

DelugeConnection.prototype._getServerConfig = function ( daemon_info ) {

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
  } ).then(
    function ( payload ) {

      // TODO: no failure (empty payload) state
      console.log( '_getServerConfig__callback', payload.result );
      this.server_config = $.extend( true, {}, payload.result );
      $d.resolveWith( this, [ this.server_config, daemon_info ] );

    }.bind( this ),
    function (error) {

      console.error( '_getServerConfig__error', error );
      throw error;

    }.bind( this )
  );

  return $d.promise();

};

/* plugin interactions */

DelugeConnection.prototype._getPlugins = function () {
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

DelugeConnection.prototype._getLabelInfo = function () {
  return this._request( 'getlabelinfo', {
    'method': 'label.get_labels',
    'params': [],
    'id': '-17001.2'
  } ).then( function ( payload ) {
    console.log( '_getLabelInfo__callback', payload );
    return { 'Label': payload.result };
  } );
};

DelugeConnection.prototype._getBlocklistInfo = function () {
  return this._request( 'getblocklistinfo', {
    'method': 'blocklist.get_status',
    'params': [],
    'id': '-17001.3'
  } ).then( function ( payload ) {
    console.log( '_getBlocklistInfo__callback', payload );
    return { 'Blocklist': payload.result };
  } );
};

DelugeConnection.prototype._processPluginOptions = function ( url, plugins, torrentId ) {
  var $d = jQuery.Deferred();

  if ( !!plugins && !!torrentId ) {

    var promises = [];

    console.log( '_processPluginOptions', url, plugins, torrentId );

    Object.keys( plugins ).forEach( function ( pluginName ) {

      var proc = this[ '_process' + pluginName + 'Options' ].bind( this );
      if ( proc ) promises.push( proc( url, torrentId, plugins[ pluginName ] ) ); // procs will return promises

    }.bind( this ) );

    $.when.apply( $, promises ).then(
      function () {

        $d.resolveWith( this, arguments );

      }.bind( this ),

      function () {

        $d.rejectWith( this, arguments );

      }.bind( this ) );


  } else {

    $d.resolveWith( this ); // noop

  }

  return $d;
};

DelugeConnection.prototype._processLabelOptions = function ( torrent_url, torrentId, labelId ) {

  var $d = jQuery.Deferred();

  if ( !!labelId ) {
    console.log( '_processLabelOptions', torrentId, labelId );

    // empty labelid will remove it via deluge api
    if ( labelId === '__remove__' ) {
      labelId = '';
    }
    this._request( 'settorrentlabel', {
      'method': 'label.set_torrent',
      'params': [ torrentId, labelId ],
      'id': '-17005'
    } ).then(
      function ( payload ) {
        if ( !!payload && !!payload.error ) {
          console.error( payload );
          notify( { 'message': 'Failed to add label: ' + payload.error }, -1, 'server', 'error' );
          $d.rejectWith( this );
        } else {

          console.log( '_processLabelOptions__callback', payload.result );
          var msg;

          if ( !!labelId ) {
            msg = 'Label `' + labelId + '` added to torrent';
          } else {
            msg = 'Label removed from torrent';
          }
          notify( { 'message': msg, 'contextMessage': torrent_url }, 1500, this._getNotificationId( torrent_url + labelId ), 'added' );
          $d.resolveWith( this, [ payload.result ] );

        }
      },
      function () {
        console.error( arguments );
        notify( { 'message': 'Server error.' }, 3000, 'server', 'error' );
        $d.rejectWith( this, arguments );
      } );
  } else {
    $d.resolveWith( this );
  }

  return $d;
};

/* add torrent logic */

DelugeConnection.prototype._downloadTorrent = function ( torrent_url, cookie ) {
  // download a remote torrent url, with authentication if needed to your server

  cookie = COOKIES[ cookie ] || cookie;

  var $d = jQuery.Deferred();

  if ( torrent_url.substr( 0, 7 ) == 'magnet:' ) {

    $d.resolveWith( this, [ torrent_url ] );

  } else {

    console.log( '_downloadTorrent', this.state, [ torrent_url, cookie ] );
    this._request( 'downloadlink', {
      "method": "web.download_torrent_from_url",
      "params": [ torrent_url, cookie ],
      "id": "-17002"
    } ).then(
      function ( payload ) {
        if ( !payload || !payload.result ) {
          notify( { 'message': 'Failed to download torrent: ' + torrent_url }, -1, this._getNotificationId( torrent_url ), 'error' );
          $d.rejectWith( this );
        } else {

          console.log( '_downloadTorrent__callback', payload.result );
          $d.resolveWith( this, [ torrent_url, payload.result ] );

        }
      },
      function () {
        console.error( '_donwloadTorrent error', arguments );
        notify( { 'message': 'Server error.' }, 3000, 'server', 'error' );
        $d.rejectWith( this );
      }
    );

  }

  return $d.promise();
};

DelugeConnection.prototype._getTorrentInfo = function ( torrent_url, torrent_file ) {
  console.log( '_getTorrentInfo', this.state, torrent_file );

  // get info about a previously downloaded torrent file or a magnet link
  var $d = jQuery.Deferred();

  this._request( 'torrentinfo', {
    "method": ( torrent_url.substr( 0, 7 ) == 'magnet:' ? "web.get_magnet_info" : "web.get_torrent_info" ),
    "params": [ torrent_url.substr( 0, 7 ) == 'magnet:' ? torrent_url : torrent_file ],
    "id": "-17003"
  } ).then( function ( payload ) {
    console.log( '_getTorrentInfo__callback', this.state, payload );
    if ( !payload || !payload.result ) {
      notify( { 'message': 'Not a valid torrent: ' + torrent_url }, -1, this._getNotificationId( torrent_url ), 'error' );
      $d.rejectWith( this );
    } else {
      // TODO: CHECK FOR ERRORS
      $d.resolveWith( this, [ torrent_file, payload.result ] );
    }
  } );

  return $d.promise();
};

DelugeConnection.prototype._addTorrentFileToServer = function ( torrent_url, torrent_file, torrent_info, torrent_options ) {

  this._request( 'addtorrent', {
    "method": "web.add_torrents",
    "params": [ [ {
      'path': torrent_file,
      'options': $.extend( true, {}, this.server_config, torrent_options )
    } ] ],
    "id": "-17004.0"
  } ).then( function ( payload ) {
    console.log( '_addTorrentFileToServer__callback', payload );
    notify( { 'message': 'Torrent added successfully', 'contextMessage': torrent_url }, 1500, this._getNotificationId( torrent_url ), 'added' );
  } );

};

DelugeConnection.prototype._addTorrentUrlToServer = function ( torrent_url, torrent_options, cookie ) {

  var $d = jQuery.Deferred();

  var method,
    params = [
      torrent_url,
      $.extend( true, {}, this.server_config, torrent_options )
    ];
  cookie = COOKIES[ cookie ] || cookie;

  if ( torrent_url.substr( 0, 7 ) == 'magnet:' ) {
    method = 'core.add_torrent_magnet';
  } else {
    method = 'core.add_torrent_url';
    params.push( {
      'cookie': cookie,
      'user-agent': UA
    } );
  }

  console.log( '_addTorrentUrlToServer', method, params );

  this._request( 'addtorrent', {
    "method": method,
    "params": params,
    "id": "-17004.0"
  } ).then(
    function ( payload ) {
      console.log( '_addTorrentUrlToServer__callback', payload );

      if ( !payload.result ) {
        notify( { 'message': 'Torrent already added', 'contextMessage': torrent_url }, 1500, this._getNotificationId( torrent_url ), 'added' );
      } else {
        notify(
          { 'message': 'Torrent added successfully', 'contextMessage': torrent_url },
          1500, this._getNotificationId( torrent_url ), 'added' );
      }

      $d.resolveWith( this, [ payload.result ] ); // torrent id
    },
    function () {
      console.error( '_addTorrentUrlToServer__error', arguments );

      notify( {
        'message': 'There was an error.  Torrent was not added.',
        'contextMessage': '' + torrent_url
      }, 1500, this._getNotificationId( torrent_url ), 'error' );

      $d.rejectWith( this, arguments );
    } );

  return $d;

};

/* END DelugeConnection */

/* Send Notification */

function notify ( opts, decay, id, icon_type ) {
  if ( !localStorage.inpage_notification ) {
    return; // this is just a noop if you have notifications off...
  }

  if ( id === null ) {
    throw "Notification ID is required";
  }

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

/* BEGIN Setup */

var notificationTimeouts = {},
  delugeConnection = new DelugeConnection();

function createContextMenu ( add, with_options ) {
  chrome.contextMenus.removeAll( function () {

    if ( !!with_options ) {
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

          var sender = $.extend( true, {}, info, { 'tab': tab } ),
            senderId = communicator.getSenderID( sender );

          delugeConnection
            .getTorrentInfo( torrentUrl, domain )
            .done( function ( file_name, info ) {

              communicator.init().sendMessage( {
                'method': 'add_dialog',
                'url': torrentUrl,
                'domain': domain,
                'config': this.server_config,
                'info': info,
                'plugins': this.plugin_info
              }, null, null, senderId );

            } );
        }
      } );
    }

    if ( !!add ) {
      chrome.contextMenus.create( {
        'id': 'add',
        'title': ( !!with_options ? 'Add' : 'Add to Deluge' ),
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

          delugeConnection
            .addTorrent( torrentUrl, domain );
        }
      } );
    }
  } );
}

if ( localStorage.enable_context_menu || localStorage.enable_context_menu_with_options ) {
  createContextMenu( localStorage.enable_context_menu, localStorage.enable_context_menu_with_options );
}

communicator
  .observeMessage( function handleMessage ( request, sendResponse ) {

    console.log( '[[[ RECEIVED MESSAGE ]]]', request );

    var bits = request.method.split( '-' );
    //field connections from the content-handler via Chrome's secure pipeline hooey
    if ( request.method == "settings-changed" ) {

      console.log( '[[[ SETTINGS CHANGED ]]]', localStorage );
      delugeConnection._initState();

      if ( localStorage.enable_context_menu || localStorage.enable_context_menu_with_options ) {
        createContextMenu( localStorage.enable_context_menu, localStorage.enable_context_menu_with_options );
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
      if ( method == 'set' ) {
        localStorage[ key ] = request.value;
        // else respond with the value
      } else {
        var value = localStorage[ key ];
        try { value = JSON.parse(value); } catch (e) { }
        sendResponse( { 'value': value } );
      }

    } else if ( request.method.substring( 0, 8 ) == "addlink-" ) { //add to server request

      var url_match = false,
        addtype = bits[ 1 ],
        url = request.url,
        domain = request.domain;

      if ( !localStorage.connections ||!localStorage.connections.length ) {
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

        var plugins = request.plugins,
          options = request.options;
        console.log( '<<<< ADDLINK >>>>', url, domain, plugins, options );
        delugeConnection
          .addTorrent( url, domain, plugins, options );

      } else if ( addtype === 'todeluge:withoptions' ) {

        delugeConnection
          .getTorrentInfo( url, domain )
          .done( function ( file_name, info ) {
            console.log( '<<<< ADDLINK WITHOPTIONS >>>>', file_name, info );
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
    } else if ( request.method == 'connect' ) {
      delugeConnection.connectToServer();
    } else if ( request.method.substring( 0, 8 ) == "plugins-" ) { // get plugin info
      var actiontype = bits[1];

      switch(actiontype) {
        case 'getinfo':
          delugeConnection.getPluginInfo(true)
            .then( function (plugin_info) {
              sendResponse( { 'value': plugin_info } );
            });
          break;
        default:
          sendResponse( { 'error': 'unknown plugin action: `' + actiontype + '`' } ); // snub them.
      };

    } else {
      sendResponse( { 'error': 'unknown method: `' + request.method + '`' } ); // snub them.
    }

  } )
  .init();

chrome.notifications.onClicked.addListener(function(notId) {
  if (notId === 'needs-settings') {
    var newURL = '';
    chrome.tabs.create({'url': chrome.extension.getURL('options.html')});
    chrome.notifications.clear(notId);
  }
});

chrome.runtime.onInstalled.addListener( function ( install ) {
  var manifest = chrome.runtime.getManifest();

  console.log( '[INSTALLED: ' + manifest.version + ']', install );

  // // 70.7 storage fix...
  // if ( install.reason === 'update' && manifest.version === '0.70.7' ) {
  //   localStorage.link_regex = '';

  // }

  // if ( install.reason === 'update' && !versionCompare( install.previousVersion, manifest.version, { ignoreMinor: true } ) ) {
  //   // skip if update and not new major version
  //   return;
  // }

  // chrome.tabs.create( { url: 'https://sbussetti.github.io/deluge-siphon/' } );
} );

// try to login once
delugeConnection.connectToServer();
